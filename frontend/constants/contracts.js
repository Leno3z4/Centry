const env = (key) => process.env[key] || '';

export const CONTRACT_ADDRESSES = Object.freeze({
  USDC: env('NEXT_PUBLIC_CENTRY_USDC'),
  lendingPool: env('NEXT_PUBLIC_CENTRY_LENDING_POOL'),
  interestRateModel: env('NEXT_PUBLIC_CENTRY_INTEREST_RATE_MODEL'),
  oracle: env('NEXT_PUBLIC_CENTRY_ORACLE'),
  centryToken: env('NEXT_PUBLIC_CENTRY_TOKEN'),
  veCentry: env('NEXT_PUBLIC_CENTRY_VE_CENTRY'),
  revenueDistributor: env('NEXT_PUBLIC_CENTRY_REVENUE_DISTRIBUTOR'),
});

export function hasAddress(name) {
  return /^0x[a-fA-F0-9]{40}$/.test(CONTRACT_ADDRESSES[name] || '');
}

export function configuredContractNames() {
  return Object.keys(CONTRACT_ADDRESSES).filter(hasAddress);
}
