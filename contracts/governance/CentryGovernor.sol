// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/governance/Governor.sol";
import "@openzeppelin/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/governance/extensions/GovernorTimelockControl.sol";
import "@openzeppelin/governance/TimelockController.sol";
import "@openzeppelin/governance/utils/IVotes.sol";

contract CentryGovernor is Governor, GovernorCountingSimple, GovernorVotes, GovernorVotesQuorumFraction, GovernorTimelockControl {
    constructor(IVotes votes_, TimelockController timelock_)
        Governor("Centry Governor")
        GovernorVotes(votes_)
        GovernorVotesQuorumFraction(4)
        GovernorTimelockControl(timelock_)
    {}

    function votingDelay() public pure override returns (uint256) { return 1 days; }
    function votingPeriod() public pure override returns (uint256) { return 3 days; }
    function proposalThreshold() public pure override returns (uint256) { return 0; }

    function quorum(uint256 timepoint)
        public view override(Governor, GovernorVotesQuorumFraction) returns (uint256)
    {
        return super.quorum(timepoint);
    }

    function state(uint256 proposalId)
        public view override(Governor, GovernorTimelockControl) returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function proposalNeedsQueuing(uint256 proposalId)
        public view override(Governor, GovernorTimelockControl) returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint48) {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._executeOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor() internal view override(Governor, GovernorTimelockControl) returns (address) {
        return super._executor();
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(Governor) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
