// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./CentrySelfRepayingVault.sol";

/// @title Centry Self-Repaying Vault Factory
/// @notice Creates isolated positions that can choose a supported collateral
///         asset while keeping the debt/yield asset fixed to the configured
///         Centry Yield Vault asset.
contract CentrySelfRepayingVaultFactory {
    address public immutable lendingPool;
    address public immutable yieldVault;
    address public immutable debtAsset;

    mapping(address => address[]) private _positions;
    address[] public allPositions;

    event PositionCreated(
        address indexed owner,
        address indexed collateralAsset,
        address position
    );

    error InvalidAddress();
    error InvalidYieldAsset();

    constructor(
        address lendingPool_,
        address yieldVault_,
        address debtAsset_
    ) {
        if (
            lendingPool_ == address(0) ||
            yieldVault_ == address(0) ||
            debtAsset_ == address(0)
        ) {
            revert InvalidAddress();
        }

        if (
            ICentryYieldVault(yieldVault_).asset() != debtAsset_
        ) {
            revert InvalidYieldAsset();
        }

        lendingPool = lendingPool_;
        yieldVault = yieldVault_;
        debtAsset = debtAsset_;
    }

    function createPosition(
        address collateralAsset
    ) external returns (address position) {
        if (collateralAsset == address(0)) {
            revert InvalidAddress();
        }

        CentrySelfRepayingVault vault =
            new CentrySelfRepayingVault(
                msg.sender,
                lendingPool,
                collateralAsset,
                debtAsset,
                yieldVault
            );

        position = address(vault);

        _positions[msg.sender].push(position);
        allPositions.push(position);

        emit PositionCreated(
            msg.sender,
            collateralAsset,
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
