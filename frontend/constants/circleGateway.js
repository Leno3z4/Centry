export const GATEWAY_WALLET_ADDRESS = '0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE';
export const GATEWAY_MINTER_ADDRESS = '0x2222222d7164433c4C09B0b0D809a9b52C04C205';

export const CIRCLE_GATEWAY_API = 'https://gateway-api.circle.com';
export const CIRCLE_GATEWAY_HEADERS = {
  'Content-Type': 'application/json',
};

export const GATEWAY_MAINNET_CHAINS = [
  {
    id: 'arc-mainnet',
    name: 'Arc Mainnet',
    short: 'Arc',
    chainId: 5042,
    domain: 26,
    usdc: '0x3600000000000000000000000000000000000000',
    rpcUrl: 'https://rpc.mainnet.arc.io',
    explorerUrl: 'https://explorer.arc.io',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  },
  {
    id: 'base-mainnet',
    name: 'Base',
    short: 'Base',
    chainId: 8453,
    domain: 6,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 'arbitrum-mainnet',
    name: 'Arbitrum',
    short: 'Arbitrum',
    chainId: 42161,
    domain: 3,
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 'ethereum-mainnet',
    name: 'Ethereum',
    short: 'Ethereum',
    chainId: 1,
    domain: 0,
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
];

export const GATEWAY_WALLET_ABI = [
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [],
  },
];

export const ERC20_ALLOWANCE_ABI = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
];
