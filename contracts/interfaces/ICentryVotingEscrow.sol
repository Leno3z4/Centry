// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICentryVotingEscrow {
    function ownerOf(uint256 tokenId) external view returns (address);

    function votingPower(uint256 tokenId)
        external
        view
        returns (uint256);

    function votingPowerTime(uint256 tokenId)
        external
        view
        returns (uint256);

    function getOwnedTokenIds(address account)
        external
        view
        returns (uint256[] memory);
}
