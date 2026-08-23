// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/*
    CentryVeNFT
    ─────────────────────────────────────────────────────────────────────────
    Lock CNTRY tokens → receive an ERC721 NFT representing your locked
    position.  The NFT carries voting power that decays linearly to zero
    at the unlock time.

    Voting power:
        power = amount × timeLeft / MAX_LOCK

    Example: lock 1000 CNTRY for 4 years → 1000 power today, ~500 in 2 years.
    Example: lock 1000 CNTRY for 1 year  → 250 power today.

    Each NFT is a separate position — you can hold many.
    NFTs are transferable (position moves with the NFT).
    Locking, increasing, and extending are restricted to the current owner.

    ─────────────────────────────────────────────────────────────────────────
    How it connects to the rest of Centry
    ─────────────────────────────────────────────────────────────────────────
    GaugeController   reads balanceOfNFT(tokenId) to weight votes
    RevenueDistributor reads balanceOfNFT(tokenId) to calculate fee share
    CentryToken       is the underlying locked asset

    ─────────────────────────────────────────────────────────────────────────
    FIXES vs Gemini version
    ─────────────────────────────────────────────────────────────────────────
    1. createLock takes DURATION (seconds), not an absolute timestamp.
       Gemini ABI said unlockTime but contract expected duration — mismatch.
    2. Unlock time rounded to nearest week (Curve convention) so all locks
       align to the same epoch grid — important for RevenueDistributor epochs.
    3. Only NFT owner can increase/extend/withdraw.
    4. Transfers blocked while lock is active? No — NFTs ARE transferable
       (Velodrome style), position moves with the NFT.
    5. Re-lock on expired token (instead of forcing withdraw + create).
    6. balanceOfNFT correctly returns 0 after expiry.
    7. ReentrancyGuard on all state-changing functions.
*/

