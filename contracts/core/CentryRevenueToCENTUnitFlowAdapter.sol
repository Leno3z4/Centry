// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/ReentrancyGuard.sol";

import "../interfaces/ICentrySwapAdapter.sol";

interface IUnitFlowUniversalRouter {
    function execute(
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 deadline
    ) external payable;
}

/// @title CentryRevenueToCENTUnitFlowAdapter
/// @notice Converts Arc native USDC revenue into CENT through UnitFlow.
///
/// RevenueEngine accounting uses Arc's ERC-20 USDC interface.
/// Arc native USDC is 18-decimal for msg.value, so this adapter converts:
///
///     ERC-20 USDC amount * 1e12 = native USDC amount
///
/// UnitFlow route:
///
///     native USDC -> WUSDC (0x0b) -> CENT (0x08 V2.5)
///
/// The existing CentryUnitFlowSwapAdapter handles the reverse direction.
contract CentryRevenueToCENTUnitFlowAdapter is
    Ownable2Step,
    ReentrancyGuard,
    ICentrySwapAdapter
{
    using SafeERC20 for IERC20;

    bytes1 private constant CMD_WRAP_NATIVE = 0x0b;
    bytes1 private constant CMD_V2_SWAP_EXACT_IN = 0x08;

    uint256 private constant ERC20_TO_NATIVE_SCALE = 1e12;

    address public constant ARC_NATIVE_USDC =
        0x3600000000000000000000000000000000000000;

    address public immutable unitFlowUniversalRouter;
    address public immutable centToken;
    address public immutable wusdcToken;

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
    error NativeBalanceMismatch();

    event AuthorizedCallerSet(address indexed caller);

    event UnitFlowRevenueSwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address indexed recipient
    );

    constructor(
        address unitFlowUniversalRouter_,
        address centToken_,
        address wusdcToken_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (
            unitFlowUniversalRouter_ == address(0) ||
            centToken_ == address(0) ||
            wusdcToken_ == address(0) ||
            initialOwner == address(0)
        ) {
            revert InvalidAddress();
        }

        unitFlowUniversalRouter = unitFlowUniversalRouter_;
        centToken = centToken_;
        wusdcToken = wusdcToken_;
    }

    /// @notice Sets the RevenueEngine as the sole caller.
    /// @dev Intentionally one-time.
    function setAuthorizedCaller(address caller) external onlyOwner {
        if (
            authorizedCaller != address(0) ||
            caller == address(0)
        ) {
            revert InvalidCaller();
        }

        authorizedCaller = caller;
        emit AuthorizedCallerSet(caller);
    }

    /// @notice Converts allocated Arc USDC revenue into CENT.
    /// @dev data is abi.encode(uint256 deadline, address[] path).
    ///      Empty data uses the direct WUSDC -> CENT route.
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
        _validateRequest(
            tokenIn,
            tokenOut,
            amountIn,
            recipient
        );

        (
            uint256 deadline,
            address[] memory path
        ) = _decodeSwapData(data);

        if (deadline < block.timestamp) {
            revert InvalidDeadline();
        }

        _validatePath(path);

        uint256 nativeAmount = _toNativeAmount(amountIn);

        uint256 outputBefore = _pullAndVerifyInput(
            amountIn,
            nativeAmount
        );

        _executeUnitFlowSwap(
            nativeAmount,
            minAmountOut,
            path,
            deadline
        );

        uint256 outputAfter = IERC20(centToken).balanceOf(
            address(this)
        );

        if (outputAfter < outputBefore) {
            revert MinOutputNotMet();
        }

        amountOut = outputAfter - outputBefore;

        if (amountOut < minAmountOut) {
            revert MinOutputNotMet();
        }

        IERC20(centToken).safeTransfer(
            recipient,
            amountOut
        );

        emit UnitFlowRevenueSwapExecuted(
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            recipient
        );
    }

    function _toNativeAmount(
        uint256 amountIn
    )
        internal
        pure
        returns (uint256 nativeAmount)
    {
        nativeAmount = amountIn * ERC20_TO_NATIVE_SCALE;

        if (
            nativeAmount / ERC20_TO_NATIVE_SCALE !=
            amountIn
        ) {
            revert InvalidAmount();
        }
    }

    function _pullAndVerifyInput(
        uint256 amountIn,
        uint256 nativeAmount
    )
        internal
        returns (uint256 outputBefore)
    {
        IERC20 inputToken = IERC20(ARC_NATIVE_USDC);

        uint256 inputBefore = inputToken.balanceOf(
            address(this)
        );

        uint256 nativeBefore = address(this).balance;

        inputToken.safeTransferFrom(
            msg.sender,
            address(this),
            amountIn
        );

        _verifyInputReceived(
            inputToken,
            inputBefore,
            nativeBefore,
            amountIn,
            nativeAmount
        );

        outputBefore = IERC20(centToken).balanceOf(
            address(this)
        );
    }

    function _validateRequest(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address recipient
    ) internal view {
        if (msg.sender != authorizedCaller) {
            revert InvalidCaller();
        }

        if (authorizedCaller == address(0)) {
            revert InvalidCaller();
        }

        if (tokenIn != ARC_NATIVE_USDC) {
            revert InvalidTokenPath();
        }

        if (tokenOut != centToken) {
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
    )
        internal
        view
        returns (
            uint256 deadline,
            address[] memory path
        )
    {
        if (data.length == 0) {
            deadline = block.timestamp + 5 minutes;
            path = new address[](2);
            path[0] = wusdcToken;
            path[1] = centToken;
            return (deadline, path);
        }

        try this._decodeExternal(data) returns (
            uint256 decodedDeadline,
            address[] memory decodedPath
        ) {
            deadline = decodedDeadline;
            path = decodedPath;
        } catch {
            revert InvalidSwapData();
        }
    }

    function _decodeExternal(
        bytes calldata data
    )
        external
        view
        returns (
            uint256 deadline,
            address[] memory path
        )
    {
        if (msg.sender != address(this)) {
            revert InvalidCaller();
        }

        (deadline, path) = abi.decode(
            data,
            (uint256, address[])
        );
    }

    function _validatePath(address[] memory path) internal view {
        if (path.length < 2 || path.length > 4) {
            revert InvalidTokenPath();
        }

        if (path[0] != wusdcToken) {
            revert InvalidTokenPath();
        }

        if (path[path.length - 1] != centToken) {
            revert InvalidTokenPath();
        }

        for (uint256 i = 0; i < path.length; i++) {
            if (path[i] == address(0)) {
                revert InvalidTokenPath();
            }
        }
    }

    function _verifyInputReceived(
        IERC20 inputToken,
        uint256 inputBefore,
        uint256 nativeBefore,
        uint256 amountIn,
        uint256 nativeAmount
    ) internal view {
        uint256 inputAfter = inputToken.balanceOf(
            address(this)
        );

        if (
            inputAfter < inputBefore ||
            inputAfter - inputBefore != amountIn
        ) {
            revert InputTransferMismatch();
        }

        uint256 nativeAfter = address(this).balance;

        if (
            nativeAfter < nativeBefore ||
            nativeAfter - nativeBefore != nativeAmount
        ) {
            revert NativeBalanceMismatch();
        }
    }

    function _executeUnitFlowSwap(
        uint256 nativeAmount,
        uint256 minAmountOut,
        address[] memory path,
        uint256 deadline
    ) internal {
        bytes memory commands = abi.encodePacked(
            CMD_WRAP_NATIVE,
            CMD_V2_SWAP_EXACT_IN
        );

        bytes[] memory inputs = new bytes[](2);

        // WRAP_NATIVE: move msg.value into the router's WUSDC balance.
        inputs[0] = abi.encode(
            address(2),
            nativeAmount
        );

        // V2_SWAP_EXACT_IN: payerIsUser=false means the router uses
        // the WUSDC it just wrapped from its own balance.
        inputs[1] = abi.encode(
            address(this),
            nativeAmount,
            minAmountOut,
            path,
            false
        );

        try IUnitFlowUniversalRouter(
            unitFlowUniversalRouter
        ).execute{value: nativeAmount}(
            commands,
            inputs,
            deadline
        ) {
            // Expected successful execution.
        } catch {
            revert SwapFailed();
        }
    }
}
