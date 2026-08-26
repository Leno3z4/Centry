// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/ERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";

/// @title Centry Mock ERC20
/// @notice Test-only token. Never use as a real reserve.
contract CentryMockERC20 is ERC20, Ownable2Step {
    uint8 private immutable tokenDecimals;

    error InvalidAddress();

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address owner_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        if (owner_ == address(0)) {
            revert InvalidAddress();
        }

        tokenDecimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return tokenDecimals;
    }

    function mint(
        address to,
        uint256 amount
    ) external onlyOwner {
        if (to == address(0)) {
            revert InvalidAddress();
        }

        _mint(to, amount);
    }
}
