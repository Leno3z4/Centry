// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
interface IVeCentry{function ownerOf(uint256 tokenId) external view returns(address);function balanceOfNFT(uint256 tokenId) external view returns(uint256);}
contract GaugeController is Ownable,ReentrancyGuard{
 IVeCentry public immutable ve; address[] public gauges; mapping(address=>bool) public isGauge; mapping(uint256=>mapping(address=>uint256)) public votes; mapping(uint256=>uint256) public usedPower; mapping(address=>uint256) public gaugeWeight; uint256 public totalWeight;
 event GaugeAdded(address indexed gauge);event GaugeRemoved(address indexed gauge);event Voted(uint256 indexed tokenId,address indexed gauge,uint256 weight);event VoteReset(uint256 indexed tokenId,address indexed gauge);
 constructor(address _ve) Ownable(msg.sender){require(_ve!=address(0),"ZERO_ADDRESS");ve=IVeCentry(_ve);}
 function addGauge(address gauge) external onlyOwner{require(gauge!=address(0)&&!isGauge[gauge],"INVALID_GAUGE");isGauge[gauge]=true;gauges.push(gauge);emit GaugeAdded(gauge);}
 function removeGauge(address gauge) external onlyOwner{isGauge[gauge]=false;emit GaugeRemoved(gauge);}
 function vote(uint256 tokenId,address gauge,uint256 weight) external nonReentrant{require(ve.ownerOf(tokenId)==msg.sender,"NOT_OWNER");require(isGauge[gauge]&&weight<=100,"INVALID_VOTE");_removeVote(tokenId,gauge);uint256 power=ve.balanceOfNFT(tokenId);uint256 allocation=(power*weight)/100;require(usedPower[tokenId]+allocation<=power,"POWER_EXCEEDED");votes[tokenId][gauge]=allocation;usedPower[tokenId]+=allocation;gaugeWeight[gauge]+=allocation;totalWeight+=allocation;emit Voted(tokenId,gauge,weight);}
 function resetVote(uint256 tokenId,address gauge) external nonReentrant{require(ve.ownerOf(tokenId)==msg.sender,"NOT_OWNER");_removeVote(tokenId,gauge);emit VoteReset(tokenId,gauge);}
 function _removeVote(uint256 tokenId,address gauge) internal{uint256 old=votes[tokenId][gauge];if(old==0)return;votes[tokenId][gauge]=0;usedPower[tokenId]-=old;gaugeWeight[gauge]-=old;totalWeight-=old;}
}
