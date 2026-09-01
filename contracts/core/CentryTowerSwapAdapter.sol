// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/ReentrancyGuard.sol";

import "../interfaces/ICentrySwapAdapter.sol";

/// @title Centry Tower Swap Adapter
/// @notice Executes pre-built Tower token-swap calldata from the self-repay
///         executor and returns the measured output to the requested recipient.
/// @dev The Tower target is immutable. The authorized caller is set once after
///      deployment to the Centry self-repay executor. No arbitrary target can be
///      supplied by a keeper.
contract CentryTowerSwapAdapter is Ownable2Step, ReentrancyGuard, ICentrySwapAdapter {
    using SafeERC20 for IERC20;

    struct SwapParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        address recipient;
        bytes data;
    }

    address public immutable towerSwapExecutor;
    address public authorizedCaller;

    error InvalidAddress();
    error CallerAlreadySet();
    error UnauthorizedCaller();
    error InvalidRecipient();
    error InvalidAmount();
    error InvalidOutput();
    error MinOutputNotMet();
    error SwapFailed();

    event AuthorizedCallerSet(address indexed caller);
    event TowerSwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address indexed recipient
    );

    constructor(
        address towerSwapExecutor_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (
            towerSwapExecutor_ == address(0) ||
            initialOwner == address(0)
        ) {
            revert InvalidAddress();
        }

        towerSwapExecutor = towerSwapExecutor_;
    }

    function setAuthorizedCaller(
        address caller
    ) external onlyOwner {
        if (authorizedCaller != address(0)) {
            revert CallerAlreadySet();
        }

        if (caller == address(0)) {
            revert InvalidAddress();
        }

        authorizedCaller = caller;

        emit AuthorizedCallerSet(caller);
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        bytes calldata data
    ) external nonReentrant returns (uint256 amountOut) {
        if (msg.sender != authorizedCaller) {
            revert UnauthorizedCaller();
        }

        if (
            tokenIn == address(0) ||
            tokenOut == address(0) ||
            recipient == address(0)
        ) {
            revert InvalidAddress();
        }

        if (tokenIn == tokenOut) {
            revert InvalidOutput();
        }

        if (amountIn == 0) {
            revert InvalidAmount();
        }

        SwapParams memory params = SwapParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            minAmountOut: minAmountOut,
            recipient: recipient,
            data: data
        });

        amountOut = _executeSwap(params);
    }

    function _executeSwap(
        SwapParams memory params
    ) internal returns (uint256 amountOut) {
        IERC20 input = IERC20(params.tokenIn);
        IERC20 output = IERC20(params.tokenOut);

        uint256 inputBalanceBefore = input.balanceOf(address(this));
        uint256 outputBalanceBefore = output.balanceOf(address(this));

        if (inputBalanceBefore < params.amountIn) {
            revert InvalidAmount();
        }

        input.forceApprove(
            towerSwapExecutor,
            params.amountIn
        );

        (bool success, ) = towerSwapExecutor.call(params.data);

        input.forceApprove(
            towerSwapExecutor,
            0
        );

        if (!success) {
            revert SwapFailed();
        }

        uint256 inputBalanceAfter = input.balanceOf(address(this));
        uint256 outputBalanceAfter = output.balanceOf(address(this));

        if (inputBalanceAfter > inputBalanceBefore) {
            revert InvalidOutput();
        }

        amountOut = outputBalanceAfter - outputBalanceBefore;

        if (amountOut < params.minAmountOut) {
            revert MinOutputNotMet();
        }

        output.safeTransfer(
            params.recipient,
            amountOut
        );

        _emitSwapExecuted(params, amountOut);
    }

    function _emitSwapExecuted(
        SwapParams memory params,
        uint256 amountOut
    ) internal {
        emit TowerSwapExecuted(
            params.tokenIn,
            params.tokenOut,
            params.amountIn,
            amountOut,
            params.recipient
        );
    }
}
