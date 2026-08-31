import { NextResponse } from 'next/server';

const TOWER_BASE_URL = 'https://www.tower.exchange/api/public';

const SUPPORTED = {
  'base-sepolia': {
    rpcUrl: 'https://sepolia.base.org',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  'arbitrum-sepolia': {
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  },
  'ethereum-sepolia': {
    // Use Tower's authenticated RPC proxy instead of a third-party
    // free-tier Sepolia endpoint that can reject eth_call requests.
    chainId: 11155111,
    rpcUrl: `${TOWER_BASE_URL}/rpc/11155111`,
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
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
        chainId,
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
