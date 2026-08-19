// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IPriceOracle { function getAssetPrice(address asset) external view returns (uint256); }
interface IInterestRateModel { function getBorrowRate(uint256 borrows, uint256 cash) external view returns (uint256); }

contract LendingPool is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    uint256 public constant WAD = 1e18; uint256 public constant RAY = 1e27; uint256 public constant YEAR = 365 days; uint256 public constant MAX_LTV = 95e16;
    IERC20 public immutable usdc; IPriceOracle public oracle; IInterestRateModel public interestRateModel;
    struct CollateralConfig { bool enabled; uint256 ltv; uint256 liquidationThreshold; uint256 liquidationBonus; }
    struct Position { uint256 collateral; uint256 debtShares; }
    mapping(address => CollateralConfig) public collateralConfig;
    mapping(address => mapping(address => Position)) public positions;
    mapping(address => uint256) public supplyShares;
    mapping(address => bool) public operators;
    address[] public collateralAssets; mapping(address => bool) public collateralListed;
    uint256 public totalSupplyShares; uint256 public totalBorrows; uint256 public borrowIndex = RAY; uint256 public lastAccrual;
    error InvalidAmount(); error InsufficientLiquidity(); error HealthFactorTooLow(uint256 healthFactor); error NotLiquidatable(uint256 healthFactor); error InvalidConfig(); error NotOperator();
    event OperatorSet(address indexed operator, bool allowed); event CollateralConfigured(address indexed asset, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus);
    event Supplied(address indexed user, uint256 amount, uint256 shares); event Withdrawn(address indexed user, uint256 amount, uint256 shares);
    event CollateralSupplied(address indexed user, address indexed asset, uint256 amount); event CollateralWithdrawn(address indexed user, address indexed asset, uint256 amount);
    event Borrowed(address indexed user, uint256 amount, uint256 debtShares); event Repaid(address indexed user, uint256 amount, uint256 debtShares);
    event Liquidated(address indexed liquidator, address indexed borrower, address indexed collateral, uint256 debtRepaid, uint256 collateralSeized);
    constructor(address _usdc, address _oracle, address _interestRateModel) Ownable(msg.sender) { require(_usdc != address(0) && _oracle != address(0) && _interestRateModel != address(0), "ZERO_ADDRESS"); usdc = IERC20(_usdc); oracle = IPriceOracle(_oracle); interestRateModel = IInterestRateModel(_interestRateModel); lastAccrual = block.timestamp; }
    modifier onlyOperator() { if (!operators[msg.sender] && msg.sender != owner()) revert NotOperator(); _; }
    function setOperator(address operator, bool allowed) external onlyOwner { operators[operator] = allowed; emit OperatorSet(operator, allowed); }
    function setOracle(address value) external onlyOwner { require(value != address(0), "ZERO_ADDRESS"); oracle = IPriceOracle(value); }
    function setInterestRateModel(address value) external onlyOwner { require(value != address(0), "ZERO_ADDRESS"); interestRateModel = IInterestRateModel(value); }
    function configureCollateral(address asset, bool enabled, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus) external onlyOwner { if (asset == address(0) || ltv > MAX_LTV || liquidationThreshold < ltv || liquidationThreshold > WAD || liquidationBonus < WAD || liquidationBonus > 1.2e18) revert InvalidConfig(); collateralConfig[asset] = CollateralConfig(enabled, ltv, liquidationThreshold, liquidationBonus); if (!collateralListed[asset]) { collateralListed[asset] = true; collateralAssets.push(asset); } emit CollateralConfigured(asset, ltv, liquidationThreshold, liquidationBonus); }
    function accrueInterest() public { uint256 elapsed = block.timestamp - lastAccrual; if (elapsed == 0) return; uint256 cash = usdc.balanceOf(address(this)); uint256 rate = interestRateModel.getBorrowRate(totalBorrows, cash); uint256 interest = (totalBorrows * rate * elapsed) / RAY / YEAR; totalBorrows += interest; borrowIndex += (borrowIndex * rate * elapsed) / RAY / YEAR; lastAccrual = block.timestamp; }
    function supply(uint256 amount) external nonReentrant returns (uint256 shares) { if (amount == 0) revert InvalidAmount(); accrueInterest(); uint256 assets = totalSupplyAssets(); shares = totalSupplyShares == 0 ? amount : (amount * totalSupplyShares) / assets; require(shares > 0, "ZERO_SHARES"); totalSupplyShares += shares; supplyShares[msg.sender] += shares; usdc.safeTransferFrom(msg.sender, address(this), amount); emit Supplied(msg.sender, amount, shares); }
    function withdraw(uint256 shares) external nonReentrant returns (uint256 amount) { if (shares == 0 || shares > supplyShares[msg.sender]) revert InvalidAmount(); accrueInterest(); amount = (shares * totalSupplyAssets()) / totalSupplyShares; if (amount > usdc.balanceOf(address(this))) revert InsufficientLiquidity(); supplyShares[msg.sender] -= shares; totalSupplyShares -= shares; usdc.safeTransfer(msg.sender, amount); emit Withdrawn(msg.sender, amount, shares); }
    function supplyCollateral(address asset, uint256 amount) external nonReentrant { _supplyCollateral(msg.sender, asset, amount); }
    function supplyCollateralFor(address user, address asset, uint256 amount) external nonReentrant onlyOperator { _supplyCollateral(user, asset, amount); }
    function _supplyCollateral(address user, address asset, uint256 amount) internal { if (amount == 0 || !collateralConfig[asset].enabled) revert InvalidAmount(); positions[user][asset].collateral += amount; IERC20(asset).safeTransferFrom(msg.sender, address(this), amount); emit CollateralSupplied(user, asset, amount); }
    function withdrawCollateral(address asset, uint256 amount) external nonReentrant { _withdrawCollateral(msg.sender, msg.sender, asset, amount); }
    function withdrawCollateralFor(address user, address receiver, address asset, uint256 amount) external nonReentrant onlyOperator { _withdrawCollateral(user, receiver, asset, amount); }
    function _withdrawCollateral(address user, address receiver, address asset, uint256 amount) internal { Position storage p = positions[user][asset]; if (amount == 0 || amount > p.collateral) revert InvalidAmount(); p.collateral -= amount; if (debtOf(user) > 0 && healthFactor(user) < WAD) revert HealthFactorTooLow(healthFactor(user)); IERC20(asset).safeTransfer(receiver, amount); emit CollateralWithdrawn(user, asset, amount); }
    function borrow(uint256 amount) external nonReentrant { _borrow(msg.sender, msg.sender, amount); }
    function borrowFor(address user, address receiver, uint256 amount) external nonReentrant onlyOperator { _borrow(user, receiver, amount); }
    function _borrow(address user, address receiver, uint256 amount) internal { if (amount == 0) revert InvalidAmount(); accrueInterest(); if (amount > usdc.balanceOf(address(this))) revert InsufficientLiquidity(); uint256 shares = (amount * RAY + borrowIndex - 1) / borrowIndex; positions[user][address(usdc)].debtShares += shares; totalBorrows += amount; uint256 hf = healthFactor(user); if (hf < WAD) { positions[user][address(usdc)].debtShares -= shares; totalBorrows -= amount; revert HealthFactorTooLow(hf); } usdc.safeTransfer(receiver, amount); emit Borrowed(user, amount, shares); }
    function repay(uint256 amount) external nonReentrant returns (uint256 paid) { paid = _repay(msg.sender, amount); }
    function repayFor(address user, uint256 amount) external nonReentrant onlyOperator returns (uint256 paid) { paid = _repay(user, amount); }
    function _repay(address user, uint256 amount) internal returns (uint256 paid) { if (amount == 0) revert InvalidAmount(); accrueInterest(); uint256 shares = positions[user][address(usdc)].debtShares; uint256 debt = debtOf(user); paid = amount > debt ? debt : amount; uint256 sharesToBurn = paid == debt ? shares : (paid * RAY) / borrowIndex; positions[user][address(usdc)].debtShares = shares - sharesToBurn; totalBorrows -= paid; usdc.safeTransferFrom(msg.sender, address(this), paid); emit Repaid(user, paid, sharesToBurn); }
    function liquidate(address borrower, address collateral, uint256 debtAmount) external nonReentrant { accrueInterest(); uint256 hf = healthFactor(borrower); if (hf >= WAD) revert NotLiquidatable(hf); uint256 debt = debtOf(borrower); uint256 repayAmount = debtAmount > debt ? debt : debtAmount; uint256 debtPrice = oracle.getAssetPrice(address(usdc)); uint256 collateralPrice = oracle.getAssetPrice(collateral); uint256 seize = (repayAmount * debtPrice * collateralConfig[collateral].liquidationBonus) / collateralPrice / WAD; if (seize > positions[borrower][collateral].collateral) seize = positions[borrower][collateral].collateral; uint256 shares = positions[borrower][address(usdc)].debtShares; uint256 sharesToBurn = repayAmount == debt ? shares : (repayAmount * RAY) / borrowIndex; positions[borrower][address(usdc)].debtShares = shares - sharesToBurn; totalBorrows -= repayAmount; positions[borrower][collateral].collateral -= seize; usdc.safeTransferFrom(msg.sender, address(this), repayAmount); IERC20(collateral).safeTransfer(msg.sender, seize); emit Liquidated(msg.sender, borrower, collateral, repayAmount, seize); }
    function debtOf(address user) public view returns (uint256) { return (positions[user][address(usdc)].debtShares * borrowIndex) / RAY; }
    function totalSupplyAssets() public view returns (uint256) { return usdc.balanceOf(address(this)) + totalBorrows; }
    function supplyBalance(address user) external view returns (uint256) { return totalSupplyShares == 0 ? 0 : (supplyShares[user] * totalSupplyAssets()) / totalSupplyShares; }
    function healthFactor(address user) public view returns (uint256) { uint256 debt = debtOf(user); if (debt == 0) return type(uint256).max; uint256 debtValue = (debt * oracle.getAssetPrice(address(usdc))) / WAD; uint256 weightedCollateral; for (uint256 i; i < collateralAssets.length; ++i) { address asset = collateralAssets[i]; CollateralConfig memory cfg = collateralConfig[asset]; if (!cfg.enabled) continue; uint256 amount = positions[user][asset].collateral; if (amount == 0) continue; uint256 value = (amount * oracle.getAssetPrice(asset)) / WAD; weightedCollateral += (value * cfg.liquidationThreshold) / WAD; } if (weightedCollateral == 0) return 0; return (weightedCollateral * WAD) / debtValue; }
    function borrowCapacity(address user) public view returns (uint256 capacity) { uint256 debtPrice = oracle.getAssetPrice(address(usdc)); for (uint256 i; i < collateralAssets.length; ++i) { address asset = collateralAssets[i]; CollateralConfig memory cfg = collateralConfig[asset]; if (!cfg.enabled) continue; uint256 amount = positions[user][asset].collateral; if (amount == 0) continue; uint256 value = (amount * oracle.getAssetPrice(asset)) / WAD; capacity += (value * cfg.ltv) / debtPrice; } }
    function collateralBalance(address user, address asset) external view returns (uint256) { return positions[user][asset].collateral; }
    function getReserveData() external view returns (uint256 liquidity, uint256 borrows, uint256 borrowRate, uint256 supplyAssets) { liquidity = usdc.balanceOf(address(this)); borrows = totalBorrows; borrowRate = interestRateModel.getBorrowRate(totalBorrows, liquidity); supplyAssets = totalSupplyAssets(); }
}
