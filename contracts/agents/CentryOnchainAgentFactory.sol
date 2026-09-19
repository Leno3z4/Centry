// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./CentryOnchainAgentAccount.sol";

/// @title Centry Onchain Agent Factory
/// @notice Creates isolated, user-owned onchain agent accounts from one reusable implementation.
contract CentryOnchainAgentFactory {
    address public immutable implementation;

    address public constant USDC = 0x3600000000000000000000000000000000000000;
    address public constant TREASURY = 0x475a93394F1EDef9255EA565Ee50eb8feaC7744C;
    uint256 public constant AGENT_PRICE_USDC = 2_500_000;

    mapping(address => address[]) private _agentsByOwner;
    mapping(address => bool) public isCentryAgentAccount;

    event AgentAccountCreated(
        address indexed owner,
        address indexed agentAccount,
        address indexed initialOperator,
        bytes32 templateId,
        bytes32 configHash
    );

    event AgentAccountPurchased(
        address indexed owner,
        address indexed agentAccount,
        bytes32 indexed templateId,
        uint256 priceUsdc
    );

    constructor() {
        implementation = address(new CentryOnchainAgentAccount());
    }

    function createAgentAccount(
        bytes32 templateId,
        bytes32 configHash,
        string calldata metadataURI,
        address initialOperator
    ) external returns (address agentAccount) {
        agentAccount = _create(msg.sender, templateId, configHash, metadataURI, initialOperator);
    }

    function purchaseAndCreateAgentAccount(
        bytes32 templateId,
        bytes32 configHash,
        string calldata metadataURI,
        address initialOperator
    ) external returns (address agentAccount) {
        bool paid = IERC20(USDC).transferFrom(msg.sender, TREASURY, AGENT_PRICE_USDC);
        require(paid, "CENT: payment failed");

        agentAccount = _create(msg.sender, templateId, configHash, metadataURI, initialOperator);
        emit AgentAccountPurchased(msg.sender, agentAccount, templateId, AGENT_PRICE_USDC);
    }

    function getAgentAccounts(address owner) external view returns (address[] memory) {
        return _agentsByOwner[owner];
    }

    function agentAccountCount(address owner) external view returns (uint256) {
        return _agentsByOwner[owner].length;
    }

    function _create(
        address owner,
        bytes32 templateId,
        bytes32 configHash,
        string calldata metadataURI,
        address initialOperator
    ) internal returns (address agentAccount) {
        agentAccount = Clones.clone(implementation);

        CentryOnchainAgentAccount(payable(agentAccount)).initialize(
            owner,
            templateId,
            configHash,
            metadataURI,
            initialOperator
        );

        _agentsByOwner[owner].push(agentAccount);
        isCentryAgentAccount[agentAccount] = true;

        emit AgentAccountCreated(owner, agentAccount, initialOperator, templateId, configHash);
    }
}
