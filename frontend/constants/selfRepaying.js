export const SELF_REPAYING_FACTORY_ABI = [
  { type: 'function', name: 'positionsOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'address[]' }] },
  { type: 'function', name: 'createPosition', stateMutability: 'nonpayable', inputs: [{ name: 'collateralAsset', type: 'address' }], outputs: [{ name: 'position', type: 'address' }] },
];

export const SELF_REPAYING_POSITION_ABI = [
  { type: 'function', name: 'collateralAsset', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'collateralSupplied', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'yieldPrincipal', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'yieldShares', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'totalRepaid', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'positionOpen', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'currentDebt', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'currentYieldAssets', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'harvestableProfit', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'healthFactor', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'depositCollateral', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'openPosition', stateMutability: 'nonpayable', inputs: [{ name: 'borrowAmount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'harvestAndRepay', stateMutability: 'nonpayable', inputs: [], outputs: [{ name: 'repaid', type: 'uint256' }] },
  { type: 'function', name: 'closePosition', stateMutability: 'nonpayable', inputs: [], outputs: [] },
];
