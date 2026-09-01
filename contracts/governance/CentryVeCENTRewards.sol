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

/// @title Centry veCENT Rewards
/// @notice Distributes funded CENT rewards according to the time-integral of
///         each veCENT position's voting power.
/// @dev Rewards follow the NFT, not the wallet. The reward amount is derived
///      from on-chain voting-power seconds, so transfers do not reset accrual.
///      A future self-repay vault can be configured as the reward recipient.
contract CentryVeCENTRewards is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant WAD = 1e18;

    IERC20 public immutable rewardToken;
    ICentryVeCENT public immutable veCENT;

    // Reward token wei emitted for one WAD of voting-power per second,
    // represented with WAD precision.
    uint256 public immutable rewardRate;

    mapping(uint256 => uint256) public rewardIntegralPaid;
    mapping(uint256 => uint256) public claimedRewards;

    // Optional self-repay recipient. The configured owner is recorded so a
    // transfer automatically invalidates the old self-repay configuration.
    mapping(uint256 => address) public selfRepayRecipient;
    mapping(uint256 => address) public selfRepayOwner;

    error AmountZero();
    error InsufficientRewards();
    error InvalidAddress();
    error NotOwner();
    error NotSelfRepayOwner();
    error RewardRateZero();
    error RecipientZero();

    event Funded(
        address indexed from,
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

    /// @notice Fund the controller with CENT that can be claimed by lockers.
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

    /// @notice Current gross reward accrued by a veCENT position.
    function earned(uint256 tokenId)
        public
        view
        returns (uint256)
    {
        veCENT.ownerOf(tokenId);

        uint256 integral = veCENT.votingPowerTime(tokenId);
        uint256 paid = rewardIntegralPaid[tokenId];

        if (integral <= paid) {
            return 0;
        }

        return (
            (integral - paid) *
            rewardRate
        ) / WAD;
    }

    /// @notice Claim rewards to the current veCENT owner.
    function claim(uint256 tokenId)
        external
        nonReentrant
        returns (uint256 amount)
    {
        address owner = veCENT.ownerOf(tokenId);

        if (owner != msg.sender) {
            revert NotOwner();
        }

        amount = _claim(tokenId, owner);
    }

    /// @notice Claim rewards to a caller-selected recipient.
    /// @dev Intended for the user's own wallet or a future Centry self-repay
    ///      vault. The caller must still own the veCENT NFT.
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

        amount = _claim(tokenId, recipient);
    }

    /// @notice Configure a recipient for automated self-repay reward routing.
    /// @dev The configuration becomes invalid automatically if the NFT is
    ///      transferred because the recorded owner no longer matches ownerOf.
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

    /// @notice Claim to the configured self-repay recipient.
    /// @dev The recipient itself is only a destination. A later Centry vault
    ///      will be responsible for swapping CENT into the user's debt asset
    ///      and calling LendingPool.repayFor(user, amount).
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

        amount = _claim(tokenId, recipient);
    }

    function _claim(
        uint256 tokenId,
        address recipient
    ) internal returns (uint256 amount) {
        uint256 integral = veCENT.votingPowerTime(tokenId);
        uint256 paid = rewardIntegralPaid[tokenId];

        if (integral <= paid) {
            revert AmountZero();
        }

        amount = (
            (integral - paid) *
            rewardRate
        ) / WAD;

        if (amount == 0) {
            revert AmountZero();
        }

        if (rewardToken.balanceOf(address(this)) < amount) {
            revert InsufficientRewards();
        }

        rewardIntegralPaid[tokenId] = integral;
        claimedRewards[tokenId] += amount;

        rewardToken.safeTransfer(
            recipient,
            amount
        );

        emit RewardsClaimed(
            tokenId,
            veCENT.ownerOf(tokenId),
            recipient,
            amount
        );
    }
}
