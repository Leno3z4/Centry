// Arc Mainnet deployment configuration.
// Keep deployed addresses centralized so the frontend targets the current protocol.
export const CONTRACT_ADDRESSES = Object.freeze({
  USDC: '0x3600000000000000000000000000000000000000',
  EURC: '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1',
  CIRBTC: '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0',

  lendingPool: '0x0ee649E5A95eB9127cB7146b26349a92B68c17A4',
  interestRateModel: '0x7d2d0096Dc5D77A68B821a2308f2A65179c04B76',
  oracle: '0x00C6d554BD44859349c4aeEA0E8216AE94FC3f84',
  centryToken: '0x75E1C49f3fAebEc149c4c997f209A8e639c2253F',
  veCentry: '0x3c1771B971329f3eCf9A1bB8B3adC8756e13d334',
  veCentryRewards: '0x0cBb0050cDCCC5D9CE8Ee2C407c8608B042D30D5',
  selfRepayExecutor: '0x6D87e89C015509F84B4e01b8a193d1A2CcE7De37',
  unitFlowSwapAdapter: '0x9212cb2eD06256D8D690d631A7938D55a9E3200D',
  unitFlowRouter: '0x6fD8351b9596C1F0b2f2479BfA6A171cb3d0f410',
  treasury: '0x475a93394F1EDef9255EA565Ee50eb8feaC7744C',
  governor: '0x0F54683a09a73cB60575E0DF36E474D4F9e1157B',

  collateralAssets: Object.freeze({}),
  positionCollateral: '',
});

export function hasAddress(name) {
  return /^0x[a-fA-F0-9]{40}$/.test(CONTRACT_ADDRESSES[name] || '');
}

export function configuredContractNames() {
  return Object.keys(CONTRACT_ADDRESSES).filter(hasAddress);
}
