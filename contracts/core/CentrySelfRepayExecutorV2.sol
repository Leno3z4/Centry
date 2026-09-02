// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/ReentrancyGuard.sol";

import "../interfaces/ICentryLendingPool.sol";
import "../interfaces/ICentrySwapAdapter.sol";

interface ICentryVeCENTRevenueRewards {
    function rewardToken() external view returns (address);

    function veCENT() external view returns (address);

    function claimForSelfRepay(
        uint256 epoch,
        uint256 tokenId,
        uint256 amount,
        bytes32[] calldata proof
    ) external returns (uint256);
}

interface ICentryVeCENTOwner {
    function ownerOf(
        uint256 tokenId
    ) external view returns (address);
}

/// @title Centry Self-Repay Executor V2
/// @notice Converts funded veCENT rewards through a configured swap adapter and
///         repays any number of supported debt assets in one automation call.
/// @dev Only addresses explicitly authorized as keepers may execute self-repay.
///      The keeper supplies fresh route data and minimum outputs off-chain.
///      This contract enforces reward accounting, supported debt assets,
///      measured swap outputs, and LendingPool repayment accounting on-chain.
contract CentrySelfRepayExecutorV2 is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct SwapInstruction {
        address debtAsset;
        uint256 rewardAmountIn;
        uint256 minDebtAssetOut;
        bytes swapData;
    }

    struct RepayResult {
        address debtAsset;
        uint256 rewardAmountIn;
        uint256 debtAssetReceived;
        uint256 debtRepaid;
        uint256 leftover;
    }

    ICentryLendingPool public immutable lendingPool;
    ICentryVeCENTRevenueRewards public immutable rewardsController;
    IERC20 public immutable rewardToken;
    ICentryVeCENTOwner public immutable veCENT;

    address public swapAdapter;

    mapping(address => bool) public supportedDebtAsset;
    mapping(address => bool) public isKeeper;

    error InvalidAddress();
    error InvalidAdapter();
    error UnsupportedDebtAsset();
    error AmountZero();
    error NoSwapInstructions();
    error RewardAmountExceeded();
    error MinOutputNotMet();
    error SwapOutputInvalid();
    error NotKeeper();

    event SwapAdapterSet(address indexed adapter);

    event DebtAssetSupportUpdated(
        address indexed asset,
        bool supported
    );

    event KeeperSet(
        address indexed keeper,
        bool allowed
    );

    event SelfRepayExecuted(
        uint256 indexed tokenId,
        address indexed borrower,
        uint256 indexed epoch,
        uint256 rewardAmount,
        uint256 rewardAmountUsed,
        uint256 rewardLeftover
    );

    event DebtRepaidBySelfRepay(
        uint256 indexed tokenId,
        address indexed borrower,
        address indexed debtAsset,
        uint256 rewardAmountIn,
        uint256 debtAssetReceived,
        uint256 debtRepaid,
        uint256 leftover
    );

    constructor(
        address lendingPool_,
        address rewardsController_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (
            lendingPool_ == address(0) ||
            rewardsController_ == address(0) ||
            initialOwner == address(0)
        ) {
            revert InvalidAddress();
        }

        lendingPool = ICentryLendingPool(lendingPool_);
        rewardsController = ICentryVeCENTRevenueRewards(
            rewardsController_
        );

        address rewardToken_ = rewardsController.rewardToken();
        address veCENT_ = rewardsController.veCENT();

        if (
            rewardToken_ == address(0) ||
            veCENT_ == address(0)
        ) {
            revert InvalidAddress();
        }

        rewardToken = IERC20(rewardToken_);
        veCENT = ICentryVeCENTOwner(veCENT_);
    }

    function setSwapAdapter(
        address adapter
    ) external onlyOwner {
        if (adapter == address(0)) {
            revert InvalidAdapter();
        }

        swapAdapter = adapter;

        emit SwapAdapterSet(adapter);
    }

    function setKeeper(
        address keeper_,
        bool allowed
    ) external onlyOwner {
        if (keeper_ == address(0)) {
            revert InvalidAddress();
        }

        isKeeper[keeper_] = allowed;

        emit KeeperSet(
            keeper_,
            allowed
        );
    }

    function setDebtAssetSupported(
        address asset,
        bool supported
    ) external onlyOwner {
        if (asset == address(0)) {
            revert InvalidAddress();
        }

        supportedDebtAsset[asset] = supported;

        emit DebtAssetSupportUpdated(
            asset,
            supported
        );
    }

    function executeSelfRepay(
        uint256 epoch,
        uint256 tokenId,
        uint256 rewardAmount,
        bytes32[] calldata rewardProof,
        SwapInstruction[] calldata instructions
    ) external nonReentrant returns (RepayResult[] memory results) {
        if (!isKeeper[msg.sender]) {
            revert NotKeeper();
        }

        address borrower = veCENT.ownerOf(tokenId);

        if (borrower == address(0)) {
            revert InvalidAddress();
        }

        if (instructions.length == 0) {
            revert NoSwapInstructions();
        }

        if (swapAdapter == address(0)) {
            revert InvalidAdapter();
        }

        uint256 claimed = rewardsController.claimForSelfRepay(
            epoch,
            tokenId,
            rewardAmount,
            rewardProof
        );

        if (claimed == 0 || claimed != rewardAmount) {
            revert AmountZero();
        }

        uint256 totalRewardInput;
        results = new RepayResult[](instructions.length);

        for (uint256 i = 0; i < instructions.length; i++) {
            SwapInstruction calldata instruction = instructions[i];

            uint256 rewardUsed = _processInstruction(
                tokenId,
                borrower,
                instruction,
                results,
                i
            );

            totalRewardInput += rewardUsed;

            if (totalRewardInput > rewardAmount) {
                revert RewardAmountExceeded();
            }
        }

        uint256 rewardLeftover = rewardAmount - totalRewardInput;

        if (rewardLeftover > 0) {
            rewardToken.safeTransfer(
                borrower,
                rewardLeftover
            );
        }

        emit SelfRepayExecuted(
            tokenId,
            borrower,
            epoch,
            rewardAmount,
            totalRewardInput,
            rewardLeftover
        );
    }

    function _processInstruction(
        uint256 tokenId,
        address borrower,
        SwapInstruction calldata instruction,
        RepayResult[] memory results,
        uint256 index
    ) internal returns (uint256 rewardUsed) {
        if (
            instruction.debtAsset == address(0) ||
            !supportedDebtAsset[instruction.debtAsset]
        ) {
            revert UnsupportedDebtAsset();
        }

        if (instruction.rewardAmountIn == 0) {
            revert AmountZero();
        }

        uint256 debtAssetReceived = _swap(
            instruction.debtAsset,
            instruction.rewardAmountIn,
            instruction.minDebtAssetOut,
            instruction.swapData
        );

        uint256 currentDebt = lendingPool.borrowBalance(
            borrower,
            instruction.debtAsset
        );

        uint256 debtRepaid;

        if (currentDebt != 0) {
            debtRepaid = _repayDebt(
                instruction.debtAsset,
                borrower,
                debtAssetReceived,
                currentDebt
            );
        }

        uint256 leftover = debtAssetReceived - debtRepaid;

        if (leftover > 0) {
            IERC20(instruction.debtAsset).safeTransfer(
                borrower,
                leftover
            );
        }

        results[index] = RepayResult({
            debtAsset: instruction.debtAsset,
            rewardAmountIn: instruction.rewardAmountIn,
            debtAssetReceived: debtAssetReceived,
            debtRepaid: debtRepaid,
            leftover: leftover
        });

        emit DebtRepaidBySelfRepay(
            tokenId,
            borrower,
            instruction.debtAsset,
            instruction.rewardAmountIn,
            debtAssetReceived,
            debtRepaid,
            leftover
        );

        return instruction.rewardAmountIn;
    }

    function _swap(
        address debtAsset,
        uint256 rewardAmountIn,
        uint256 minDebtAssetOut,
        bytes calldata swapData
    ) internal returns (uint256 debtAssetReceived) {
        uint256 balanceBefore = IERC20(debtAsset).balanceOf(
            address(this)
        );

        rewardToken.forceApprove(
            swapAdapter,
            rewardAmountIn
        );

        uint256 reportedAmountOut = ICentrySwapAdapter(
            swapAdapter
        ).swap(
            address(rewardToken),
            debtAsset,
            rewardAmountIn,
            minDebtAssetOut,
            address(this),
            swapData
        );

        rewardToken.forceApprove(
            swapAdapter,
            0
        );

        uint256 balanceAfter = IERC20(debtAsset).balanceOf(
            address(this)
        );

        if (balanceAfter < balanceBefore) {
            revert SwapOutputInvalid();
        }

        debtAssetReceived = balanceAfter - balanceBefore;

        if (
            debtAssetReceived < minDebtAssetOut ||
            reportedAmountOut < minDebtAssetOut
        ) {
            revert MinOutputNotMet();
        }
    }

    function _repayDebt(
        address debtAsset,
        address borrower,
        uint256 debtAssetReceived,
        uint256 currentDebt
    ) internal returns (uint256 debtRepaid) {
        debtRepaid = debtAssetReceived < currentDebt
            ? debtAssetReceived
            : currentDebt;

        IERC20(debtAsset).forceApprove(
            address(lendingPool),
            debtRepaid
        );

        lendingPool.repayFor(
            debtAsset,
            borrower,
            debtRepaid
        );

        IERC20(debtAsset).forceApprove(
            address(lendingPool),
            0
        );
    }
}
