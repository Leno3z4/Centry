// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC721/ERC721.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/ReentrancyGuard.sol";

/// @title Centry Voting Escrow
/// @notice Non-transferable veCENT NFT with linearly decaying voting power.
contract CentryVotingEscrow is ERC721, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant WEEK = 7 days;
    uint256 public constant MIN_LOCK = 1 weeks;
    uint256 public constant MAX_LOCK = 104 weeks;

    struct Lock {
        uint128 amount;
        uint64 end;
    }

    IERC20 public immutable token;

    uint256 public nextTokenId = 1;

    mapping(address => uint256) public tokenIdOf;
    mapping(uint256 => Lock) public locks;

    error AmountTooLarge();
    error ExistingLock();
    error InvalidDuration();
    error LockExpired();
    error LockNotExpired();
    error NoLock();
    error NonTransferable();
    error ZeroAmount();
    error ZeroToken();

    event LockCreated(
        address indexed user,
        uint256 indexed tokenId,
        uint256 amount,
        uint256 end
    );

    event LockIncreased(
        address indexed user,
        uint256 indexed tokenId,
        uint256 amount,
        uint256 newTotal
    );

    event LockExtended(
        address indexed user,
        uint256 indexed tokenId,
        uint256 newEnd
    );

    event Withdrawn(
        address indexed user,
        uint256 indexed tokenId,
        uint256 amount
    );

    constructor(address token_) ERC721("Centry Vote Escrow", "veCENT") {
        if (token_ == address(0)) {
            revert ZeroToken();
        }

        token = IERC20(token_);
    }

    function createLock(
        uint256 amount,
        uint256 duration
    ) external nonReentrant returns (uint256 tokenId) {
        if (amount == 0) {
            revert ZeroAmount();
        }

        if (
            duration < MIN_LOCK ||
            duration > MAX_LOCK
        ) {
            revert InvalidDuration();
        }

        if (tokenIdOf[msg.sender] != 0) {
            revert ExistingLock();
        }

        if (amount > type(uint128).max) {
            revert AmountTooLarge();
        }

        uint256 end = (
            (block.timestamp + duration) /
            WEEK
        ) * WEEK;

        if (end <= block.timestamp) {
            revert InvalidDuration();
        }

        token.safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        tokenId = nextTokenId++;
        tokenIdOf[msg.sender] = tokenId;

        locks[tokenId] = Lock({
            amount: uint128(amount),
            end: uint64(end)
        });

        _mint(msg.sender, tokenId);

        emit LockCreated(
            msg.sender,
            tokenId,
            amount,
            end
        );
    }

    function increaseAmount(
        uint256 amount
    ) external nonReentrant {
        if (amount == 0) {
            revert ZeroAmount();
        }

        uint256 tokenId = tokenIdOf[msg.sender];

        if (tokenId == 0) {
            revert NoLock();
        }

        if (ownerOf(tokenId) != msg.sender) {
            revert NoLock();
        }

        Lock storage lock = locks[tokenId];

        if (block.timestamp >= lock.end) {
            revert LockExpired();
        }

        if (
            uint256(lock.amount) + amount >
            type(uint128).max
        ) {
            revert AmountTooLarge();
        }

        token.safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        lock.amount = uint128(
            uint256(lock.amount) + amount
        );

        emit LockIncreased(
            msg.sender,
            tokenId,
            amount,
            lock.amount
        );
    }

    function extendLock(
        uint256 newDuration
    ) external {
        uint256 tokenId = tokenIdOf[msg.sender];

        if (tokenId == 0) {
            revert NoLock();
        }

        if (ownerOf(tokenId) != msg.sender) {
            revert NoLock();
        }

        Lock storage lock = locks[tokenId];

        if (block.timestamp >= lock.end) {
            revert LockExpired();
        }

        if (
            newDuration < MIN_LOCK ||
            newDuration > MAX_LOCK
        ) {
            revert InvalidDuration();
        }

        uint256 newEnd = (
            (block.timestamp + newDuration) /
            WEEK
        ) * WEEK;

        if (
            newEnd <= lock.end ||
            newEnd > block.timestamp + MAX_LOCK
        ) {
            revert InvalidDuration();
        }

        lock.end = uint64(newEnd);

        emit LockExtended(
            msg.sender,
            tokenId,
            newEnd
        );
    }

    function withdraw() external nonReentrant {
        uint256 tokenId = tokenIdOf[msg.sender];

        if (tokenId == 0) {
            revert NoLock();
        }

        if (ownerOf(tokenId) != msg.sender) {
            revert NoLock();
        }

        Lock memory lock = locks[tokenId];

        if (block.timestamp < lock.end) {
            revert LockNotExpired();
        }

        delete locks[tokenId];
        delete tokenIdOf[msg.sender];

        _burn(tokenId);

        token.safeTransfer(
            msg.sender,
            lock.amount
        );

        emit Withdrawn(
            msg.sender,
            tokenId,
            lock.amount
        );
    }

    function votingPower(
        uint256 tokenId
    ) public view returns (uint256) {
        Lock memory lock = locks[tokenId];

        if (
            lock.amount == 0 ||
            block.timestamp >= lock.end
        ) {
            return 0;
        }

        return (
            uint256(lock.amount) *
            (uint256(lock.end) - block.timestamp)
        ) / MAX_LOCK;
    }

    function votingPowerOf(
        address account
    ) external view returns (uint256) {
        uint256 tokenId = tokenIdOf[account];

        if (tokenId == 0) {
            return 0;
        }

        return votingPower(tokenId);
    }

    function lockedAmount(
        address account
    ) external view returns (uint256) {
        uint256 tokenId = tokenIdOf[account];

        if (tokenId == 0) {
            return 0;
        }

        return locks[tokenId].amount;
    }

    function lockEnd(
        address account
    ) external view returns (uint256) {
        uint256 tokenId = tokenIdOf[account];

        if (tokenId == 0) {
            return 0;
        }

        return locks[tokenId].end;
    }

    function approve(
        address,
        uint256
    ) public pure override {
        revert NonTransferable();
    }

    function setApprovalForAll(
        address,
        bool
    ) public pure override {
        revert NonTransferable();
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);

        if (
            from != address(0) &&
            to != address(0)
        ) {
            revert NonTransferable();
        }

        return super._update(
            to,
            tokenId,
            auth
        );
    }
}
