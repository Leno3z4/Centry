// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/ERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice Fixed-supply CENT token. No post-deployment mint authority exists.
contract CentryToken is ERC20, ERC20Permit {
    constructor(address initialRecipient, uint256 initialSupply) ERC20("Centry", "CENT") ERC20Permit("Centry") {
        require(initialRecipient != address(0), "ZERO_RECIPIENT");
        _mint(initialRecipient, initialSupply);
    }
}
