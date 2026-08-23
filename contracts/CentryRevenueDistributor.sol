// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./CentryVeNFT.sol";

/*
    CentryRevenueDistributor
    ─────────────────────────────────────────────────────────────────────────
    Protocol fees (USDC from interest spread) flow here.
    veNFT holders claim their share proportional to their voting power
    at the time of each distribution.

    Distribution model: epoch-based (weekly).
        Every week, accumulated USDC is snapshotted.
        veNFT holders can claim their share for each past epoch.
        A token's share = its power at epoch start / total power at epoch start.

    Why epoch-based vs per-block?
        Per-block accumulation (like Synthetix staking) requires on-chain
        checkpoints for every transfer/lock change — very gas heavy for NFTs.
        Weekly epochs are simple, auditable, and match how Velodrome works.

    ─────────────────────────────────────────────────────────────────────────
    Flow
    ─────────────────────────────────────────────────────────────────────────
    1. LendingPool calls withdrawReserves() → sends USDC to this contract.
    2. Anyone calls checkpoint() weekly to snapshot that week's USDC + power.
    3. veNFT holders call claim(tokenId) to collect their accumulated USDC.
*/

contract CentryRevenueDistributor is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ── Constants ───────────────────────────────────────────────────────── */

    uint256 public constant WEEK = 1 weeks;
    uint256 public constant WAD  = 1e18;

    /* ── Immutables ──────────────────────────────────────────────────────── */

    IERC20      public immutable usdc;
    CentryVeNFT public immutable veNFT;

    /* ── Epoch state ─────────────────────────────────────────────────────── */

    struct Epoch {
        uint256 totalUsdc;       // USDC available for this epoch
        uint256 totalPower;      // sum of all veNFT power at epoch start
        uint256 startTime;       // epoch start timestamp
        bool    checkpointed;    // whether this epoch has been snapshotted
    }

    // epoch index → Epoch
    mapping(uint256 => Epoch) public epochs;
    uint256 public currentEpoch;

    // tokenId → last epoch claimed
    mapping(uint256 => uint256) public lastClaimedEpoch;

    // tokenId → power snapshot at each epoch (set when user checkpoints)
    // epochIndex → tokenId → power
    mapping(uint256 => mapping(uint256 => uint256)) public tokenPowerAt;

    // USDC accumulated since last epoch checkpoint
    uint256 public pendingUsdc;

    // Addresses allowed to deposit fees (LendingPool, Vault, etc.)
    mapping(address => bool) public isFeeSource;

    /* ── Events ──────────────────────────────────────────────────────────── */

    event EpochCheckpointed(
        uint256 indexed epoch,
        uint256 totalUsdc,
        uint256 totalPower,
        uint256 startTime
    );
    event TokenCheckpointed(
        uint256 indexed tokenId,
        uint256 indexed epoch,
        uint256 power
    );
    event Claimed(
        uint256 indexed tokenId,
        address indexed to,
        uint256 amount,
        uint256 fromEpoch,
        uint256 toEpoch
    );
    event FeesReceived(address indexed from, uint256 amount);
    event FeeSourceUpdated(address indexed source, bool approved);

    /* ── Constructor ─────────────────────────────────────────────────────── */

    constructor(
        address initialOwner,
        address usdc_,
        address veNFT_
    )
        Ownable(initialOwner)
    {
        require(usdc_  != address(0), "rev: usdc=0");
        require(veNFT_ != address(0), "rev: venft=0");

        usdc  = IERC20(usdc_);
        veNFT = CentryVeNFT(veNFT_);

        // Initialise epoch 0
        epochs[0].startTime    = _currentWeek();
        epochs[0].checkpointed = false;
    }

    /* ── Admin ───────────────────────────────────────────────────────────── */

    function setFeeSource(address source, bool approved) external onlyOwner {
        require(source != address(0), "rev: source=0");
        isFeeSource[source] = approved;
        emit FeeSourceUpdated(source, approved);
    }

    /* ── Fee intake ──────────────────────────────────────────────────────── */

    /**
     * @notice Receive USDC protocol fees.
     *         Called by LendingPool after withdrawReserves().
     *         Anyone can deposit — but track approved sources for transparency.
     */
    function depositFees(uint256 amount) external nonReentrant {
        require(amount > 0, "rev: amount=0");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        pendingUsdc += amount;

        emit FeesReceived(msg.sender, amount);
    }

    /* ── Epoch checkpoint ────────────────────────────────────────────────── */

    /**
     * @notice Snapshot the current epoch.
     *         Call this once per week (anyone can call — permissionless).
     * @param tokenIds  Array of all active veNFT tokenIds to record power for.
     *                  Pass from off-chain enumeration (nextTokenId gives the range).
     *
     * Why pass tokenIds externally?
     *   The contract doesn't know which NFTs exist without on-chain enumeration,
     *   which is gas-prohibitive. The caller provides the list; the contract
     *   verifies each exists via ownerOf().
     */
    function checkpointEpoch(uint256[] calldata tokenIds)
        external
        nonReentrant
    {
        Epoch storage ep = epochs[currentEpoch];

        // Only checkpoint once per week
        require(
            block.timestamp >= ep.startTime + WEEK,
            "rev: epoch not over"
        );
        require(!ep.checkpointed, "rev: already checkpointed");

        // Snapshot pending USDC into this epoch
        ep.totalUsdc    = pendingUsdc;
        ep.checkpointed = true;
        pendingUsdc     = 0;

        // Record power for each provided tokenId
        uint256 totalPower;
        for (uint256 i; i < tokenIds.length; ++i) {
            uint256 id    = tokenIds[i];
            uint256 power = veNFT.balanceOfNFT(id);

            if (power == 0) continue; // expired or invalid

            tokenPowerAt[currentEpoch][id] = power;
            totalPower += power;
        }

        ep.totalPower = totalPower;

        emit EpochCheckpointed(currentEpoch, ep.totalUsdc, totalPower, ep.startTime);

        // Advance to next epoch
        currentEpoch++;
        epochs[currentEpoch].startTime    = _currentWeek();
        epochs[currentEpoch].checkpointed = false;
    }

    /**
     * @notice Record a specific tokenId's power for the current (open) epoch.
     *         Call this before checkpointEpoch if you want to be included.
     *         Frontend should call this whenever a user creates/extends a lock.
     */
    function checkpointToken(uint256 tokenId) external nonReentrant {
        require(veNFT.ownerOf(tokenId) != address(0), "rev: invalid token");

        uint256 power = veNFT.balanceOfNFT(tokenId);
        tokenPowerAt[currentEpoch][tokenId] = power;

        emit TokenCheckpointed(tokenId, currentEpoch, power);
    }

    /* ── Claim ───────────────────────────────────────────────────────────── */

    /**
     * @notice Claim accumulated USDC for a veNFT across all unclaimed epochs.
     * @param tokenId  Your veNFT token ID.
     * @param to       Address to receive USDC.
     *
     * Anyone can claim for any tokenId — USDC always goes to `to` param,
     * but only the owner would realistically know their tokenId.
     * For safety the frontend should always pass msg.sender as `to`.
     */
    function claim(uint256 tokenId, address to)
        external
        nonReentrant
        returns (uint256 totalClaimed)
    {
        require(to != address(0), "rev: to=0");

        uint256 fromEpoch = lastClaimedEpoch[tokenId];
        uint256 toEpoch   = currentEpoch; // don't claim current open epoch

        require(fromEpoch < toEpoch, "rev: nothing to claim");

        for (uint256 e = fromEpoch; e < toEpoch; ++e) {
            Epoch memory ep = epochs[e];

            if (!ep.checkpointed)   continue;
            if (ep.totalPower == 0) continue;
            if (ep.totalUsdc  == 0) continue;

            uint256 power = tokenPowerAt[e][tokenId];
            if (power == 0) continue;

            uint256 share = ep.totalUsdc * power / ep.totalPower;
            totalClaimed += share;
        }

        lastClaimedEpoch[tokenId] = toEpoch;

        if (totalClaimed > 0) {
            usdc.safeTransfer(to, totalClaimed);
            emit Claimed(tokenId, to, totalClaimed, fromEpoch, toEpoch);
        }
    }

    /* ── View ────────────────────────────────────────────────────────────── */

    /// @notice Preview how much USDC a tokenId can claim right now.
    function claimable(uint256 tokenId)
        external
        view
        returns (uint256 total)
    {
        uint256 fromEpoch = lastClaimedEpoch[tokenId];
        uint256 toEpoch   = currentEpoch;

        for (uint256 e = fromEpoch; e < toEpoch; ++e) {
            Epoch memory ep = epochs[e];
            if (!ep.checkpointed || ep.totalPower == 0 || ep.totalUsdc == 0) continue;

            uint256 power = tokenPowerAt[e][tokenId];
            if (power == 0) continue;

            total += ep.totalUsdc * power / ep.totalPower;
        }
    }

    /// @notice Current epoch info for the frontend.
    function getCurrentEpochInfo()
        external
        view
        returns (
            uint256 epochIndex,
            uint256 startTime,
            uint256 endsAt,
            uint256 accumulatedUsdc
        )
    {
        Epoch memory ep = epochs[currentEpoch];
        return (
            currentEpoch,
            ep.startTime,
            ep.startTime + WEEK,
            pendingUsdc
        );
    }

    /// @notice How many seconds until the current epoch can be checkpointed.
    function timeUntilCheckpoint() external view returns (uint256) {
        uint256 epochEnd = epochs[currentEpoch].startTime + WEEK;
        if (block.timestamp >= epochEnd) return 0;
        return epochEnd - block.timestamp;
    }

    /* ── Internal ────────────────────────────────────────────────────────── */

    function _currentWeek() internal view returns (uint256) {
        return (block.timestamp / WEEK) * WEEK;
    }
}
