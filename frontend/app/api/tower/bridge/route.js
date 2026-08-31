import { NextResponse } from 'next/server';

const TOWER_BASE_URL = 'https://www.tower.exchange/api/public';
const ARC_CHAIN_ID = 5042002;

const SUPPORTED_CHAINS = new Set([
  11155111,
  84532,
  421614,
  ARC_CHAIN_ID,
  43113,
  11155420,
  80002,
  1301,
]);

function isAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

export async function POST(request) {
  const apiKey = process.env.TOWER_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        success: false,
        error: 'Tower is not configured. Set TOWER_API_KEY on the server.',
      },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const {
      fromChainId,
      toChainId,
      amount,
      recipientAddress,
      senderAddress,
      useForwarder = true,
    } = body || {};

    const from = Number(fromChainId);
    const to = Number(toChainId);

    if (!SUPPORTED_CHAINS.has(from) || !SUPPORTED_CHAINS.has(to)) {
      return NextResponse.json(
        { success: false, error: 'Unsupported bridge network.' },
        { status: 400 },
      );
    }

    if (from === to) {
      return NextResponse.json(
        {
          success: false,
          error: 'Source and destination networks must be different.',
        },
        { status: 400 },
      );
    }

    if (!isAddress(recipientAddress) || (senderAddress && !isAddress(senderAddress))) {
      return NextResponse.json(
        { success: false, error: 'Invalid wallet address.' },
        { status: 400 },
      );
    }

    if (
      typeof amount !== 'string' ||
      !/^\d+(\.\d{1,6})?$/.test(amount) ||
      Number(amount) <= 0
    ) {
      return NextResponse.json(
        { success: false, error: 'Enter a valid USDC amount.' },
        { status: 400 },
      );
    }

    const response = await fetch(`${TOWER_BASE_URL}/bridge`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fromChainId: from,
        toChainId: to,
        amount,
        token: 'USDC',
        recipientAddress,
        ...(senderAddress ? { senderAddress } : {}),
        useForwarder: Boolean(useForwarder),
      }),
      cache: 'no-store',
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Unable to reach Tower for the bridge request.',
      },
      { status: 502 },
    );
  }
}
