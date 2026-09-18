// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/ReentrancyGuard.sol";

import "../interfaces/ICentrySwapAdapter.sol";

interface IUnitFlowV3Router {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInput(
        ExactInputParams calldata params
    ) external payable returns (uint256 amountOut);
}

/// @title Centry Revenue To CENT UnitFlow V3 Adapter
/// @notice Converts Arc native USDC ERC-20 revenue into CENT through UnitFlow V3.
/// @dev Uses the live UnitFlow V3 router interface directly. Arc's native USDC
///      ERC-20 interface is 18 decimals for the native balance but token amounts
///      passed through this contract remain in the ERC-20 token's own units.
///      No WUSDC wrapping is performed because UnitFlow V3 swaps ERC-20 token
///      addresses directly.
///
///      swapData:
///        abi.encode(uint256 deadline, uint24 fee) for a direct pool, or
///        abi.encode(uint256 deadline, bytes v3Path) for a multi-hop V3 path.
///
///      A V3 path is tokenIn (20 bytes) + fee (3 bytes) + tokenOut (20 bytes),
///      optionally repeated for additional hops. The adapter validates that the
///      path starts with native USDC and ends with CENT; callers never provide
///      arbitrary router calldata.
contract CentryRevenueToCENTUnitFlowAdapter is
    Ownable2Step,
    ReentrancyGuard,
    ICentrySwapAdapter
{
    using SafeERC20 for IERC20;

    address public constant ARC_NATIVE_USDC =
        0x3600000000000000000000000000000000000000;

    address public immutable unitFlowRouter;
    address public immutable centToken;

    address public authorizedCaller;

    error InvalidAddress();
    error InvalidCaller();
    error InvalidAmount();
    error InvalidTokenPath();
    error InvalidRecipient();
    error InvalidDeadline();
    error InvalidSwapData();
    error MinOutputNotMet();
    error SwapFailed();
    error InputTransferMismatch();

    event AuthorizedCallerSet(address indexed caller);

    event UnitFlowRevenueSwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 deadline,
        address indexed recipient
    );

    constructor(
        address unitFlowRouter_,
        address centToken_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (
            unitFlowRouter_ == address(0) ||
            centToken_ == address(0) ||
            initialOwner == address(0)
        ) {
            revert InvalidAddress();
        }

        unitFlowRouter = unitFlowRouter_;
        centToken = centToken_;
    }

    /// @notice Sets the RevenueEngine as the sole caller.
    /// @dev Intentionally one-time.
    function setAuthorizedCaller(address caller) external onlyOwner {
        if (authorizedCaller != address(0) || caller == address(0)) {
            revert InvalidCaller();
        }

        authorizedCaller = caller;
        emit AuthorizedCallerSet(caller);
    }

    /// @notice Converts allocated Arc USDC revenue into CENT.
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        bytes calldata data
    )
        external
        override
        nonReentrant
        returns (uint256 amountOut)
    {
        _validateRequest(tokenIn, tokenOut, amountIn, recipient);

        (uint256 deadline, bytes memory path) = _decodeSwapData(data);

        if (deadline <= block.timestamp) {
            revert InvalidDeadline();
        }

        _validatePath(path);

        uint256 outputBefore = _pullInput(amountIn);

        amountOut = _executeSwap(
            amountIn,
            minAmountOut,
            path,
            deadline,
            outputBefore
        );

        IERC20(centToken).safeTransfer(recipient, amountOut);

        emit UnitFlowRevenueSwapExecuted(
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            deadline,
            recipient
        );
    }

    function rescueERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        if (token == address(0) || to == address(0)) {
            revert InvalidAddress();
        }

        if (token == centToken) {
            revert InvalidTokenPath();
        }

        IERC20(token).safeTransfer(to, amount);
    }

    function _pullInput(
        uint256 amountIn
    ) internal returns (uint256 outputBefore) {
        IERC20 inputToken = IERC20(ARC_NATIVE_USDC);
        uint256 inputBefore = inputToken.balanceOf(address(this));

        inputToken.safeTransferFrom(msg.sender, address(this), amountIn);

        uint256 inputAfter = inputToken.balanceOf(address(this));

        if (inputAfter < inputBefore || inputAfter - inputBefore != amountIn) {
            revert InputTransferMismatch();
        }

        outputBefore = IERC20(centToken).balanceOf(address(this));
    }

    function _executeSwap(
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory path,
        uint256 deadline,
        uint256 outputBefore
    ) internal returns (uint256 amountOut) {
        IERC20 inputToken = IERC20(ARC_NATIVE_USDC);
        inputToken.forceApprove(unitFlowRouter, amountIn);

        try IUnitFlowV3Router(unitFlowRouter).exactInput(
            IUnitFlowV3Router.ExactInputParams({
                path: path,
                recipient: address(this),
                deadline: deadline,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut
            })
        ) returns (uint256 reportedAmountOut) {
            inputToken.forceApprove(unitFlowRouter, 0);

            uint256 outputAfter = IERC20(centToken).balanceOf(address(this));

            if (outputAfter < outputBefore) {
                revert MinOutputNotMet();
            }

            amountOut = outputAfter - outputBefore;

            if (amountOut < minAmountOut || reportedAmountOut < minAmountOut) {
                revert MinOutputNotMet();
            }
        } catch {
            inputToken.forceApprove(unitFlowRouter, 0);
            revert SwapFailed();
        }
    }

    function _validateRequest(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address recipient
    ) internal view {
        if (msg.sender != authorizedCaller || authorizedCaller == address(0)) {
            revert InvalidCaller();
        }

        if (tokenIn != ARC_NATIVE_USDC || tokenOut != centToken) {
            revert InvalidTokenPath();
        }

        if (amountIn == 0) {
            revert InvalidAmount();
        }

        if (recipient == address(0)) {
            revert InvalidRecipient();
        }
    }

    function _decodeSwapData(
        bytes calldata data
    ) internal view returns (uint256 deadline, bytes memory path) {
        if (data.length == 64) {
            uint24 fee;

            try this._decodeDirect(data) returns (
                uint256 decodedDeadline,
                uint24 decodedFee
            ) {
                deadline = decodedDeadline;
                fee = decodedFee;
            } catch {
                revert InvalidSwapData();
            }

            path = abi.encodePacked(
                ARC_NATIVE_USDC,
                fee,
                centToken
            );

            return (deadline, path);
        }

        try this._decodePath(data) returns (
            uint256 decodedDeadline,
            bytes memory decodedPath
        ) {
            deadline = decodedDeadline;
            path = decodedPath;
        } catch {
            revert InvalidSwapData();
        }
    }

    function _decodeDirect(
        bytes calldata data
    ) external
    view
    returns (
        uint256 deadline,
        uint24 fee
    ) {
        if (msg.sender != address(this)) {
            revert InvalidCaller();
        }

        (deadline, fee) = abi.decode(
            data,
            (uint256, uint24)
        );
    }

    function _decodePath(
        bytes calldata data
    ) external
    view
    returns (
        uint256 deadline,
        bytes memory path
    ) {
        if (msg.sender != address(this)) {
            revert InvalidCaller();
        }

        (deadline, path) = abi.decode(
            data,
            (uint256, bytes)
        );
    }

    function _validatePath(bytes memory path) internal view {
        uint256 length = path.length;

        if (length < 43 || (length - 43) % 23 != 0) {
            revert InvalidTokenPath();
        }

        address firstToken;
        address lastToken;
        address tokenAtOffset;

        assembly {
            firstToken := shr(96, mload(add(path, 32)))
            lastToken := shr(96, mload(add(add(path, 32), sub(length, 20))))
        }

        if (firstToken != ARC_NATIVE_USDC || lastToken != centToken) {
            revert InvalidTokenPath();
        }

        for (uint256 offset = 0; offset < length; offset += 23) {
            assembly {
                tokenAtOffset := shr(96, mload(add(add(path, 32), offset)))
            }

            if (tokenAtOffset == address(0)) {
                revert InvalidTokenPath();
            }
        }
    }
}
