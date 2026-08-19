// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/access/Ownable.sol";
/// @dev TESTNET ONLY. Replace this with a production oracle adapter before real collateral.
contract MockOracle is Ownable{
 mapping(address=>uint256) public prices;
 constructor() Ownable(msg.sender){}
 function setPrice(address asset,uint256 price) external onlyOwner{require(price>0,"INVALID_PRICE");prices[asset]=price;}
 function getAssetPrice(address asset) external view returns(uint256){uint256 p=prices[asset];require(p>0,"NO_PRICE");return p;}
}
