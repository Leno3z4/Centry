export const SELF_REPAYING_VAULT_ABI = [
  "function depositCollateral(uint256 amount) external",
  "function withdrawCollateral(uint256 amount) external",
  "function borrow(uint256 amount) external",
  "function repay(uint256 amount) external",
  "function getVaultDetails(address user) external view returns (uint256 collateral, uint256 debt, uint256 maxBorrow)",
  "function usyc() external view returns (address)",
  "function usdc() external view returns (address)"
];

export const LENDING_POOL_ABI = [
  "function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
  "function getReserveData(address asset) external view returns (uint256 totalLiquidity, uint256 totalBorrows, uint256 currentLiquidityRate)",
  "function initReserve(address asset, address interestRateModel) external"
];

export const VE_NFT_ABI = [
  "function createLock(uint256 value, uint256 unlockTime) external returns (uint256)",
  "function increaseAmount(uint256 tokenId, uint256 value) external",
  "function withdraw(uint256 tokenId) external",
  "function balanceOf(address owner) external view returns (uint256)",
  "function locked(uint256 tokenId) external view returns (int128 amount, uint256 end)"
];

export const GAUGE_CONTROLLER_ABI = [
  "function voteForGaugeWeight(address gaugeAddress, uint256 userWeight) external",
  "function getGaugeWeight(address gaugeAddress) external view returns (uint256)",
  "function getTotalWeight() external view returns (uint256)"
];

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)"
];
