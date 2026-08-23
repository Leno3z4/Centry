// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockUSYC is ERC20, Ownable {
    uint8 private _dec;

    constructor(uint8 decimals_) ERC20("Mock USYC", "mUSYC") Ownable(msg.sender) {
        _dec = decimals_;
    }

    function decimals() public view override returns (uint8) { return _dec; }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
