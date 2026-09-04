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
    )
        external
        payable;
}

/// @title CentryRevenueToCENTUnitFlowAdapter
/// @notice Converts Arc native USDC revenue into CENT through UnitFlow.
///
/// Route:
///
///     Native USDC
///         ↓
///       WUSDC
///         ↓
///        CENT
///
/// This adapter is separate from the existing self-repay UnitFlow adapter.
///
/// Existing adapter:
///     CENT → WUSDC → native USDC
///
/// This adapter:
///     native USDC → WUSDC → CENT
///
/// The adapter only accepts calls from the configured RevenueEngine.
/// It does not accept arbitrary token pairs or arbitrary router commands.
contract CentryRevenueToCENTUnitFlowAdapter
    is Ownable2Step, ReentrancyGuard, ICentrySwapAdapter
{
    using SafeERC20 for IERC20;

    bytes1 private constant CMD_WRAP_NATIVE =
        0x0b;

    bytes1 private constant CMD_V2_SWAP_EXACT_IN =
        0x08;

    /// @notice Arc Testnet native USDC ERC20 interface.
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

    error MinOutputNotMet();

    error SwapFailed();

    error RouterDidNotConsumeInput();

    error InputTransferMismatch();

    event AuthorizedCallerSet(
        address indexed caller
    );

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
    )
        Ownable(initialOwner)
    {
        if (
            unitFlowUniversalRouter_ ==
            address(0)
        ) {
            revert InvalidAddress();
        }

        if (
            centToken_ ==
            address(0)
        ) {
            revert InvalidAddress();
        }

        if (
            wusdcToken_ ==
            address(0)
        ) {
            revert InvalidAddress();
        }

        if (
            initialOwner ==
            address(0)
        ) {
            revert InvalidAddress();
        }

        unitFlowUniversalRouter =
            unitFlowUniversalRouter_;

        centToken =
            centToken_;

        wusdcToken =
            wusdcToken_;
    }

    /// @notice Sets the RevenueEngine as the only caller.
    /// @dev This is intentionally one-time.
    function setAuthorizedCaller(
        address caller
    )
        external
        onlyOwner
    {
        if (
            authorizedCaller !=
            address(0)
        ) {
            revert InvalidCaller();
        }

        if (
            caller ==
            address(0)
        ) {
            revert InvalidCaller();
        }

        authorizedCaller =
            caller;

        emit AuthorizedCallerSet(
            caller
        );
    }

    /// @notice Swap Arc native USDC revenue into CENT.
    ///
    /// tokenIn:
    ///     Arc native USDC ERC20 address
    ///
    /// tokenOut:
    ///     CENT
    ///
    /// data:
    ///     optional ABI-encoded uint256 deadline
    ///
    /// Empty data defaults to five minutes from execution.
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
        returns (
            uint256 amountOut
        )
    {
        _validateSwapRequest(
            tokenIn,
            tokenOut,
            amountIn,
            recipient
        );

        uint256 deadline =
            _decodeDeadline(
                data
            );

        IERC20 inputToken =
            IERC20(
                ARC_NATIVE_USDC
            );

        IERC20 outputToken =
            IERC20(
                centToken
            );

        uint256 inputBefore =
            inputToken.balanceOf(
                address(this)
            );

        uint256 outputBefore =
            outputToken.balanceOf(
                address(this)
            );

        inputToken.safeTransferFrom(
            msg.sender,
            address(this),
            amountIn
        );

        uint256 inputAfter =
            inputToken.balanceOf(
                address(this)
            );

        if (
            inputAfter <
            inputBefore
        ) {
            revert InputTransferMismatch();
        }

        if (
            inputAfter -
            inputBefore !=
            amountIn
        ) {
            revert InputTransferMismatch();
        }

        _executeUnitFlowSwap(
            amountIn,
            minAmountOut,
            deadline
        );

        uint256 outputAfter =
            outputToken.balanceOf(
                address(this)
            );

        if (
            outputAfter <
            outputBefore
        ) {
            revert MinOutputNotMet();
        }

        amountOut =
            outputAfter -
            outputBefore;

        if (
            amountOut <
            minAmountOut
        ) {
            revert MinOutputNotMet();
        }

        outputToken.safeTransfer(
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

    function _validateSwapRequest(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address recipient
    )
        internal
        view
    {
        if (
            msg.sender !=
            authorizedCaller
        ) {
            revert InvalidCaller();
        }

        if (
            authorizedCaller ==
            address(0)
        ) {
            revert InvalidCaller();
        }

        if (
            tokenIn !=
            ARC_NATIVE_USDC
        ) {
            revert InvalidTokenPath();
        }

        if (
            tokenOut !=
            centToken
        ) {
            revert InvalidTokenPath();
        }

        if (
            amountIn == 0
        ) {
            revert InvalidAmount();
        }

        if (
            recipient == address(0)
        ) {
            revert InvalidRecipient();
        }
    }

    function _decodeDeadline(
        bytes calldata data
    )
        internal
        view
        returns (
            uint256 deadline
        )
    {
        if (
            data.length == 0
        ) {
            return
                block.timestamp +
                5 minutes;
        }

        if (
            data.length != 32
        ) {
            revert InvalidDeadline();
        }

        deadline =
            abi.decode(
                data,
                (uint256)
            );

        if (
            deadline <
            block.timestamp
        ) {
            revert InvalidDeadline();
        }
    }

    function _executeUnitFlowSwap(
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    )
        internal
    {
        /*
            UnitFlow command sequence:

                0x0b
                WRAP_NATIVE

                0x08
                V2_SWAP_EXACT_IN
        */
        bytes memory commands =
            abi.encodePacked(
                CMD_WRAP_NATIVE,
                CMD_V2_SWAP_EXACT_IN
            );

        bytes[] memory inputs =
            new bytes[](2);

        /*
            WRAP_NATIVE

            address(2) is the UniversalRouter's internal
            router-recipient sentinel.

            The router receives the native USDC supplied
            through msg.value and wraps it into WUSDC.
        */
        inputs[0] =
            abi.encode(
                address(2),
                amountIn
            );

        address[] memory path =
            new address[](2);

        path[0] =
            wusdcToken;

        path[1] =
            centToken;

        /*
            V2 exact-input swap:

                WUSDC → CENT

            recipient:
                this adapter

            amountIn:
                same 18-decimal native amount

            payerIsUser:
                false

            Therefore the UniversalRouter spends the
            WUSDC it just created during WRAP_NATIVE.
        */
        inputs[1] =
            abi.encode(
                address(this),
                amountIn,
                minAmountOut,
                path,
                false
            );

        uint256 nativeBefore =
            address(this).balance;

        try
            IUnitFlowUniversalRouter(
                unitFlowUniversalRouter
            ).execute{
                value: amountIn
            }(
                commands,
                inputs,
                deadline
            )
        {
            // Expected successful execution.
        }
        catch {
            revert SwapFailed();
        }

        uint256 nativeAfter =
            address(this).balance;

        if (
            nativeAfter >
            nativeBefore
        ) {
            revert RouterDidNotConsumeInput();
        }

        if (
            nativeBefore -
            nativeAfter <
            amountIn
        ) {
            revert RouterDidNotConsumeInput();
        }
    }
}
