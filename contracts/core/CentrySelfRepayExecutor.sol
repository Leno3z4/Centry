// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/ReentrancyGuard.sol";

import "../interfaces/ICentryLendingPool.sol";
import "../interfaces/ICentrySwapAdapter.sol";

interface ICentryVeCENTRewards {
    function rewardToken() external view returns (address);

    function veCENT() external view returns (address);

    function claimForSelfRepay(
        uint256 tokenId
    ) external returns (uint256 amount);
}

interface ICentryVeCENTOwnership {
    function ownerOf(
        uint256 tokenId
    ) external view returns (address);
}

contract CentrySelfRepayExecutor is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct RepayResult {
        uint256 rewardAmount;
        uint256 debtAssetReceived;
        uint256 debtRepaid;
        uint256 leftover;
    }

    ICentryLendingPool public immutable lendingPool;
    ICentryVeCENTRewards public immutable rewardsController;
    IERC20 public immutable rewardToken;
    ICentryVeCENTOwnership public immutable veCENT;

    address public swapAdapter;

    mapping(address => bool) public supportedDebtAsset;

    error InvalidAddress();
    error InvalidAdapter();
    error UnsupportedDebtAsset();
    error NotTokenOwner();
    error AmountZero();
    error MinOutputNotMet();
    error SwapOutputInvalid();

    event SwapAdapterSet(address indexed adapter);
    event DebtAssetSupportUpdated(
        address indexed asset,
        bool supported
    );
    event SelfRepayExecuted(
        uint256 indexed tokenId,
        address indexed borrower,
        address indexed debtAsset,
        uint256 rewardAmount,
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
        rewardsController = ICentryVeCENTRewards(
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
        veCENT = ICentryVeCENTOwnership(veCENT_);
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
        uint256 tokenId,
        address debtAsset,
        uint256 minDebtAssetOut,
        bytes calldata swapData
    ) external nonReentrant returns (
        uint256 rewardAmount,
        uint256 debtAssetReceived,
        uint256 debtRepaid,
        uint256 leftover
    ) {
        address borrower = veCENT.ownerOf(tokenId);

        if (borrower != msg.sender) {
            revert NotTokenOwner();
        }

        _validateExecution(debtAsset);

        RepayResult memory result = _executeRepay(
            tokenId,
            borrower,
            debtAsset,
            minDebtAssetOut,
            swapData
        );

        emit SelfRepayExecuted(
            tokenId,
            borrower,
            debtAsset,
            result.rewardAmount,
            result.debtAssetReceived,
            result.debtRepaid,
            result.leftover
        );

        return (
            result.rewardAmount,
            result.debtAssetReceived,
            result.debtRepaid,
            result.leftover
        );
    }

    function _validateExecution(
        address debtAsset
    ) internal view {
        if (!supportedDebtAsset[debtAsset]) {
            revert UnsupportedDebtAsset();
        }

        if (swapAdapter == address(0)) {
            revert InvalidAdapter();
        }
    }

    function _executeRepay(
        uint256 tokenId,
        address borrower,
        address debtAsset,
        uint256 minDebtAssetOut,
        bytes calldata swapData
    ) internal returns (RepayResult memory result) {
        result.rewardAmount = rewardsController.claimForSelfRepay(
            tokenId
        );

        if (result.rewardAmount == 0) {
            revert AmountZero();
        }

        result.debtAssetReceived = _swapRewards(
            debtAsset,
            result.rewardAmount,
            minDebtAssetOut,
            swapData
        );

        uint256 currentDebt = lendingPool.borrowBalance(
            borrower,
            debtAsset
        );

        if (currentDebt == 0) {
            IERC20(debtAsset).safeTransfer(
                borrower,
                result.debtAssetReceived
            );

            result.leftover = result.debtAssetReceived;
            return result;
        }

        result.debtRepaid = _repayDebt(
            debtAsset,
            borrower,
            result.debtAssetReceived,
            currentDebt
        );

        result.leftover = result.debtAssetReceived - result.debtRepaid;

        if (result.leftover > 0) {
            IERC20(debtAsset).safeTransfer(
                borrower,
                result.leftover
            );
        }
    }

    function _swapRewards(
        address debtAsset,
        uint256 rewardAmount,
        uint256 minDebtAssetOut,
        bytes calldata swapData
    ) internal returns (uint256 debtAssetReceived) {
        address adapter = swapAdapter;

        rewardToken.forceApprove(
            adapter,
            rewardAmount
        );

        uint256 balanceBefore = IERC20(debtAsset).balanceOf(
            address(this)
        );

        uint256 reportedAmountOut = ICentrySwapAdapter(adapter).swap(
            address(rewardToken),
            debtAsset,
            rewardAmount,
            minDebtAssetOut,
            address(this),
            swapData
        );

        rewardToken.forceApprove(
            adapter,
            0
        );

        uint256 balanceAfter = IERC20(debtAsset).balanceOf(
            address(this)
        );

        if (balanceAfter <= balanceBefore) {
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

        debtRepaid = lendingPool.repayFor(
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
