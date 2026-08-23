// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
interface ICentryPool { function supplyCollateralFor(address user,address asset,uint256 amount) external; function withdrawCollateralFor(address user,address receiver,address asset,uint256 amount) external; function borrowFor(address user,address receiver,uint256 amount) external; function repayFor(address user,uint256 amount) external returns(uint256); function debtOf(address user) external view returns(uint256); function healthFactor(address user) external view returns(uint256); function borrowCapacity(address user) external view returns(uint256); }
contract SelfRepayingVault is ReentrancyGuard, Ownable {
 using SafeERC20 for IERC20; IERC20 public immutable usyc; IERC20 public immutable usdc; ICentryPool public immutable lendingPool;
 mapping(address=>uint256) public depositedUSYC; mapping(address=>bool) public keepers;
 event KeeperSet(address indexed keeper,bool allowed); event Deposited(address indexed user,uint256 amount); event Withdrawn(address indexed user,uint256 amount); event Borrowed(address indexed user,uint256 amount); event Repaid(address indexed user,uint256 amount);
 constructor(address _usyc,address _usdc,address _lendingPool) Ownable(msg.sender){require(_usyc!=address(0)&&_usdc!=address(0)&&_lendingPool!=address(0),"ZERO_ADDRESS");usyc=IERC20(_usyc);usdc=IERC20(_usdc);lendingPool=ICentryPool(_lendingPool);}
 modifier onlyKeeper(){require(keepers[msg.sender]||msg.sender==owner(),"NOT_KEEPER");_;}
 function setKeeper(address keeper,bool allowed) external onlyOwner{keepers[keeper]=allowed;emit KeeperSet(keeper,allowed);}
 function depositCollateral(uint256 amount) external nonReentrant{require(amount>0,"ZERO_AMOUNT");usyc.safeTransferFrom(msg.sender,address(this),amount);usyc.forceApprove(address(lendingPool),amount);lendingPool.supplyCollateralFor(msg.sender,address(usyc),amount);depositedUSYC[msg.sender]+=amount;emit Deposited(msg.sender,amount);}
 function withdrawCollateral(uint256 amount) external nonReentrant{require(amount>0&&amount<=depositedUSYC[msg.sender],"INVALID_AMOUNT");depositedUSYC[msg.sender]-=amount;lendingPool.withdrawCollateralFor(msg.sender,msg.sender,address(usyc),amount);emit Withdrawn(msg.sender,amount);}
 function borrow(uint256 amount) external nonReentrant{require(amount>0,"ZERO_AMOUNT");lendingPool.borrowFor(msg.sender,msg.sender,amount);emit Borrowed(msg.sender,amount);}
 function repay(uint256 amount) external nonReentrant{require(amount>0,"ZERO_AMOUNT");usdc.safeTransferFrom(msg.sender,address(this),amount);usdc.forceApprove(address(lendingPool),amount);uint256 paid=lendingPool.repayFor(msg.sender,amount);emit Repaid(msg.sender,paid);}
 function harvestAndRepay(address user,uint256 yieldAmount) external nonReentrant onlyKeeper{require(yieldAmount>0,"ZERO_AMOUNT");usdc.forceApprove(address(lendingPool),yieldAmount);uint256 paid=lendingPool.repayFor(user,yieldAmount);emit Repaid(user,paid);}
 function getVaultDetails(address user) external view returns(uint256 collateral,uint256 debt,uint256 maxBorrow,uint256 healthFactor){collateral=depositedUSYC[user];debt=lendingPool.debtOf(user);maxBorrow=lendingPool.borrowCapacity(user);healthFactor=lendingPool.healthFactor(user);}
}
