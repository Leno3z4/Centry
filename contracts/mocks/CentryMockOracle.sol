// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable.sol";
import "../interfaces/ICentryOracle.sol";
/// @dev Test-only oracle. Never use with real funds.
contract CentryMockOracle is ICentryOracle, Ownable2Step { mapping(address=>uint256) public prices; mapping(address=>uint256) public updatedAt; constructor(address owner_) Ownable(owner_){} function setPrice(address asset,uint256 priceE18) external onlyOwner{require(asset!=address(0)&&priceE18>0,"INVALID_PRICE");prices[asset]=priceE18;updatedAt[asset]=block.timestamp;} function getPrice(address asset) external view returns(uint256 priceE18,uint256 timestamp){priceE18=prices[asset];timestamp=updatedAt[asset];require(priceE18>0,"NO_PRICE");} }
