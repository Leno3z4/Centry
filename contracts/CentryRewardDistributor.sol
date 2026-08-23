// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "./CentryToken.sol";

/**
 * CentryRewardDistributor
 *
 * Neverland-style, activity-based incentives controller.
 * Each supported market can define separate supply and borrow emissions.
 * The LendingPool settles rewards against the user's PREVIOUS balance before
 * changing that balance, preventing deposit/withdraw/borrow timing games.
 *
 * For the Arc/USYC MVP:
 *   - USDC supply can earn CNTRY
 *   - USDC borrow can earn CNTRY
 *   - USYC collateral can earn CNTRY
 *
 * Reward units are the pool's accounting units: supply shares, borrow shares,
 * and collateral token units.
 */
contract CentryRewardDistributor is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 public constant PRECISION = 1e27;
    uint256 public constant MAX_EMISSION_PER_SECOND = 1e24;

    struct Market {
        bool active;
        uint256 supplyEmissionPerSecond;
        uint256 borrowEmissionPerSecond;
        uint256 supplyIndex;
        uint256 borrowIndex;
        uint40 lastUpdate;
        uint256 totalSupplyUnits;
        uint256 totalBorrowUnits;
    }

    struct UserState {
        uint256 supplyIndex;
        uint256 borrowIndex;
        uint256 accrued;
    }

    CentryToken public immutable cntry;
    address public lendingPool;
    address public selfRepayOperator;

    mapping(address => Market) public markets;
    mapping(address => mapping(address => UserState)) public userState;
    address[] public marketList;

    event MarketConfigured(address indexed asset, uint256 supplyEmissionPerSecond, uint256 borrowEmissionPerSecond);
    event MarketDisabled(address indexed asset);
    event LendingPoolUpdated(address indexed pool);
    event SelfRepayOperatorUpdated(address indexed operator);
    event RewardsAccrued(address indexed user, address indexed asset, uint256 amount);
    event Claimed(address indexed user, address indexed asset, uint256 amount, address indexed recipient);
    event SelfRepayRewardsClaimed(address indexed user, uint256 amount, address indexed operator);

    constructor(address initialOwner, address cntry_, address lendingPool_) Ownable(initialOwner) {
        require(cntry_ != address(0), "rd: cntry=0");
        require(lendingPool_ != address(0), "rd: pool=0");
        cntry = CentryToken(cntry_);
        lendingPool = lendingPool_;
    }

    modifier onlyPool() { require(msg.sender == lendingPool, "rd: not pool"); _; }

    function setLendingPool(address pool) external onlyOwner {
        require(pool != address(0), "rd: pool=0"); lendingPool = pool; emit LendingPoolUpdated(pool);
    }

    function setSelfRepayOperator(address operator) external onlyOwner {
        require(operator != address(0), "rd: operator=0"); selfRepayOperator = operator; emit SelfRepayOperatorUpdated(operator);
    }

    function configureMarket(address asset, uint256 supplyEmissionPerSecond, uint256 borrowEmissionPerSecond) external onlyOwner {
        require(asset != address(0), "rd: asset=0");
        require(supplyEmissionPerSecond <= MAX_EMISSION_PER_SECOND, "rd: supply emission too high");
        require(borrowEmissionPerSecond <= MAX_EMISSION_PER_SECOND, "rd: borrow emission too high");
        Market storage m = markets[asset];
        if (!m.active) { m.active = true; m.lastUpdate = uint40(block.timestamp); marketList.push(asset); }
        _accrueMarket(asset);
        m.supplyEmissionPerSecond = supplyEmissionPerSecond;
        m.borrowEmissionPerSecond = borrowEmissionPerSecond;
        emit MarketConfigured(asset, supplyEmissionPerSecond, borrowEmissionPerSecond);
    }

    function disableMarket(address asset) external onlyOwner {
        Market storage m = markets[asset]; require(m.active, "rd: inactive market"); _accrueMarket(asset); m.active = false; emit MarketDisabled(asset);
    }

    function handleSupplyChange(address user, address asset, uint256 oldUserUnits, uint256 newTotalSupplyUnits) external onlyPool {
        Market storage m = markets[asset]; if (!m.active) return;
        _accrueMarket(asset);
        _settleUser(user, oldUserUnits, _poolBorrowUnits(user, asset), asset, m);
        m.totalSupplyUnits = newTotalSupplyUnits;
    }

    function handleBorrowChange(address user, address asset, uint256 oldUserUnits, uint256 newTotalBorrowUnits) external onlyPool {
        Market storage m = markets[asset]; if (!m.active) return;
        _accrueMarket(asset);
        _settleUser(user, _poolSupplyUnits(user, asset), oldUserUnits, asset, m);
        m.totalBorrowUnits = newTotalBorrowUnits;
    }

    function accrueMarket(address asset) external { _accrueMarket(asset); }

    function claim(address asset) external nonReentrant returns (uint256 amount) { amount = _claimFor(msg.sender, asset, msg.sender); }

    function claimAll(address[] calldata assets) external nonReentrant returns (uint256 total) {
        for (uint256 i; i < assets.length; ++i) total += _claimFor(msg.sender, assets[i], msg.sender);
    }

    function claimForSelfRepay(address user, address[] calldata assets) external nonReentrant returns (uint256 total) {
        require(msg.sender == selfRepayOperator, "rd: not self-repay operator"); require(user != address(0), "rd: user=0");
        for (uint256 i; i < assets.length; ++i) total += _claimFor(user, assets[i], msg.sender);
        if (total > 0) emit SelfRepayRewardsClaimed(user, total, msg.sender);
    }

    function pendingRewards(address user, address asset) external view returns (uint256) {
        Market memory m = markets[asset]; UserState memory u = userState[asset][user];
        uint256 supplyAcc = m.supplyIndex; uint256 borrowAcc = m.borrowIndex;
        if (m.active) {
            uint256 elapsed = block.timestamp - m.lastUpdate;
            if (elapsed > 0) {
                if (m.totalSupplyUnits > 0 && m.supplyEmissionPerSecond > 0) supplyAcc += Math.mulDiv(m.supplyEmissionPerSecond * elapsed, PRECISION, m.totalSupplyUnits);
                if (m.totalBorrowUnits > 0 && m.borrowEmissionPerSecond > 0) borrowAcc += Math.mulDiv(m.borrowEmissionPerSecond * elapsed, PRECISION, m.totalBorrowUnits);
            }
        }
        uint256 supplyUnits = _poolSupplyUnits(user, asset); uint256 borrowUnits = _poolBorrowUnits(user, asset);
        uint256 pendingSupply = supplyUnits > 0 && supplyAcc > u.supplyIndex ? Math.mulDiv(supplyUnits, supplyAcc - u.supplyIndex, PRECISION) : 0;
        uint256 pendingBorrow = borrowUnits > 0 && borrowAcc > u.borrowIndex ? Math.mulDiv(borrowUnits, borrowAcc - u.borrowIndex, PRECISION) : 0;
        return u.accrued + pendingSupply + pendingBorrow;
    }

    function _accrueMarket(address asset) internal {
        Market storage m = markets[asset]; if (!m.active) return;
        uint256 elapsed = block.timestamp - m.lastUpdate; if (elapsed == 0) return; m.lastUpdate = uint40(block.timestamp);
        if (m.totalSupplyUnits > 0 && m.supplyEmissionPerSecond > 0) m.supplyIndex += Math.mulDiv(m.supplyEmissionPerSecond * elapsed, PRECISION, m.totalSupplyUnits);
        if (m.totalBorrowUnits > 0 && m.borrowEmissionPerSecond > 0) m.borrowIndex += Math.mulDiv(m.borrowEmissionPerSecond * elapsed, PRECISION, m.totalBorrowUnits);
    }

    function _settleUser(address user, uint256 supplyUnits, uint256 borrowUnits, address asset, Market storage m) internal {
        UserState storage u = userState[asset][user];
        if (u.supplyIndex == 0) u.supplyIndex = m.supplyIndex;
        if (u.borrowIndex == 0) u.borrowIndex = m.borrowIndex;
        if (supplyUnits > 0 && m.supplyIndex > u.supplyIndex) u.accrued += Math.mulDiv(supplyUnits, m.supplyIndex - u.supplyIndex, PRECISION);
        if (borrowUnits > 0 && m.borrowIndex > u.borrowIndex) u.accrued += Math.mulDiv(borrowUnits, m.borrowIndex - u.borrowIndex, PRECISION);
        u.supplyIndex = m.supplyIndex; u.borrowIndex = m.borrowIndex;
        if (u.accrued > 0) emit RewardsAccrued(user, asset, u.accrued);
    }

    function _claimFor(address user, address asset, address recipient) internal returns (uint256 amount) {
        Market storage m = markets[asset]; require(m.active, "rd: market inactive"); _accrueMarket(asset);
        _settleUser(user, _poolSupplyUnits(user, asset), _poolBorrowUnits(user, asset), asset, m);
        UserState storage u = userState[asset][user]; uint256 accrued = u.accrued; if (accrued == 0) return 0;
        uint256 mintable = cntry.mintableSupply(); amount = accrued > mintable ? mintable : accrued; if (amount == 0) return 0;
        u.accrued = accrued - amount;
        cntry.mint(recipient, amount);
        emit Claimed(user, asset, amount, recipient);
    }

    function _poolSupplyUnits(address user, address asset) internal view returns (uint256) {
        if (asset == _lendingPoolUsdc()) {
            (bool ok, bytes memory data) = lendingPool.staticcall(abi.encodeWithSignature("supplyShares(address)", user));
            return ok ? abi.decode(data, (uint256)) : 0;
        }
        (bool ok2, bytes memory data2) = lendingPool.staticcall(abi.encodeWithSignature("collateralBalances(address,address)", user, asset));
        return ok2 ? abi.decode(data2, (uint256)) : 0;
    }

    function _poolBorrowUnits(address user, address asset) internal view returns (uint256) {
        if (asset != _lendingPoolUsdc()) return 0;
        (bool ok, bytes memory data) = lendingPool.staticcall(abi.encodeWithSignature("borrowShares(address)", user));
        return ok ? abi.decode(data, (uint256)) : 0;
    }

    function _lendingPoolUsdc() internal view returns (address) {
        (bool ok, bytes memory data) = lendingPool.staticcall(abi.encodeWithSignature("usdc()"));
        require(ok, "rd: pool usdc read failed"); return abi.decode(data, (address));
    }
}
