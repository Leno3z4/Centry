// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/Pausable.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/ReentrancyGuard.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/ICentryOracle.sol";
import "./CentryInterestRateStrategy.sol";

/// @title Centry Lending Pool
/// @notice Arc-focused multi-reserve lending market.
/// @dev ERC-20 reserves only. Fee-on-transfer and rebasing behavior is rejected.
contract CentryLendingPool is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 public constant RAY = 1e27;
    uint256 public constant WAD = 1e18;
    uint256 public constant BPS = 10_000;
    uint256 public constant YEAR = 365 days;
    uint256 public constant MAX_CLOSE_FACTOR_BPS = 5_000;
    uint256 public constant MAX_RESERVES = 16;

    error AmountZero();
    error BorrowNotAllowed();
    error CapExceeded();
    error HealthFactorHealthy();
    error InsufficientBalance();
    error InsufficientLiquidity();
    error InvalidAddress();
    error InvalidOraclePrice();
    error InvalidRiskParams();
    error NothingToSweep();
    error ReserveExists();
    error ReserveLimit();
    error ReserveMissing();
    error UnsupportedDecimals();
    error UnsupportedTokenBehavior();

    struct Reserve {
        bool active;
        uint8 decimals;
        uint16 ltvBps;
        uint16 liquidationThresholdBps;
        uint16 liquidationBonusBps;
        uint16 reserveFactorBps;
        uint128 supplyCap;
        uint128 borrowCap;
        uint256 liquidityIndex;
        uint256 borrowIndex;
        uint256 totalScaledSupply;
        uint256 totalScaledBorrow;
        uint40 lastAccrual;
    }

    struct LiquidationQuote {
        uint256 debtToRepay;
        uint256 collateralToSeize;
        uint256 debtScaled;
        uint256 collateralScaled;
    }

    mapping(address => Reserve) public reserves;
    address[] public reserveList;

    mapping(address => mapping(address => uint256)) public scaledSupply;
    mapping(address => mapping(address => uint256)) public scaledBorrow;

    ICentryOracle public immutable oracle;
    CentryInterestRateStrategy public immutable rateStrategy;
    address public immutable treasury;

    event ReserveAdded(
        address indexed asset,
        uint8 decimals,
        uint16 ltvBps,
        uint16 liquidationThresholdBps,
        uint16 liquidationBonusBps,
        uint16 reserveFactorBps,
        uint128 supplyCap,
        uint128 borrowCap
    );

    event ReserveRiskUpdated(
        address indexed asset,
        uint16 ltvBps,
        uint16 liquidationThresholdBps,
        uint16 liquidationBonusBps,
        uint128 supplyCap,
        uint128 borrowCap
    );

    event Supplied(
        address indexed asset,
        address indexed user,
        uint256 amount,
        uint256 scaledAmount
    );

    event Withdrawn(
        address indexed asset,
        address indexed user,
        uint256 amount,
        uint256 scaledAmount
    );

    event Borrowed(
        address indexed asset,
        address indexed user,
        uint256 amount,
        uint256 scaledAmount
    );

    event Repaid(
        address indexed asset,
        address indexed payer,
        address indexed borrower,
        uint256 amount,
        uint256 scaledAmount
    );

    event Liquidated(
        address indexed collateralAsset,
        address indexed debtAsset,
        address indexed borrower,
        address liquidator,
        uint256 repaidDebt,
        uint256 seizedCollateral
    );

    event InterestAccrued(
        address indexed asset,
        uint256 liquidityIndex,
        uint256 borrowIndex,
        uint256 borrowRatePerYear,
        uint256 utilization
    );

    event ProtocolFeesSwept(
        address indexed asset,
        address indexed treasury,
        uint256 amount
    );

    constructor(
        address initialOwner,
        address oracle_,
        address rateStrategy_,
        address treasury_
    ) Ownable(initialOwner) {
        if (
            oracle_ == address(0) ||
            rateStrategy_ == address(0) ||
            treasury_ == address(0)
        ) {
            revert InvalidAddress();
        }

        oracle = ICentryOracle(oracle_);
        rateStrategy = CentryInterestRateStrategy(rateStrategy_);
        treasury = treasury_;
    }

    function addReserve(
        address asset,
        uint16 ltvBps,
        uint16 liquidationThresholdBps,
        uint16 liquidationBonusBps,
        uint16 reserveFactorBps,
        uint128 supplyCap,
        uint128 borrowCap
    ) external onlyOwner {
        if (asset == address(0)) {
            revert InvalidAddress();
        }

        if (reserves[asset].active) {
            revert ReserveExists();
        }

        if (reserveList.length >= MAX_RESERVES) {
            revert ReserveLimit();
        }

        _validateRiskParams(
            ltvBps,
            liquidationThresholdBps,
            liquidationBonusBps,
            reserveFactorBps,
            supplyCap,
            borrowCap
        );

        uint8 decimals = IERC20Metadata(asset).decimals();

        if (decimals == 0 || decimals > 18) {
            revert UnsupportedDecimals();
        }

        reserves[asset] = Reserve({
            active: true,
            decimals: decimals,
            ltvBps: ltvBps,
            liquidationThresholdBps: liquidationThresholdBps,
            liquidationBonusBps: liquidationBonusBps,
            reserveFactorBps: reserveFactorBps,
            supplyCap: supplyCap,
            borrowCap: borrowCap,
            liquidityIndex: RAY,
            borrowIndex: RAY,
            totalScaledSupply: 0,
            totalScaledBorrow: 0,
            lastAccrual: uint40(block.timestamp)
        });

        reserveList.push(asset);

        emit ReserveAdded(
            asset,
            decimals,
            ltvBps,
            liquidationThresholdBps,
            liquidationBonusBps,
            reserveFactorBps,
            supplyCap,
            borrowCap
        );
    }

    function setReserveRiskParams(
        address asset,
        uint16 ltvBps,
        uint16 liquidationThresholdBps,
        uint16 liquidationBonusBps,
        uint128 supplyCap,
        uint128 borrowCap
    ) external onlyOwner {
        Reserve storage reserve = _reserve(asset);

        _validateRiskParams(
            ltvBps,
            liquidationThresholdBps,
            liquidationBonusBps,
            reserve.reserveFactorBps,
            supplyCap,
            borrowCap
        );

        reserve.ltvBps = ltvBps;
        reserve.liquidationThresholdBps = liquidationThresholdBps;
        reserve.liquidationBonusBps = liquidationBonusBps;
        reserve.supplyCap = supplyCap;
        reserve.borrowCap = borrowCap;

        emit ReserveRiskUpdated(
            asset,
            ltvBps,
            liquidationThresholdBps,
            liquidationBonusBps,
            supplyCap,
            borrowCap
        );
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function supply(
        address asset,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        if (amount == 0) {
            revert AmountZero();
        }

        Reserve storage reserve = _accrue(asset);
        uint256 currentSupply = _currentSupply(reserve);

        if (currentSupply + amount > reserve.supplyCap) {
            revert CapExceeded();
        }

        uint256 scaledAmount = _toScaledUp(
            amount,
            reserve.liquidityIndex
        );

        IERC20 token = IERC20(asset);
        uint256 beforeBalance = token.balanceOf(address(this));

        token.safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        if (token.balanceOf(address(this)) - beforeBalance != amount) {
            revert UnsupportedTokenBehavior();
        }

        scaledSupply[msg.sender][asset] += scaledAmount;
        reserve.totalScaledSupply += scaledAmount;

        emit Supplied(
            asset,
            msg.sender,
            amount,
            scaledAmount
        );
    }

    function withdraw(
        address asset,
        uint256 amount
    ) external nonReentrant whenNotPaused returns (uint256 withdrawn) {
        Reserve storage reserve = _accrue(asset);
        uint256 userSupply = _currentUserSupply(
            reserve,
            msg.sender,
            asset
        );

        withdrawn = amount == type(uint256).max
            ? userSupply
            : amount;

        if (withdrawn == 0 || withdrawn > userSupply) {
            revert InsufficientBalance();
        }

        if (
            withdrawn >
            IERC20(asset).balanceOf(address(this))
        ) {
            revert InsufficientLiquidity();
        }

        uint256 scaledAmount = _toScaledUp(
            withdrawn,
            reserve.liquidityIndex
        );

        if (
            scaledAmount >
            scaledSupply[msg.sender][asset]
        ) {
            scaledAmount = scaledSupply[msg.sender][asset];
        }

        scaledSupply[msg.sender][asset] -= scaledAmount;
        reserve.totalScaledSupply -= scaledAmount;

        IERC20(asset).safeTransfer(
            msg.sender,
            withdrawn
        );

        if (
            _userDebtValue(msg.sender) != 0 &&
            healthFactor(msg.sender) < WAD
        ) {
            revert BorrowNotAllowed();
        }

        emit Withdrawn(
            asset,
            msg.sender,
            withdrawn,
            scaledAmount
        );
    }

    function borrow(
        address asset,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        if (amount == 0) {
            revert AmountZero();
        }

        Reserve storage reserve = _accrue(asset);
        uint256 currentBorrows = _currentBorrows(reserve);

        if (currentBorrows + amount > reserve.borrowCap) {
            revert CapExceeded();
        }

        if (
            IERC20(asset).balanceOf(address(this)) < amount
        ) {
            revert InsufficientLiquidity();
        }

        uint256 scaledAmount = _toScaledUp(
            amount,
            reserve.borrowIndex
        );

        scaledBorrow[msg.sender][asset] += scaledAmount;
        reserve.totalScaledBorrow += scaledAmount;

        if (!_withinBorrowLimit(msg.sender)) {
            scaledBorrow[msg.sender][asset] -= scaledAmount;
            reserve.totalScaledBorrow -= scaledAmount;
            revert BorrowNotAllowed();
        }

        IERC20(asset).safeTransfer(
            msg.sender,
            amount
        );

        emit Borrowed(
            asset,
            msg.sender,
            amount,
            scaledAmount
        );
    }

    function repay(
        address asset,
        uint256 amount
    ) external nonReentrant returns (uint256) {
        return _repay(
            asset,
            msg.sender,
            msg.sender,
            amount
        );
    }

    function repayFor(
        address asset,
        address borrower,
        uint256 amount
    ) external nonReentrant returns (uint256) {
        if (borrower == address(0)) {
            revert InvalidAddress();
        }

        return _repay(
            asset,
            msg.sender,
            borrower,
            amount
        );
    }

    function liquidate(
        address collateralAsset,
        address debtAsset,
        address borrower,
        uint256 debtAmount
    ) external nonReentrant whenNotPaused {
        if (borrower == address(0) || debtAmount == 0) {
            revert AmountZero();
        }

        if (healthFactor(borrower) >= WAD) {
            revert HealthFactorHealthy();
        }

        Reserve storage collateralReserve = _accrue(
            collateralAsset
        );
        Reserve storage debtReserve = _accrue(
            debtAsset
        );

        LiquidationQuote memory quote = _buildLiquidationQuote(
            collateralAsset,
            debtAsset,
            borrower,
            debtAmount,
            collateralReserve,
            debtReserve
        );

        _settleLiquidation(
            collateralAsset,
            debtAsset,
            borrower,
            quote,
            collateralReserve,
            debtReserve
        );

        emit Liquidated(
            collateralAsset,
            debtAsset,
            borrower,
            msg.sender,
            quote.debtToRepay,
            quote.collateralToSeize
        );
    }

    function sweepProtocolFees(
        address asset,
        uint256 amount
    ) external onlyOwner nonReentrant {
        Reserve storage reserve = _accrue(asset);

        uint256 assets =
            IERC20(asset).balanceOf(address(this)) +
            _currentBorrows(reserve);

        uint256 liabilities = _currentSupply(reserve);

        if (assets <= liabilities) {
            revert NothingToSweep();
        }

        uint256 available = assets - liabilities;
        uint256 requested = amount == type(uint256).max
            ? available
            : amount;

        if (requested == 0 || requested > available) {
            revert NothingToSweep();
        }

        IERC20(asset).safeTransfer(
            treasury,
            requested
        );

        emit ProtocolFeesSwept(
            asset,
            treasury,
            requested
        );
    }

    function currentSupply(
        address asset
    ) external view returns (uint256) {
        Reserve memory reserve = _reserveMemory(asset);

        return (
            reserve.totalScaledSupply *
            _projectLiquidityIndex(reserve, asset)
        ) / RAY;
    }

    function currentBorrow(
        address asset
    ) external view returns (uint256) {
        Reserve memory reserve = _reserveMemory(asset);

        return (
            reserve.totalScaledBorrow *
            _projectBorrowIndex(reserve, asset)
        ) / RAY;
    }

    function supplyBalance(
        address user,
        address asset
    ) external view returns (uint256) {
        Reserve memory reserve = _reserveMemory(asset);

        return (
            scaledSupply[user][asset] *
            _projectLiquidityIndex(reserve, asset)
        ) / RAY;
    }

    function borrowBalance(
        address user,
        address asset
    ) external view returns (uint256) {
        Reserve memory reserve = _reserveMemory(asset);

        return (
            scaledBorrow[user][asset] *
            _projectBorrowIndex(reserve, asset)
        ) / RAY;
    }

    function utilization(
        address asset
    ) public view returns (uint256) {
        Reserve memory reserve = _reserveMemory(asset);
        uint256 borrowAmount = (
            reserve.totalScaledBorrow *
            _projectBorrowIndex(reserve, asset)
        ) / RAY;
        uint256 cash = IERC20(asset).balanceOf(
            address(this)
        );

        if (borrowAmount == 0 || cash + borrowAmount == 0) {
            return 0;
        }

        return (borrowAmount * WAD) / (cash + borrowAmount);
    }

    function healthFactor(
        address user
    ) public view returns (uint256) {
        uint256 debtValue = _userDebtValue(user);

        if (debtValue == 0) {
            return type(uint256).max;
        }

        uint256 adjustedCollateral;

        for (uint256 i = 0; i < reserveList.length; ++i) {
            address asset = reserveList[i];
            Reserve memory reserve = reserves[asset];
            uint256 collateral = (
                scaledSupply[user][asset] *
                _projectLiquidityIndex(reserve, asset)
            ) / RAY;

            if (collateral == 0) {
                continue;
            }

            uint256 collateralValue = _assetValue(
                asset,
                collateral
            );

            adjustedCollateral += (
                collateralValue *
                reserve.liquidationThresholdBps
            ) / BPS;
        }

        return (adjustedCollateral * WAD) / debtValue;
    }

    function borrowPower(
        address user
    ) public view returns (uint256 power) {
        for (uint256 i = 0; i < reserveList.length; ++i) {
            address asset = reserveList[i];
            Reserve memory reserve = reserves[asset];
            uint256 collateral = (
                scaledSupply[user][asset] *
                _projectLiquidityIndex(reserve, asset)
            ) / RAY;

            if (collateral == 0) {
                continue;
            }

            uint256 collateralValue = _assetValue(
                asset,
                collateral
            );

            power += (
                collateralValue *
                reserve.ltvBps
            ) / BPS;
        }
    }

    function _validateRiskParams(
        uint16 ltvBps,
        uint16 liquidationThresholdBps,
        uint16 liquidationBonusBps,
        uint16 reserveFactorBps,
        uint128 supplyCap,
        uint128 borrowCap
    ) internal pure {
        if (
            ltvBps == 0 ||
            ltvBps > liquidationThresholdBps ||
            liquidationThresholdBps >= BPS
        ) {
            revert InvalidRiskParams();
        }

        if (
            liquidationBonusBps < BPS ||
            liquidationBonusBps > 12_000 ||
            reserveFactorBps > 3_000
        ) {
            revert InvalidRiskParams();
        }

        if (
            supplyCap == 0 ||
            borrowCap == 0 ||
            borrowCap > supplyCap
        ) {
            revert InvalidRiskParams();
        }
    }

    function _repay(
        address asset,
        address payer,
        address borrower,
        uint256 amount
    ) internal returns (uint256 repaid) {
        if (amount == 0) {
            revert AmountZero();
        }

        Reserve storage reserve = _accrue(asset);
        uint256 debt = _currentUserBorrow(
            reserve,
            borrower,
            asset
        );

        repaid = amount == type(uint256).max
            ? debt
            : amount;

        if (repaid == 0 || repaid > debt) {
            revert InsufficientBalance();
        }

        uint256 scaledAmount = _toScaledUp(
            repaid,
            reserve.borrowIndex
        );

        if (
            scaledAmount >
            scaledBorrow[borrower][asset]
        ) {
            scaledAmount = scaledBorrow[borrower][asset];
        }

        _pullExactToken(
            asset,
            payer,
            repaid
        );

        scaledBorrow[borrower][asset] -= scaledAmount;
        reserve.totalScaledBorrow -= scaledAmount;

        emit Repaid(
            asset,
            payer,
            borrower,
            repaid,
            scaledAmount
        );
    }

    function _buildLiquidationQuote(
        address collateralAsset,
        address debtAsset,
        address borrower,
        uint256 requestedDebt,
        Reserve storage collateralReserve,
        Reserve storage debtReserve
    ) internal view returns (LiquidationQuote memory quote) {
        uint256 borrowerDebt = _currentUserBorrow(
            debtReserve,
            borrower,
            debtAsset
        );

        uint256 maxRepay = (
            borrowerDebt * MAX_CLOSE_FACTOR_BPS
        ) / BPS;

        quote.debtToRepay = requestedDebt < maxRepay
            ? requestedDebt
            : maxRepay;

        if (quote.debtToRepay == 0) {
            revert InsufficientBalance();
        }

        uint256 debtValue = _assetValue(
            debtAsset,
            quote.debtToRepay
        );
        uint256 collateralPrice = _assetPrice(
            collateralAsset
        );

        quote.collateralToSeize = _collateralForDebtValue(
            debtValue,
            collateralPrice,
            collateralReserve
        );

        uint256 userCollateral = _currentUserSupply(
            collateralReserve,
            borrower,
            collateralAsset
        );

        if (quote.collateralToSeize > userCollateral) {
            quote.collateralToSeize = userCollateral;

            uint256 maxDebtValue = (
                quote.collateralToSeize *
                collateralPrice
            ) / (10 ** collateralReserve.decimals);

            maxDebtValue = (
                maxDebtValue * BPS
            ) / collateralReserve.liquidationBonusBps;

            quote.debtToRepay = _amountFromValue(
                debtAsset,
                maxDebtValue
            );

            if (quote.debtToRepay > maxRepay) {
                quote.debtToRepay = maxRepay;
            }
        }

        if (
            quote.debtToRepay == 0 ||
            quote.collateralToSeize == 0
        ) {
            revert InsufficientBalance();
        }

        quote.debtScaled = _toScaledUp(
            quote.debtToRepay,
            debtReserve.borrowIndex
        );

        if (
            quote.debtScaled >
            scaledBorrow[borrower][debtAsset]
        ) {
            quote.debtScaled = scaledBorrow[borrower][debtAsset];
        }

        quote.collateralScaled = _toScaledUp(
            quote.collateralToSeize,
            collateralReserve.liquidityIndex
        );

        if (
            quote.collateralScaled >
            scaledSupply[borrower][collateralAsset]
        ) {
            quote.collateralScaled = scaledSupply[
                borrower
            ][collateralAsset];
        }
    }

    function _settleLiquidation(
        address collateralAsset,
        address debtAsset,
        address borrower,
        LiquidationQuote memory quote,
        Reserve storage collateralReserve,
        Reserve storage debtReserve
    ) internal {
        _pullExactToken(
            debtAsset,
            msg.sender,
            quote.debtToRepay
        );

        scaledBorrow[borrower][debtAsset] -= quote.debtScaled;
        debtReserve.totalScaledBorrow -= quote.debtScaled;

        scaledSupply[borrower][collateralAsset] -= quote.collateralScaled;
        collateralReserve.totalScaledSupply -= quote.collateralScaled;

        IERC20(collateralAsset).safeTransfer(
            msg.sender,
            quote.collateralToSeize
        );
    }

    function _pullExactToken(
        address asset,
        address payer,
        uint256 amount
    ) internal {
        IERC20 token = IERC20(asset);
        uint256 beforeBalance = token.balanceOf(
            address(this)
        );

        token.safeTransferFrom(
            payer,
            address(this),
            amount
        );

        if (
            token.balanceOf(address(this)) - beforeBalance !=
            amount
        ) {
            revert UnsupportedTokenBehavior();
        }
    }

    function _collateralForDebtValue(
        uint256 debtValue,
        uint256 collateralPrice,
        Reserve storage collateralReserve
    ) internal view returns (uint256) {
        if (collateralPrice == 0) {
            revert InvalidOraclePrice();
        }

        return (
            debtValue *
            uint256(collateralReserve.liquidationBonusBps) *
            (10 ** collateralReserve.decimals)
        ) / (
            collateralPrice * BPS
        );
    }

    function _userDebtValue(
        address user
    ) internal view returns (uint256 total) {
        for (uint256 i = 0; i < reserveList.length; ++i) {
            address asset = reserveList[i];
            Reserve memory reserve = reserves[asset];
            uint256 debt = (
                scaledBorrow[user][asset] *
                _projectBorrowIndex(reserve, asset)
            ) / RAY;

            if (debt == 0) {
                continue;
            }

            total += _assetValue(
                asset,
                debt
            );
        }
    }

    function _withinBorrowLimit(
        address user
    ) internal view returns (bool) {
        return _userDebtValue(user) <= borrowPower(user);
    }

    function _reserve(
        address asset
    ) internal view returns (Reserve storage reserve) {
        reserve = reserves[asset];

        if (!reserve.active) {
            revert ReserveMissing();
        }
    }

    function _reserveMemory(
        address asset
    ) internal view returns (Reserve memory reserve) {
        reserve = reserves[asset];

        if (!reserve.active) {
            revert ReserveMissing();
        }
    }

    function _accrue(
        address asset
    ) internal returns (Reserve storage reserve) {
        reserve = _reserve(asset);

        uint256 elapsed =
            block.timestamp - reserve.lastAccrual;

        if (elapsed == 0) {
            return reserve;
        }

        uint256 borrowAmount = _currentBorrows(reserve);
        uint256 cash = IERC20(asset).balanceOf(
            address(this)
        );
        uint256 utilizationE18 = _utilizationFromAmounts(
            borrowAmount,
            cash
        );
        uint256 borrowRate = rateStrategy.getBorrowRate(
            utilizationE18
        );

        uint256 borrowGrowth =
            WAD + (borrowRate * elapsed) / YEAR;

        reserve.borrowIndex = (
            reserve.borrowIndex * borrowGrowth
        ) / WAD;

        uint256 supplyRate = (
            borrowRate *
            utilizationE18 *
            (BPS - reserve.reserveFactorBps)
        ) / (WAD * BPS);

        uint256 supplyGrowth =
            WAD + (supplyRate * elapsed) / YEAR;

        reserve.liquidityIndex = (
            reserve.liquidityIndex * supplyGrowth
        ) / WAD;

        reserve.lastAccrual = uint40(block.timestamp);

        emit InterestAccrued(
            asset,
            reserve.liquidityIndex,
            reserve.borrowIndex,
            borrowRate,
            utilizationE18
        );
    }

    function _currentSupply(
        Reserve memory reserve
    ) internal pure returns (uint256) {
        return (
            reserve.totalScaledSupply *
            reserve.liquidityIndex
        ) / RAY;
    }

    function _currentBorrows(
        Reserve memory reserve
    ) internal pure returns (uint256) {
        return (
            reserve.totalScaledBorrow *
            reserve.borrowIndex
        ) / RAY;
    }

    function _currentUserSupply(
        Reserve storage reserve,
        address user,
        address asset
    ) internal view returns (uint256) {
        return (
            scaledSupply[user][asset] *
            reserve.liquidityIndex
        ) / RAY;
    }

    function _currentUserBorrow(
        Reserve storage reserve,
        address user,
        address asset
    ) internal view returns (uint256) {
        return (
            scaledBorrow[user][asset] *
            reserve.borrowIndex
        ) / RAY;
    }

    function _projectLiquidityIndex(
        Reserve memory reserve,
        address asset
    ) internal view returns (uint256) {
        if (
            reserve.lastAccrual ==
            uint40(block.timestamp)
        ) {
            return reserve.liquidityIndex;
        }

        uint256 elapsed =
            block.timestamp - reserve.lastAccrual;
        uint256 borrowAmount = _currentBorrows(reserve);
        uint256 cash = IERC20(asset).balanceOf(
            address(this)
        );
        uint256 utilizationE18 = _utilizationFromAmounts(
            borrowAmount,
            cash
        );
        uint256 borrowRate = rateStrategy.getBorrowRate(
            utilizationE18
        );

        uint256 supplyRate = (
            borrowRate *
            utilizationE18 *
            (BPS - reserve.reserveFactorBps)
        ) / (WAD * BPS);

        uint256 growth =
            WAD + (supplyRate * elapsed) / YEAR;

        return (
            reserve.liquidityIndex * growth
        ) / WAD;
    }

    function _projectBorrowIndex(
        Reserve memory reserve,
        address asset
    ) internal view returns (uint256) {
        if (
            reserve.lastAccrual ==
            uint40(block.timestamp)
        ) {
            return reserve.borrowIndex;
        }

        uint256 elapsed =
            block.timestamp - reserve.lastAccrual;
        uint256 borrowAmount = _currentBorrows(reserve);
        uint256 cash = IERC20(asset).balanceOf(
            address(this)
        );
        uint256 utilizationE18 = _utilizationFromAmounts(
            borrowAmount,
            cash
        );
        uint256 borrowRate = rateStrategy.getBorrowRate(
            utilizationE18
        );

        uint256 growth =
            WAD + (borrowRate * elapsed) / YEAR;

        return (
            reserve.borrowIndex * growth
        ) / WAD;
    }

    function _utilizationFromAmounts(
        uint256 borrowAmount,
        uint256 cash
    ) internal pure returns (uint256) {
        if (borrowAmount == 0 || cash + borrowAmount == 0) {
            return 0;
        }

        return (borrowAmount * WAD) / (cash + borrowAmount);
    }

    function _assetPrice(
        address asset
    ) internal view returns (uint256 priceE18) {
        (priceE18, ) = oracle.getPrice(asset);

        if (priceE18 == 0) {
            revert InvalidOraclePrice();
        }
    }

    function _assetValue(
        address asset,
        uint256 amount
    ) internal view returns (uint256) {
        Reserve memory reserve = _reserveMemory(asset);
        uint256 price = _assetPrice(asset);

        return (
            amount *
            price
        ) / (10 ** reserve.decimals);
    }

    function _amountFromValue(
        address asset,
        uint256 valueE18
    ) internal view returns (uint256) {
        Reserve memory reserve = _reserveMemory(asset);
        uint256 price = _assetPrice(asset);

        if (price == 0) {
            revert InvalidOraclePrice();
        }

        return (
            valueE18 *
            (10 ** reserve.decimals)
        ) / price;
    }

    function _toScaledUp(
        uint256 amount,
        uint256 index
    ) internal pure returns (uint256) {
        return (amount * RAY + index - 1) / index;
    }
}
