// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./CentryVeNFT.sol";

/*
    CentryGaugeController
    ─────────────────────────────────────────────────────────────────────────
    veNFT holders vote their locked voting power toward gauges.
    Gauge weights determine how protocol CNTRY emissions are distributed.

    Each tokenId votes independently.
    A tokenId can split its power across multiple gauges (weights sum to 100).
    Votes persist until changed — no need to re-vote every epoch.

    ─────────────────────────────────────────────────────────────────────────
    FIXES vs Gemini version
    ─────────────────────────────────────────────────────────────────────────
    1. vote() takes tokenId — the specific NFT voting, not just msg.sender.
       Gemini's ABI had voteForGaugeWeight(gaugeAddress, userWeight) with
       no tokenId — you couldn't specify which NFT to vote with.
    2. Weight is 0-100 (integer percent), not WAD. Simpler for frontend.
    3. Total weight per tokenId capped at 100 — prevents voting with
       more than 100% of power across gauges.
    4. Gauge whitelist — only owner-approved gauges can receive votes.
    5. Vote reset before re-voting — prevents weight accumulation bugs.
    6. Expired locks have zero power — vote() reverts on expired tokenId.
*/

contract CentryGaugeController is Ownable2Step, ReentrancyGuard {

    /* ── State ───────────────────────────────────────────────────────────── */

    CentryVeNFT public immutable veNFT;

    // List of approved gauges (pools that can receive emissions)
    address[] public gaugeList;
    mapping(address => bool) public isGauge;

    // tokenId → gauge → weight (0-100)
    mapping(uint256 => mapping(address => uint256)) public votes;

    // tokenId → total weight used (sum across all gauges, max 100)
    mapping(uint256 => uint256) public usedWeight;

    // gauge → total raw voting power pointed at it (sum of power × weight)
    mapping(address => uint256) public gaugeWeight;

    // Total raw voting power across all gauges
    uint256 public totalWeight;

    /* ── Events ──────────────────────────────────────────────────────────── */

    event GaugeAdded(address indexed gauge);
    event GaugeRemoved(address indexed gauge);
    event Voted(uint256 indexed tokenId, address indexed gauge, uint256 weight);
    event VoteReset(uint256 indexed tokenId, address indexed gauge);

    /* ── Constructor ─────────────────────────────────────────────────────── */

    constructor(address initialOwner, address veNFT_)
        Ownable(initialOwner)
    {
        require(veNFT_ != address(0), "gc: veNFT=0");
        veNFT = CentryVeNFT(veNFT_);
    }

    /* ── Admin: Gauges ───────────────────────────────────────────────────── */

    function addGauge(address gauge) external onlyOwner {
        require(gauge      != address(0), "gc: gauge=0");
        require(!isGauge[gauge],          "gc: already added");
        isGauge[gauge] = true;
        gaugeList.push(gauge);
        emit GaugeAdded(gauge);
    }

    function removeGauge(address gauge) external onlyOwner {
        require(isGauge[gauge], "gc: not a gauge");
        isGauge[gauge] = false;

        // Remove from list
        uint256 len = gaugeList.length;
        for (uint256 i; i < len; ++i) {
            if (gaugeList[i] == gauge) {
                gaugeList[i] = gaugeList[len - 1];
                gaugeList.pop();
                break;
            }
        }
        emit GaugeRemoved(gauge);
    }

    /* ── Voting ──────────────────────────────────────────────────────────── */

    /**
     * @notice Vote for a gauge with a specific veNFT.
     * @param tokenId Your veNFT token ID.
     * @param gauge   Approved gauge address to vote for.
     * @param weight  Percent of your power to allocate (0-100).
     *                Pass 0 to remove vote for this gauge.
     *
     * Your total weight across all gauges cannot exceed 100.
     * Example: vote tokenId 5 → gaugeA 60, gaugeB 40 (total = 100).
     */
    function vote(
        uint256 tokenId,
        address gauge,
        uint256 weight
    )
        external
        nonReentrant
    {
        require(veNFT.ownerOf(tokenId) == msg.sender, "gc: not owner");
        require(isGauge[gauge],                        "gc: not a gauge");
        require(weight <= 100,                         "gc: weight > 100");

        uint256 power = veNFT.balanceOfNFT(tokenId);
        require(power > 0, "gc: no voting power (lock expired?)");

        // Remove old vote for this gauge first
        _removeVote(tokenId, gauge, power);

        if (weight == 0) return; // just resetting

        // Check new total won't exceed 100
        require(
            usedWeight[tokenId] + weight <= 100,
            "gc: total weight > 100"
        );

        // Apply new vote
        uint256 rawPower = power * weight / 100;

        votes[tokenId][gauge] = weight;
        usedWeight[tokenId]  += weight;
        gaugeWeight[gauge]   += rawPower;
        totalWeight          += rawPower;

        emit Voted(tokenId, gauge, weight);
    }

    /**
     * @notice Reset vote for one gauge.
     * @param tokenId Your veNFT token ID.
     * @param gauge   Gauge to remove your vote from.
     */
    function resetVote(uint256 tokenId, address gauge)
        external
        nonReentrant
    {
        require(veNFT.ownerOf(tokenId) == msg.sender, "gc: not owner");

        uint256 power = veNFT.balanceOfNFT(tokenId);
        _removeVote(tokenId, gauge, power);
    }

    /**
     * @notice Reset all votes for a tokenId at once.
     */
    function resetAllVotes(uint256 tokenId, address[] calldata gauges)
        external
        nonReentrant
    {
        require(veNFT.ownerOf(tokenId) == msg.sender, "gc: not owner");

        uint256 power = veNFT.balanceOfNFT(tokenId);
        for (uint256 i; i < gauges.length; ++i) {
            _removeVote(tokenId, gauges[i], power);
        }
    }

    /* ── View ────────────────────────────────────────────────────────────── */

    /// @notice Gauge weight as a fraction of total (WAD). Used by emission logic.
    function gaugeWeightFraction(address gauge)
        external
        view
        returns (uint256)
    {
        if (totalWeight == 0) return 0;
        return gaugeWeight[gauge] * 1e18 / totalWeight;
    }

    /// @notice All active gauges.
    function getGauges() external view returns (address[] memory) {
        return gaugeList;
    }

    /// @notice Remaining weight a tokenId can still allocate.
    function remainingWeight(uint256 tokenId)
        external
        view
        returns (uint256)
    {
        uint256 used = usedWeight[tokenId];
        return used >= 100 ? 0 : 100 - used;
    }

    /* ── Internal ────────────────────────────────────────────────────────── */

    function _removeVote(
        uint256 tokenId,
        address gauge,
        uint256 currentPower
    )
        internal
    {
        uint256 oldWeight = votes[tokenId][gauge];
        if (oldWeight == 0) return;

        uint256 oldRaw = currentPower * oldWeight / 100;

        votes[tokenId][gauge]  = 0;
        usedWeight[tokenId]   -= oldWeight;

        // Guard against underflow if power has changed since last vote
        if (gaugeWeight[gauge] >= oldRaw) {
            gaugeWeight[gauge] -= oldRaw;
        } else {
            gaugeWeight[gauge] = 0;
        }

        if (totalWeight >= oldRaw) {
            totalWeight -= oldRaw;
        } else {
            totalWeight = 0;
        }

        emit VoteReset(tokenId, gauge);
    }
}
