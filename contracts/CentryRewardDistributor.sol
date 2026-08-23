// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./CentryToken.sol";
import "./CentryGaugeController.sol";
import "./CentryLendingPool.sol";
import "./CentrySelfRepayingVault.sol";

/*
    CentryRewardDistributor
    ─────────────────────────────────────────────────────────────────────────
    Distributes CNTRY token emissions to liquidity providers.

    Every week:
      1. Anyone calls distribute() — reads gauge weights from GaugeController.
      2. CNTRY budget is split proportionally across gauges.
      3. Each gauge's share is split among its depositors by position size.
      4. Users call claim() to collect their CNTRY.

    Two gauge types supported:
      POOL  → rewards USDC suppliers in LendingPool  (by supplyShares)
      VAULT → rewards USYC depositors in Vault       (by collateral amount)

    Uses MasterChef-style accCntryPerShare accounting:
      - On each distribute(), accCntryPerShare grows for each gauge
      - User's pending = shares × accCntryPerShare − rewardDebt
      - On claim, rewardDebt syncs to current accCntryPerShare

    This is the standard Sushi/Compound pattern — gas efficient and exact.

    ─────────────────────────────────────────────────────────────────────────
    The full Centry incentive loop
    ─────────────────────────────────────────────────────────────────────────
    supply USDC to pool  ──→  earn CNTRY (via this contract)
    deposit USYC to vault ─→  earn CNTRY (via this contract)
         ↓
    lock CNTRY in veNFT  ──→  get voting power
         ↓
    vote gauges           ──→  direct more CNTRY to preferred gauges
         ↓
    hold veNFT            ──→  earn USDC fees (RevenueDistributor)
*/

