// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/ReentrancyGuard.sol";

import "../interfaces/ICentrySwapAdapter.sol";

interface IUnitFlowUniversalRouter
{
    function execute(
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 deadline
    )
        external
        payable;
}

contract CentryRevenueToCENTUnitFlowAdapter is
    Ownable2Step,
    ReentrancyGuard,
    ICentrySwapAdapter
{
    using SafeERC20 for IERC20;

    bytes1 private constant CMD_WRAP_NATIVE =
        0x0b;

    bytes1 private constant CMD_V2_SWAP_EXACT_IN =
        0x08;

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
            caller == address(0)
        ) {
            revert InvalidCaller();
        }

        authorizedCaller =
            caller;

        emit AuthorizedCallerSet(
            caller
        );
    }

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
        _validateSwap(
            tokenIn,
            tokenOut,
            amountIn,
            recipient
        );

        uint256 deadline =
            _decodeDeadline(data);

        IERC20 inputToken =
            IERC20(ARC_NATIVE_USDC);

        IERC20 outputToken =
            IERC20(centToken);

        inputToken.safeTransferFrom(
            msg.sender,
            address(this),
            amountIn
        );

        uint256 outputBefore =
            outputToken.balanceOf(
                address(this)
            );

        _executeUnitFlow(
            amountIn,
            minAmountOut,
            deadline
        );

        amountOut =
            outputToken.balanceOf(
                address(this)
            ) -
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

    function _validateSwap(
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
        returns (uint256 deadline)
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

    function _executeUnitFlow(
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    )
        internal
    {
        bytes memory commands =
            abi.encodePacked(
                CMD_WRAP_NATIVE,
                CMD_V2_SWAP_EXACT_IN
            );

        bytes[] memory inputs =
            new bytes[](2);

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

        inputs[1] =
            abi.encode(
                address(this),
                amountIn,
                minAmountOut,
                path,
                false
            );

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
    }
}
