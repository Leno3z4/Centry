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

/// @title Centry UnitFlow Swap Adapter
/// @notice Restricted UnitFlow V3 adapter for CENT -> Arc native USDC.
/// @dev Uses the UnitFlow V3 router's exact-input interface directly.
///      No WUSDC wrapping/unwrapping is required for V3 because the router
///      accepts the ERC-20 token address for Arc native USDC directly.
///
///      swapData:
///        abi.encode(uint256 deadline, uint24 fee) for a direct pool, or
///        abi.encode(uint256 deadline, bytes v3Path) for a multi-hop V3 path.
///
///      The adapter validates the path endpoints and never accepts arbitrary
///      router calldata.
contract CentryUnitFlowSwapAdapter is
    Ownable2Step,
    ReentrancyGuard,
    ICentrySwapAdapter
{
    using SafeERC20 for IERC20;

    address public constant ARC_NATIVE_USDC =
        0x3600000000000000000000000000000000000000;

    address public immutable unitFlowRouter;
    address public immutable centToken;

    mapping(address => bool) public supportedOutput;

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
    ) external override nonReentrant returns (uint256 amountOut) {
        _validateSwapRequest(
            tokenIn,
            tokenOut,
            amountIn,
            recipient
        );

        if (!supportedOutput[tokenOut]) {
            revert UnsupportedOutput();
        }

        if (tokenOut != ARC_NATIVE_USDC) {
            revert UnexpectedOutputToken();
        }

        (
            uint256 deadline,
            bytes memory path
        ) = _decodeSwapData(data);

        if (deadline < block.timestamp) {
            revert InvalidDeadline();
        }

        _validatePath(path);

        uint256 outputBefore = _outputBalance();

        amountOut = _executeSwap(
            amountIn,
            minAmountOut,
            path,
            deadline,
            outputBefore
        );

        IERC20(ARC_NATIVE_USDC).safeTransfer(
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

    function _outputBalance() internal view returns (uint256) {
        return IERC20(ARC_NATIVE_USDC).balanceOf(address(this));
    }

    function _executeSwap(
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory path,
        uint256 deadline,
        uint256 outputBefore
    ) internal returns (uint256 amountOut) {
        IERC20 inputToken = IERC20(centToken);
        uint256 inputBefore = inputToken.balanceOf(address(this));

        if (inputBefore < amountIn) {
            revert InvalidAmount();
        }

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

            uint256 inputAfter = inputToken.balanceOf(address(this));

            if (inputAfter > inputBefore) {
                revert RouterDidNotConsumeInput();
            }

            uint256 outputAfter = IERC20(ARC_NATIVE_USDC).balanceOf(address(this));

            if (outputAfter < outputBefore) {
                revert MinOutputNotMet();
            }

            amountOut = outputAfter - outputBefore;

            if (
                amountOut < minAmountOut ||
                reportedAmountOut < minAmountOut
            ) {
                revert MinOutputNotMet();
            }
        } catch {
            inputToken.forceApprove(unitFlowRouter, 0);
            revert SwapFailed();
        }
    }

    function _validateSwapRequest(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address recipient
    ) internal view {
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
            revert InvalidTokenPath();
        }
    }

    function _decodeSwapData(
        bytes calldata data
    )
        internal
        view
        returns (
            uint256 deadline,
            bytes memory path
        )
    {
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
                centToken,
                fee,
                ARC_NATIVE_USDC
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

        if (
            length != 43 &&
            length != 66 &&
            length != 89
        ) {
            revert InvalidTokenPath();
        }

        address firstToken;
        address lastToken;

        assembly {
            firstToken := shr(
                96,
                mload(add(path, 32))
            )

            lastToken := shr(
                96,
                mload(
                    add(
                        path,
                        add(
                            32,
                            sub(length, 20)
                        )
                    )
                )
            )
        }

        if (
            firstToken != centToken ||
            lastToken != ARC_NATIVE_USDC
        ) {
            revert InvalidTokenPath();
        }
    }
}
