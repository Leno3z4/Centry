// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/ReentrancyGuard.sol";

interface ICentryVeCENTRevenueRewardsFunding {
    function fund(uint256 amount) external;
}

interface ICentryRevenueToCENTAdapter {
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        bytes calldata data
    ) external returns (uint256 amountOut);
}

/// @title Centry Revenue Engine
/// @notice Treasury-controlled protocol-revenue allocation layer.
///
/// Flow:
///     LendingPool surplus
///         -> immutable LendingPool treasury
///         -> RevenueEngine
///         -> approved allocation
///         -> CENT acquisition
///         -> veCENT RevenueRewards funding
///
/// The engine does not determine individual veCENT entitlements.
/// RevenueRewards remains responsible for funded epoch budgets and proofs.
contract CentryRevenueEngine is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;

    IERC20 public immutable centToken;
    ICentryVeCENTRevenueRewardsFunding public immutable rewardsController;
    address public immutable treasury;

    ICentryRevenueToCENTAdapter public centAcquisitionAdapter;

    mapping(address => bool) public approvedRevenueAsset;
    mapping(address => uint256) public rewardAllocationBps;
    mapping(address => uint256) public reservedForCENT;

    mapping(address => uint256) public totalRevenueReceived;
    mapping(address => uint256) public totalRevenueAllocated;
    mapping(address => uint256) public totalRevenueToTreasury;

    uint256 public totalCENTAcquired;
    uint256 public totalCENTFunded;

    error InvalidAddress();
    error InvalidBps();
    error InvalidAmount();
    error UnsupportedRevenueAsset();
    error InsufficientReservedRevenue();
    error AdapterNotSet();
    error SwapFailed();
    error SwapOutputInvalid();
    error MinOutputNotMet();

    event RevenueAssetSupportUpdated(
        address indexed asset,
        bool supported
    );

    event RewardAllocationUpdated(
        address indexed asset,
        uint256 rewardAllocationBps
    );

    event RevenuePulled(
        address indexed asset,
        address indexed source,
        uint256 amount
    );

    event RevenueAllocated(
        address indexed asset,
        uint256 totalAmount,
        uint256 amountForCENT,
        uint256 amountToTreasury
    );

    event CENTAcquisitionAdapterSet(
        address indexed adapter
    );

    event CENTAcquired(
        address indexed asset,
        uint256 amountIn,
        uint256 amountOut
    );

    event RewardsFunded(
        uint256 amount
    );

    constructor(
        address centToken_,
        address rewardsController_,
        address treasury_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (
            centToken_ == address(0) ||
            rewardsController_ == address(0) ||
            treasury_ == address(0) ||
            initialOwner == address(0)
        ) {
            revert InvalidAddress();
        }

        centToken = IERC20(centToken_);
        rewardsController =
            ICentryVeCENTRevenueRewardsFunding(rewardsController_);
        treasury = treasury_;
    }

    function setRevenueAssetSupported(
        address asset,
        bool supported
    ) external onlyOwner {
        if (asset == address(0)) {
            revert InvalidAddress();
        }

        approvedRevenueAsset[asset] = supported;

        emit RevenueAssetSupportUpdated(
            asset,
            supported
        );
    }

    function setRewardAllocationBps(
        address asset,
        uint256 allocationBps
    ) external onlyOwner {
        if (
            asset == address(0) ||
            allocationBps > BPS
        ) {
            revert InvalidBps();
        }

        rewardAllocationBps[asset] = allocationBps;

        emit RewardAllocationUpdated(
            asset,
            allocationBps
        );
    }

    function setCENTAcquisitionAdapter(
        address adapter
    ) external onlyOwner {
        if (adapter == address(0)) {
            revert InvalidAddress();
        }

        centAcquisitionAdapter =
            ICentryRevenueToCENTAdapter(adapter);

        emit CENTAcquisitionAdapterSet(
            adapter
        );
    }

    /// @notice Pull realized revenue from the configured treasury.
    /// @dev The treasury must approve this engine for the ERC-20.
    function pullRevenue(
        address asset,
        uint256 amount
    ) external onlyOwner nonReentrant {
        if (
            asset == address(0) ||
            amount == 0
        ) {
            revert InvalidAmount();
        }

        if (!approvedRevenueAsset[asset]) {
            revert UnsupportedRevenueAsset();
        }

        IERC20(asset).safeTransferFrom(
            treasury,
            address(this),
            amount
        );

        totalRevenueReceived[asset] += amount;

        emit RevenuePulled(
            asset,
            treasury,
            amount
        );
    }

    /// @notice Reserve the reward portion for CENT acquisition and
    ///         return the retained portion to treasury.
    function allocateRevenue(
        address asset,
        uint256 amount
    ) external onlyOwner nonReentrant {
        if (
            asset == address(0) ||
            amount == 0
        ) {
            revert InvalidAmount();
        }

        if (!approvedRevenueAsset[asset]) {
            revert UnsupportedRevenueAsset();
        }

        if (
            IERC20(asset).balanceOf(address(this)) < amount
        ) {
            revert InvalidAmount();
        }

        uint256 amountForCENT = (
            amount * rewardAllocationBps[asset]
        ) / BPS;

        uint256 amountToTreasury =
            amount - amountForCENT;

        if (amountForCENT > 0) {
            reservedForCENT[asset] += amountForCENT;
        }

        if (amountToTreasury > 0) {
            IERC20(asset).safeTransfer(
                treasury,
                amountToTreasury
            );

            totalRevenueToTreasury[asset] +=
                amountToTreasury;
        }

        totalRevenueAllocated[asset] += amount;

        emit RevenueAllocated(
            asset,
            amount,
            amountForCENT,
            amountToTreasury
        );
    }

    /// @notice Swap an allocated revenue asset into CENT.
    /// @dev The adapter must itself be restricted to this engine.
    function acquireCENT(
        address asset,
        uint256 amountIn,
        uint256 minCENTOut,
        bytes calldata data
    ) external onlyOwner nonReentrant returns (
        uint256 amountOut
    ) {
        if (
            asset == address(0) ||
            amountIn == 0 ||
            asset == address(centToken)
        ) {
            revert InvalidAmount();
        }

        if (!approvedRevenueAsset[asset]) {
            revert UnsupportedRevenueAsset();
        }

        if (
            amountIn >
            reservedForCENT[asset]
        ) {
            revert InsufficientReservedRevenue();
        }

        if (
            address(centAcquisitionAdapter) ==
            address(0)
        ) {
            revert AdapterNotSet();
        }

        IERC20 inputToken = IERC20(asset);

        uint256 centBefore =
            centToken.balanceOf(address(this));

        inputToken.forceApprove(
            address(centAcquisitionAdapter),
            amountIn
        );

        try centAcquisitionAdapter.swap(
            asset,
            address(centToken),
            amountIn,
            minCENTOut,
            address(this),
            data
        ) returns (
            uint256 reportedAmountOut
        ) {
            inputToken.forceApprove(
                address(centAcquisitionAdapter),
                0
            );

            uint256 centAfter =
                centToken.balanceOf(address(this));

            if (centAfter < centBefore) {
                revert SwapOutputInvalid();
            }

            amountOut = centAfter - centBefore;

            if (
                amountOut < minCENTOut ||
                reportedAmountOut < minCENTOut
            ) {
                revert MinOutputNotMet();
            }
        } catch {
            inputToken.forceApprove(
                address(centAcquisitionAdapter),
                0
            );

            revert SwapFailed();
        }

        reservedForCENT[asset] -= amountIn;
        totalCENTAcquired += amountOut;

        emit CENTAcquired(
            asset,
            amountIn,
            amountOut
        );
    }

    /// @notice Fund veCENT rewards with CENT that was received as revenue.
    function fundRewardsWithCENT(
        uint256 amount
    ) external onlyOwner nonReentrant {
        if (amount == 0) {
            revert InvalidAmount();
        }

        if (
            amount >
            reservedForCENT[address(centToken)]
        ) {
            revert InsufficientReservedRevenue();
        }

        centToken.forceApprove(
            address(rewardsController),
            amount
        );

        rewardsController.fund(
            amount
        );

        centToken.forceApprove(
            address(rewardsController),
            0
        );

        reservedForCENT[address(centToken)] -= amount;
        totalCENTFunded += amount;

        emit RewardsFunded(amount);
    }

    /// @notice Fund veCENT rewards using CENT acquired from another
    ///         approved revenue asset.
    function fundAcquiredCENT(
        uint256 amount
    ) external onlyOwner nonReentrant {
        if (amount == 0) {
            revert InvalidAmount();
        }

        if (
            centToken.balanceOf(address(this)) < amount
        ) {
            revert InvalidAmount();
        }

        centToken.forceApprove(
            address(rewardsController),
            amount
        );

        rewardsController.fund(
            amount
        );

        centToken.forceApprove(
            address(rewardsController),
            0
        );

        totalCENTFunded += amount;

        emit RewardsFunded(amount);
    }
}
