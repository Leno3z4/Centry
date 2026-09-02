// Arc Testnet deployment configuration.
// Keep deployed addresses centralized so the frontend and keeper tooling
// target the same live protocol contracts.
export const CONTRACT_ADDRESSES = Object.freeze({
  USDC: '0x3600000000000000000000000000000000000000',
  EURC: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
  CIRBTC: '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF',

  lendingPool: '0x90C935687D91b3352b2C55cd79389C92950D94BD',
  interestRateModel: '0x0e33c05cc844914155B7300aA93085DBB32d4FBE',
  oracle: '0xC82424D224dbfBF9D41a9cBe5cA2AdF762572fC6',
  centryToken: '0x76e6d50D3151f0B4645ac0E53584F4204Fc6f0e3',
  veCentry: '0xb39411595eD14991377411bcE52677C05AcE978D',
  veCentryRewards: '0x2fA236D227cb139FbA6E43396614cf8E23CF3050',
  selfRepayExecutor: '0xfCDBA35d9255927E9226f371761c1A9Ad82cF831',
  unitFlowSwapAdapter: '0xDc99c84B8B58d0E0f2dA5E29567Be5325b4b3545',
  revenueDistributor: '0xc54A67aBF5a5697F2dDCd75d6165a17E73048271',

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
