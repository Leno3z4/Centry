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

        if (!supportedDebtAsset[debtAsset]) {
            revert UnsupportedDebtAsset();
        }

        address adapter = swapAdapter;

        if (adapter == address(0)) {
            revert InvalidAdapter();
        }

        rewardAmount = rewardsController.claimForSelfRepay(
            tokenId
        );

        if (rewardAmount == 0) {
            revert AmountZero();
        }

        rewardToken.forceApprove(
            adapter,
            rewardAmount
        );

        uint256 debtAssetBalanceBefore = IERC20(debtAsset)
            .balanceOf(address(this));

        uint256 reportedAmountOut = ICentrySwapAdapter(adapter)
            .swap(
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

        uint256 debtAssetBalanceAfter = IERC20(debtAsset)
            .balanceOf(address(this));

        if (debtAssetBalanceAfter <= debtAssetBalanceBefore) {
            revert SwapOutputInvalid();
        }

        debtAssetReceived = (
            debtAssetBalanceAfter -
            debtAssetBalanceBefore
        );

        if (
            debtAssetReceived < minDebtAssetOut ||
            reportedAmountOut < minDebtAssetOut
        ) {
            revert MinOutputNotMet();
        }

        uint256 currentDebt = lendingPool.borrowBalance(
            borrower,
            debtAsset
        );

        if (currentDebt == 0) {
            IERC20(debtAsset).safeTransfer(
                borrower,
                debtAssetReceived
            );

            emit SelfRepayExecuted(
                tokenId,
                borrower,
                debtAsset,
                rewardAmount,
                debtAssetReceived,
                0,
                debtAssetReceived
            );

            return (
                rewardAmount,
                debtAssetReceived,
                0,
                debtAssetReceived
            );
        }

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

        leftover = debtAssetReceived - debtRepaid;

        if (leftover > 0) {
            IERC20(debtAsset).safeTransfer(
                borrower,
                leftover
            );
        }

        emit SelfRepayExecuted(
            tokenId,
            borrower,
            debtAsset,
            rewardAmount,
            debtAssetReceived,
            debtRepaid,
            leftover
        );
    }
}
