// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/ReentrancyGuard.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/Pausable.sol";

interface ICentryLendingPool {
    function supply(
        address asset,
        uint256 amount
    ) external;

    function withdraw(
        address asset,
        uint256 amount
    ) external returns (uint256 withdrawn);

    function borrow(
        address asset,
        uint256 amount
    ) external;

    function repayFor(
        address asset,
        address borrower,
        uint256 amount
    ) external returns (uint256 repaid);

    function borrowBalance(
        address user,
        address asset
    ) external view returns (uint256);

    function healthFactor(
        address user
    ) external view returns (uint256);
}

interface ICentryYieldVault {
    function asset() external view returns (address);

    function deposit(
        uint256 assets,
        address receiver
    ) external returns (uint256 shares);

    function redeem(
        uint256 shares,
        address receiver,
        address owner_
    ) external returns (uint256 assets);

    function balanceOf(
        address account
    ) external view returns (uint256);
}

/// @title Centry Self-Repaying Vault
/// @notice An isolated user position that supplies collateral to the existing
///         Centry lending pool, borrows the same asset, places the borrowed
///         asset into a Centry Yield Vault, and uses realized positive yield
///         to repay the position's debt.
/// @dev One deployed instance belongs to one owner. A factory can create
///      isolated instances for multiple users without sharing accounting.
contract CentrySelfRepayingVault is
    Ownable2Step,
    ReentrancyGuard,
    Pausable
{
    using SafeERC20 for IERC20;

    uint256 public constant WAD = 1e18;

    ICentryLendingPool public immutable lendingPool;
    ICentryYieldVault public immutable yieldVault;
    IERC20 public immutable assetToken;

    uint256 public collateralSupplied;
    uint256 public yieldPrincipal;
    uint256 public yieldShares;
    uint256 public totalRepaid;
    bool public positionOpen;

    error InvalidAddress();
    error InvalidAsset();
    error AmountZero();
    error PositionAlreadyOpen();
    error PositionNotOpen();
    error DebtOutstanding();
    error NoYield();
    error NoDebt();
    error HealthFactorTooLow();
    error PositionActive();
    error InvalidVaultState();

    event CollateralDeposited(
        address indexed owner,
        uint256 amount
    );

    event PositionOpened(
        address indexed owner,
        uint256 collateral,
        uint256 borrowed,
        uint256 yieldShares
    );

    event YieldHarvested(
        uint256 assetsRedeemed,
        uint256 principalReturned,
        uint256 profit
    );

    event DebtRepaid(
        uint256 amount,
        uint256 remainingDebt
    );

    event PositionClosed(
        address indexed owner,
        uint256 returnedAssets
    );

    event PositionPaused(address indexed account);
    event PositionUnpaused(address indexed account);

    constructor(
        address initialOwner,
        address lendingPool_,
        address yieldVault_,
        address asset_
    ) Ownable(initialOwner) {
        if (
            initialOwner == address(0) ||
            lendingPool_ == address(0) ||
            yieldVault_ == address(0) ||
            asset_ == address(0)
        ) {
            revert InvalidAddress();
        }

        if (
            ICentryYieldVault(yieldVault_).asset() != asset_
        ) {
            revert InvalidAsset();
        }

        lendingPool = ICentryLendingPool(lendingPool_);
        yieldVault = ICentryYieldVault(yieldVault_);
        assetToken = IERC20(asset_);
    }

    /// @notice Deposits collateral into this isolated position.
    /// @dev Additional collateral is deliberately disabled after opening so
    ///      accounting cannot claim collateral that was never supplied to the pool.
    function depositCollateral(
        uint256 amount
    ) external onlyOwner whenNotPaused nonReentrant {
        if (positionOpen) {
            revert PositionActive();
        }

        if (amount == 0) {
            revert AmountZero();
        }

        assetToken.safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        collateralSupplied += amount;

        emit CollateralDeposited(
            msg.sender,
            amount
        );
    }

    /// @notice Supplies collateral, borrows, and deposits the borrowed asset
    ///         into the configured yield vault.
    function openPosition(
        uint256 borrowAmount
    ) external onlyOwner whenNotPaused nonReentrant {
        if (positionOpen) {
            revert PositionAlreadyOpen();
        }

        if (collateralSupplied == 0 || borrowAmount == 0) {
            revert AmountZero();
        }

        lendingPool.supply(
            address(assetToken),
            collateralSupplied
        );

        lendingPool.borrow(
            address(assetToken),
            borrowAmount
        );

        assetToken.forceApprove(
            address(yieldVault),
            borrowAmount
        );

        yieldShares = yieldVault.deposit(
            borrowAmount,
            address(this)
        );

        if (yieldShares == 0) {
            revert InvalidVaultState();
        }

        yieldPrincipal = borrowAmount;
        positionOpen = true;

        uint256 health = lendingPool.healthFactor(
            address(this)
        );

        if (health < WAD) {
            revert HealthFactorTooLow();
        }

        emit PositionOpened(
            msg.sender,
            collateralSupplied,
            borrowAmount,
            yieldShares
        );
    }

    /// @notice Realizes the yield position, uses only positive profit to repay
    ///         debt, and reinvests the remaining assets.
    /// @return repaidAmount The amount of debt repaid from realized profit.
    function harvestAndRepay()
        external
        onlyOwner
        whenNotPaused
        nonReentrant
        returns (uint256 repaidAmount)
    {
        if (!positionOpen) {
            revert PositionNotOpen();
        }

        uint256 debt = lendingPool.borrowBalance(
            address(this),
            address(assetToken)
        );

        if (debt == 0) {
            revert NoDebt();
        }

        if (yieldShares == 0) {
            revert NoYield();
        }

        uint256 beforeBalance = assetToken.balanceOf(
            address(this)
        );

        uint256 redeemed = yieldVault.redeem(
            yieldShares,
            address(this),
            address(this)
        );

        uint256 received = assetToken.balanceOf(
            address(this)
        ) - beforeBalance;

        if (received != redeemed || received == 0) {
            revert InvalidVaultState();
        }

        uint256 profit = received > yieldPrincipal
            ? received - yieldPrincipal
            : 0;

        if (profit > 0) {
            repaidAmount = profit > debt
                ? debt
                : profit;

            assetToken.forceApprove(
                address(lendingPool),
                repaidAmount
            );

            uint256 actualRepaid = lendingPool.repayFor(
                address(assetToken),
                address(this),
                repaidAmount
            );

            if (actualRepaid != repaidAmount) {
                revert InvalidVaultState();
            }

            totalRepaid += repaidAmount;
        }

        uint256 remainingAssets = received - repaidAmount;

        if (remainingAssets > 0) {
            assetToken.forceApprove(
                address(yieldVault),
                remainingAssets
            );

            yieldShares = yieldVault.deposit(
                remainingAssets,
                address(this)
            );

            if (yieldShares == 0) {
                revert InvalidVaultState();
            }

            yieldPrincipal = remainingAssets;
        } else {
            yieldShares = 0;
            yieldPrincipal = 0;
        }

        uint256 remainingDebt = lendingPool.borrowBalance(
            address(this),
            address(assetToken)
        );

        emit YieldHarvested(
            received,
            remainingAssets,
            profit
        );

        emit DebtRepaid(
            repaidAmount,
            remainingDebt
        );
    }

    /// @notice Closes the position after the lending debt has reached zero.
    function closePosition()
        external
        onlyOwner
        whenNotPaused
        nonReentrant
        returns (uint256 returnedAssets)
    {
        if (!positionOpen) {
            revert PositionNotOpen();
        }

        uint256 debt = lendingPool.borrowBalance(
            address(this),
            address(assetToken)
        );

        if (debt != 0) {
            revert DebtOutstanding();
        }

        if (yieldShares > 0) {
            yieldVault.redeem(
                yieldShares,
                address(this),
                address(this)
            );
        }

        yieldShares = 0;
        yieldPrincipal = 0;

        if (collateralSupplied > 0) {
            lendingPool.withdraw(
                address(assetToken),
                type(uint256).max
            );
        }

        collateralSupplied = 0;
        positionOpen = false;

        returnedAssets = assetToken.balanceOf(
            address(this)
        );

        if (returnedAssets == 0) {
            revert InvalidVaultState();
        }

        assetToken.safeTransfer(
            owner(),
            returnedAssets
        );

        emit PositionClosed(
            owner(),
            returnedAssets
        );
    }

    function currentDebt()
        external
        view
        returns (uint256)
    {
        return lendingPool.borrowBalance(
            address(this),
            address(assetToken)
        );
    }

    function currentHealthFactor()
        external
        view
        returns (uint256)
    {
        return lendingPool.healthFactor(
            address(this)
        );
    }

    function pause() external onlyOwner {
        _pause();
        emit PositionPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        _unpause();
        emit PositionUnpaused(msg.sender);
    }
}
