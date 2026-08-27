// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./CentrySelfRepayingVault.sol";

interface ICentryReserveRegistry {
    function getReserveConfig(
        address asset
    )
        external
        view
        returns (
            bool active,
            uint8 decimals,
            uint16 ltvBps,
            uint16 liquidationThresholdBps,
            uint16 liquidationBonusBps,
            uint16 reserveFactorBps,
            uint128 supplyCap,
            uint128 borrowCap
        );
}

/// @title Centry Self-Repaying Vault Factory
/// @notice Creates isolated positions that choose a supported collateral
///         asset while keeping the debt/yield asset fixed to the yield vault.
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
    error UnsupportedCollateral();

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

        (
            bool debtActive,
            uint8 debtDecimals,
            uint16 debtLtvBps,
            uint16 debtLiquidationThresholdBps,
            uint16 debtLiquidationBonusBps,
            uint16 debtReserveFactorBps,
            uint128 debtSupplyCap,
            uint128 debtBorrowCap
        ) = ICentryReserveRegistry(lendingPool_).getReserveConfig(
            debtAsset_
        );

        debtDecimals;
        debtLtvBps;
        debtLiquidationThresholdBps;
        debtLiquidationBonusBps;
        debtReserveFactorBps;
        debtSupplyCap;

        if (
            !debtActive ||
            debtBorrowCap == 0
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

        (
            bool collateralActive,
            uint8 collateralDecimals,
            uint16 collateralLtvBps,
            uint16 collateralLiquidationThresholdBps,
            uint16 collateralLiquidationBonusBps,
            uint16 collateralReserveFactorBps,
            uint128 collateralSupplyCap,
            uint128 collateralBorrowCap
        ) = ICentryReserveRegistry(lendingPool).getReserveConfig(
            collateralAsset
        );

        collateralDecimals;
        collateralLtvBps;
        collateralLiquidationThresholdBps;
        collateralLiquidationBonusBps;
        collateralReserveFactorBps;
        collateralBorrowCap;

        if (
            !collateralActive ||
            collateralSupplyCap == 0
        ) {
            revert UnsupportedCollateral();
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
