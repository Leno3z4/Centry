// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
contract VeNFT is ERC721,ReentrancyGuard,Ownable{
 using SafeERC20 for IERC20; uint256 public constant WEEK=1 weeks; uint256 public constant MIN_LOCK=1 weeks; uint256 public constant MAX_LOCK=4*365 days; IERC20 public immutable token; uint256 public nextTokenId;
 struct Lock{uint128 amount;uint40 end;} mapping(uint256=>Lock) public locks;
 event Locked(address indexed user,uint256 indexed tokenId,uint256 amount,uint256 end); event Withdrawn(address indexed user,uint256 indexed tokenId,uint256 amount);
 constructor(address _token) ERC721("Centry Vote Escrow","veCENTRY") Ownable(msg.sender){token=IERC20(_token);}
 function createLock(uint256 amount,uint256 duration) external nonReentrant returns(uint256 tokenId){require(amount>0&&duration>=MIN_LOCK&&duration<=MAX_LOCK,"INVALID_LOCK");uint40 end=uint40(((block.timestamp+duration)/WEEK)*WEEK);tokenId=++nextTokenId;locks[tokenId]=Lock(uint128(amount),end);_safeMint(msg.sender,tokenId);token.safeTransferFrom(msg.sender,address(this),amount);emit Locked(msg.sender,tokenId,amount,end);}
 function withdraw(uint256 tokenId) external nonReentrant{require(ownerOf(tokenId)==msg.sender,"NOT_OWNER");Lock memory l=locks[tokenId];require(block.timestamp>=l.end,"LOCKED");delete locks[tokenId];_burn(tokenId);token.safeTransfer(msg.sender,l.amount);emit Withdrawn(msg.sender,tokenId,l.amount);}
 function balanceOfNFT(uint256 tokenId) public view returns(uint256){Lock memory l=locks[tokenId];if(block.timestamp>=l.end)return 0;return(uint256(l.amount)*(l.end-block.timestamp))/MAX_LOCK;}
 function lockedEnd(uint256 tokenId) external view returns(uint256){return locks[tokenId].end;}
}
