// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/ReentrancyGuard.sol";

import "../interfaces/ICentrySwapAdapter.sol";

interface IUnitFlowSwapRouter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256 amountOut);
}

/// @title Centry UnitFlow Swap Adapter
/// @notice Restricted UnitFlow adapter for CENT reward -> debt-asset swaps.
/// @dev This adapter intentionally exposes only UnitFlow's token-swap router.
///      The self-repay executor remains responsible for reward accounting and
///      LendingPool repayment accounting. The adapter measures the actual token
///      output and only supports configured paths rooted at CENT.
contract CentryUnitFlowSwapAdapter is
    Ownable2Step,
    ReentrancyGuard,
    ICentrySwapAdapter
{
    using SafeERC20 for IERC20;

    address public immutable unitFlowSwapRouter;
    address public immutable centToken;

    mapping(address => bool) public supportedOutput;

    error InvalidAddress();
    error InvalidCaller();
    error InvalidAmount();
    error InvalidPath();
    error InvalidRecipient();
    error MinOutputNotMet();
    error SwapFailed();
    error UnsupportedOutput();
    error RouterDidNotConsumeInput();

    address public authorizedCaller;

    event AuthorizedCallerSet(address indexed caller);

    event OutputSupportUpdated(
        address indexed token,
        bool supported
    );

    event UnitFlowSwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address indexed recipient
    );

    constructor(
        address unitFlowSwapRouter_,
        address centToken_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (
            unitFlowSwapRouter_ == address(0) ||
            centToken_ == address(0) ||
            initialOwner == address(0)
        ) {
            revert InvalidAddress();
        }

        unitFlowSwapRouter = unitFlowSwapRouter_;
        centToken = centToken_;
    }

    function setAuthorizedCaller(
        address caller
    ) external onlyOwner {
        if (authorizedCaller != address(0)) {
            revert InvalidCaller();
        }

        if (caller == address(0)) {
            revert InvalidCaller();
        }

        authorizedCaller = caller;

        emit AuthorizedCallerSet(caller);
    }

    function setOutputSupported(
        address token,
        bool supported
    ) external onlyOwner {
        if (token == address(0)) {
            revert InvalidAddress();
        }

        supportedOutput[token] = supported;

        emit OutputSupportUpdated(
            token,
            supported
        );
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
            revert InvalidCaller();
        }

        if (
            tokenIn == address(0) ||
            tokenOut == address(0)
        ) {
            revert InvalidAddress();
        }

        if (recipient == address(0)) {
            revert InvalidRecipient();
        }

        if (amountIn == 0) {
            revert InvalidAmount();
        }

        if (tokenIn != centToken) {
            revert InvalidPath();
        }

        if (!supportedOutput[tokenOut]) {
            revert UnsupportedOutput();
        }

        (
            uint256 deadline,
            address[] memory path
        ) = abi.decode(
            data,
            (uint256, address[])
        );

        if (
            path.length < 2 ||
            path[0] != centToken ||
            path[path.length - 1] != tokenOut
        ) {
            revert InvalidPath();
        }

        IERC20 input = IERC20(tokenIn);
        IERC20 output = IERC20(tokenOut);

        uint256 inputBefore = input.balanceOf(address(this));
        uint256 outputBefore = output.balanceOf(address(this));

        if (inputBefore < amountIn) {
            revert InvalidAmount();
        }

        input.forceApprove(
            unitFlowSwapRouter,
            amountIn
        );

        uint256 reportedAmountOut;

        try IUnitFlowSwapRouter(unitFlowSwapRouter).swapExactTokensForTokens(
            amountIn,
            minAmountOut,
            path,
            address(this),
            deadline
        ) returns (uint256 amountOutReported) {
            reportedAmountOut = amountOutReported;
        } catch {
            input.forceApprove(
                unitFlowSwapRouter,
                0
            );

            revert SwapFailed();
        }

        input.forceApprove(
            unitFlowSwapRouter,
            0
        );

        uint256 inputAfter = input.balanceOf(address(this));
        uint256 outputAfter = output.balanceOf(address(this));

        if (inputAfter > inputBefore) {
            revert RouterDidNotConsumeInput();
        }

        amountOut = outputAfter - outputBefore;

        if (
            amountOut < minAmountOut ||
            reportedAmountOut < minAmountOut
        ) {
            revert MinOutputNotMet();
        }

        output.safeTransfer(
            recipient,
            amountOut
        );

        emit UnitFlowSwapExecuted(
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            recipient
        );
    }
}