contract CentryRewardDistributor is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ── Constants ───────────────────────────────────────────────────────── */

    uint256 public constant WEEK        = 1 weeks;
    uint256 public constant PRECISION   = 1e24; // higher precision for accPerShare

    /* ── Gauge type enum ─────────────────────────────────────────────────── */

    enum GaugeType { POOL, VAULT }

    /* ── Gauge config ────────────────────────────────────────────────────── */

    struct GaugeInfo {
        GaugeType gaugeType;
        bool      active;
        // MasterChef accounting
        uint256   accCntryPerShare; // accumulated CNTRY per share unit (× PRECISION)
        uint256   lastDistributed;  // timestamp of last distribution
    }

    // gauge address → info
    mapping(address => GaugeInfo) public gaugeInfo;

    // gauge → user → rewardDebt
    mapping(address => mapping(address => uint256)) public rewardDebt;

    // gauge → user → pending unclaimed CNTRY (snapshotted on position change)
    mapping(address => mapping(address => uint256)) public pendingRewards;

    /* ── Protocol contracts ──────────────────────────────────────────────── */

    CentryToken           public immutable cntry;
    CentryGaugeController public immutable gaugeController;
    CentryLendingPool     public immutable lendingPool;
    CentrySelfRepayingVault public immutable vault;

    /* ── Emission config ─────────────────────────────────────────────────── */

    uint256 public cntryPerWeek;        // total CNTRY emitted each week
    uint256 public lastDistributeTime;  // last time distribute() was called

    /* ── Events ──────────────────────────────────────────────────────────── */

    event GaugeRegistered(address indexed gauge, GaugeType gaugeType);
    event GaugeDeactivated(address indexed gauge);
    event Distributed(uint256 totalCntry, uint256 timestamp);
    event GaugeRewarded(address indexed gauge, uint256 cntryAmount);
    event Claimed(address indexed user, address indexed gauge, uint256 amount);
    event EmissionRateUpdated(uint256 newRate);

    /* ── Constructor ─────────────────────────────────────────────────────── */

    constructor(
        address initialOwner,
        address cntry_,
        address gaugeController_,
        address lendingPool_,
        address vault_,
        uint256 cntryPerWeek_
    )
        Ownable(initialOwner)
    {
        require(cntry_           != address(0), "rd: cntry=0");
        require(gaugeController_ != address(0), "rd: gc=0");
        require(lendingPool_     != address(0), "rd: pool=0");
        require(vault_           != address(0), "rd: vault=0");

        cntry            = CentryToken(cntry_);
        gaugeController  = CentryGaugeController(gaugeController_);
        lendingPool      = CentryLendingPool(lendingPool_);
        vault            = CentrySelfRepayingVault(vault_);
        cntryPerWeek     = cntryPerWeek_;
        lastDistributeTime = block.timestamp;
    }

    /* ── Admin ───────────────────────────────────────────────────────────── */

    /**
     * @notice Register a gauge with this distributor.
     *         Must already be approved in GaugeController.
     * @param gauge     Address of the gauge (pool or vault).
     * @param gaugeType POOL = rewards USDC suppliers, VAULT = rewards USYC depositors.
     */
    function registerGauge(address gauge, GaugeType gaugeType)
        external
        onlyOwner
    {
        require(gauge != address(0),             "rd: gauge=0");
        require(gaugeController.isGauge(gauge),  "rd: not in GaugeController");
        require(!gaugeInfo[gauge].active,         "rd: already registered");

        gaugeInfo[gauge] = GaugeInfo({
            gaugeType:        gaugeType,
            active:           true,
            accCntryPerShare: 0,
            lastDistributed:  block.timestamp
        });

        emit GaugeRegistered(gauge, gaugeType);
    }

    function deactivateGauge(address gauge) external onlyOwner {
        require(gaugeInfo[gauge].active, "rd: not active");
        gaugeInfo[gauge].active = false;
        emit GaugeDeactivated(gauge);
    }

    function setEmissionRate(uint256 cntryPerWeek_) external onlyOwner {
        // Distribute at old rate first before changing
        distribute();
        cntryPerWeek = cntryPerWeek_;
        emit EmissionRateUpdated(cntryPerWeek_);
    }

    /* ── Distribute ──────────────────────────────────────────────────────── */

    /**
     * @notice Distribute CNTRY emissions across gauges.
     *         Permissionless — anyone can call weekly.
     *         Safe to call more than once per week — does nothing until enough
     *         time has elapsed.
     *
     * How it works:
     *   1. Calculate CNTRY owed since last distribution.
     *   2. Read gauge weights from GaugeController.
     *   3. Split CNTRY proportionally across active gauges.
     *   4. For each gauge, increment accCntryPerShare by:
     *         gaugeAllocation / totalDepositsInGauge
     *   5. Users claim by reading: shares × accCntryPerShare − rewardDebt.
     */
    function distribute() public {
        uint256 elapsed = block.timestamp - lastDistributeTime;
        if (elapsed < 1 hours) return; // min 1hr between distributions

        uint256 totalCntry = cntryPerWeek * elapsed / WEEK;
        if (totalCntry == 0) return;

        lastDistributeTime = block.timestamp;

        uint256 totalWeight = gaugeController.totalWeight();
        if (totalWeight == 0) return; // nobody has voted yet

        // Check mintable supply
        uint256 mintable = cntry.mintableSupply();
        if (totalCntry > mintable) totalCntry = mintable;
        if (totalCntry == 0) return;

        // Mint to this contract
        cntry.mint(address(this), totalCntry);

        address[] memory gauges = gaugeController.getGauges();
        uint256 distributed;

        for (uint256 i; i < gauges.length; ++i) {
            address gauge = gauges[i];
            GaugeInfo storage info = gaugeInfo[gauge];

            if (!info.active) continue;

            // Gauge's share of total weight
            uint256 gaugeW    = gaugeController.gaugeWeight(gauge);
            if (gaugeW == 0) continue;

            uint256 gaugeAlloc = totalCntry * gaugeW / totalWeight;
            if (gaugeAlloc == 0) continue;

            // Total deposits in this gauge (denominator for accPerShare)
            uint256 totalDeposits = _totalDeposits(gauge, info.gaugeType);
            if (totalDeposits == 0) continue;

            // Increment accumulated CNTRY per share
            info.accCntryPerShare += gaugeAlloc * PRECISION / totalDeposits;

            distributed += gaugeAlloc;

            emit GaugeRewarded(gauge, gaugeAlloc);
        }

        // Return any undistributed dust (rounding) to mintable supply
        // by burning it — keeps accounting clean
        if (distributed < totalCntry) {
            uint256 dust = totalCntry - distributed;
            IERC20(address(cntry)).safeTransfer(address(0xdead), dust);
        }

        emit Distributed(totalCntry, block.timestamp);
    }

    /* ── Claim ───────────────────────────────────────────────────────────── */

    /**
     * @notice Claim CNTRY rewards for your position in a gauge.
     * @param gauge The gauge address (pool or vault) you have a deposit in.
     */
    function claim(address gauge) external nonReentrant returns (uint256 amount) {
        distribute(); // settle latest emissions first

        _settle(msg.sender, gauge);

        amount = pendingRewards[gauge][msg.sender];
        if (amount == 0) return 0;

        pendingRewards[gauge][msg.sender] = 0;

        IERC20(address(cntry)).safeTransfer(msg.sender, amount);

        emit Claimed(msg.sender, gauge, amount);
    }

    /**
     * @notice Claim from all gauges in one call.
     */
    function claimAll(address[] calldata gauges)
        external
        nonReentrant
        returns (uint256 totalAmount)
    {
        distribute();

        for (uint256 i; i < gauges.length; ++i) {
            address gauge = gauges[i];
            _settle(msg.sender, gauge);

            uint256 amount = pendingRewards[gauge][msg.sender];
            if (amount == 0) continue;

            pendingRewards[gauge][msg.sender] = 0;
            totalAmount += amount;

            emit Claimed(msg.sender, gauge, amount);
        }

        if (totalAmount > 0) {
            IERC20(address(cntry)).safeTransfer(msg.sender, totalAmount);
        }
    }

    /* ── View ────────────────────────────────────────────────────────────── */

    /**
     * @notice How much CNTRY a user can claim from a specific gauge right now.
     */
    function pendingCntry(address user, address gauge)
        external
        view
        returns (uint256)
    {
        GaugeInfo memory info = gaugeInfo[gauge];
        if (!info.active) return pendingRewards[gauge][user];

        uint256 userShares = _userShares(user, gauge, info.gaugeType);
        if (userShares == 0) return pendingRewards[gauge][user];

        // Simulate the latest distribution
        uint256 elapsed = block.timestamp - lastDistributeTime;
        uint256 simCntry = cntryPerWeek * elapsed / WEEK;
        uint256 totalWeight = gaugeController.totalWeight();

        uint256 simAccPerShare = info.accCntryPerShare;

        if (simCntry > 0 && totalWeight > 0) {
            uint256 gaugeW      = gaugeController.gaugeWeight(gauge);
            uint256 gaugeAlloc  = simCntry * gaugeW / totalWeight;
            uint256 totalDep    = _totalDeposits(gauge, info.gaugeType);
            if (totalDep > 0) {
                simAccPerShare += gaugeAlloc * PRECISION / totalDep;
            }
        }

        uint256 accumulated = userShares * simAccPerShare / PRECISION;
        uint256 debt        = rewardDebt[gauge][user];

        uint256 newRewards = accumulated > debt ? accumulated - debt : 0;
        return pendingRewards[gauge][user] + newRewards;
    }

    /* ── Internal ────────────────────────────────────────────────────────── */

    /**
     * @dev Settle pending rewards for a user in a gauge.
     *      Must be called before any change to user's shares.
     *      (Pool and Vault don't call this automatically — see note below.)
     */
    function _settle(address user, address gauge) internal {
        GaugeInfo memory info = gaugeInfo[gauge];
        if (!info.active) return;

        uint256 userShares = _userShares(user, gauge, info.gaugeType);

        if (userShares > 0) {
            uint256 accumulated = userShares * info.accCntryPerShare / PRECISION;
            uint256 debt        = rewardDebt[gauge][user];

            if (accumulated > debt) {
                pendingRewards[gauge][user] += accumulated - debt;
            }
        }

        // Sync debt to current accPerShare
        rewardDebt[gauge][user] =
            userShares * gaugeInfo[gauge].accCntryPerShare / PRECISION;
    }

    /// @dev Get user's shares in a gauge (what rewards are based on).
    function _userShares(
        address user,
        address gauge,
        GaugeType gaugeType
    )
        internal
        view
        returns (uint256)
    {
        if (gaugeType == GaugeType.POOL) {
            // For the LendingPool gauge: shares = USDC supply shares
            return lendingPool.supplyShares(user);
        } else {
            // For the Vault gauge: shares = USYC collateral deposited
            (uint256 collateral, ) = vault.positions(user);
            return collateral;
        }
    }

    /// @dev Total deposits across all users in a gauge (denominator).
    function _totalDeposits(
        address,        // gauge address — unused, using type directly
        GaugeType gaugeType
    )
        internal
        view
        returns (uint256)
    {
        if (gaugeType == GaugeType.POOL) {
            return lendingPool.totalSupplyShares();
        } else {
            return vault.totalCollateral();
        }
    }
}
