import { CONTRACT_ADDRESSES } from './contracts';

export const MARKETS = [
  {
    id: 'usdc',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address: CONTRACT_ADDRESSES.USDC,
    kind: 'arc-native',
    status: 'live',
    description: 'Native Arc USDC used as Centry\'s stablecoin reserve.',
  },
  {
    id: 'eurc',
    symbol: 'EURC',
    name: 'Euro Coin',
    decimals: 6,
    address: '',
    kind: 'arc',
    status: 'coming-soon',
    description: 'Will be enabled only after its Arc deployment and oracle are verified.',
  },
  {
    id: 'usyc',
    symbol: 'USYC',
    name: 'Hashnote US Yield Coin',
    decimals: 6,
    address: '',
    kind: 'arc',
    status: 'coming-soon',
    description: 'Requires a dedicated collateral/risk model before lending support.',
  },
];

export const ACTIVE_MARKETS = MARKETS.filter(
  (market) => market.status === 'live' && market.address
);

export const UPCOMING_MARKETS = MARKETS.filter(
  (market) => market.status !== 'live'
);
