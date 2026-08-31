import { NextResponse } from 'next/server';

const TOWER_BASE_URL = 'https://www.tower.exchange/api/public';
const ARC_CHAIN_ID = 5042002;

function validAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value || '');
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
    const body = await request.json();
    const { quote, userAddress } = body || {};

    if (!quote || typeof quote !== 'object') {
      return NextResponse.json(
        { success: false, error: 'A Tower quote is required.' },
        { status: 400 },
      );
    }

    if (!validAddress(userAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid wallet address.' },
        { status: 400 },
      );
    }

    if (Number(quote.chainId || ARC_CHAIN_ID) !== ARC_CHAIN_ID) {
      return NextResponse.json(
        { success: false, error: 'Only Arc Testnet swaps are enabled in Centry right now.' },
        { status: 400 },
      );
    }

    const response = await fetch(`${TOWER_BASE_URL}/swap/build-tx`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ quote, userAddress }),
      cache: 'no-store',
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Unable to build the Tower swap transaction.' },
      { status: 502 },
    );
  }
}
