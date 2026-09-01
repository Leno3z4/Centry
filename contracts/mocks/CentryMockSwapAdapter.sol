// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/ICentrySwapAdapter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title CentryMockSwapAdapter
 * @notice Test-only swap adapter for validating the self-repay executor.
 *
 * This contract does not perform a market swap.
 * The owner funds it with the desired output token and configures a fixed
 * exchange rate for each token pair. A swap then transfers the calculated
 * output token amount to the executor's requested recipient.
 *
 * It is intended for Arc Testnet integration testing only and must not be
 * used as a production exchange adapter.
 */
contract CentryMockSwapAdapter is
    ICentrySwapAdapter,
    Ownable2Step
{
    using SafeERC20 for IERC20;

    uint256 public constant WAD = 1e18;

    mapping(address => mapping(address => uint256))
        public rateWad;

    error InvalidAddress();
    error InvalidRate();
    error AmountZero();
    error UnsupportedPair();
    error InsufficientOutputLiquidity();
    error InsufficientInputAllowance();

    event RateSet(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 rateWad
    );

    event LiquidityFunded(
        address indexed token,
        address indexed from,
        uint256 amount
    );

    event MockSwapExecuted(
        address indexed caller,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address recipient
    );

    constructor(
        address initialOwner
    ) Ownable(initialOwner) {
        if (initialOwner == address(0)) {
            revert InvalidAddress();
        }
    }

    function setRate(
        address tokenIn,
        address tokenOut,
        uint256 rateWad_
    ) external onlyOwner {
        if (
            tokenIn == address(0) ||
            tokenOut == address(0)
        ) {
            revert InvalidAddress();
        }

        if (rateWad_ == 0) {
            revert InvalidRate();
        }

        rateWad[tokenIn][tokenOut] = rateWad_;

        emit RateSet(
            tokenIn,
            tokenOut,
            rateWad_
        );
    }

    function fund(
        address token,
        uint256 amount
    ) external {
        if (token == address(0)) {
            revert InvalidAddress();
        }

        if (amount == 0) {
            revert AmountZero();
        }

        IERC20(token).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        emit LiquidityFunded(
            token,
            msg.sender,
            amount
        );
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        bytes calldata
    ) external override returns (uint256 amountOut) {
        if (
            tokenIn == address(0) ||
            tokenOut == address(0) ||
            recipient == address(0)
        ) {
            revert InvalidAddress();
        }

        if (amountIn == 0) {
            revert AmountZero();
        }

        uint256 rate = rateWad[tokenIn][tokenOut];

        if (rate == 0) {
            revert UnsupportedPair();
        }

        amountOut = (
            amountIn * rate
        ) / WAD;

        if (amountOut < minAmountOut) {
            revert InsufficientOutputLiquidity();
        }

        if (
            IERC20(tokenOut).balanceOf(address(this)) < amountOut
        ) {
            revert InsufficientOutputLiquidity();
        }

        uint256 allowance = IERC20(tokenIn).allowance(
            msg.sender,
            address(this)
        );

        if (allowance < amountIn) {
            revert InsufficientInputAllowance();
        }

        IERC20(tokenIn).safeTransferFrom(
            msg.sender,
            address(this),
            amountIn
        );

        IERC20(tokenOut).safeTransfer(
            recipient,
            amountOut
        );

        emit MockSwapExecuted(
            msg.sender,
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            recipient
        );
    }
}
