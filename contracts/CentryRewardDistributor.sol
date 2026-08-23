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
 * Neverland-style incentives controller for Centry.
 *
 * Rewards are attached to market activity instead of a single weekly vault
 * gauge. Each supported asset can have independent supply and borrow emission
 * rates. The LendingPool notifies this contract whenever a user's balance
 * changes so rewards accrue against time-weighted balances.
 *
 * Current testnet model:
 *   - USDC supply earns CNTRY
 *   - USDC borrow earns CNTRY
 *   - USYC collateral can earn CNTRY
 *
 * The controller is intentionally independent from the risk engine. It can be
 * replaced/expanded later without changing the LendingPool accounting model.
 */
contract CentryRewardDistributor is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 public constant PRECISION = 1e27;
    uint256 public constant MAX_EMISSION_PER_SECOND = 1e24; // testnet guardrail

    struct Market {
        bool active;
        uint256 supplyEmissionPerSecond;
        uint256 borrowEmissionPerSecond;
        uint256 supplyIndex;
        uint256 borrowIndex;
        uint40 lastUpdate;
        uint256 totalSupply;
        uint256 totalBorrow;
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
    event Claimed(address indexed user, uint256 amount, address indexed recipient);
    event SelfRepayRewardsClaimed(address indexed user, uint256 amount, address indexed operator);

    constructor(address initialOwner, address cntry_, address lendingPool_)
        Ownable(initialOwner)
    {
        require(cntry_ != address(0), "rd: cntry=0");
        require(lendingPool_ != address(0), "rd: pool=0");
        cntry = CentryToken(cntry_);
        lendingPool = lendingPool_;
    }

    modifier onlyPool() {
        require(msg.sender == lendingPool, "rd: not pool");
        _;
    }

    function setLendingPool(address pool) external onlyOwner {
        require(pool != address(0), "rd: pool=0");
        lendingPool = pool;
        emit LendingPoolUpdated(pool);
    }

    function setSelfRepayOperator(address operator) external onlyOwner {
        require(operator != address(0), "rd: operator=0");
        selfRepayOperator = operator;
        emit SelfRepayOperatorUpdated(operator);
    }

    function configureMarket(address asset, uint256 supplyEmissionPerSecond, uint256 borrowEmissionPerSecond) external onlyOwner {
        require(asset != address(0), "rd: asset=0");
        require(supplyEmissionPerSecond <= MAX_EMISSION_PER_SECOND, "rd: supply emission too high");
        require(borrowEmissionPerSecond <= MAX_EMISSION_PER_SECOND, "rd: borrow emission too high");

        Market storage m = markets[asset];
        if (!m.active) {
            m.active = true;
            m.lastUpdate = uint40(block.timestamp);
            marketList.push(asset);
        }

        _accrueMarket(asset);
        m.supplyEmissionPerSecond = supplyEmissionPerSecond;
        m.borrowEmissionPerSecond = borrowEmissionPerSecond;
        emit MarketConfigured(asset, supplyEmissionPerSecond, borrowEmissionPerSecond);
    }

    function disableMarket(address asset) external onlyOwner {
        Market storage m = markets[asset];
        require(m.active, "rd: inactive market");
        _accrueMarket(asset);
        m.active = false;
        emit MarketDisabled(asset);
    }

    function handleSupplyChange(address user, address asset, uint256 newBalance, uint256 newTotalSupply) external onlyPool {
        Market storage m = markets[asset];
        if (!m.active) return;
        _accrueMarket(asset);
        _settleUser(user, asset, m);
        m.totalSupply = newTotalSupply;
    }

    function handleBorrowChange(address user, address asset, uint256 newBalance, uint256 newTotalBorrow) external onlyPool {
        Market storage m = markets[asset];
        if (!m.active) return;
        _accrueMarket(asset);
        _settleUser(user, asset, m);
        m.totalBorrow = newTotalBorrow;
    }

    /**
     * Keeper-friendly settlement after a balance change. The balance itself is
     * supplied by the pool hook; this function only reads stored indexes.
     */
    function accrueMarket(address asset) external {
        _accrueMarket(asset);
    }

    function claim(address asset) external nonReentrant returns (uint256 amount) {
        amount = _claimFor(msg.sender, asset, msg.sender);
    }

    function claimAll(address[] calldata assets) external nonReentrant returns (uint256 total) {
        for (uint256 i; i < assets.length; ++i) {
            total += _claimFor(msg.sender, assets[i], msg.sender);
        }
    }

    /**
     * Claim CNTRY for an opted-in self-repay flow. The operator receives CNTRY
     * and is expected to swap it for USDC before calling the vault repayment.
     */
    function claimForSelfRepay(address user, address[] calldata assets)
        external
        nonReentrant
        returns (uint256 total)
    {
        require(msg.sender == selfRepayOperator, "rd: not self-repay operator");
        require(user != address(0), "rd: user=0");

        for (uint256 i; i < assets.length; ++i) {
            total += _claimFor(user, assets[i], address(this));
        }

        if (total > 0) {
            IERC20(address(cntry)).safeTransfer(selfRepayOperator, total);
            emit SelfRepayRewardsClaimed(user, total, selfRepayOperator);
        }
    }

    function pendingRewards(address user, address asset) external view returns (uint256) {
        Market memory m = markets[asset];
        UserState memory u = userState[asset][user];
        uint256 supplyAcc = m.supplyIndex;
        uint256 borrowAcc = m.borrowIndex;

        if (m.active) {
            uint256 elapsed = block.timestamp - m.lastUpdate;
            if (elapsed > 0) {
                if (m.totalSupply > 0) supplyAcc += Math.mulDiv(m.supplyEmissionPerSecond * elapsed, PRECISION, m.totalSupply);
                if (m.totalBorrow > 0) borrowAcc += Math.mulDiv(m.borrowEmissionPerSecond * elapsed, PRECISION, m.totalBorrow);
            }
        }

        uint256 supplyBal = _poolSupplyBalance(user, asset);
        uint256 borrowBal = _poolBorrowBalance(user, asset);
        uint256 pendingSupply = supplyBal > 0 && supplyAcc > u.supplyIndex ? Math.mulDiv(supplyBal, supplyAcc - u.supplyIndex, PRECISION) : 0;
        uint256 pendingBorrow = borrowBal > 0 && borrowAcc > u.borrowIndex ? Math.mulDiv(borrowBal, borrowAcc - u.borrowIndex, PRECISION) : 0;
        return u.accrued + pendingSupply + pendingBorrow;
    }

    function _accrueMarket(address asset) internal {
        Market storage m = markets[asset];
        if (!m.active) return;
        uint256 elapsed = block.timestamp - m.lastUpdate;
        if (elapsed == 0) return;
        m.lastUpdate = uint40(block.timestamp);

        if (m.totalSupply > 0 && m.supplyEmissionPerSecond > 0) {
            m.supplyIndex += Math.mulDiv(m.supplyEmissionPerSecond * elapsed, PRECISION, m.totalSupply);
        }
        if (m.totalBorrow > 0 && m.borrowEmissionPerSecond > 0) {
            m.borrowIndex += Math.mulDiv(m.borrowEmissionPerSecond * elapsed, PRECISION, m.totalBorrow);
        }
    }

    function _settleUser(address user, address asset, Market storage m) internal {
        UserState storage u = userState[asset][user];
        uint256 supplyBal = _poolSupplyBalance(user, asset);
        uint256 borrowBal = _poolBorrowBalance(user, asset);

        if (u.supplyIndex == 0) u.supplyIndex = m.supplyIndex;
        if (u.borrowIndex == 0) u.borrowIndex = m.borrowIndex;

        if (supplyBal > 0 && m.supplyIndex > u.supplyIndex) {
            u.accrued += Math.mulDiv(supplyBal, m.supplyIndex - u.supplyIndex, PRECISION);
        }
        if (borrowBal > 0 && m.borrowIndex > u.borrowIndex) {
            u.accrued += Math.mulDiv(borrowBal, m.borrowIndex - u.borrowIndex, PRECISION);
        }

        u.supplyIndex = m.supplyIndex;
        u.borrowIndex = m.borrowIndex;
        if (u.accrued > 0) emit RewardsAccrued(user, asset, u.accrued);
    }

    function _claimFor(address user, address asset, address recipient) internal returns (uint256 amount) {
        Market storage m = markets[asset];
        require(m.active, "rd: market inactive");
        _accrueMarket(asset);
        _settleUser(user, asset, m);

        UserState storage u = userState[asset][user];
        amount = u.accrued;
        if (amount == 0) return 0;
        u.accrued = 0;

        uint256 mintable = cntry.mintableSupply();
        if (amount > mintable) amount = mintable;
        if (amount == 0) return 0;

        cntry.mint(recipient, amount);
        emit Claimed(user, amount, recipient);
    }

    function _poolSupplyBalance(address user, address asset) internal view returns (uint256) {
        if (asset == lendingPoolUsdc()) {
            (bool ok, bytes memory data) = lendingPool.staticcall(abi.encodeWithSignature("supplyBalance(address)", user));
            return ok ? abi.decode(data, (uint256)) : 0;
        }
        (bool ok2, bytes memory data2) = lendingPool.staticcall(abi.encodeWithSignature("collateralBalances(address,address)", user, asset));
        return ok2 ? abi.decode(data2, (uint256)) : 0;
    }

    function _poolBorrowBalance(address user, address asset) internal view returns (uint256) {
        if (asset != lendingPoolUsdc()) return 0;
        (bool ok, bytes memory data) = lendingPool.staticcall(abi.encodeWithSignature("debtOf(address)", user));
        return ok ? abi.decode(data, (uint256)) : 0;
    }

    function lendingPoolUsdc() internal view returns (address) {
        (bool ok, bytes memory data) = lendingPool.staticcall(abi.encodeWithSignature("usdc()"));
        require(ok, "rd: pool usdc read failed");
        return abi.decode(data, (address));
    }
}
