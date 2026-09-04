// Arc Testnet deployment configuration.
// Keep deployed addresses centralized so the frontend targets the same live protocol contracts.
export const CONTRACT_ADDRESSES = Object.freeze({
  USDC: '0x3600000000000000000000000000000000000000',
  EURC: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
  CIRBTC: '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF',

  lendingPool: '0x90C935687D91b3352b2C55cd79389C92950D94BD',
  interestRateModel: '0x0e33c05cc844914155B7300aA93085DBB32d4FBE',
  oracle: '0xC82424D224dbfBF9D41a9cBe5cA2AdF762572fC6',
  centryToken: '0x76e6d50D3151f0B4645ac0E53584F4204Fc6f0e3',
  veCentry: '0xF8B71bAed42c28e7e376C4DbD4A137047B92a503',
  veCentryRewards: '0x06e627ce43F2ddd37e8f196824f7049416c3025b',
  selfRepayExecutor: '0x02356D1E4557b8D656cE1493D751C914EA84efe7',
  unitFlowSwapAdapter: '0x8430a1cF22C1cd09F7B7eD2C3dB0D66020f6F020',
  revenueDistributor: '',

  collateralAssets: Object.freeze({
    ETH: '0x54a4dd95bf4ABb6cF02014ca62C3FbbDeE040B6a',
    BTC: '0x47CadF37d57C0e3381360F80dfC5df582871B11f',
    SOL: '0xa44E356ba09A60626587E9d284B64a298Fbf8fde',
    EUR: '0x9aA8218dCBf0Ca9B04ba44a1c9ed8Da4144d0aDC',
  }),

  positionCollateral: '',
});

export function hasAddress(name) {
  return /^0x[a-fA-F0-9]{40}$/.test(CONTRACT_ADDRESSES[name] || '');
}

export function configuredContractNames() {
  return Object.keys(CONTRACT_ADDRESSES).filter(hasAddress);
}
