// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../CentryOnchainAgentAccount.sol";
import "../CentryOnchainAgentFactory.sol";

interface Vm {
    function warp(uint256 newTimestamp) external;
    function prank(address sender) external;
}

contract CentryAgentCallTarget {
    uint256 public value;
    uint256 public received;

    function setValue(uint256 value_) external {
        value = value_;
    }

    function receiveNative() external payable {
        received += msg.value;
    }
}

contract MockERC8004IdentityRegistry {
    uint256 public nextAgentId = 1;
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => string) public agentURI;

    function register(string calldata agentURI_) external returns (uint256 agentId) {
        agentId = nextAgentId++;
        ownerOf[agentId] = msg.sender;
        agentURI[agentId] = agentURI_;
    }

    function setAgentURI(uint256 agentId, string calldata newURI) external {
        if (ownerOf[agentId] != msg.sender) revert NotIdentityOwner();
        agentURI[agentId] = newURI;
    }

    error NotIdentityOwner();
}

/// @title Centry Onchain Agent Account Tests
/// @notice Small Foundry-compatible tests with no forge-std dependency.
contract CentryOnchainAgentAccountTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    CentryOnchainAgentFactory internal factory;
    CentryOnchainAgentAccount internal account;
    CentryAgentCallTarget internal target;
    MockERC8004IdentityRegistry internal identityRegistry;

    address internal user = address(0xA11CE);
    address internal agent = address(0xA61E7);

    function setUp() public {
        factory = new CentryOnchainAgentFactory();
        target = new CentryAgentCallTarget();
        identityRegistry = new MockERC8004IdentityRegistry();

        vm.prank(user);
        address accountAddress = factory.createAgentAccount(
            keccak256("lending-agent"),
            keccak256("config-v1"),
            "ipfs://centry/agents/lending-agent/v1",
            agent
        );
        account = CentryOnchainAgentAccount(payable(accountAddress));
    }

    function testAgentCanExecutePermittedCall() external {
        bytes4 selector = CentryAgentCallTarget.setValue.selector;

        vm.prank(user);
        account.setPermission(agent, address(target), selector, true, 0, 0);

        vm.prank(agent);
        account.execute(address(target), 0, abi.encodeCall(target.setValue, (42)));

        _assertEq(target.value(), 42);
    }

    function testAgentCannotExecuteUnpermittedCall() external {
        (bool ok,) = address(account).call(
            abi.encodeCall(
                account.execute,
                (address(target), 0, abi.encodeCall(target.setValue, (42)))
            )
        );
        _assertFalse(ok);
    }

    function testPermissionCanExpire() external {
        bytes4 selector = CentryAgentCallTarget.setValue.selector;

        vm.prank(user);
        account.setPermission(agent, address(target), selector, true, uint64(block.timestamp + 1 hours), 0);

        vm.warp(block.timestamp + 2 hours);
        vm.prank(agent);
        (bool ok,) = address(account).call(
            abi.encodeCall(account.execute, (address(target), 0, abi.encodeCall(target.setValue, (42))))
        );
        _assertFalse(ok);
    }

    function testNativeValueLimitIsEnforced() external {
        bytes4 selector = CentryAgentCallTarget.receiveNative.selector;

        (bool funded,) = address(account).call{value: 1 ether}("");
        _assertTrue(funded);

        vm.prank(user);
        account.setPermission(agent, address(target), selector, true, 0, 1 ether);

        vm.prank(agent);
        account.execute(address(target), 0.5 ether, abi.encodeCall(target.receiveNative, ()));
        _assertEq(target.received(), 0.5 ether);
        _assertFalse(account.canExecute(agent, address(target), selector, 1.5 ether));
    }

    function testBatchExecutionIsBoundedAndPermissioned() external {
        bytes4 selector = CentryAgentCallTarget.setValue.selector;

        vm.prank(user);
        account.setPermission(agent, address(target), selector, true, 0, 0);

        address[] memory targets = new address[](2);
        uint256[] memory values = new uint256[](2);
        bytes[] memory data = new bytes[](2);
        targets[0] = address(target);
        targets[1] = address(target);
        data[0] = abi.encodeCall(target.setValue, (7));
        data[1] = abi.encodeCall(target.setValue, (9));

        vm.prank(agent);
        account.executeBatch(targets, values, data);

        _assertEq(target.value(), 9);
    }

    function testOwnerCanExecuteAndTransferOwnership() external {
        vm.prank(user);
        account.executeAsOwner(address(target), 0, abi.encodeCall(target.setValue, (99)));
        _assertEq(target.value(), 99);

        address newOwner = address(0xB0B);
        vm.prank(user);
        account.transferOwnership(newOwner);

        vm.prank(newOwner);
        account.acceptOwnership();

        _assertEqAddress(account.owner(), newOwner);
    }

    function testERC8004RegistrationBindsIdentityToAgentAccount() external {
        vm.prank(user);
        uint256 agentId = account.registerERC8004Identity(
            address(identityRegistry),
            "https://api.centry.test/agents/1.json"
        );

        _assertEqAddress(identityRegistry.ownerOf(agentId), address(account));
        _assertEqAddress(account.erc8004IdentityRegistry(), address(identityRegistry));
        _assertEq(account.erc8004AgentId(), agentId);
        _assertEqString(identityRegistry.agentURI(agentId), "https://api.centry.test/agents/1.json");
    }

    function testERC8004RegistrationURICanBeUpdatedByAccountOwner() external {
        vm.prank(user);
        uint256 agentId = account.registerERC8004Identity(
            address(identityRegistry),
            "https://api.centry.test/agents/1.json"
        );

        vm.prank(user);
        account.updateERC8004IdentityURI("https://api.centry.test/agents/1-v2.json");

        _assertEqString(identityRegistry.agentURI(agentId), "https://api.centry.test/agents/1-v2.json");
    }

    function _assertEq(uint256 a, uint256 b) internal pure {
        if (a != b) revert AssertionFailed();
    }

    function _assertEqAddress(address a, address b) internal pure {
        if (a != b) revert AssertionFailed();
    }

    function _assertEqString(string memory a, string memory b) internal pure {
        if (keccak256(bytes(a)) != keccak256(bytes(b))) revert AssertionFailed();
    }

    function _assertFalse(bool value_) internal pure {
        if (value_) revert AssertionFailed();
    }

    function _assertTrue(bool value_) internal pure {
        if (!value_) revert AssertionFailed();
    }

    error AssertionFailed();
}
