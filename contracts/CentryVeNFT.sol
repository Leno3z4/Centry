// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract CentryVeNFT is ERC721, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant WAD = 1e18;
    uint256 public constant WEEK = 1 weeks;
    uint256 public constant MIN_LOCK = 1 weeks;
    uint256 public constant MAX_LOCK = 4 * 365 days;

    IERC20 public immutable token;

    struct LockedBalance {
        uint128 amount;
        uint40 end;
    }

    mapping(uint256 => LockedBalance) public locked;
    uint256 public nextTokenId;
    uint256 public totalLocked;

    event Locked(address indexed owner, uint256 indexed tokenId, uint256 amount, uint256 unlockTime);
    event AmountIncreased(uint256 indexed tokenId, uint256 addedAmount, uint256 newTotal);
    event LockExtended(uint256 indexed tokenId, uint256 newUnlockTime);
    event Withdrawn(address indexed owner, uint256 indexed tokenId, uint256 amount);

    constructor(address initialOwner, address cntryToken)
        ERC721("Centry veNFT", "veCNTRY")
        Ownable(initialOwner)
    {
        require(cntryToken != address(0), "venft: token=0");
        token = IERC20(cntryToken);
    }

    function createLock(uint256 amount, uint256 duration) external nonReentrant returns (uint256 tokenId) {
        require(amount > 0, "venft: amount=0");
        require(amount <= type(uint128).max, "venft: amount too large");
        require(duration >= MIN_LOCK && duration <= MAX_LOCK, "venft: bad duration");

        uint256 weeksLocked = duration / WEEK;
        require(weeksLocked > 0, "venft: duration rounds to zero");
        uint256 unlockTime = ((block.timestamp / WEEK) + weeksLocked) * WEEK;
        require(unlockTime > block.timestamp, "venft: unlock invalid");
        require(unlockTime - block.timestamp <= MAX_LOCK + WEEK, "venft: unlock too far");

        token.safeTransferFrom(msg.sender, address(this), amount);
        tokenId = ++nextTokenId;
        locked[tokenId] = LockedBalance(uint128(amount), uint40(unlockTime));
        totalLocked += amount;
        _mint(msg.sender, tokenId);
        emit Locked(msg.sender, tokenId, amount, unlockTime);
    }

    function increaseAmount(uint256 tokenId, uint256 addAmount) external nonReentrant {
        require(_isOwner(msg.sender, tokenId), "venft: not owner");
        require(addAmount > 0, "venft: amount=0");
        LockedBalance storage l = locked[tokenId];
        require(l.amount > 0 && l.end > block.timestamp, "venft: lock expired");
        require(uint256(l.amount) + addAmount <= type(uint128).max, "venft: amount too large");
        token.safeTransferFrom(msg.sender, address(this), addAmount);
        l.amount += uint128(addAmount);
        totalLocked += addAmount;
        emit AmountIncreased(tokenId, addAmount, uint256(l.amount));
    }

    function extendLock(uint256 tokenId, uint256 newDuration) external nonReentrant {
        require(_isOwner(msg.sender, tokenId), "venft: not owner");
        require(newDuration >= MIN_LOCK && newDuration <= MAX_LOCK, "venft: bad duration");
        LockedBalance storage l = locked[tokenId];
        require(l.amount > 0, "venft: no lock");
        uint256 weeksLocked = newDuration / WEEK;
        uint256 newEnd = ((block.timestamp / WEEK) + weeksLocked) * WEEK;
        require(newEnd > uint256(l.end), "venft: must extend");
        l.end = uint40(newEnd);
        emit LockExtended(tokenId, newEnd);
    }

    function relock(uint256 tokenId, uint256 newDuration) external nonReentrant {
        require(_isOwner(msg.sender, tokenId), "venft: not owner");
        require(newDuration >= MIN_LOCK && newDuration <= MAX_LOCK, "venft: bad duration");
        LockedBalance storage l = locked[tokenId];
        require(l.amount > 0 && l.end <= block.timestamp, "venft: still locked");
        uint256 weeksLocked = newDuration / WEEK;
        uint256 newEnd = ((block.timestamp / WEEK) + weeksLocked) * WEEK;
        require(newEnd > block.timestamp, "venft: unlock invalid");
        l.end = uint40(newEnd);
        emit LockExtended(tokenId, newEnd);
    }

    function withdraw(uint256 tokenId) external nonReentrant {
        require(_isOwner(msg.sender, tokenId), "venft: not owner");
        LockedBalance memory l = locked[tokenId];
        require(l.amount > 0 && l.end <= block.timestamp, "venft: still locked");
        uint256 amount = uint256(l.amount);
        delete locked[tokenId];
        totalLocked -= amount;
        _burn(tokenId);
        token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, tokenId, amount);
    }

    function balanceOfNFT(uint256 tokenId) public view returns (uint256) {
        LockedBalance memory l = locked[tokenId];
        if (l.amount == 0 || l.end <= block.timestamp) return 0;
        uint256 timeLeft = uint256(l.end) - block.timestamp;
        if (timeLeft > MAX_LOCK) timeLeft = MAX_LOCK;
        return uint256(l.amount) * timeLeft / MAX_LOCK;
    }

    function totalBalanceOf(address owner, uint256[] calldata ids) external view returns (uint256 total) {
        for (uint256 i; i < ids.length; ++i) {
            if (ownerOf(ids[i]) == owner) total += balanceOfNFT(ids[i]);
        }
    }

    function lockedEnd(uint256 tokenId) external view returns (uint256) { return uint256(locked[tokenId].end); }

    function isExpired(uint256 tokenId) external view returns (bool) {
        LockedBalance memory l = locked[tokenId];
        return l.amount > 0 && l.end <= block.timestamp;
    }

    function getPosition(uint256 tokenId)
        external
        view
        returns (address owner, uint256 amount, uint256 end, uint256 power, bool expired)
    {
        LockedBalance memory l = locked[tokenId];
        return (_ownerOf(tokenId), uint256(l.amount), uint256(l.end), balanceOfNFT(tokenId), l.amount > 0 && l.end <= block.timestamp);
    }

    function _isOwner(address addr, uint256 tokenId) internal view returns (bool) {
        address owner = _ownerOf(tokenId);
        return owner != address(0) && owner == addr;
    }
}
