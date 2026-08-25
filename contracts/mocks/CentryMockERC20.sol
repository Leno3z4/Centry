// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/token/ERC20/ERC20.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable.sol";
/// @dev Test-only token. Never use as a real reserve.
contract CentryMockERC20 is ERC20, Ownable2Step { uint8 private immutable _decimals; constructor(string memory n,string memory s,uint8 d,address owner_) ERC20(n,s) Ownable(owner_){_decimals=d;} function decimals() public view override returns(uint8){return _decimals;} function mint(address to,uint256 amount) external onlyOwner{_mint(to,amount);} }
