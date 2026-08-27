// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./CentrySelfRepayingVault.sol";

/// @title Centry Self-Repaying Vault Factory
/// @notice Creates isolated self-repaying positions with shared protocol config.
contract CentrySelfRepayingVaultFactory {
    address public immutable lendingPool;
    address public immutable yieldVault;
    address public immutable asset;

    mapping(address => address[]) private _positions;
    address[] public allPositions;

    event PositionCreated(
        address indexed owner,
        address indexed position
    );

    error InvalidAddress();

    constructor(
        address lendingPool_,
        address yieldVault_,
        address asset_
    ) {
        if (
            lendingPool_ == address(0) ||
            yieldVault_ == address(0) ||
            asset_ == address(0)
        ) {
            revert InvalidAddress();
        }

        lendingPool = lendingPool_;
        yieldVault = yieldVault_;
        asset = asset_;
    }

    function createPosition()
        external
        returns (address position)
    {
        CentrySelfRepayingVault vault =
            new CentrySelfRepayingVault(
                msg.sender,
                lendingPool,
                yieldVault,
                asset
            );

        position = address(vault);

        _positions[msg.sender].push(position);
        allPositions.push(position);

        emit PositionCreated(
            msg.sender,
            position
        );
    }

    function positionsOf(
        address owner
    ) external view returns (address[] memory) {
        return _positions[owner];
    }

    function positionCount(
        address owner
    ) external view returns (uint256) {
        return _positions[owner].length;
    }

    function allPositionsLength()
        external
        view
        returns (uint256)
    {
        return allPositions.length;
    }
}
