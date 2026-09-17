// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/governance/utils/IVotes.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC721/ERC721.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/ReentrancyGuard.sol";

interface ICentryVeCENTTransferHook {
    function onVeCENTTransfer(uint256 tokenId, address from, address to) external;
}

contract CentryVotingEscrow is ERC721, ReentrancyGuard, Ownable2Step, IVotes {
    using SafeERC20 for IERC20;

    uint256 public constant WEEK = 7 days;
    uint256 public constant MIN_LOCK = 1 weeks;
    uint256 public constant MAX_LOCK = 104 weeks;
    uint256 public constant BPS = 10_000;
    uint256 public constant EARLY_WITHDRAW_FEE_BPS = 2_500;
    uint256 public constant EARLY_WITHDRAW_REWARD_SHARE_BPS = 6_000;

    struct Lock {
        uint128 amount;
        uint64 end;
    }

    struct VoteCheckpoint {
        uint64 timestamp;
        uint192 reserved;
        uint256 bias;
        uint256 slope;
    }

    IERC20 public immutable token;
    address public immutable treasury;
    address public rewardsController;
    address public transferHook;

    uint256 public nextTokenId = 1;

    mapping(uint256 => Lock) public locks;
    mapping(address => uint256[]) private _ownedTokenIds;
    mapping(uint256 => uint256) private _ownedTokenIndex;

    mapping(uint256 => uint256) public cumulativeVotingPowerTime;
    mapping(uint256 => uint64) public lastVotingPowerCheckpoint;

    mapping(address => uint256) private _voteBias;
    mapping(address => uint256) private _voteSlope;
    uint256 private _totalVoteBias;
    uint256 private _totalVoteSlope;

    mapping(address => VoteCheckpoint[]) private _voteCheckpoints;
    VoteCheckpoint[] private _totalVoteCheckpoints;

    error AmountTooLarge();
    error InvalidDuration();
    error InvalidHook();
    error LockExpired();
    error LockNotExpired();
    error NoLock();
    error RewardsControllerAlreadySet();
    error TransferHookAlreadySet();
    error ZeroAmount();
    error ZeroToken();
    error ZeroTreasury();
    error RewardsControllerNotSet();
    error DelegationDisabled();
    error FutureLookup();

    event RewardsControllerSet(address indexed controller);
    event TransferHookSet(address indexed hook);
    event LockCreated(address indexed user, uint256 indexed tokenId, uint256 amount, uint256 end);
    event LockIncreased(address indexed user, uint256 indexed tokenId, uint256 amount, uint256 newTotal);
    event LockExtended(address indexed user, uint256 indexed tokenId, uint256 newEnd);
    event Withdrawn(address indexed user, uint256 indexed tokenId, uint256 amount);

    constructor(address token_, address treasury_)
        ERC721("Centry Vote Escrow", "veCENT")
        Ownable(msg.sender)
    {
        if (token_ == address(0)) revert ZeroToken();
        if (treasury_ == address(0)) revert ZeroTreasury();
        token = IERC20(token_);
        treasury = treasury_;
    }

    function setRewardsController(address controller) external onlyOwner {
        if (rewardsController != address(0)) revert RewardsControllerAlreadySet();
        rewardsController = controller;
        emit RewardsControllerSet(controller);
    }

    function setTransferHook(address hook) external onlyOwner {
        if (transferHook != address(0)) revert TransferHookAlreadySet();
        if (hook == address(0)) revert InvalidHook();
        transferHook = hook;
        emit TransferHookSet(hook);
    }

    function createLock(uint256 amount, uint256 duration) external nonReentrant returns (uint256 tokenId) {
        if (amount == 0) revert ZeroAmount();
        if (duration < MIN_LOCK || duration > MAX_LOCK) revert InvalidDuration();
        if (amount > type(uint128).max) revert AmountTooLarge();

        uint256 end = ((block.timestamp + duration) / WEEK) * WEEK;
        if (end <= block.timestamp) revert InvalidDuration();

        token.safeTransferFrom(msg.sender, address(this), amount);

        tokenId = nextTokenId++;
        locks[tokenId] = Lock({amount: uint128(amount), end: uint64(end)});
        lastVotingPowerCheckpoint[tokenId] = uint64(block.timestamp);

        _checkpointAccount(msg.sender);
        _addVotingPosition(msg.sender, amount, end);
        _checkpointTotal();
        _addTotalVotingPosition(amount, end);

        _mint(msg.sender, tokenId);
        emit LockCreated(msg.sender, tokenId, amount, end);
    }

    function increaseAmount(uint256 tokenId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (ownerOf(tokenId) != msg.sender) revert NoLock();

        Lock storage lock = locks[tokenId];
        if (block.timestamp >= lock.end) revert LockExpired();

        _checkpointVotingPower(tokenId);
        _checkpointAccount(msg.sender);
        _checkpointTotal();

        if (uint256(lock.amount) + amount > type(uint128).max) revert AmountTooLarge();

        token.safeTransferFrom(msg.sender, address(this), amount);
        _removeVotingPosition(msg.sender, lock.amount, lock.end);
        _removeTotalVotingPosition(lock.amount, lock.end);

        lock.amount = uint128(uint256(lock.amount) + amount);
        _addVotingPosition(msg.sender, lock.amount, lock.end);
        _addTotalVotingPosition(lock.amount, lock.end);

        emit LockIncreased(msg.sender, tokenId, amount, lock.amount);
    }

    function extendLock(uint256 tokenId, uint256 newDuration) external {
        if (ownerOf(tokenId) != msg.sender) revert NoLock();

        Lock storage lock = locks[tokenId];
        if (block.timestamp >= lock.end) revert LockExpired();
        if (newDuration < MIN_LOCK || newDuration > MAX_LOCK) revert InvalidDuration();

        uint256 newEnd = ((block.timestamp + newDuration) / WEEK) * WEEK;
        if (newEnd <= lock.end || newEnd > block.timestamp + MAX_LOCK) revert InvalidDuration();

        _checkpointVotingPower(tokenId);
        _checkpointAccount(msg.sender);
        _checkpointTotal();

        _removeVotingPosition(msg.sender, lock.amount, lock.end);
        _removeTotalVotingPosition(lock.amount, lock.end);
        lock.end = uint64(newEnd);
        _addVotingPosition(msg.sender, lock.amount, newEnd);
        _addTotalVotingPosition(lock.amount, newEnd);

        emit LockExtended(msg.sender, tokenId, newEnd);
    }

    function withdraw(uint256 tokenId) external nonReentrant {
        if (ownerOf(tokenId) != msg.sender) revert NoLock();

        Lock memory lock = locks[tokenId];
        bool early = block.timestamp < lock.end;

        _checkpointVotingPower(tokenId);
        _checkpointAccount(msg.sender);
        _checkpointTotal();
        _removeVotingPosition(msg.sender, lock.amount, lock.end);
        _removeTotalVotingPosition(lock.amount, lock.end);

        delete locks[tokenId];
        delete lastVotingPowerCheckpoint[tokenId];
        _burn(tokenId);

        if (early) {
            if (rewardsController == address(0)) revert RewardsControllerNotSet();
            uint256 fee = (uint256(lock.amount) * EARLY_WITHDRAW_FEE_BPS) / BPS;
            uint256 rewardShare = (fee * EARLY_WITHDRAW_REWARD_SHARE_BPS) / BPS;
            uint256 treasuryShare = fee - rewardShare;
            uint256 returnedAmount = uint256(lock.amount) - fee;
            token.safeTransfer(address(rewardsController), rewardShare);
            token.safeTransfer(treasury, treasuryShare);
            token.safeTransfer(msg.sender, returnedAmount);
            emit Withdrawn(msg.sender, tokenId, lock.amount);
            return;
        }

        token.safeTransfer(msg.sender, lock.amount);
        emit Withdrawn(msg.sender, tokenId, lock.amount);
    }

    function votingPower(uint256 tokenId) public view returns (uint256) {
        Lock memory lock = locks[tokenId];
        if (lock.amount == 0 || block.timestamp >= lock.end) return 0;
        return (uint256(lock.amount) * (uint256(lock.end) - block.timestamp)) / MAX_LOCK;
    }

    function votingPowerOf(address account) public view returns (uint256 total) {
        uint256[] memory tokenIds = _ownedTokenIds[account];
        for (uint256 i = 0; i < tokenIds.length; i++) total += votingPower(tokenIds[i]);
    }

    function lockedAmount(uint256 tokenId) external view returns (uint256) { return locks[tokenId].amount; }
    function lockEnd(uint256 tokenId) external view returns (uint256) { return locks[tokenId].end; }
    function getOwnedTokenIds(address account) external view returns (uint256[] memory) { return _ownedTokenIds[account]; }

    function totalLocked(address account) external view returns (uint256 total) {
        uint256[] memory tokenIds = _ownedTokenIds[account];
        for (uint256 i = 0; i < tokenIds.length; i++) total += locks[tokenIds[i]].amount;
    }

    function votingPowerTime(uint256 tokenId) public view returns (uint256) {
        Lock memory lock = locks[tokenId];
        uint256 accumulated = cumulativeVotingPowerTime[tokenId];
        uint256 checkpoint = lastVotingPowerCheckpoint[tokenId];
        if (lock.amount == 0 || checkpoint == 0 || block.timestamp <= checkpoint) return accumulated;
        uint256 effectiveEnd = uint256(lock.end);
        if (checkpoint >= effectiveEnd) return accumulated;
        uint256 to = block.timestamp < effectiveEnd ? block.timestamp : effectiveEnd;
        if (to <= checkpoint) return accumulated;
        uint256 delta = to - checkpoint;
        uint256 remainingAtCheckpoint = effectiveEnd - checkpoint;
        uint256 remainingAtEnd = effectiveEnd - to;
        uint256 area = (uint256(lock.amount) * delta * (remainingAtCheckpoint + remainingAtEnd)) / (2 * MAX_LOCK);
        return accumulated + area;
    }

    function checkpointVotingPower(uint256 tokenId) external {
        ownerOf(tokenId);
        _checkpointVotingPower(tokenId);
    }

    function _checkpointVotingPower(uint256 tokenId) internal {
        Lock memory lock = locks[tokenId];
        uint256 checkpoint = lastVotingPowerCheckpoint[tokenId];
        if (checkpoint == 0 || block.timestamp <= checkpoint) return;

        uint256 effectiveEnd = uint256(lock.end);
        if (checkpoint < effectiveEnd) {
            uint256 to = block.timestamp < effectiveEnd ? block.timestamp : effectiveEnd;
            if (to > checkpoint) {
                uint256 delta = to - checkpoint;
                uint256 remainingAtCheckpoint = effectiveEnd - checkpoint;
                uint256 remainingAtEnd = effectiveEnd - to;
                cumulativeVotingPowerTime[tokenId] +=
                    (uint256(lock.amount) * delta * (remainingAtCheckpoint + remainingAtEnd)) /
                    (2 * MAX_LOCK);
            }
        }
        lastVotingPowerCheckpoint[tokenId] = uint64(block.timestamp);
    }

    // IVotes uses timestamp checkpoints here because veCENT voting power decays with time.
    function clock() public view returns (uint48) { return uint48(block.timestamp); }
    function CLOCK_MODE() public pure returns (string memory) { return "mode=timestamp"; }

    function getVotes(address account) public view returns (uint256) {
        return _currentVotingPower(_voteBias[account], _voteSlope[account], block.timestamp);
    }

    function getPastVotes(address account, uint256 timepoint) public view returns (uint256) {
        if (timepoint >= block.timestamp) revert FutureLookup();
        VoteCheckpoint memory checkpoint = _lookup(_voteCheckpoints[account], uint64(timepoint));
        return _currentVotingPower(checkpoint.bias, checkpoint.slope, timepoint);
    }

    function getPastTotalSupply(uint256 timepoint) public view returns (uint256) {
        if (timepoint >= block.timestamp) revert FutureLookup();
        VoteCheckpoint memory checkpoint = _lookup(_totalVoteCheckpoints, uint64(timepoint));
        return _currentVotingPower(checkpoint.bias, checkpoint.slope, timepoint);
    }

    function delegates(address account) public pure returns (address) { return account; }

    function delegate(address delegatee) public {
        if (delegatee != msg.sender) revert DelegationDisabled();
        emit DelegateChanged(msg.sender, msg.sender, msg.sender);
        emit DelegateVotesChanged(msg.sender, getVotes(msg.sender), getVotes(msg.sender));
    }

    function delegateBySig(
        address delegatee,
        uint256,
        uint256,
        uint8,
        bytes32,
        bytes32
    ) public pure {
        if (delegatee == address(0)) revert DelegationDisabled();
        revert DelegationDisabled();
    }

    function _currentVotingPower(uint256 bias, uint256 slope, uint256 timestamp) internal pure returns (uint256) {
        uint256 scaledBias = bias;
        uint256 scaledSlope = slope * timestamp;
        if (scaledBias <= scaledSlope) return 0;
        return (scaledBias - scaledSlope) / MAX_LOCK;
    }

    function _checkpointAccount(address account) internal {
        _writeCheckpoint(_voteCheckpoints[account], _voteBias[account], _voteSlope[account]);
    }

    function _checkpointTotal() internal {
        _writeCheckpoint(_totalVoteCheckpoints, _totalVoteBias, _totalVoteSlope);
    }

    function _writeCheckpoint(VoteCheckpoint[] storage checkpoints, uint256 bias, uint256 slope) internal {
        uint64 timestamp = uint64(block.timestamp);
        uint256 length = checkpoints.length;
        if (length > 0 && checkpoints[length - 1].timestamp == timestamp) {
            checkpoints[length - 1].bias = bias;
            checkpoints[length - 1].slope = slope;
        } else {
            checkpoints.push(VoteCheckpoint({timestamp: timestamp, reserved: 0, bias: bias, slope: slope}));
        }
    }

    function _lookup(VoteCheckpoint[] storage checkpoints, uint64 timepoint) internal view returns (VoteCheckpoint memory) {
        uint256 length = checkpoints.length;
        if (length == 0) return VoteCheckpoint(0, 0, 0, 0);
        if (checkpoints[0].timestamp > timepoint) return VoteCheckpoint(0, 0, 0, 0);

        uint256 low = 0;
        uint256 high = length;
        while (low < high) {
            uint256 mid = (low + high) / 2;
            if (checkpoints[mid].timestamp <= timepoint) low = mid + 1;
            else high = mid;
        }
        return checkpoints[low - 1];
    }

    function _addVotingPosition(address account, uint256 amount, uint256 end) internal {
        _voteBias[account] += amount * end;
        _voteSlope[account] += amount;
    }

    function _removeVotingPosition(address account, uint256 amount, uint256 end) internal {
        _voteBias[account] -= amount * end;
        _voteSlope[account] -= amount;
    }

    function _addTotalVotingPosition(uint256 amount, uint256 end) internal {
        _totalVoteBias += amount * end;
        _totalVoteSlope += amount;
    }

    function _removeTotalVotingPosition(uint256 amount, uint256 end) internal {
        _totalVoteBias -= amount * end;
        _totalVoteSlope -= amount;
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address previousOwner)
    {
        previousOwner = _ownerOf(tokenId);

        if (previousOwner != address(0) && to != previousOwner) {
            _checkpointVotingPower(tokenId);
            _checkpointAccount(previousOwner);
            _removeVotingPosition(previousOwner, locks[tokenId].amount, locks[tokenId].end);
        }

        if (to != address(0) && previousOwner != to) {
            _checkpointAccount(to);
            if (previousOwner != address(0)) {
                _addVotingPosition(to, locks[tokenId].amount, locks[tokenId].end);
            }
        }

        previousOwner = super._update(to, tokenId, auth);

        if (previousOwner != address(0)) {
            uint256[] storage fromTokens = _ownedTokenIds[previousOwner];
            uint256 index = _ownedTokenIndex[tokenId];
            uint256 lastIndex = fromTokens.length - 1;
            if (index != lastIndex) {
                uint256 movedTokenId = fromTokens[lastIndex];
                fromTokens[index] = movedTokenId;
                _ownedTokenIndex[movedTokenId] = index;
            }
            fromTokens.pop();
            delete _ownedTokenIndex[tokenId];
        }

        if (to != address(0)) {
            _ownedTokenIndex[tokenId] = _ownedTokenIds[to].length;
            _ownedTokenIds[to].push(tokenId);
        }

        address hook = transferHook;
        if (hook != address(0) && previousOwner != address(0) && to != previousOwner) {
            ICentryVeCENTTransferHook(hook).onVeCENTTransfer(tokenId, previousOwner, to);
        }
    }
}
