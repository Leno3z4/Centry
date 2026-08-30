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
    address: CONTRACT_ADDRESSES.EURC,
    kind: 'arc',
    status: 'live',
    description: 'Arc-native euro stablecoin enabled for the Centry lending reserve.',
  },
  {
    id: 'cirbtc',
    symbol: 'cirBTC',
    name: 'Circle Wrapped Bitcoin',
    decimals: 8,
    address: CONTRACT_ADDRESSES.CIRBTC,
    kind: 'arc',
    status: 'live',
    description: 'Circle Wrapped Bitcoin enabled for the Centry lending reserve.',
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
