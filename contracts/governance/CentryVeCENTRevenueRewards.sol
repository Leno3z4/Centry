// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/ReentrancyGuard.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/cryptography/MerkleProof.sol";

interface ICentryVeCENTRevenuePosition {
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface ICentryVeCENTRevenueTransferHook {
    function onVeCENTTransfer(
        uint256 tokenId,
        address from,
        address to
    ) external;
}

/// @title Centry veCENT Revenue Rewards
/// @notice Funded, epoch-based reward distribution for transferable veCENT NFTs.
/// @dev A keeper computes the epoch allocation from realized protocol revenue and
///      the protocol's published voting-power accounting, then commits a Merkle
///      root. The contract only pays funded, proven allocations and never mints
///      rewards or stores a fixed emission rate. The NFT id is the position key,
///      so an already-earned allocation follows the transferable position.
contract CentryVeCENTRevenueRewards is Ownable2Step, ReentrancyGuard, ICentryVeCENTRevenueTransferHook {
    using SafeERC20 for IERC20;

    uint256 public constant ROOT_DELAY = 2 days;

    struct PendingEpoch {
        bytes32 root;
        uint256 rewardBudget;
        uint40 readyAt;
    }

    IERC20 public immutable rewardToken;
    ICentryVeCENTRevenuePosition public immutable veCENT;

    mapping(uint256 => bytes32) public epochRoots;
    mapping(uint256 => PendingEpoch) public pendingEpochs;
    mapping(uint256 => uint256) public epochRewardBudget;
    mapping(uint256 => uint256) public epochClaimed;
    mapping(uint256 => mapping(uint256 => bool)) public claimed;

    mapping(uint256 => address) public selfRepayRecipient;
    mapping(uint256 => address) public selfRepayOwner;

    uint256 public latestEpoch;

    error AmountZero();
    error AlreadyClaimed();
    error EpochAlreadyQueued();
    error EpochAlreadySet();
    error EpochNotReady();
    error InsufficientRewards();
    error InvalidAddress();
    error InvalidRoot();
    error InvalidRewardBudget();
    error NotOwner();
    error NotSelfRepayOwner();
    error RecipientZero();
    error TransferHookUnauthorized();
    error InvalidProof();

    event Funded(address indexed from, uint256 amount);

    event EpochQueued(
        uint256 indexed epoch,
        bytes32 indexed root,
        uint256 rewardBudget,
        uint256 readyAt
    );

    event EpochActivated(
        uint256 indexed epoch,
        bytes32 indexed root,
        uint256 rewardBudget
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
        ICentryVeCENTRevenuePosition veCENT_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (
            address(rewardToken_) == address(0) ||
            address(veCENT_) == address(0) ||
            initialOwner == address(0)
        ) {
            revert InvalidAddress();
        }

        rewardToken = rewardToken_;
        veCENT = veCENT_;
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

    function queueEpoch(
        uint256 epoch,
        bytes32 root,
        uint256 rewardBudget
    ) external onlyOwner {
        if (epoch == 0 || root == bytes32(0)) {
            revert InvalidRoot();
        }

        if (rewardBudget == 0) {
            revert InvalidRewardBudget();
        }

        if (epochRoots[epoch] != bytes32(0)) {
            revert EpochAlreadySet();
        }

        if (pendingEpochs[epoch].root != bytes32(0)) {
            revert EpochAlreadyQueued();
        }

        if (
            rewardToken.balanceOf(address(this)) <
            rewardBudget
        ) {
            revert InsufficientRewards();
        }

        uint40 readyAt = uint40(
            block.timestamp + ROOT_DELAY
        );

        pendingEpochs[epoch] = PendingEpoch({
            root: root,
            rewardBudget: rewardBudget,
            readyAt: readyAt
        });

        emit EpochQueued(
            epoch,
            root,
            rewardBudget,
            readyAt
        );
    }

    function activateEpoch(uint256 epoch) external {
        PendingEpoch memory pending = pendingEpochs[epoch];

        if (pending.root == bytes32(0)) {
            revert InvalidRoot();
        }

        if (block.timestamp < pending.readyAt) {
            revert EpochNotReady();
        }

        epochRoots[epoch] = pending.root;
        epochRewardBudget[epoch] = pending.rewardBudget;
        delete pendingEpochs[epoch];

        if (epoch > latestEpoch) {
            latestEpoch = epoch;
        }

        emit EpochActivated(
            epoch,
            epochRoots[epoch],
            epochRewardBudget[epoch]
        );
    }

    function claim(
        uint256 epoch,
        uint256 tokenId,
        uint256 amount,
        bytes32[] calldata proof
    ) external nonReentrant returns (uint256) {
        address owner = veCENT.ownerOf(tokenId);

        if (owner != msg.sender) {
            revert NotOwner();
        }

        return _claim(
            epoch,
            tokenId,
            owner,
            owner,
            amount,
            proof
        );
    }

    function claimTo(
        uint256 epoch,
        uint256 tokenId,
        address recipient,
        uint256 amount,
        bytes32[] calldata proof
    ) external nonReentrant returns (uint256) {
        address owner = veCENT.ownerOf(tokenId);

        if (owner != msg.sender) {
            revert NotOwner();
        }

        if (recipient == address(0)) {
            revert RecipientZero();
        }

        return _claim(
            epoch,
            tokenId,
            owner,
            recipient,
            amount,
            proof
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

    function claimForSelfRepay(
        uint256 epoch,
        uint256 tokenId,
        uint256 amount,
        bytes32[] calldata proof
    ) external nonReentrant returns (uint256) {
        address owner = veCENT.ownerOf(tokenId);
        address recipient = selfRepayRecipient[tokenId];

        if (
            recipient == address(0) ||
            selfRepayOwner[tokenId] != owner
        ) {
            revert NotSelfRepayOwner();
        }

        return _claim(
            epoch,
            tokenId,
            owner,
            recipient,
            amount,
            proof
        );
    }

    function onVeCENTTransfer(
        uint256 tokenId,
        address from,
        address to
    ) external override {
        if (msg.sender != address(veCENT)) {
            revert TransferHookUnauthorized();
        }

        if (
            from != address(0) &&
            from != to &&
            selfRepayRecipient[tokenId] != address(0)
        ) {
            _clearSelfRepay(tokenId, from);
        }
    }

    function _claim(
        uint256 epoch,
        uint256 tokenId,
        address owner,
        address recipient,
        uint256 amount,
        bytes32[] calldata proof
    ) internal returns (uint256) {
        bytes32 root = epochRoots[epoch];

        if (root == bytes32(0) || amount == 0) {
            revert InvalidRoot();
        }

        if (claimed[epoch][tokenId]) {
            revert AlreadyClaimed();
        }

        bytes32 leaf = keccak256(
            bytes.concat(
                keccak256(
                    abi.encode(
                        tokenId,
                        amount
                    )
                )
            )
        );

        if (!MerkleProof.verify(proof, root, leaf)) {
            revert InvalidProof();
        }

        uint256 newClaimed = epochClaimed[epoch] + amount;

        if (newClaimed > epochRewardBudget[epoch]) {
            revert InsufficientRewards();
        }

        if (
            rewardToken.balanceOf(address(this)) <
            amount
        ) {
            revert InsufficientRewards();
        }

        claimed[epoch][tokenId] = true;
        epochClaimed[epoch] = newClaimed;

        rewardToken.safeTransfer(
            recipient,
            amount
        );

        emit RewardsClaimed(
            epoch,
            tokenId,
            owner,
            recipient,
            amount
        );

        return amount;
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
