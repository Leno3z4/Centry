export const GATEWAY_WALLET_ADDRESS = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
export const GATEWAY_MINTER_ADDRESS = '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B';

export const CIRCLE_GATEWAY_TESTNET_API = 'https://gateway-api-testnet.circle.com';
export const GATEWAY_ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

export const GATEWAY_TESTNET_CHAINS = [
  {
    id: 'arc-testnet',
    name: 'Arc Testnet',
    short: 'Arc',
    chainId: 5042002,
    domain: 26,
    usdc: '0x3600000000000000000000000000000000000000',
    rpcUrl: 'https://rpc.testnet.arc.network',
    explorerUrl: 'https://testnet.arcscan.app',
    nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
  },
  {
    id: 'base-sepolia',
    name: 'Base Sepolia',
    short: 'Base',
    chainId: 84532,
    domain: 6,
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    rpcUrl: 'https://sepolia.base.org',
    explorerUrl: 'https://sepolia.basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 'arbitrum-sepolia',
    name: 'Arbitrum Sepolia',
    short: 'Arbitrum',
    chainId: 421614,
    domain: 3,
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    explorerUrl: 'https://sepolia.arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 'ethereum-sepolia',
    name: 'Ethereum Sepolia',
    short: 'Ethereum',
    chainId: 11155111,
    domain: 0,
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    rpcUrl: 'https://rpc.sepolia.org',
    explorerUrl: 'https://sepolia.etherscan.io',
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

export const GATEWAY_MINTER_ABI = [
  {
    type: 'function',
    name: 'gatewayMint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'attestationPayload', type: 'bytes' },
      { name: 'signature', type: 'bytes' },
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
    outputs: [{ name: '', type: 'bool' }],
  },
];

export const GATEWAY_EIP712_TYPES = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
  ],
  TransferSpec: [
    { name: 'version', type: 'uint32' },
    { name: 'sourceDomain', type: 'uint32' },
    { name: 'destinationDomain', type: 'uint32' },
    { name: 'sourceContract', type: 'bytes32' },
    { name: 'destinationContract', type: 'bytes32' },
    { name: 'sourceToken', type: 'bytes32' },
    { name: 'destinationToken', type: 'bytes32' },
    { name: 'sourceDepositor', type: 'bytes32' },
    { name: 'destinationRecipient', type: 'bytes32' },
    { name: 'sourceSigner', type: 'bytes32' },
    { name: 'destinationCaller', type: 'bytes32' },
    { name: 'value', type: 'uint256' },
    { name: 'salt', type: 'bytes32' },
    { name: 'hookData', type: 'bytes' },
  ],
  BurnIntent: [
    { name: 'maxBlockHeight', type: 'uint256' },
    { name: 'maxFee', type: 'uint256' },
    { name: 'spec', type: 'TransferSpec' },
  ],
};

export const GATEWAY_EIP712_DOMAIN = {
  name: 'GatewayWallet',
  version: '1',
};
