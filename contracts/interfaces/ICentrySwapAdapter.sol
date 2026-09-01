// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICentrySwapAdapter {
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        bytes calldata data
    ) external returns (uint256 amountOut);
}
