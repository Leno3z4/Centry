export const LENDING_POOL_ABI = [
  "function supply(uint256 amount) external returns (uint256 shares)",
  "function withdraw(uint256 shares) external returns (uint256 amount)",
  "function supplyCollateral(address asset, uint256 amount, address onBehalfOf) external",
  "function withdrawCollateral(address asset, uint256 amount) external",
  "function borrow(uint256 amount) external",
  "function repay(address onBehalfOf, uint256 amount) external returns (uint256)",
  "function supplyBalance(address user) external view returns (uint256)",
  "function supplyShares(address user) external view returns (uint256)",
  "function totalSupplyShares() external view returns (uint256)",
  "function totalSupplyAssets() external view returns (uint256)",
  "function debtOf(address user) external view returns (uint256)",
  "function healthFactor(address user) external view returns (uint256)",
  "function borrowCapacity(address user) external view returns (uint256)",
  "function getReserveData() external view returns (uint256 totalLiquidity, uint256 totalBorrows, uint256 borrowRatePerYear, uint256 supplyRatePerYear)",
  "function userCollaterals(address user) external view returns (address[])",
];

export const SELF_REPAYING_VAULT_ABI = [
  "function depositCollateral(uint256 amount) external",
  "function withdrawCollateral(uint256 amount) external",
  "function borrow(uint256 amount) external",
  "function repay(uint256 amount) external",
  "function getPosition(address user) external view returns (uint256 collateral, uint256 debt, uint256 maxBorrow, uint256 healthFactor)",
  "function collateralValueUSD(address user) external view returns (uint256)",
  "function idleLiquidity() external view returns (uint256)",
  "function usyc() external view returns (address)",
  "function usdc() external view returns (address)",
];

export const VE_NFT_ABI = [
  "function createLock(uint256 amount, uint256 duration) external returns (uint256 tokenId)",
  "function increaseAmount(uint256 tokenId, uint256 addAmount) external",
  "function extendLock(uint256 tokenId, uint256 newDuration) external",
  "function withdraw(uint256 tokenId) external",
  "function balanceOf(address owner) external view returns (uint256)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function balanceOfNFT(uint256 tokenId) external view returns (uint256)",
  "function lockedEnd(uint256 tokenId) external view returns (uint256)",
  "function isExpired(uint256 tokenId) external view returns (bool)",
  "function nextTokenId() external view returns (uint256)",
  "function getPosition(uint256 tokenId) external view returns (address owner, uint256 amount, uint256 end, uint256 power, bool expired)",
];

export const GAUGE_CONTROLLER_ABI = [
  "function vote(uint256 tokenId, address gauge, uint256 weight) external",
  "function resetVote(uint256 tokenId, address gauge) external",
  "function resetAllVotes(uint256 tokenId, address[] gauges) external",
  "function gaugeWeight(address gauge) external view returns (uint256)",
  "function totalWeight() external view returns (uint256)",
  "function isGauge(address gauge) external view returns (bool)",
  "function votes(uint256 tokenId, address gauge) external view returns (uint256)",
  "function usedWeight(uint256 tokenId) external view returns (uint256)",
  "function remainingWeight(uint256 tokenId) external view returns (uint256)",
  "function getGauges() external view returns (address[])",
];

export const REWARD_DISTRIBUTOR_ABI = [
  "function distribute() external",
  "function claim(address gauge) external returns (uint256)",
  "function claimAll(address[] gauges) external returns (uint256)",
  "function pendingCntry(address user, address gauge) external view returns (uint256)",
];

export const REVENUE_DISTRIBUTOR_ABI = [
  "function depositFees(uint256 amount) external",
  "function checkpointToken(uint256 tokenId) external",
  "function claim(uint256 tokenId, address to) external returns (uint256)",
  "function claimable(uint256 tokenId) external view returns (uint256)",
  "function getCurrentEpochInfo() external view returns (uint256 epochIndex, uint256 startTime, uint256 endsAt, uint256 accumulatedUsdc)",
  "function timeUntilCheckpoint() external view returns (uint256)",
];

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function transfer(address to, uint256 amount) external returns (bool)",
];
