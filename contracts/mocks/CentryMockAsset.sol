// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/ERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";

/// @title Centry Mock Asset
/// @notice Testnet-only ERC-20 used to exercise additional Centry reserves.
/// @dev The owner can mint tokens to controlled test wallets. Never use as a
///      representation of a real-world asset or its market value.
contract CentryMockAsset is ERC20, Ownable2Step {
    uint8 private immutable _assetDecimals;

    error InvalidAddress();
    error InvalidDecimals();
    error AmountZero();

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address initialOwner
    )
        ERC20(name_, symbol_)
        Ownable(initialOwner)
    {
        if (initialOwner == address(0)) {
            revert InvalidAddress();
        }

        if (
            decimals_ == 0 ||
            decimals_ > 18
        ) {
            revert InvalidDecimals();
        }

        _assetDecimals = decimals_;
    }

    function decimals()
        public
        view
        override
        returns (uint8)
    {
        return _assetDecimals;
    }

    function mint(
        address to,
        uint256 amount
    ) external onlyOwner {
        if (to == address(0)) {
            revert InvalidAddress();
        }

        if (amount == 0) {
            revert AmountZero();
        }

        _mint(to, amount);
    }
}
