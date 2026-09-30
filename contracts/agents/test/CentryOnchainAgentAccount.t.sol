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


contract MockAgentToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        uint256 balance = balanceOf[msg.sender];
        if (balance < amount) revert InsufficientBalance();
        balanceOf[msg.sender] = balance - amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance < amount) revert InsufficientAllowance();
        uint256 balance = balanceOf[from];
        if (balance < amount) revert InsufficientBalance();
        allowance[from][msg.sender] = currentAllowance - amount;
        balanceOf[from] = balance - amount;
        balanceOf[to] += amount;
        return true;
    }

    error InsufficientAllowance();
    error InsufficientBalance();
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

        vm.prank(user);
        account.setActive(true);
    }

    function testFinancialLimitsRequireApprovedSpenderAndReset() external {
        MockAgentToken token = new MockAgentToken();
        bytes4 approveSelector = bytes4(keccak256("approve(address,uint256)"));
        uint64 expiry = uint64(block.timestamp + 3 days);

        vm.prank(user);
        account.setPermission(agent, address(token), approveSelector, true, expiry, 0);

        vm.prank(user);
        account.setFinancialLimit(
            agent,
            address(token),
            approveSelector,
            address(token),
            100,
            150,
            1 days
        );

        vm.prank(user);
        account.setApprovalSpender(agent, address(token), address(target), true);

        vm.prank(agent);
        account.execute(
            address(token),
            0,
            abi.encodeWithSelector(approveSelector, address(target), 100)
        );

        vm.prank(agent);
        (bool maliciousSpenderOk,) = address(account).call(
            abi.encodeCall(
                account.execute,
                (
                    address(token),
                    0,
                    abi.encodeWithSelector(approveSelector, address(0xBEEF), 1)
                )
            )
        );
        _assertFalse(maliciousSpenderOk);

        vm.prank(agent);
        (bool windowExceeded,) = address(account).call(
            abi.encodeCall(
                account.execute,
                (
                    address(token),
                    0,
                    abi.encodeWithSelector(approveSelector, address(target), 51)
                )
            )
        );
        _assertFalse(windowExceeded);

        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(agent);
        account.execute(
            address(token),
            0,
            abi.encodeWithSelector(approveSelector, address(target), 100)
        );
    }

    function testFactoryCreateWithAuthorizationInstallsBundle() external {
        bytes4 selector = CentryAgentCallTarget.setValue.selector;

        CentryOnchainAgentAccount.AuthorizationPermission[] memory permissions = new CentryOnchainAgentAccount.AuthorizationPermission[](1);
        permissions[0] = CentryOnchainAgentAccount.AuthorizationPermission({
            operator: agent,
            target: address(target),
            selector: selector,
            allowed: true,
            expiresAt: 0,
            maxNativeValue: 0
        });

        CentryOnchainAgentAccount.AuthorizationFinancialLimit[] memory limits = new CentryOnchainAgentAccount.AuthorizationFinancialLimit[](0);
        CentryOnchainAgentAccount.AuthorizationApprovalSpender[] memory spenders = new CentryOnchainAgentAccount.AuthorizationApprovalSpender[](0);

        vm.prank(user);
        address newAccountAddress = factory.createAgentAccountWithAuthorization(
            keccak256("batched-agent"),
            keccak256("config-v2"),
            "ipfs://centry/agents/batched-agent/v1",
            agent,
            permissions,
            limits,
            spenders
        );

        CentryOnchainAgentAccount newAccount = CentryOnchainAgentAccount(payable(newAccountAddress));
        _assertTrue(newAccount.agentOperators(agent));
        (bool allowed,,) = newAccount.permissions(agent, address(target), selector);
        _assertTrue(allowed);
        _assertTrue(newAccount.permissionCodeHashes(agent, address(target), selector) == address(target).codehash);
        _assertFalse(newAccount.active());

        vm.prank(agent);
        (bool inactiveExecutionOk,) = address(newAccount).call(
            abi.encodeCall(newAccount.execute, (address(target), 0, abi.encodeCall(target.setValue, (11))))
        );
        _assertFalse(inactiveExecutionOk);

        vm.prank(user);
        newAccount.setActive(true);

        vm.prank(agent);
        newAccount.execute(address(target), 0, abi.encodeCall(target.setValue, (11)));
        _assertEq(target.value(), 11);
    }

    function testConfigureAuthorizationAppliesMultipleWritesInOneCall() external {
        bytes4 selector = CentryAgentCallTarget.setValue.selector;

        CentryOnchainAgentAccount.AuthorizationPermission[] memory permissions = new CentryOnchainAgentAccount.AuthorizationPermission[](2);
        permissions[0] = CentryOnchainAgentAccount.AuthorizationPermission({
            operator: agent,
            target: address(target),
            selector: selector,
            allowed: true,
            expiresAt: 0,
            maxNativeValue: 0
        });
        permissions[1] = CentryOnchainAgentAccount.AuthorizationPermission({
            operator: agent,
            target: address(target),
            selector: bytes4(keccak256("receiveNative()")),
            allowed: true,
            expiresAt: 0,
            maxNativeValue: 1 ether
        });

        CentryOnchainAgentAccount.AuthorizationFinancialLimit[] memory limits = new CentryOnchainAgentAccount.AuthorizationFinancialLimit[](0);
        CentryOnchainAgentAccount.AuthorizationApprovalSpender[] memory spenders = new CentryOnchainAgentAccount.AuthorizationApprovalSpender[](0);

        vm.prank(user);
        account.configureAuthorization(permissions, limits, spenders);

        _assertTrue(account.canExecute(agent, address(target), selector, 0));
        _assertTrue(account.canExecute(agent, address(target), bytes4(keccak256("receiveNative()")), 1 ether));

        vm.prank(agent);
        account.execute(address(target), 0, abi.encodeCall(target.setValue, (21)));
        _assertEq(target.value(), 21);
    }

    function testFactoryCreateWithSelfTransferAuthorizationResolvesAgentTarget() external {
        bytes4 selector = bytes4(keccak256("transferToAgent(address,address,uint256)"));

        CentryOnchainAgentAccount.AuthorizationPermission[] memory permissions = new CentryOnchainAgentAccount.AuthorizationPermission[](1);
        permissions[0] = CentryOnchainAgentAccount.AuthorizationPermission({
            operator: agent,
            target: address(0),
            selector: selector,
            allowed: true,
            expiresAt: 0,
            maxNativeValue: 0
        });

        CentryOnchainAgentAccount.AuthorizationFinancialLimit[] memory limits = new CentryOnchainAgentAccount.AuthorizationFinancialLimit[](1);
        limits[0] = CentryOnchainAgentAccount.AuthorizationFinancialLimit({
            operator: agent,
            target: address(0),
            selector: selector,
            asset: address(0x1234),
            maxAmountPerCall: 100,
            maxAmountPerWindow: 100,
            windowDuration: 1 days
        });

        CentryOnchainAgentAccount.AuthorizationApprovalSpender[] memory spenders = new CentryOnchainAgentAccount.AuthorizationApprovalSpender[](0);

        vm.prank(user);
        address newAccountAddress = factory.createAgentAccountWithAuthorization(
            keccak256("transfer-agent"),
            keccak256("config-v3"),
            "",
            agent,
            permissions,
            limits,
            spenders
        );

        CentryOnchainAgentAccount newAccount = CentryOnchainAgentAccount(payable(newAccountAddress));
        (bool allowed,,) = newAccount.permissions(agent, newAccountAddress, selector);
        _assertTrue(allowed);
        (uint128 perCall,,,,) = newAccount.financialLimits(agent, newAccountAddress, selector, address(0x1234));
        _assertEq(perCall, 100);
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

    function testCanExecuteReturnsFalseWhileInactive() external {
        bytes4 selector = CentryAgentCallTarget.setValue.selector;

        vm.prank(user);
        account.setPermission(agent, address(target), selector, true, 0, 0);

        vm.prank(user);
        account.setActive(false);

        _assertFalse(account.canExecute(agent, address(target), selector, 0));
    }

    function testTransferFromCannotSourceFundsFromExternalAddress() external {
        MockAgentToken token = new MockAgentToken();
        address externalSource = address(0xBEEF);

        token.mint(externalSource, 1000);

        bytes4 selector = bytes4(keccak256("transferFrom(address,address,uint256)"));
        vm.prank(user);
        account.setPermission(agent, address(token), selector, true, 0, 0);

        vm.prank(user);
        account.setFinancialLimit(agent, address(token), selector, address(token), 1000, 1000, 1 days);

        vm.prank(externalSource);
        token.approve(address(account), 1000);

        vm.prank(agent);
        (bool ok,) = address(account).call(
            abi.encodeCall(
                account.execute,
                (
                    address(token),
                    0,
                    abi.encodeWithSelector(selector, externalSource, user, 100)
                )
            )
        );
        _assertFalse(ok);
        _assertEq(token.balanceOf(externalSource), 1000);
        _assertEq(token.balanceOf(user), 0);
    }

    function testOwnerCanRevokeAgentApproval() external {
        MockAgentToken token = new MockAgentToken();
        address spender = address(0xB0B);

        vm.prank(user);
        account.executeAsOwner(
            address(token),
            0,
            abi.encodeCall(token.approve, (spender, 500))
        );

        _assertEq(token.allowance(address(account), spender), 500);

        vm.prank(user);
        account.revokeAgentApproval(address(token), spender);

        _assertEq(token.allowance(address(account), spender), 0);
    }

    function testOwnershipTransferInvalidatesDelegationAndDeactivates() external {
        bytes4 selector = CentryAgentCallTarget.setValue.selector;

        vm.prank(user);
        account.setPermission(agent, address(target), selector, true, 0, 0);

        _assertTrue(account.canExecute(agent, address(target), selector, 0));
        _assertEqBytes32(
            account.permissionCodeHashes(agent, address(target), selector),
            address(target).codehash
        );

        address newOwner = address(0xB0B);
        vm.prank(user);
        account.transferOwnership(newOwner);

        vm.prank(newOwner);
        account.acceptOwnership();

        _assertEqAddress(account.owner(), newOwner);
        _assertFalse(account.active());
        _assertFalse(account.canExecute(agent, address(target), selector, 0));
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


    function testOwnerCanWithdrawNativeFundsWhileAgentIsInactive() external {
        (bool funded,) = address(account).call{value: 1 ether}("");
        _assertTrue(funded);

        vm.prank(user);
        account.setActive(false);

        uint256 beforeBalance = user.balance;
        vm.prank(user);
        account.withdrawNative(0.4 ether);

        _assertEq(user.balance, beforeBalance + 0.4 ether);
        _assertEq(address(account).balance, 0.6 ether);
    }

    function testOwnerCanWithdrawERC20FundsWhileAgentIsInactive() external {
        MockAgentToken token = new MockAgentToken();
        token.mint(address(account), 1000);

        vm.prank(user);
        account.setActive(false);

        vm.prank(user);
        account.withdrawToken(address(token), 400);

        _assertEq(token.balanceOf(user), 400);
        _assertEq(token.balanceOf(address(account)), 600);
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

    function _assertEqBytes32(bytes32 a, bytes32 b) internal pure {
        if (a != b) revert AssertionFailed();
    }

    function _assertFalse(bool value_) internal pure {
        if (value_) revert AssertionFailed();
    }

    function _assertTrue(bool value_) internal pure {
        if (!value_) revert AssertionFailed();
    }

    error AssertionFailed();
}
