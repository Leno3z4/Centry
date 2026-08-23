// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./CentryOracle.sol";
import "./CentryInterestRateModel.sol";

interface ICentryRewardDistributor {
    function handleSupplyChange(address user, address asset, uint256 oldUserUnits, uint256 newTotalSupplyUnits) external;
    function handleBorrowChange(address user, address asset, uint256 oldUserUnits, uint256 newTotalBorrowUnits) external;
}

contract CentryLendingPool is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 public constant WAD = 1e18;
    uint256 public constant MAX_COLLATERAL_ASSETS = 8;
    uint256 public constant MAX_RESERVE_FACTOR = 0.30e18;
    uint256 public constant MAX_LIQUIDATION_BONUS = 1.20e18;

    IERC20 public immutable usdc;

    struct CollateralConfig { bool active; uint256 ltv; uint256 liquidationThreshold; uint256 liquidationBonus; }
    mapping(address => CollateralConfig) public collateralConfigs;
    mapping(address => mapping(address => uint256)) public collateralBalances;
    mapping(address => uint256) public totalCollateral;
    mapping(address => address[]) private _userCollateralList;
    mapping(address => mapping(address => bool)) private _inCollateralList;

    uint256 public totalSupplyAssets;
    uint256 public totalSupplyShares;
    mapping(address => uint256) public supplyShares;

    uint256 public totalBorrows;
    uint256 public totalBorrowShares;
    mapping(address => uint256) public borrowShares;
    uint256 public lastAccrual;

    uint256 public protocolReserves;
    uint256 public reserveFactor;
    address public oracle;
    address public interestRateModel;
    address public authorisedVault;
    address public rewardDistributor;

    event CollateralConfigured(address indexed asset, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus);
    event CollateralDisabled(address indexed asset);
    event Supplied(address indexed user, uint256 amount, uint256 shares);
    event Withdrawn(address indexed user, uint256 amount, uint256 shares);
    event CollateralSupplied(address indexed user, address indexed asset, uint256 amount);
    event CollateralWithdrawn(address indexed user, address indexed asset, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed borrower, address indexed payer, uint256 amount);
    event Liquidated(address indexed liquidator, address indexed borrower, address indexed collateral, uint256 debtRepaid, uint256 collateralSeized);
    event ReservesWithdrawn(address indexed to, uint256 amount);
    event OracleUpdated(address newOracle);
    event IrmUpdated(address newIrm);
    event ReserveFactorUpdated(uint256 newFactor);
    event AuthorisedVaultUpdated(address vault);
    event RewardDistributorUpdated(address distributor);

    constructor(address initialOwner, address usdc_, address oracle_, address interestRateModel_, uint256 reserveFactor_) Ownable(initialOwner) {
        require(usdc_ != address(0) && oracle_ != address(0) && interestRateModel_ != address(0), "pool: zero address");
        require(reserveFactor_ <= MAX_RESERVE_FACTOR, "pool: reserve too high");
        usdc = IERC20(usdc_); oracle = oracle_; interestRateModel = interestRateModel_; reserveFactor = reserveFactor_; lastAccrual = block.timestamp;
    }

    function configureCollateral(address asset, uint256 ltv_, uint256 liquidationThreshold_, uint256 liquidationBonus_) external onlyOwner {
        require(asset != address(0), "pool: asset=0");
        require(ltv_ > 0 && ltv_ < liquidationThreshold_ && liquidationThreshold_ < WAD, "pool: bad thresholds");
        require(liquidationBonus_ >= WAD && liquidationBonus_ <= MAX_LIQUIDATION_BONUS, "pool: bad bonus");
        collateralConfigs[asset] = CollateralConfig(true, ltv_, liquidationThreshold_, liquidationBonus_);
        emit CollateralConfigured(asset, ltv_, liquidationThreshold_, liquidationBonus_);
    }
    function disableCollateral(address asset) external onlyOwner { collateralConfigs[asset].active = false; emit CollateralDisabled(asset); }
    function setOracle(address oracle_) external onlyOwner { require(oracle_ != address(0), "pool: oracle=0"); oracle = oracle_; emit OracleUpdated(oracle_); }
    function setInterestRateModel(address irm_) external onlyOwner { require(irm_ != address(0), "pool: irm=0"); interestRateModel = irm_; emit IrmUpdated(irm_); }
    function setReserveFactor(uint256 factor) external onlyOwner { require(factor <= MAX_RESERVE_FACTOR, "pool: reserve too high"); accrueInterest(); reserveFactor = factor; emit ReserveFactorUpdated(factor); }
    function setAuthorisedVault(address vault) external onlyOwner { require(vault != address(0), "pool: vault=0"); authorisedVault = vault; emit AuthorisedVaultUpdated(vault); }
    function setRewardDistributor(address distributor) external onlyOwner { require(distributor != address(0), "pool: distributor=0"); rewardDistributor = distributor; emit RewardDistributorUpdated(distributor); }

    function withdrawReserves(uint256 amount, address to) external onlyOwner {
        require(to != address(0), "pool: to=0"); require(amount > 0 && amount <= protocolReserves, "pool: invalid reserves");
        require(amount <= usdc.balanceOf(address(this)), "pool: reserves not liquid"); protocolReserves -= amount; usdc.safeTransfer(to, amount); emit ReservesWithdrawn(to, amount);
    }

    function accrueInterest() public {
        uint256 elapsed = block.timestamp - lastAccrual; if (elapsed == 0) return; lastAccrual = block.timestamp; if (totalBorrows == 0) return;
        uint256 ratePerSecond = CentryInterestRateModel(interestRateModel).borrowRatePerSecond(_cash(), totalBorrows);
        uint256 interestFactor = Math.mulDiv(ratePerSecond, elapsed, 1);
        uint256 interest = Math.mulDiv(totalBorrows, interestFactor, WAD); if (interest == 0) return;
        uint256 reserveShare = Math.mulDiv(interest, reserveFactor, WAD); totalBorrows += interest; protocolReserves += reserveShare; totalSupplyAssets += interest - reserveShare;
    }

    function supply(uint256 amount) external nonReentrant returns (uint256 shares) {
        require(amount > 0, "pool: amount=0"); accrueInterest(); shares = _toSupplyShares(amount); require(shares > 0, "pool: shares=0");
        if (rewardDistributor != address(0)) ICentryRewardDistributor(rewardDistributor).handleSupplyChange(msg.sender, address(usdc), supplyShares[msg.sender], totalSupplyShares + shares);
        usdc.safeTransferFrom(msg.sender, address(this), amount); supplyShares[msg.sender] += shares; totalSupplyShares += shares; totalSupplyAssets += amount;
        emit Supplied(msg.sender, amount, shares);
    }

    function withdraw(uint256 shares) external nonReentrant returns (uint256 amount) {
        require(shares > 0, "pool: shares=0"); accrueInterest(); if (shares == type(uint256).max) shares = supplyShares[msg.sender];
        require(shares > 0 && supplyShares[msg.sender] >= shares, "pool: insufficient shares"); amount = _fromSupplyShares(shares); require(amount > 0 && amount <= _cash(), "pool: insufficient liquidity");
        if (rewardDistributor != address(0)) ICentryRewardDistributor(rewardDistributor).handleSupplyChange(msg.sender, address(usdc), supplyShares[msg.sender], totalSupplyShares - shares);
        supplyShares[msg.sender] -= shares; totalSupplyShares -= shares; totalSupplyAssets -= amount; usdc.safeTransfer(msg.sender, amount); emit Withdrawn(msg.sender, amount, shares);
    }

    function supplyCollateral(address asset, uint256 amount, address onBehalfOf) external nonReentrant {
        require(amount > 0 && onBehalfOf != address(0), "pool: invalid collateral"); require(collateralConfigs[asset].active, "pool: unsupported collateral");
        if (!_inCollateralList[onBehalfOf][asset]) { require(_userCollateralList[onBehalfOf].length < MAX_COLLATERAL_ASSETS, "pool: too many collateral assets"); _userCollateralList[onBehalfOf].push(asset); _inCollateralList[onBehalfOf][asset] = true; }
        if (rewardDistributor != address(0)) ICentryRewardDistributor(rewardDistributor).handleSupplyChange(onBehalfOf, asset, collateralBalances[onBehalfOf][asset], totalCollateral[asset] + amount);
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount); collateralBalances[onBehalfOf][asset] += amount; totalCollateral[asset] += amount; emit CollateralSupplied(onBehalfOf, asset, amount);
    }

    function withdrawCollateral(address asset, uint256 amount) external nonReentrant { _withdrawCollateral(msg.sender, asset, amount, msg.sender); }
    function withdrawCollateralFor(address user, address asset, uint256 amount, address recipient) external nonReentrant { require(msg.sender == authorisedVault, "pool: not vault"); require(user != address(0) && recipient != address(0), "pool: zero address"); _withdrawCollateral(user, asset, amount, recipient); }

    function _withdrawCollateral(address user, address asset, uint256 amount, address recipient) internal {
        require(amount > 0 && collateralBalances[user][asset] >= amount, "pool: insufficient collateral");
        require(healthFactorAfterCollateralChange(user, asset, amount) >= WAD, "pool: would become unhealthy");
        if (rewardDistributor != address(0)) ICentryRewardDistributor(rewardDistributor).handleSupplyChange(user, asset, collateralBalances[user][asset], totalCollateral[asset] - amount);
        collateralBalances[user][asset] -= amount; totalCollateral[asset] -= amount; IERC20(asset).safeTransfer(recipient, amount); emit CollateralWithdrawn(user, asset, amount);
    }

    function borrow(uint256 amount) external nonReentrant { _borrow(msg.sender, amount, msg.sender); }
    function borrowFor(address onBehalfOf, uint256 amount, address recipient) external nonReentrant { require(msg.sender == authorisedVault, "pool: not vault"); require(onBehalfOf != address(0) && recipient != address(0), "pool: zero address"); _borrow(onBehalfOf, amount, recipient); }

    function _borrow(address borrower, uint256 amount, address recipient) internal {
        require(amount > 0, "pool: amount=0"); accrueInterest(); require(amount <= _cash(), "pool: insufficient liquidity"); require(amount <= borrowCapacity(borrower), "pool: ltv exceeded");
        uint256 shares = _toBorrowShares(amount); require(shares > 0, "pool: borrow shares=0");
        if (rewardDistributor != address(0)) ICentryRewardDistributor(rewardDistributor).handleBorrowChange(borrower, address(usdc), borrowShares[borrower], totalBorrowShares + shares);
        borrowShares[borrower] += shares; totalBorrowShares += shares; totalBorrows += amount;
        require(healthFactor(borrower) >= WAD, "pool: insufficient collateral"); usdc.safeTransfer(recipient, amount); emit Borrowed(borrower, amount);
    }

    function repay(address onBehalfOf, uint256 amount) external nonReentrant returns (uint256 paid) { require(onBehalfOf != address(0), "pool: onBehalfOf=0"); return _repay(onBehalfOf, msg.sender, amount); }
    function repayFor(address onBehalfOf, uint256 amount) external nonReentrant returns (uint256 paid) { require(msg.sender == authorisedVault, "pool: not vault"); return _repay(onBehalfOf, msg.sender, amount); }

    function _repay(address borrower, address payer, uint256 amount) internal returns (uint256 paid) {
        accrueInterest(); uint256 currentDebt = _currentDebt(borrower); require(currentDebt > 0, "pool: no debt"); if (amount == type(uint256).max || amount > currentDebt) amount = currentDebt;
        uint256 shares = _debtToShares(amount); if (shares == 0) shares = 1; if (shares > borrowShares[borrower]) shares = borrowShares[borrower]; paid = _sharesToDebt(shares); require(paid > 0 && paid <= currentDebt, "pool: invalid repay");
        if (rewardDistributor != address(0)) ICentryRewardDistributor(rewardDistributor).handleBorrowChange(borrower, address(usdc), borrowShares[borrower], totalBorrowShares - shares);
        borrowShares[borrower] -= shares; totalBorrowShares -= shares; totalBorrows -= paid; usdc.safeTransferFrom(payer, address(this), paid); emit Repaid(borrower, payer, paid);
    }

    function liquidate(address borrower, address collateralAsset, uint256 debtAmount) external nonReentrant {
        require(borrower != msg.sender, "pool: self-liquidation"); accrueInterest(); require(healthFactor(borrower) < WAD, "pool: position healthy");
        CollateralConfig memory cfg = collateralConfigs[collateralAsset]; require(cfg.active, "pool: collateral not active"); uint256 currentDebt = _currentDebt(borrower); require(currentDebt > 0, "pool: no debt");
        uint256 maxRepay = currentDebt / 2; if (debtAmount > maxRepay) debtAmount = maxRepay; require(debtAmount > 0, "pool: debtAmount=0");
        uint256 shares = _debtToShares(debtAmount); if (shares == 0) shares = 1; if (shares > borrowShares[borrower]) shares = borrowShares[borrower]; uint256 actualDebt = _sharesToDebt(shares); require(actualDebt > 0, "pool: actual debt=0");
        uint256 debtValueUSD = _toUSDValue(address(usdc), actualDebt); uint256 collateralToSeize = _fromUSDValue(collateralAsset, Math.mulDiv(debtValueUSD, cfg.liquidationBonus, WAD)); uint256 available = collateralBalances[borrower][collateralAsset]; if (collateralToSeize > available) collateralToSeize = available; require(collateralToSeize > 0, "pool: no collateral to seize");
        if (rewardDistributor != address(0)) {
            ICentryRewardDistributor(rewardDistributor).handleBorrowChange(borrower, address(usdc), borrowShares[borrower], totalBorrowShares - shares);
            ICentryRewardDistributor(rewardDistributor).handleSupplyChange(borrower, collateralAsset, collateralBalances[borrower][collateralAsset], totalCollateral[collateralAsset] - collateralToSeize);
        }
        borrowShares[borrower] -= shares; totalBorrowShares -= shares; totalBorrows -= actualDebt; collateralBalances[borrower][collateralAsset] -= collateralToSeize; totalCollateral[collateralAsset] -= collateralToSeize;
        usdc.safeTransferFrom(msg.sender, address(this), actualDebt); IERC20(collateralAsset).safeTransfer(msg.sender, collateralToSeize); emit Liquidated(msg.sender, borrower, collateralAsset, actualDebt, collateralToSeize);
    }

    function healthFactor(address user) public view returns (uint256) { uint256 debtUSD = _currentDebtUSD(user); if (debtUSD == 0) return type(uint256).max; return Math.mulDiv(_weightedCollateralUSD(user), WAD, debtUSD); }
    function healthFactorAfterCollateralChange(address user, address asset, uint256 removedAmount) public view returns (uint256) {
        uint256 debtUSD = _currentDebtUSD(user); if (debtUSD == 0) return type(uint256).max;
        uint256 currentWeighted = _weightedCollateralUSD(user); uint256 removedValue = Math.mulDiv(_toUSDValue(asset, removedAmount), collateralConfigs[asset].liquidationThreshold, WAD);
        if (removedValue >= currentWeighted) return 0; return Math.mulDiv(currentWeighted - removedValue, WAD, debtUSD);
    }
    function availableLiquidity() external view returns (uint256) { return _cash(); }
    function supplyBalance(address user) external view returns (uint256) { return _fromSupplyShares(supplyShares[user]); }
    function debtOf(address user) external view returns (uint256) { return _currentDebt(user); }

    function borrowCapacity(address user) public view returns (uint256) {
        uint256 currentDebtUSD = _currentDebtUSD(user); uint256 maxDebtUSD; address[] memory assets = _userCollateralList[user];
        for (uint256 i; i < assets.length; ++i) { address asset = assets[i]; uint256 bal = collateralBalances[user][asset]; if (bal == 0) continue; maxDebtUSD += Math.mulDiv(_toUSDValue(asset, bal), collateralConfigs[asset].ltv, WAD); }
        if (maxDebtUSD <= currentDebtUSD) return 0; return _fromUSDValue(address(usdc), maxDebtUSD - currentDebtUSD);
    }

    function collateralValueUSD(address user, address asset) external view returns (uint256) { return _toUSDValue(asset, collateralBalances[user][asset]); }
    function getReserveData() external view returns (uint256 totalLiquidity, uint256 totalBorrowsOut, uint256 borrowRatePerYear, uint256 supplyRatePerYear) { uint256 cash = _cash(); CentryInterestRateModel irm = CentryInterestRateModel(interestRateModel); return (totalSupplyAssets, totalBorrows, irm.borrowRatePerSecond(cash, totalBorrows) * 365 days, irm.supplyRatePerSecond(cash, totalBorrows, reserveFactor) * 365 days); }
    function userCollaterals(address user) external view returns (address[] memory) { return _userCollateralList[user]; }

    function _toSupplyShares(uint256 assets) internal view returns (uint256) { if (totalSupplyAssets == 0 || totalSupplyShares == 0) return assets; return Math.mulDiv(assets, totalSupplyShares, totalSupplyAssets); }
    function _fromSupplyShares(uint256 shares) internal view returns (uint256) { if (totalSupplyShares == 0) return 0; return Math.mulDiv(shares, totalSupplyAssets, totalSupplyShares); }
    function _toBorrowShares(uint256 assets) internal view returns (uint256) { if (totalBorrows == 0 || totalBorrowShares == 0) return assets; return Math.mulDiv(assets, totalBorrowShares, totalBorrows); }
    function _debtToShares(uint256 debt) internal view returns (uint256) { if (totalBorrows == 0 || totalBorrowShares == 0) return debt; return Math.mulDiv(debt, totalBorrowShares, totalBorrows); }
    function _sharesToDebt(uint256 shares) internal view returns (uint256) { if (totalBorrowShares == 0) return 0; return Math.mulDiv(shares, totalBorrows, totalBorrowShares); }
    function _currentDebt(address user) internal view returns (uint256) { return _sharesToDebt(borrowShares[user]); }
    function _currentDebtUSD(address user) internal view returns (uint256) { uint256 debt = _currentDebt(user); return debt == 0 ? 0 : _toUSDValue(address(usdc), debt); }
    function _weightedCollateralUSD(address user) internal view returns (uint256 total) { address[] memory assets = _userCollateralList[user]; for (uint256 i; i < assets.length; ++i) { address asset = assets[i]; uint256 bal = collateralBalances[user][asset]; if (bal == 0) continue; total += Math.mulDiv(_toUSDValue(asset, bal), collateralConfigs[asset].liquidationThreshold, WAD); } }
    function _toUSDValue(address asset, uint256 amount) internal view returns (uint256) { if (amount == 0) return 0; (uint256 price, uint8 priceDec) = ICentryOracle(oracle).getPrice(asset); return _normalise(amount, _decimals(asset), price, priceDec); }
    function _fromUSDValue(address asset, uint256 usdValue) internal view returns (uint256) { if (usdValue == 0) return 0; (uint256 price, uint8 priceDec) = ICentryOracle(oracle).getPrice(asset); uint256 scaled = Math.mulDiv(usdValue, 10 ** priceDec, price); return Math.mulDiv(scaled, 10 ** _decimals(asset), WAD); }
    function _normalise(uint256 amount, uint8 assetDec, uint256 price, uint8 priceDec) internal pure returns (uint256) { uint256 scaled = Math.mulDiv(amount, price, 10 ** priceDec); return Math.mulDiv(scaled, WAD, 10 ** assetDec); }
    function _cash() internal view returns (uint256) { uint256 balance = usdc.balanceOf(address(this)); require(balance >= protocolReserves, "pool: reserve accounting"); return balance - protocolReserves; }
    function _decimals(address asset) internal view returns (uint8) { try IERC20Metadata(asset).decimals() returns (uint8 d) { require(d <= 18, "pool: decimals > 18"); return d; } catch { return 18; } }
}