contract CentryVeNFT is ERC721, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ── Constants ───────────────────────────────────────────────────────── */

    uint256 public constant WAD     = 1e18;
    uint256 public constant WEEK    = 1 weeks;        // 604800 seconds
    uint256 public constant MIN_LOCK = 1 weeks;       // shortest lock
    uint256 public constant MAX_LOCK = 4 * 365 days; // ~208 weeks, longest lock

    /* ── Immutables ──────────────────────────────────────────────────────── */

    IERC20 public immutable token; // CentryToken (CNTRY)

    /* ── State ───────────────────────────────────────────────────────────── */

    struct LockedBalance {
        uint128 amount; // CNTRY locked  (max ~3.4e38, well above 100M * 1e18)
        uint40  end;    // unlock epoch  (seconds, fits until year 36812)
    }

    mapping(uint256 => LockedBalance) public locked;

    uint256 public nextTokenId; // increments from 1
    uint256 public totalLocked; // total CNTRY held in escrow

    /* ── Events ──────────────────────────────────────────────────────────── */

    event Locked(
        address indexed owner,
        uint256 indexed tokenId,
        uint256 amount,
        uint256 unlockTime
    );
    event AmountIncreased(
        uint256 indexed tokenId,
        uint256 addedAmount,
        uint256 newTotal
    );
    event LockExtended(
        uint256 indexed tokenId,
        uint256 newUnlockTime
    );
    event Withdrawn(
        address indexed owner,
        uint256 indexed tokenId,
        uint256 amount
    );

    /* ── Constructor ─────────────────────────────────────────────────────── */

    constructor(address initialOwner, address cntryToken)
        ERC721("Centry veNFT", "veCNTRY")
        Ownable(initialOwner)
    {
        require(cntryToken != address(0), "venft: token=0");
        token = IERC20(cntryToken);
    }

    /* ── Core: Create lock ───────────────────────────────────────────────── */

    /**
     * @notice Lock CNTRY for a duration and receive a veNFT.
     * @param amount   CNTRY to lock (must be > 0).
     * @param duration Lock duration in seconds (MIN_LOCK to MAX_LOCK).
     * @return tokenId The minted NFT token ID.
     *
     * Duration is rounded DOWN to the nearest week so all locks align
     * to the same epoch grid (required for fair RevenueDistributor epochs).
     *
     * FIX: Gemini's hook sent an absolute timestamp here.
     *      This function always expects a DURATION (seconds from now).
     *      Frontend: pass e.g. 4 * 365 * 24 * 3600 for a 4-year lock.
     */
    function createLock(uint256 amount, uint256 duration)
        external
        nonReentrant
        returns (uint256 tokenId)
    {
        require(amount   > 0,         "venft: amount=0");
        require(duration >= MIN_LOCK, "venft: too short");
        require(duration <= MAX_LOCK, "venft: too long");

        uint256 unlockTime = _roundToWeek(block.timestamp + duration);

        // Edge case: rounding could push below MIN_LOCK
        require(unlockTime > block.timestamp, "venft: unlock in past");

        token.safeTransferFrom(msg.sender, address(this), amount);

        tokenId = ++nextTokenId;

        locked[tokenId] = LockedBalance({
            amount: uint128(amount),
            end:    uint40(unlockTime)
        });

        totalLocked += amount;

        _mint(msg.sender, tokenId);

        emit Locked(msg.sender, tokenId, amount, unlockTime);
    }

    /* ── Core: Modify lock ───────────────────────────────────────────────── */

    /**
     * @notice Add more CNTRY to an existing lock.
     *         Voting power increases immediately; unlock time stays the same.
     * @param tokenId  Your veNFT token ID.
     * @param addAmount CNTRY to add.
     */
    function increaseAmount(uint256 tokenId, uint256 addAmount)
        external
        nonReentrant
    {
        require(_isOwner(msg.sender, tokenId),  "venft: not owner");
        require(addAmount > 0,                   "venft: amount=0");

        LockedBalance storage l = locked[tokenId];
        require(l.amount > 0,               "venft: no lock");
        require(l.end > block.timestamp,    "venft: lock expired");

        token.safeTransferFrom(msg.sender, address(this), addAmount);

        l.amount    += uint128(addAmount);
        totalLocked += addAmount;

        emit AmountIncreased(tokenId, addAmount, uint256(l.amount));
    }

    /**
     * @notice Extend an existing lock's duration (increases voting power).
     *         New duration is measured from NOW, not from the current end.
     * @param tokenId     Your veNFT token ID.
     * @param newDuration New total duration in seconds from now.
     */
    function extendLock(uint256 tokenId, uint256 newDuration)
        external
        nonReentrant
    {
        require(_isOwner(msg.sender, tokenId), "venft: not owner");
        require(newDuration >= MIN_LOCK,        "venft: too short");
        require(newDuration <= MAX_LOCK,        "venft: too long");

        LockedBalance storage l = locked[tokenId];
        require(l.amount > 0, "venft: no lock");

        uint256 newEnd = _roundToWeek(block.timestamp + newDuration);
        require(newEnd > uint256(l.end), "venft: must extend");

        l.end = uint40(newEnd);

        emit LockExtended(tokenId, newEnd);
    }

    /**
     * @notice Re-lock an expired position without having to withdraw + create.
     *         Resets the duration from now.
     * @param tokenId     Your expired veNFT token ID.
     * @param newDuration New lock duration in seconds from now.
     */
    function relock(uint256 tokenId, uint256 newDuration)
        external
        nonReentrant
    {
        require(_isOwner(msg.sender, tokenId), "venft: not owner");
        require(newDuration >= MIN_LOCK,        "venft: too short");
        require(newDuration <= MAX_LOCK,        "venft: too long");

        LockedBalance storage l = locked[tokenId];
        require(l.amount > 0,                "venft: no lock");
        require(l.end <= block.timestamp,    "venft: still locked — use extendLock");

        uint256 newEnd = _roundToWeek(block.timestamp + newDuration);
        l.end = uint40(newEnd);

        emit LockExtended(tokenId, newEnd);
    }

    /* ── Core: Withdraw ──────────────────────────────────────────────────── */

    /**
     * @notice Withdraw locked CNTRY after the lock expires.
     *         Burns the NFT and returns the tokens.
     * @param tokenId Your veNFT token ID.
     */
    function withdraw(uint256 tokenId)
        external
        nonReentrant
    {
        require(_isOwner(msg.sender, tokenId), "venft: not owner");

        LockedBalance memory l = locked[tokenId];
        require(l.amount > 0,              "venft: no lock");
        require(l.end <= block.timestamp,  "venft: still locked");

        uint256 amount = uint256(l.amount);

        // Clear state before external call (checks-effects-interactions)
        delete locked[tokenId];
        totalLocked -= amount;

        _burn(tokenId);

        token.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, tokenId, amount);
    }

    /* ── View: Voting power ──────────────────────────────────────────────── */

    /**
     * @notice Voting power of a specific NFT right now.
     *         Decays linearly to 0 at unlock time.
     *
     * power = amount × timeLeft / MAX_LOCK
     *
     * Returns 0 if lock is expired.
     */
    function balanceOfNFT(uint256 tokenId)
        public
        view
        returns (uint256)
    {
        LockedBalance memory l = locked[tokenId];
        if (l.amount == 0)              return 0;
        if (l.end <= block.timestamp)   return 0;

        uint256 timeLeft = uint256(l.end) - block.timestamp;

        // Clamp — shouldn't exceed MAX_LOCK but safe to guard
        if (timeLeft > MAX_LOCK) timeLeft = MAX_LOCK;

        return uint256(l.amount) * timeLeft / MAX_LOCK;
    }

    /**
     * @notice Sum of voting power across all NFTs owned by an address.
     *         Loops through owned tokens — use off-chain for gas-heavy calls.
     * @param owner  Address to check.
     * @param ids    Token IDs owned by this address (pass from off-chain enumeration).
     */
    function totalBalanceOf(address owner, uint256[] calldata ids)
        external
        view
        returns (uint256 total)
    {
        for (uint256 i; i < ids.length; ++i) {
            if (ownerOf(ids[i]) == owner) {
                total += balanceOfNFT(ids[i]);
            }
        }
    }

    /**
     * @notice Unlock timestamp for a token (0 if no lock).
     */
    function lockedEnd(uint256 tokenId) external view returns (uint256) {
        return uint256(locked[tokenId].end);
    }

    /**
     * @notice Whether a lock has expired.
     */
    function isExpired(uint256 tokenId) external view returns (bool) {
        LockedBalance memory l = locked[tokenId];
        return l.amount > 0 && l.end <= block.timestamp;
    }

    /**
     * @notice Full position info for frontend.
     */
    function getPosition(uint256 tokenId)
        external
        view
        returns (
            address owner,
            uint256 amount,
            uint256 end,
            uint256 power,
            bool    expired
        )
    {
        LockedBalance memory l = locked[tokenId];
        return (
            _ownerOf(tokenId),
            uint256(l.amount),
            uint256(l.end),
            balanceOfNFT(tokenId),
            l.amount > 0 && l.end <= block.timestamp
        );
    }

    /* ── Internal ────────────────────────────────────────────────────────── */

    /// @dev Round a timestamp DOWN to the nearest week boundary.
    function _roundToWeek(uint256 ts) internal pure returns (uint256) {
        return (ts / WEEK) * WEEK;
    }

    /// @dev Check if `addr` owns `tokenId`. Uses _ownerOf to avoid revert on unowned.
    function _isOwner(address addr, uint256 tokenId)
        internal
        view
        returns (bool)
    {
        address owner = _ownerOf(tokenId);
        return owner != address(0) && owner == addr;
    }
}
