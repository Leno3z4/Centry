// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/ReentrancyGuard.sol";

/// @notice Minimal UnitFlow UniversalRouter interface used by Centry.
interface IUnitFlowUniversalRouterRevenue {
    function execute(
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 deadline
    ) external payable;
}

/// @title CentryRevenueToCENTUnitFlowAdapter
/// @notice Restricted UnitFlow adapter for protocol-revenue asset -> CENT swaps.
/// @dev Designed for Arc Testnet native USDC -> WUSDC -> CENT.
///
///      The route is intentionally fixed:
///          native USDC -> WUSDC -> CENT
///
///      Callers cannot provide arbitrary router calldata, commands, or paths.
///      Only the configured RevenueEngine may invoke the swap.
contract CentryRevenueToCENTUnitFlowAdapter is
    Ownable2Step,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    bytes1 private constant CMD_V2_SWAP_EXACT_IN = 0x08;
    bytes1 private constant CMD_WRAP_NATIVE_USDC = 0x0b;

    address public constant ARC_NATIVE_USDC =
        0x3600000000000000000000000000000000000000;

    address public immutable unitFlowUniversalRouter;
    address public immutable centToken;
    address public immutable wusdcToken;

    address public authorizedCaller;

    error InvalidAddress();
    error InvalidCaller();
    error InvalidAmount();
    error InvalidRecipient();
    error InvalidDeadline();
    error InvalidTokenPath();
    error SwapFailed();
    error MinOutputNotMet();
    error InputNotReceived();
    error InputNotConsumed();
    error UnexpectedCENTBalance();

    event AuthorizedCallerSet(address indexed caller);

    event RevenueSwapExecuted(
        address indexed revenueAsset,
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

    /// @notice Set the RevenueEngine once.
    /// @dev Deliberately immutable after the first configuration to prevent
    ///      the adapter from being redirected to an arbitrary caller.
    function setAuthorizedCaller(
        address caller
    ) external onlyOwner {
        if (
            authorizedCaller != address(0) ||
            caller == address(0)
        ) {
            revert InvalidCaller();
        }

        authorizedCaller = caller;

        emit AuthorizedCallerSet(caller);
    }

    /// @notice Swap Arc Testnet native USDC into CENT through UnitFlow.
    /// @dev The RevenueEngine approves the adapter for ARC_NATIVE_USDC before
    ///      this call. Because Arc Testnet exposes native USDC as the chain's
    ///      native asset, the adapter forwards the received amount as msg.value
    ///      to UnitFlow's WRAP_ETH command, which wraps it into WUSDC.
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        bytes calldata data
    ) external payable nonReentrant returns (uint256 amountOut) {
        if (msg.sender != authorizedCaller) {
            revert InvalidCaller();
        }

        if (
            tokenIn != ARC_NATIVE_USDC ||
            tokenOut != centToken
        ) {
            revert InvalidTokenPath();
        }

        if (
            amountIn == 0 ||
            recipient == address(0)
        ) {
            revert InvalidAmount();
        }

        if (msg.value != 0) {
            revert InputNotReceived();
        }

        IERC20(ARC_NATIVE_USDC).safeTransferFrom(
            msg.sender,
            address(this),
            amountIn
        );

        (
            uint256 deadline,
            address[] memory path
        ) = _decodeSwapData(data);

        if (deadline < block.timestamp) {
            revert InvalidDeadline();
        }

        if (
            path.length != 2 ||
            path[0] != wusdcToken ||
            path[1] != centToken
        ) {
            revert InvalidTokenPath();
        }

        uint256 centBefore =
            IERC20(centToken).balanceOf(address(this));

        bytes memory commands = abi.encodePacked(
            CMD_WRAP_NATIVE_USDC,
            CMD_V2_SWAP_EXACT_IN
        );

        bytes[] memory inputs = new bytes[](2);

        // UnitFlow's WRAP command wraps the chain-native USDC into WUSDC.
        // Keep the wrapped balance inside the UniversalRouter for the next
        // V2 swap command.
        //
        // The adapter received native USDC through its ERC-20 interface above;
        // on Arc Testnet the same asset is the chain-native value transferred
        // to the UniversalRouter by this payable call.
        inputs[0] = abi.encode(
            address(2),
            amountIn
        );

        // payerIsUser = false because the WRAP command has already supplied
        // the WUSDC to the UniversalRouter itself.
        inputs[1] = abi.encode(
            address(this),
            amountIn,
            minAmountOut,
            path,
            false
        );

        try IUnitFlowUniversalRouterRevenue(
            unitFlowUniversalRouter
        ).execute{value: amountIn}(
            commands,
            inputs,
            deadline
        ) {
            // Expected successful return.
        } catch {
            revert SwapFailed();
        }

        uint256 centAfter =
            IERC20(centToken).balanceOf(address(this));

        if (centAfter < centBefore) {
            revert UnexpectedCENTBalance();
        }

        amountOut = centAfter - centBefore;

        if (amountOut < minAmountOut) {
            revert MinOutputNotMet();
        }

        IERC20(centToken).safeTransfer(
            recipient,
            amountOut
        );

        emit RevenueSwapExecuted(
            tokenIn,
            amountIn,
            amountOut,
            recipient
        );
    }

    function _decodeSwapData(
        bytes calldata data
    ) internal view returns (
        uint256 deadline,
        address[] memory path
    ) {
        if (data.length == 0) {
            deadline = block.timestamp + 5 minutes;

            path = new address[](2);
            path[0] = wusdcToken;
            path[1] = centToken;

            return (deadline, path);
        }

        return abi.decode(
            data,
            (uint256, address[])
        );
    }
}
