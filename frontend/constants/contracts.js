const env = (key, fallback = '') => process.env[key] || fallback;

// Arc testnet deployment supplied by the Centry deployer.
// Environment variables override these defaults for future deployments.
export const CONTRACT_ADDRESSES = Object.freeze({
  USDC: env(
    'NEXT_PUBLIC_CENTRY_USDC',
    '0x3F75004aF35F5c6cA028DBf5aef688b6e128367f'
  ),
  lendingPool: env(
    'NEXT_PUBLIC_CENTRY_LENDING_POOL',
    '0xd2E73c4aC467e806D20F8316Ee31e89a260f2bFa'
  ),
  interestRateModel: env(
    'NEXT_PUBLIC_CENTRY_INTEREST_RATE_MODEL',
    '0x0e33c05cc844914155B7300aA93085DBB32d4FBE'
  ),
  oracle: env(
    'NEXT_PUBLIC_CENTRY_ORACLE',
    '0x4A2384bE6e4727a0187A28075234853b59E05052'
  ),
  centryToken: env(
    'NEXT_PUBLIC_CENTRY_TOKEN',
    '0x9DCa0659D4625949eCE5B73CFb826B2c8eD287cB'
  ),
  veCentry: env(
    'NEXT_PUBLIC_CENTRY_VE_CENTRY',
    '0xb9cC70321317b92B45bd8813E54F1f3BcfACfA38'
  ),
  revenueDistributor: env(
    'NEXT_PUBLIC_CENTRY_REVENUE_DISTRIBUTOR',
    '0xc54A67aBF5a5697F2dDCd75d6165a17E73048271'
  ),
  selfRepayingFactory: env(
    'NEXT_PUBLIC_CENTRY_SELF_REPAYING_FACTORY',
    ''
  ),
  yieldVault: env(
    'NEXT_PUBLIC_CENTRY_YIELD_VAULT',
    '0x58d5b2d559895EF8446f2a38Dde1D29CE6d00E41'
  ),
  testYieldStrategy: env(
    'NEXT_PUBLIC_CENTRY_TEST_YIELD_STRATEGY',
    '0x5cF01Da1F06b602E3315678a88F605305fE58029'
  ),
  positionCollateral: env(
    'NEXT_PUBLIC_CENTRY_POSITION_COLLATERAL',
    ''
  ),
});

export function hasAddress(name) {
  return /^0x[a-fA-F0-9]{40}$/.test(
    CONTRACT_ADDRESSES[name] || ''
  );
}

export function configuredContractNames() {
  return Object.keys(CONTRACT_ADDRESSES).filter(hasAddress);
}
