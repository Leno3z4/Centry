// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/ICentryYieldStrategy.sol";

interface ICentryYieldVault {
    function donateYield(uint256 amount) external;
}

/// @title Centry Test Yield Strategy
/// @notice Controlled testnet strategy that forwards real underlying tokens
///         to a Centry Yield Vault as yield.
/// @dev This contract does not manufacture yield. The owner must fund it with
///      the underlying asset before a harvest can occur.
contract CentryTestYieldStrategy is
    ICentryYieldStrategy,
    Ownable2Step
{
    using SafeERC20 for IERC20;

    error InvalidAddress();
    error ZeroAmount();

    IERC20 private immutable _asset;
    ICentryYieldVault private immutable _vault;

    event StrategyFunded(
        address indexed funder,
        uint256 amount
    );

    event YieldHarvested(
        address indexed caller,
        uint256 amount
    );

    constructor(
        IERC20 asset_,
        ICentryYieldVault vault_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (
            address(asset_) == address(0) ||
            address(vault_) == address(0) ||
            initialOwner == address(0)
        ) {
            revert InvalidAddress();
        }

        _asset = asset_;
        _vault = vault_;
    }

    function asset() external view override returns (address) {
        return address(_asset);
    }

    function vault() external view override returns (address) {
        return address(_vault);
    }

    function totalManagedAssets()
        external
        view
        override
        returns (uint256)
    {
        return _asset.balanceOf(address(this));
    }

    /// @notice Funds the strategy with the underlying token for testnet yield.
    /// @dev The caller must approve this strategy before calling this function.
    function fund(
        uint256 amount
    ) external onlyOwner {
        if (amount == 0) {
            revert ZeroAmount();
        }

        _asset.safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        emit StrategyFunded(
            msg.sender,
            amount
        );
    }

    /// @notice Sends all currently held strategy funds to the yield vault.
    /// @dev Anyone can trigger a harvest; funds always go to the configured
    ///      vault and never to the caller.
    function harvest()
        external
        override
        returns (uint256 yieldAmount)
    {
        yieldAmount = _asset.balanceOf(address(this));

        if (yieldAmount == 0) {
            revert ZeroAmount();
        }

        _asset.forceApprove(
            address(_vault),
            yieldAmount
        );

        _vault.donateYield(
            yieldAmount
        );

        emit YieldHarvested(
            msg.sender,
            yieldAmount
        );
    }
}
