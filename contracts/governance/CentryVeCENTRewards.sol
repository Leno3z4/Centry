// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/ReentrancyGuard.sol";

interface ICentryVeCENT {
    function ownerOf(uint256 tokenId) external view returns (address);

    function votingPower(uint256 tokenId)
        external
        view
        returns (uint256);
}

/// @title Centry veCENT Rewards
/// @notice Emits CENT to veCENT positions according to time-weighted voting
///         power.
/// @dev Reward accrual is checkpointed before lock mutations and transfers by
///      the veCENT contract. The reward rate is fixed for the lifetime of this
///      distributor, while funding determines how long rewards remain payable.
///      A future self-repay vault can receive rewards directly.
contract CentryVeCENTRewards is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant WAD = 1e18;

    IERC20 public immutable rewardToken;
    ICentryVeCENT public immutable veCENT;

    // CENT wei emitted per 1 WAD of voting power per second.
    uint256 public immutable rewardRate;

    // The first funding transaction starts the reward program. Positions do
    // not earn anything before this timestamp.
    uint256 public programStart;

    mapping(uint256 => uint256) public lastCheckpoint;
    mapping(uint256 => uint256) public accruedRewards;
    mapping(uint256 => uint256) public claimedRewards;

    // Optional self-repay recipient. It is valid only while the same address
    // remains the owner of the veCENT NFT.
    mapping(uint256 => address) public selfRepayRecipient;
    mapping(uint256 => address) public selfRepayOwner;

    error AmountZero();
    error InsufficientRewards();
    error InvalidAddress();
    error NotOwner();
    error NotSelfRepayOwner();
    error RewardRateZero();
    error RecipientZero();

    event Funded(address indexed from, uint256 amount);
    event RewardsCheckpointed(
        uint256 indexed tokenId,
        uint256 votingPower,
        uint256 elapsed,
        uint256 amount
    );
    event RewardsClaimed(
        uint256 indexed tokenId,
        address indexed owner,
        address indexed recipient,
        uint256 amount
    );
    event SelfRepayConfigured(
        uint256 indexed tokenId,
        address indexed owner,
        address indexed recipient
    );
    event SelfRepayDisabled(
        uint256 indexed tokenId,
        address indexed owner
    );

    constructor(
        IERC20 rewardToken_,
        ICentryVeCENT veCENT_,
        uint256 rewardRate_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (
            address(rewardToken_) == address(0) ||
            address(veCENT_) == address(0) ||
            initialOwner == address(0)
        ) {
            revert InvalidAddress();
        }

        if (rewardRate_ == 0) {
            revert RewardRateZero();
        }

        rewardToken = rewardToken_;
        veCENT = veCENT_;
        rewardRate = rewardRate_;
    }

    /// @notice Fund future rewards. The first funding starts the program.
    function fund(uint256 amount) external nonReentrant {
        if (amount == 0) {
            revert AmountZero();
        }

        rewardToken.safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        if (programStart == 0) {
            programStart = block.timestamp;
        }

        emit Funded(msg.sender, amount);
    }

    /// @notice Checkpoint a position's currently accrued rewards.
    /// @dev Anyone may call this. It is also called by veCENT before any lock
    ///      mutation or transfer, preserving the reward history of the old
    ///      position state.
    function checkpoint(uint256 tokenId)
        external
        returns (uint256 amount)
    {
        amount = _checkpoint(tokenId);
    }

    function earned(uint256 tokenId)
        public
        view
        returns (uint256)
    {
        address owner = veCENT.ownerOf(tokenId);
        owner;

        uint256 accrued = accruedRewards[tokenId];
        uint256 checkpointTime = lastCheckpoint[tokenId];

        if (programStart == 0) {
            return accrued;
        }

        uint256 start = checkpointTime > programStart
            ? checkpointTime
            : programStart;

        if (start == 0 || block.timestamp <= start) {
            return accrued;
        }

        uint256 elapsed = block.timestamp - start;
        uint256 power = veCENT.votingPower(tokenId);

        return accrued + (
            power * elapsed * rewardRate
        ) / WAD;
    }

    function claim(uint256 tokenId)
        external
        nonReentrant
        returns (uint256 amount)
    {
        address owner = veCENT.ownerOf(tokenId);

        if (owner != msg.sender) {
            revert NotOwner();
        }

        _checkpoint(tokenId);
        amount = accruedRewards[tokenId];

        if (amount == 0) {
            revert AmountZero();
        }

        if (rewardToken.balanceOf(address(this)) < amount) {
            revert InsufficientRewards();
        }

        accruedRewards[tokenId] = 0;
        claimedRewards[tokenId] += amount;

        rewardToken.safeTransfer(
            owner,
            amount
        );

        emit RewardsClaimed(
            tokenId,
            owner,
            owner,
            amount
        );
    }

    function claimTo(
        uint256 tokenId,
        address recipient
    ) external nonReentrant returns (uint256 amount) {
        address owner = veCENT.ownerOf(tokenId);

        if (owner != msg.sender) {
            revert NotOwner();
        }

        if (recipient == address(0)) {
            revert RecipientZero();
        }

        _checkpoint(tokenId);
        amount = accruedRewards[tokenId];

        if (amount == 0) {
            revert AmountZero();
        }

        if (rewardToken.balanceOf(address(this)) < amount) {
            revert InsufficientRewards();
        }

        accruedRewards[tokenId] = 0;
        claimedRewards[tokenId] += amount;

        rewardToken.safeTransfer(
            recipient,
            amount
        );

        emit RewardsClaimed(
            tokenId,
            owner,
            recipient,
            amount
        );
    }

    function setSelfRepayRecipient(
        uint256 tokenId,
        address recipient
    ) external {
        address owner = veCENT.ownerOf(tokenId);

        if (owner != msg.sender) {
            revert NotOwner();
        }

        if (recipient == address(0)) {
            revert RecipientZero();
        }

        selfRepayRecipient[tokenId] = recipient;
        selfRepayOwner[tokenId] = owner;

        emit SelfRepayConfigured(
            tokenId,
            owner,
            recipient
        );
    }

    function disableSelfRepay(
        uint256 tokenId
    ) external {
        address owner = veCENT.ownerOf(tokenId);

        if (owner != msg.sender) {
            revert NotOwner();
        }

        delete selfRepayRecipient[tokenId];
        delete selfRepayOwner[tokenId];

        emit SelfRepayDisabled(
            tokenId,
            owner
        );
    }

    /// @notice Claim to the configured self-repay destination.
    /// @dev The destination is intentionally separate from the reward
    ///      distributor. A later executor/vault will swap CENT into the user's
    ///      debt asset and call LendingPool.repayFor().
    function claimForSelfRepay(
        uint256 tokenId
    ) external nonReentrant returns (uint256 amount) {
        address owner = veCENT.ownerOf(tokenId);
        address recipient = selfRepayRecipient[tokenId];

        if (
            recipient == address(0) ||
            selfRepayOwner[tokenId] != owner
        ) {
            revert NotSelfRepayOwner();
        }

        _checkpoint(tokenId);
        amount = accruedRewards[tokenId];

        if (amount == 0) {
            revert AmountZero();
        }

        if (rewardToken.balanceOf(address(this)) < amount) {
            revert InsufficientRewards();
        }

        accruedRewards[tokenId] = 0;
        claimedRewards[tokenId] += amount;

        rewardToken.safeTransfer(
            recipient,
            amount
        );

        emit RewardsClaimed(
            tokenId,
            owner,
            recipient,
            amount
        );
    }

    function _checkpoint(
        uint256 tokenId
    ) internal returns (uint256 amount) {
        veCENT.ownerOf(tokenId);

        uint256 nowTime = block.timestamp;
        uint256 previous = lastCheckpoint[tokenId];

        if (programStart == 0) {
            lastCheckpoint[tokenId] = nowTime;
            return 0;
        }

        uint256 start = previous > programStart
            ? previous
            : programStart;

        if (nowTime <= start) {
            lastCheckpoint[tokenId] = nowTime;
            return 0;
        }

        uint256 elapsed = nowTime - start;
        uint256 power = veCENT.votingPower(tokenId);

        amount = (
            power * elapsed * rewardRate
        ) / WAD;

        accruedRewards[tokenId] += amount;
        lastCheckpoint[tokenId] = nowTime;

        emit RewardsCheckpointed(
            tokenId,
            power,
            elapsed,
            amount
        );
    }
}
