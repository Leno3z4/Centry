// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-8004 Identity Registry surface used by Centry agent accounts.
/// @dev Kept intentionally narrow so Centry can integrate with the canonical registry
///      deployed by Arc or another network without owning or replacing that registry.
interface ICentryERC8004IdentityRegistry {
    function register(string calldata agentURI) external returns (uint256 agentId);

    function setAgentURI(
        uint256 agentId,
        string calldata newURI
    ) external;
}
