// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/ERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title Centry Token
/// @notice Fixed-supply CENT token with ERC-2612 permit support.
/// @dev There is intentionally no post-deployment mint function.
contract CentryToken is ERC20, ERC20Permit {
    error InvalidRecipient();

    constructor(
        address initialRecipient,
        uint256 initialSupply
    )
        ERC20("Centry", "CENT")
        ERC20Permit("Centry")
    {
        if (initialRecipient == address(0)) {
            revert InvalidRecipient();
        }

        _mint(
            initialRecipient,
            initialSupply
        );
    }
}
