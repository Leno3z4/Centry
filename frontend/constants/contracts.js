const env = (key, fallback = '') => process.env[key] || fallback;

// Arc testnet deployment configuration.
// Arc testnet exposes its native USDC through an ERC-20-compatible interface
// at 0x3600000000000000000000000000000000000000 with 6 ERC-20 decimals.
export const CONTRACT_ADDRESSES = Object.freeze({
  USDC: env(
    'NEXT_PUBLIC_CENTRY_USDC',
    '0x3600000000000000000000000000000000000000'
  ),
  lendingPool: env(
    'NEXT_PUBLIC_CENTRY_LENDING_POOL',
    '0x90C935687D91b3352b2C55cd79389C92950D94BD'
  ),
  interestRateModel: env(
    'NEXT_PUBLIC_CENTRY_INTEREST_RATE_MODEL',
    '0x0e33c05cc844914155B7300aA93085DBB32d4FBE'
  ),
  oracle: env(
    'NEXT_PUBLIC_CENTRY_ORACLE',
    '0xC82424D224dbfBF9D41a9cBe5cA2AdF762572fC6'
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
    '0xB5988B4A0D8E9e3AF491B987b9F7c0150397999E'
  ),
  yieldVault: env(
    'NEXT_PUBLIC_CENTRY_YIELD_VAULT',
    '0x58d5b2d559895EF8446f2a38Dde1D29CE6d00E41'
  ),
  testYieldStrategy: env(
    'NEXT_PUBLIC_CENTRY_TEST_YIELD_STRATEGY',
    '0x5cF01Da1F06b602E3315678a88F605305fE58029'
  ),
  collateralAssets: Object.freeze({
    ETH: env(
      'NEXT_PUBLIC_CENTRY_MOCK_ETH',
      '0x54a4dd95bf4ABb6cF02014ca62C3FbbDeE040B6a'
    ),
    BTC: env(
      'NEXT_PUBLIC_CENTRY_MOCK_BTC',
      '0x47CadF37d57C0e3381360F80dfC5df582871B11f'
    ),
    SOL: env(
      'NEXT_PUBLIC_CENTRY_MOCK_SOLANA',
      '0xa44E356ba09A60626587E9d284B64a298Fbf8fde'
    ),
    EUR: env(
      'NEXT_PUBLIC_CENTRY_MOCK_EUR',
      '0x9aA8218dCBf0Ca9B04ba44a1c9ed8Da4144d0aDC'
    ),
  }),
  positionCollateral: env(
    'NEXT_PUBLIC_CENTRY_POSITION_COLLATERAL',
    ''
  ),
});

export function hasAddress(name) {
  return /^0x[a-fA-F0-9]{40}$/.test(CONTRACT_ADDRESSES[name] || '');
}

export function configuredContractNames() {
  return Object.keys(CONTRACT_ADDRESSES).filter(hasAddress);
}
