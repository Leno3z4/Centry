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
    ) external;
}

/// @title Centry UnitFlow Swap Adapter
/// @notice Restricted UnitFlow adapter for CENT reward -> debt-asset swaps.
/// @dev Uses the live UnitFlow UniversalRouter command flow validated by the
///      Centry CENT -> WUSDC -> native USDC transaction:
///      0x08 = V2 exact-input swap
///      0x0c = WUSDC unwrap
///
///      The adapter deliberately builds the command payload itself. Callers
///      cannot provide arbitrary UniversalRouter calldata, targets, commands,
///      or token paths.
contract CentryUnitFlowSwapAdapter is
    Ownable2Step,
    ReentrancyGuard,
    ICentrySwapAdapter
{
    using SafeERC20 for IERC20;

    bytes1 private constant CMD_V2_SWAP_EXACT_IN = 0x08;
    bytes1 private constant CMD_UNWRAP_WUSDC = 0x0c;

    address private constant ARC_NATIVE_USDC =
        0x3600000000000000000000000000000000000000;

    address public immutable unitFlowUniversalRouter;
    address public immutable centToken;
    address public immutable wusdcToken;

    mapping(address => bool) public supportedOutput;

    address public authorizedCaller;

    error InvalidAddress();
    error InvalidCaller();
    error InvalidAmount();
    error InvalidTokenPath();
    error InvalidRecipient();
    error InvalidDeadline();
    error MinOutputNotMet();
    error SwapFailed();
    error UnsupportedOutput();
    error RouterDidNotConsumeInput();
    error UnexpectedOutputToken();

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
        _validateSwapRequest(
            tokenIn,
            tokenOut,
            amountIn,
            recipient
        );

        if (!supportedOutput[tokenOut]) {
            revert UnsupportedOutput();
        }

        (
            uint256 deadline,
            address[] memory path
        ) = _decodeSwapData(data);

        if (deadline < block.timestamp) {
            revert InvalidDeadline();
        }

        if (
            path.length != 2 ||
            path[0] != centToken ||
            path[1] != wusdcToken
        ) {
            revert InvalidTokenPath();
        }

        if (tokenOut != ARC_NATIVE_USDC) {
            revert UnexpectedOutputToken();
        }

        amountOut = _executeUnitFlowSwap(
            amountIn,
            minAmountOut,
            path,
            deadline
        );

        if (amountOut < minAmountOut) {
            revert MinOutputNotMet();
        }

        IERC20(tokenOut).safeTransfer(
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

    function _validateSwapRequest(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address recipient
    ) internal view {
        if (
            msg.sender != authorizedCaller
        ) {
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
            revert InvalidTokenPath();
        }
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
            path[0] = centToken;
            path[1] = wusdcToken;
            return (deadline, path);
        }

        return abi.decode(
            data,
            (uint256, address[])
        );
    }

    function _executeUnitFlowSwap(
        uint256 amountIn,
        uint256 minAmountOut,
        address[] memory path,
        uint256 deadline
    ) internal returns (uint256 amountOut) {
        IERC20 input = IERC20(centToken);
        IERC20 output = IERC20(ARC_NATIVE_USDC);

        uint256 inputBefore = input.balanceOf(address(this));
        uint256 outputBefore = output.balanceOf(address(this));

        if (inputBefore < amountIn) {
            revert InvalidAmount();
        }

        input.forceApprove(
            unitFlowUniversalRouter,
            amountIn
        );

        bytes memory commands = abi.encodePacked(
            CMD_V2_SWAP_EXACT_IN,
            CMD_UNWRAP_WUSDC
        );

        bytes[] memory inputs = new bytes[](2);

        inputs[0] = abi.encode(
            address(2),
            amountIn,
            minAmountOut,
            path,
            true
        );

        inputs[1] = abi.encode(
            address(this),
            minAmountOut
        );

        try IUnitFlowUniversalRouter(
            unitFlowUniversalRouter
        ).execute(
            commands,
            inputs,
            deadline
        ) {
            // Expected successful return.
        } catch {
            input.forceApprove(
                unitFlowUniversalRouter,
                0
            );

            revert SwapFailed();
        }

        input.forceApprove(
            unitFlowUniversalRouter,
            0
        );

        uint256 inputAfter = input.balanceOf(address(this));

        if (inputAfter > inputBefore) {
            revert RouterDidNotConsumeInput();
        }

        uint256 outputAfter = output.balanceOf(address(this));

        if (outputAfter < outputBefore) {
            revert MinOutputNotMet();
        }

        amountOut = outputAfter - outputBefore;
    }
}
