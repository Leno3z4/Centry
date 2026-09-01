// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/ReentrancyGuard.sol";

interface ICentryVeCENT {
    function ownerOf(uint256 tokenId) external view returns (address);

    function votingPowerTime(uint256 tokenId)
        external
        view
        returns (uint256);
}

contract CentryVeCENTRewards is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant WAD = 1e18;

    IERC20 public immutable rewardToken;
    ICentryVeCENT public immutable veCENT;
    uint256 public immutable rewardRate;

    mapping(uint256 => uint256) public lastVotingPowerTime;
    mapping(uint256 => bool) public rewardInitialized;
    mapping(uint256 => uint256) public accruedRewards;
    mapping(uint256 => uint256) public claimedRewards;

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
        uint256 votingPowerSeconds,
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

    function fund(uint256 amount) external nonReentrant {
        if (amount == 0) {
            revert AmountZero();
        }

        rewardToken.safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        emit Funded(msg.sender, amount);
    }

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
        veCENT.ownerOf(tokenId);

        uint256 current = veCENT.votingPowerTime(tokenId);

        if (!rewardInitialized[tokenId]) {
            return accruedRewards[tokenId];
        }

        uint256 paid = lastVotingPowerTime[tokenId];

        if (current <= paid) {
            return accruedRewards[tokenId];
        }

        return accruedRewards[tokenId] + (
            (current - paid) * rewardRate
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
        amount = _pay(tokenId, owner);

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
        amount = _pay(tokenId, recipient);

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
        amount = _pay(tokenId, recipient);

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

        amount = (
            delta * rewardRate
        ) / WAD;

        accruedRewards[tokenId] += amount;
        lastVotingPowerTime[tokenId] = current;

        emit RewardsCheckpointed(
            tokenId,
            delta,
            amount
        );
    }

    function _pay(
        uint256 tokenId,
        address recipient
    ) internal returns (uint256 amount) {
        amount = accruedRewards[tokenId];

        if (amount == 0) {
            revert AmountZero();
        }

        if (
            rewardToken.balanceOf(address(this)) < amount
        ) {
            revert InsufficientRewards();
        }

        accruedRewards[tokenId] = 0;
        claimedRewards[tokenId] += amount;

        rewardToken.safeTransfer(
            recipient,
            amount
        );
    }
}
