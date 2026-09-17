// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/proxy/Clones.sol";
import "./CentryOnchainAgentAccount.sol";

/// @title Centry Onchain Agent Factory
/// @notice Creates isolated, user-owned onchain agent accounts from one audited implementation.
contract CentryOnchainAgentFactory {
    address public immutable implementation;

    mapping(address => address[]) private _agentsByOwner;
    mapping(address => bool) public isCentryAgentAccount;

    event AgentAccountCreated(
        address indexed owner,
        address indexed agentAccount,
        address indexed initialOperator,
        bytes32 templateId,
        bytes32 configHash
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
        agentAccount = Clones.clone(implementation);

        CentryOnchainAgentAccount(payable(agentAccount)).initialize(
            msg.sender,
            templateId,
            configHash,
            metadataURI,
            initialOperator
        );

        _agentsByOwner[msg.sender].push(agentAccount);
        isCentryAgentAccount[agentAccount] = true;

        emit AgentAccountCreated(
            msg.sender,
            agentAccount,
            initialOperator,
            templateId,
            configHash
        );
    }

    function getAgentAccounts(address owner) external view returns (address[] memory) {
        return _agentsByOwner[owner];
    }

    function agentAccountCount(address owner) external view returns (uint256) {
        return _agentsByOwner[owner].length;
    }
}
