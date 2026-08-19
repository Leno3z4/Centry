// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
interface IVeBalance{function balanceOfNFT(uint256 tokenId) external view returns(uint256);function ownerOf(uint256 tokenId) external view returns(address);}
contract RevenueDistributor is ReentrancyGuard,Ownable{
 using SafeERC20 for IERC20; uint256 public constant PRECISION=1e36; IERC20 public immutable usdc; IVeBalance public immutable ve; uint256 public accUSDCPerWeight; mapping(uint256=>uint256) public rewardDebt; mapping(uint256=>uint256) public claimable;
 event RevenueAdded(uint256 amount,uint256 weight);event Claimed(uint256 indexed tokenId,address indexed to,uint256 amount);
 constructor(address _usdc,address _ve) Ownable(msg.sender){require(_usdc!=address(0)&&_ve!=address(0),"ZERO_ADDRESS");usdc=IERC20(_usdc);ve=IVeBalance(_ve);}
 function notifyRevenue(uint256 amount,uint256 weightSnapshot) external onlyOwner{require(amount>0&&weightSnapshot>0,"INVALID_REVENUE");usdc.safeTransferFrom(msg.sender,address(this),amount);accUSDCPerWeight+=(amount*PRECISION)/weightSnapshot;emit RevenueAdded(amount,weightSnapshot);}
 function checkpoint(uint256 tokenId) public{uint256 weight=ve.balanceOfNFT(tokenId);uint256 accumulated=(weight*accUSDCPerWeight)/PRECISION;uint256 debt=rewardDebt[tokenId];if(accumulated>debt)claimable[tokenId]+=accumulated-debt;rewardDebt[tokenId]=accumulated;}
 function claim(uint256 tokenId,address to) external nonReentrant{require(ve.ownerOf(tokenId)==msg.sender,"NOT_OWNER");checkpoint(tokenId);uint256 amount=claimable[tokenId];require(amount>0,"NOTHING_TO_CLAIM");claimable[tokenId]=0;usdc.safeTransfer(to,amount);emit Claimed(tokenId,to,amount);}
}
