// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/ReentrancyGuard.sol";

import "../interfaces/ICentryVeCENTTransferHook.sol";

interface ICentryVeCENT {
    function ownerOf(uint256 tokenId) external view returns (address);

    function votingPowerTime(uint256 tokenId)
        external
        view
        returns (uint256);
}

/// @title Centry veCENT Rewards
/// @notice Revenue-funded epoch rewards for veCENT positions.
/// @dev The owner/keeper supplies an epoch budget after protocol revenue has
///      been realized. The contract never mints rewards and never uses a
///      hard-coded emission rate.
contract CentryVeCENTRewards is Ownable2Step, ReentrancyGuard, ICentryVeCENTTransferHook {
    using SafeERC20 for IERC20;

    uint256 public constant WAD = 1e18;
    uint256 public constant MAX_EPOCH_DURATION = 30 days;

    IERC20 public immutable rewardToken;
    ICentryVeCENT public immutable veCENT;

    uint256 public epochDuration;
    uint256 public currentEpoch;
    uint256 public epochStart;
    uint256 public epochEnd;
    uint256 public epochRewardBudget;
    uint256 public totalVotingPowerTime;

    mapping(uint256 => uint256) public epochRewardBudgetById;
    mapping(uint256 => uint256) public epochTotalVotingPowerTime;
    mapping(uint256 => mapping(uint256 => uint256)) public tokenVotingPowerTime;
    mapping(uint256 => mapping(uint256 => bool)) public epochClaimed;

    mapping(uint256 => uint256) public accruedRewards;
    mapping(uint256 => uint256) public claimedRewards;
    mapping(uint256 => uint256) public lastVotingPowerTime;
    mapping(uint256 => bool) public rewardInitialized;

    mapping(uint256 => address) public selfRepayRecipient;
    mapping(uint256 => address) public selfRepayOwner;

    error AmountZero();
    error EpochNotEnded();
    error EpochNotStarted();
    error InvalidAddress();
    error InvalidEpochDuration();
    error InvalidEpochBudget();
    error InsufficientRewards();
    error NotOwner();
    error NotSelfRepayOwner();
    error RecipientZero();
    error TokenNotInEpoch();

    event Funded(
        address indexed from,
        uint256 amount
    );

    event EpochStarted(
        uint256 indexed epoch,
        uint256 start,
        uint256 end,
        uint256 rewardBudget
    );

    event EpochCheckpointed(
        uint256 indexed epoch,
        uint256 indexed tokenId,
        uint256 votingPowerTime
    );

    event EpochFinalized(
        uint256 indexed epoch,
        uint256 rewardBudget,
        uint256 totalVotingPowerTime
    );

    event RewardsClaimed(
        uint256 indexed epoch,
        uint256 indexed tokenId,
        address indexed owner,
        address recipient,
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
        uint256 epochDuration_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (
            address(rewardToken_) == address(0) ||
            address(veCENT_) == address(0) ||
            initialOwner == address(0)
        ) {
            revert InvalidAddress();
        }

        if (
            epochDuration_ == 0 ||
            epochDuration_ > MAX_EPOCH_DURATION
        ) {
            revert InvalidEpochDuration();
        }

        rewardToken = rewardToken_;
        veCENT = veCENT_;
        epochDuration = epochDuration_;
    }

    function fund(uint256 amount) external nonReentrant {
        if (amount == 0) {
            revert AmountZero();
        }

        rewardToken.safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        emit Funded(
            msg.sender,
            amount
        );
    }

    function startEpoch(uint256 rewardBudget) external onlyOwner {
        if (
            currentEpoch != 0 &&
            block.timestamp < epochEnd
        ) {
            revert EpochNotEnded();
        }

        if (rewardBudget == 0) {
            revert InvalidEpochBudget();
        }

        if (
            rewardToken.balanceOf(address(this)) <
            rewardBudget
        ) {
            revert InsufficientRewards();
        }

        currentEpoch += 1;
        epochStart = block.timestamp;
        epochEnd = block.timestamp + epochDuration;
        epochRewardBudget = rewardBudget;
        totalVotingPowerTime = 0;

        epochRewardBudgetById[currentEpoch] = rewardBudget;

        emit EpochStarted(
            currentEpoch,
            epochStart,
            epochEnd,
            rewardBudget
        );
    }

    function checkpoint(uint256 tokenId)
        external
        returns (uint256 amount)
    {
        return _checkpointCurrentEpoch(tokenId);
    }

    function finalizeEpoch() external {
        if (currentEpoch == 0) {
            revert EpochNotStarted();
        }

        if (block.timestamp < epochEnd) {
            revert EpochNotEnded();
        }

        epochTotalVotingPowerTime[currentEpoch] =
            totalVotingPowerTime;

        emit EpochFinalized(
            currentEpoch,
            epochRewardBudget,
            totalVotingPowerTime
        );
    }

    function earned(uint256 tokenId)
        public
        view
        returns (uint256 amount)
    {
        address owner = veCENT.ownerOf(tokenId);

        if (owner == address(0)) {
            revert NotOwner();
        }

        amount = accruedRewards[tokenId];

        if (currentEpoch == 0) {
            return amount;
        }

        uint256 currentVotingPowerTime = veCENT.votingPowerTime(
            tokenId
        );

        uint256 previous = lastVotingPowerTime[tokenId];

        if (
            rewardInitialized[tokenId] &&
            currentVotingPowerTime > previous &&
            block.timestamp <= epochEnd
        ) {
            uint256 delta = currentVotingPowerTime - previous;
            amount += delta;
        }
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

        _checkpointCurrentEpoch(tokenId);
        amount = _claimAvailable(tokenId, owner);

        emit RewardsClaimed(
            currentEpoch,
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

        _checkpointCurrentEpoch(tokenId);
        amount = _claimAvailable(tokenId, recipient);

        emit RewardsClaimed(
            currentEpoch,
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

    function disableSelfRepay(uint256 tokenId) external {
        address owner = veCENT.ownerOf(tokenId);

        if (owner != msg.sender) {
            revert NotOwner();
        }

        _clearSelfRepay(tokenId, owner);
    }

    function claimForSelfRepay(uint256 tokenId)
        external
        nonReentrant
        returns (uint256 amount)
    {
        address owner = veCENT.ownerOf(tokenId);
        address recipient = selfRepayRecipient[tokenId];

        if (
            recipient == address(0) ||
            selfRepayOwner[tokenId] != owner
        ) {
            revert NotSelfRepayOwner();
        }

        _checkpointCurrentEpoch(tokenId);
        amount = _claimAvailable(tokenId, recipient);

        emit RewardsClaimed(
            currentEpoch,
            tokenId,
            owner,
            recipient,
            amount
        );
    }

    function onVeCENTTransfer(
        uint256 tokenId,
        address from,
        address to
    ) external override {
        if (msg.sender != address(veCENT)) {
            revert NotOwner();
        }

        if (from != address(0) && from != to) {
            _clearSelfRepay(tokenId, from);
        }
    }

    function setEpochDuration(
        uint256 newDuration
    ) external onlyOwner {
        if (
            newDuration == 0 ||
            newDuration > MAX_EPOCH_DURATION
        ) {
            revert InvalidEpochDuration();
        }

        if (
            currentEpoch != 0 &&
            block.timestamp < epochEnd
        ) {
            revert EpochNotEnded();
        }

        epochDuration = newDuration;
    }

    function _checkpointCurrentEpoch(
        uint256 tokenId
    ) internal returns (uint256 amount) {
        veCENT.ownerOf(tokenId);

        if (currentEpoch == 0) {
            revert EpochNotStarted();
        }

        uint256 current = veCENT.votingPowerTime(tokenId);

        if (!rewardInitialized[tokenId]) {
            rewardInitialized[tokenId] = true;
            lastVotingPowerTime[tokenId] = current;
            return 0;
        }

        uint256 previous = lastVotingPowerTime[tokenId];

        if (current <= previous) {
            return 0;
        }

        uint256 delta = current - previous;
        uint256 effectiveCurrent = block.timestamp;

        if (effectiveCurrent > epochEnd) {
            effectiveCurrent = epochEnd;
        }

        if (effectiveCurrent < epochStart) {
            lastVotingPowerTime[tokenId] = current;
            return 0;
        }

        uint256 epochStartVotingPowerTime = veCENT.votingPowerTime(
            tokenId
        );

        epochStartVotingPowerTime;

        tokenVotingPowerTime[currentEpoch][tokenId] += delta;
        totalVotingPowerTime += delta;
        lastVotingPowerTime[tokenId] = current;

        emit EpochCheckpointed(
            currentEpoch,
            tokenId,
            delta
        );

        amount = delta;
    }

    function _claimAvailable(
        uint256 tokenId,
        address recipient
    ) internal returns (uint256 amount) {
        if (currentEpoch == 0) {
            revert EpochNotStarted();
        }

        uint256 votingTime = tokenVotingPowerTime[
            currentEpoch
        ][tokenId];

        uint256 totalTime = epochTotalVotingPowerTime[
            currentEpoch
        ];

        if (totalTime == 0 || votingTime == 0) {
            revert TokenNotInEpoch();
        }

        if (epochClaimed[currentEpoch][tokenId]) {
            revert TokenNotInEpoch();
        }

        amount = (
            epochRewardBudget *
            votingTime
        ) / totalTime;

        if (amount == 0) {
            revert AmountZero();
        }

        if (
            rewardToken.balanceOf(address(this)) <
            amount
        ) {
            revert InsufficientRewards();
        }

        epochClaimed[currentEpoch][tokenId] = true;
        accruedRewards[tokenId] = 0;
        claimedRewards[tokenId] += amount;

        rewardToken.safeTransfer(
            recipient,
            amount
        );
    }

    function _clearSelfRepay(
        uint256 tokenId,
        address owner
    ) internal {
        delete selfRepayRecipient[tokenId];
        delete selfRepayOwner[tokenId];

        emit SelfRepayDisabled(
            tokenId,
            owner
        );
    }
}
