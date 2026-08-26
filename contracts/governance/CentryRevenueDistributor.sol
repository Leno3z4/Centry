// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/Pausable.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/ReentrancyGuard.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/cryptography/MerkleProof.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Centry Revenue Distributor
/// @notice Pull-based revenue distribution using delayed Merkle roots.
contract CentryRevenueDistributor is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 public constant ROOT_DELAY = 2 days;

    struct PendingRoot {
        bytes32 root;
        uint40 readyAt;
    }

    mapping(uint256 => mapping(address => bytes32)) public merkleRoots;
    mapping(uint256 => mapping(address => PendingRoot)) public pendingRoots;
    mapping(uint256 => mapping(address => mapping(address => uint256))) public claimed;

    error AlreadyClaimed();
    error InvalidProof();
    error InvalidRoot();
    error NotFunded();
    error RootAlreadyQueued();
    error RootAlreadySet();
    error RootNotReady();
    error ZeroAddress();

    event RootQueued(
        uint256 indexed epoch,
        address indexed asset,
        bytes32 root,
        uint256 readyAt
    );

    event RootActivated(
        uint256 indexed epoch,
        address indexed asset,
        bytes32 root
    );

    event Funded(
        address indexed asset,
        address indexed from,
        uint256 amount
    );

    event Claimed(
        uint256 indexed epoch,
        address indexed asset,
        address indexed user,
        uint256 amount
    );

    constructor(address initialOwner)
        Ownable(initialOwner)
    {}

    function queueRoot(
        uint256 epoch,
        address asset,
        bytes32 root
    ) external onlyOwner {
        if (
            asset == address(0) ||
            root == bytes32(0)
        ) {
            revert InvalidRoot();
        }

        if (merkleRoots[epoch][asset] != bytes32(0)) {
            revert RootAlreadySet();
        }

        if (pendingRoots[epoch][asset].root != bytes32(0)) {
            revert RootAlreadyQueued();
        }

        uint40 readyAt = uint40(
            block.timestamp + ROOT_DELAY
        );

        pendingRoots[epoch][asset] = PendingRoot({
            root: root,
            readyAt: readyAt
        });

        emit RootQueued(
            epoch,
            asset,
            root,
            readyAt
        );
    }

    function activateRoot(
        uint256 epoch,
        address asset
    ) external {
        PendingRoot memory pending =
            pendingRoots[epoch][asset];

        if (pending.root == bytes32(0)) {
            revert InvalidRoot();
        }

        if (block.timestamp < pending.readyAt) {
            revert RootNotReady();
        }

        merkleRoots[epoch][asset] = pending.root;
        delete pendingRoots[epoch][asset];

        emit RootActivated(
            epoch,
            asset,
            pending.root
        );
    }

    function fund(
        address asset,
        uint256 amount
    ) external nonReentrant {
        if (asset == address(0)) {
            revert ZeroAddress();
        }

        if (amount == 0) {
            revert NotFunded();
        }

        IERC20(asset).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        emit Funded(
            asset,
            msg.sender,
            amount
        );
    }

    function claim(
        uint256 epoch,
        address asset,
        uint256 amount,
        bytes32[] calldata proof
    ) external nonReentrant whenNotPaused {
        bytes32 root = merkleRoots[epoch][asset];

        if (root == bytes32(0)) {
            revert InvalidRoot();
        }

        if (
            amount == 0 ||
            claimed[epoch][asset][msg.sender] != 0
        ) {
            revert AlreadyClaimed();
        }

        bytes32 leaf = keccak256(
            bytes.concat(
                keccak256(
                    abi.encode(
                        msg.sender,
                        amount
                    )
                )
            )
        );

        if (
            !MerkleProof.verify(
                proof,
                root,
                leaf
            )
        ) {
            revert InvalidProof();
        }

        if (
            IERC20(asset).balanceOf(address(this)) <
            amount
        ) {
            revert NotFunded();
        }

        claimed[epoch][asset][msg.sender] = amount;

        IERC20(asset).safeTransfer(
            msg.sender,
            amount
        );

        emit Claimed(
            epoch,
            asset,
            msg.sender,
            amount
        );
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
