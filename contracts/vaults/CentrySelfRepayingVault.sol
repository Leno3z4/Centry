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

interface ICentryYieldVault {
    function asset() external view returns (address);

    function approve(
        address spender,
        uint256 amount
    ) external returns (bool);

    function deposit(
        uint256 assets,
        address receiver
    ) external returns (uint256 shares);

    function redeem(
        uint256 shares,
        address receiver,
        address owner_
    ) external returns (uint256 assets);

    function convertToAssets(
        uint256 shares
    ) external view returns (uint256 assets);
}

/// @title Centry Self-Repaying Vault
/// @notice Isolated user position that supplies a selected collateral asset
///         to the existing Centry lending pool, borrows the fixed debt asset,
///         invests the debt asset in the Centry Yield Vault, and uses
///         realized positive yield to repay the debt.
/// @dev Collateral is supplied to the lending pool when deposited so the
///      position can be inspected before borrowing. The debt/yield asset is
///      fixed by the configured yield vault.
contract CentrySelfRepayingVault is
    Ownable2Step,
    ReentrancyGuard,
    Pausable
{
    using SafeERC20 for IERC20;

    uint256 public constant WAD = 1e18;

    ICentryLendingPool public immutable lendingPool;
    ICentryYieldVault public immutable yieldVault;
    IERC20 public immutable collateralAsset;
    IERC20 public immutable debtAsset;

    uint256 public collateralSupplied;
    uint256 public yieldPrincipal;
    uint256 public yieldShares;
    uint256 public totalRepaid;
    bool public positionOpen;

    error InvalidAddress();
    error InvalidAsset();
    error UnsupportedCollateral();
    error UnsupportedDebtAsset();
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
        address indexed asset,
        uint256 amount
    );

    event CollateralWithdrawn(
        address indexed owner,
        uint256 amount
    );

    event PositionOpened(
        address indexed owner,
        address indexed collateralAsset,
        uint256 collateral,
        uint256 borrowed,
        uint256 yieldShares
    );

    event YieldHarvested(
        uint256 assetsRedeemed,
        uint256 remainingYieldAssets,
        uint256 profit
    );

    event DebtRepaid(
        uint256 amount,
        uint256 remainingDebt
    );

    event PositionClosed(
        address indexed owner,
        uint256 returnedCollateral,
        uint256 returnedYieldAssets
    );

    event PositionPaused(address indexed account);
    event PositionUnpaused(address indexed account);

    constructor(
        address initialOwner,
        address lendingPool_,
        address collateralAsset_,
        address debtAsset_,
        address yieldVault_
    ) Ownable(initialOwner) {
        if (
            initialOwner == address(0) ||
            lendingPool_ == address(0) ||
            collateralAsset_ == address(0) ||
            debtAsset_ == address(0) ||
            yieldVault_ == address(0)
        ) {
            revert InvalidAddress();
        }

        if (
            ICentryYieldVault(yieldVault_).asset() != debtAsset_
        ) {
            revert InvalidAsset();
        }

        _requireActiveReserve(
            lendingPool_,
            collateralAsset_
        );

        _requireActiveReserve(
            lendingPool_,
            debtAsset_
        );

        lendingPool = ICentryLendingPool(lendingPool_);
        yieldVault = ICentryYieldVault(yieldVault_);
        collateralAsset = IERC20(collateralAsset_);
        debtAsset = IERC20(debtAsset_);
    }

    function _requireActiveReserve(
        address pool,
        address asset
    ) internal view {
        (
            bool success,
            bytes memory data
        ) = pool.staticcall(
            abi.encodeWithSelector(
                ICentryLendingPool.getReserveConfig.selector,
                asset
            )
        );

        if (!success || data.length < 32) {
            revert UnsupportedCollateral();
        }

        bool active = abi.decode(
            data,
            (bool)
        );

        if (!active) {
            revert UnsupportedCollateral();
        }
    }

    function depositCollateral(
        uint256 amount
    ) external onlyOwner whenNotPaused nonReentrant {
        if (positionOpen) {
            revert PositionActive();
        }

        if (amount == 0) {
            revert AmountZero();
        }

        collateralAsset.safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        collateralAsset.forceApprove(
            address(lendingPool),
            amount
        );

        lendingPool.supply(
            address(collateralAsset),
            amount
        );

        collateralSupplied += amount;

        emit CollateralDeposited(
            msg.sender,
            address(collateralAsset),
            amount
        );
    }

    function withdrawUnopenedCollateral(
        uint256 amount
    ) external onlyOwner whenNotPaused nonReentrant {
        if (positionOpen) {
            revert PositionActive();
        }

        if (
            amount == 0 ||
            amount > collateralSupplied
        ) {
            revert AmountZero();
        }

        uint256 withdrawn = lendingPool.withdraw(
            address(collateralAsset),
            amount
        );

        if (withdrawn != amount) {
            revert InvalidVaultState();
        }

        collateralSupplied -= amount;

        collateralAsset.safeTransfer(
            msg.sender,
            amount
        );

        emit CollateralWithdrawn(
            msg.sender,
            amount
        );
    }

    function openPosition(
        uint256 borrowAmount
    ) external onlyOwner whenNotPaused nonReentrant {
        if (positionOpen) {
            revert PositionAlreadyOpen();
        }

        if (
            collateralSupplied == 0 ||
            borrowAmount == 0
        ) {
            revert AmountZero();
        }

        lendingPool.borrow(
            address(debtAsset),
            borrowAmount
        );

        debtAsset.forceApprove(
            address(yieldVault),
            borrowAmount
        );

        uint256 shares = yieldVault.deposit(
            borrowAmount,
            address(this)
        );

        if (shares == 0) {
            revert InvalidVaultState();
        }

        uint256 health = lendingPool.healthFactor(
            address(this)
        );

        if (health < WAD) {
            revert HealthFactorTooLow();
        }

        yieldShares = shares;
        yieldPrincipal = borrowAmount;
        positionOpen = true;

        emit PositionOpened(
            msg.sender,
            address(collateralAsset),
            collateralSupplied,
            borrowAmount,
            shares
        );
    }

    /// @notice Approves this position to redeem its own cYLD shares, then
    ///         realizes yield and uses only positive profit above principal
    ///         to repay the debt.
    /// @dev Permissionless. The caller cannot redirect harvested funds.
    function harvestAndRepay()
        external
        whenNotPaused
        nonReentrant
        returns (uint256 repaidAmount)
    {
        if (!positionOpen) {
            revert PositionNotOpen();
        }

        uint256 debt = lendingPool.borrowBalance(
            address(this),
            address(debtAsset)
        );

        if (debt == 0) {
            revert NoDebt();
        }

        if (yieldShares == 0) {
            revert NoYield();
        }

        uint256 beforeBalance = debtAsset.balanceOf(
            address(this)
        );

        uint256 sharesToRedeem = yieldShares;

        yieldVault.approve(
            address(this),
            sharesToRedeem
        );

        uint256 redeemed = yieldVault.redeem(
            sharesToRedeem,
            address(this),
            address(this)
        );

        uint256 received =
            debtAsset.balanceOf(address(this)) -
            beforeBalance;

        if (
            received != redeemed ||
            received == 0
        ) {
            revert InvalidVaultState();
        }

        uint256 profit = received > yieldPrincipal
            ? received - yieldPrincipal
            : 0;

        if (profit > 0) {
            repaidAmount = profit > debt
                ? debt
                : profit;

            debtAsset.forceApprove(
                address(lendingPool),
                repaidAmount
            );

            uint256 actualRepaid = lendingPool.repayFor(
                address(debtAsset),
                address(this),
                repaidAmount
            );

            if (actualRepaid != repaidAmount) {
                revert InvalidVaultState();
            }

            totalRepaid += actualRepaid;
        }

        uint256 remainingAssets = received - repaidAmount;

        if (remainingAssets > 0) {
            debtAsset.forceApprove(
                address(yieldVault),
                remainingAssets
            );

            uint256 newShares = yieldVault.deposit(
                remainingAssets,
                address(this)
            );

            if (newShares == 0) {
                revert InvalidVaultState();
            }

            yieldShares = newShares;
        } else {
            yieldShares = 0;
        }

        emit YieldHarvested(
            received,
            remainingAssets,
            profit
        );

        emit DebtRepaid(
            repaidAmount,
            lendingPool.borrowBalance(
                address(this),
                address(debtAsset)
            )
        );
    }

    function currentYieldAssets()
        external
        view
        returns (uint256)
    {
        return yieldVault.convertToAssets(
            yieldShares
        );
    }

    function currentDebt()
        external
        view
        returns (uint256)
    {
        return lendingPool.borrowBalance(
            address(this),
            address(debtAsset)
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

    function harvestableProfit()
        external
        view
        returns (uint256)
    {
        uint256 currentAssets = yieldVault.convertToAssets(
            yieldShares
        );

        return currentAssets > yieldPrincipal
            ? currentAssets - yieldPrincipal
            : 0;
    }

    function closePosition()
        external
        onlyOwner
        whenNotPaused
        nonReentrant
        returns (
            uint256 returnedCollateral,
            uint256 returnedYieldAssets
        )
    {
        if (!positionOpen) {
            revert PositionNotOpen();
        }

        uint256 debt = lendingPool.borrowBalance(
            address(this),
            address(debtAsset)
        );

        if (debt != 0) {
            revert DebtOutstanding();
        }

        if (yieldShares > 0) {
            yieldVault.approve(
                address(this),
                yieldShares
            );

            returnedYieldAssets = yieldVault.redeem(
                yieldShares,
                address(this),
                address(this)
            );
        }

        yieldShares = 0;
        yieldPrincipal = 0;

        if (collateralSupplied > 0) {
            returnedCollateral = lendingPool.withdraw(
                address(collateralAsset),
                type(uint256).max
            );
        }

        collateralSupplied = 0;
        positionOpen = false;

        if (returnedCollateral > 0) {
            collateralAsset.safeTransfer(
                owner(),
                returnedCollateral
            );
        }

        if (returnedYieldAssets > 0) {
            debtAsset.safeTransfer(
                owner(),
                returnedYieldAssets
            );
        }

        emit PositionClosed(
            owner(),
            returnedCollateral,
            returnedYieldAssets
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
