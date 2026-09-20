import { NextResponse } from 'next/server';

const TOWER_BASE_URL = 'https://www.tower.exchange/api/public';
const ARC_RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL || process.env.ARC_RPC_URL || 'https://rpc.mainnet.arc.io';

const SUPPORTED = {
  'base-mainnet': {
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  'arbitrum-mainnet': {
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  'ethereum-mainnet': {
    chainId: 1,
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  'arc-mainnet': {
    chainId: 5042,
    rpcUrl: ARC_RPC_URL,
    usdc: '0x3600000000000000000000000000000000000000',
  },
};

function isAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

export async function POST(request) {
  const apiKey = process.env.TOWER_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: 'Tower is not configured. Set TOWER_API_KEY on the server.' },
      { status: 503 },
    );
  }

  try {
    const { address, chainId } = await request.json();

    if (!isAddress(address) || !SUPPORTED[chainId]) {
      return NextResponse.json(
        { success: false, error: 'Unsupported chain or invalid wallet address.' },
        { status: 400 },
      );
    }

    const network = SUPPORTED[chainId];
    const response = await fetch(`${TOWER_BASE_URL}/wallet/balance`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address,
        chainId: Number(network.chainId || chainId),
        rpcUrl: network.rpcUrl,
        tokenAddress: network.usdc,
        balanceType: 'token',
      }),
      cache: 'no-store',
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Unable to query the source-chain USDC balance.' },
      { status: 502 },
    );
  }
}
