// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/extensions/ERC4626.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/Pausable.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/ReentrancyGuard.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/IERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Centry Yield Vault
/// @notice ERC-4626 vault whose share value increases when real underlying
///         assets are added to the vault as yield.
/// @dev Testnet-first building block for Centry self-repaying positions.
///      No yield is created by this contract. Yield must come from an actual
///      transfer of the underlying asset into the vault.
contract CentryYieldVault is
    ERC4626,
    Ownable2Step,
    Pausable,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    error InvalidAddress();
    error ZeroAmount();

    event YieldDonated(
        address indexed donor,
        uint256 amount
    );

    event VaultPaused(address indexed account);
    event VaultUnpaused(address indexed account);

    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        address initialOwner
    )
        ERC20(name_, symbol_)
        ERC4626(asset_)
        Ownable(initialOwner)
    {
        if (
            address(asset_) == address(0) ||
            initialOwner == address(0)
        ) {
            revert InvalidAddress();
        }
    }

    /// @notice Adds real underlying assets to the vault without minting shares.
    /// @dev This increases the exchange value of existing shares.
    function donateYield(
        uint256 amount
    ) external whenNotPaused nonReentrant {
        if (amount == 0) {
            revert ZeroAmount();
        }

        IERC20(asset()).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        emit YieldDonated(
            msg.sender,
            amount
        );
    }

    function pause() external onlyOwner {
        _pause();
        emit VaultPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        _unpause();
        emit VaultUnpaused(msg.sender);
    }

    function deposit(
        uint256 assets,
        address receiver
    )
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256 shares)
    {
        shares = super.deposit(
            assets,
            receiver
        );
    }

    function mint(
        uint256 shares,
        address receiver
    )
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256 assets)
    {
        assets = super.mint(
            shares,
            receiver
        );
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner_
    )
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256 shares)
    {
        shares = super.withdraw(
            assets,
            receiver,
            owner_
        );
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner_
    )
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256 assets)
    {
        assets = super.redeem(
            shares,
            receiver,
            owner_
        );
    }
}
