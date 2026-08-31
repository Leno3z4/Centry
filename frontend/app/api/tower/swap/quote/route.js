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
    const { inputToken, outputToken, inputAmount, slippageTolerance = 50 } = body || {};

    if (!validAddress(inputToken) || !validAddress(outputToken)) {
      return NextResponse.json(
        { success: false, error: 'Invalid swap token address.' },
        { status: 400 },
      );
    }

    if (inputToken.toLowerCase() === outputToken.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Input and output tokens must be different.' },
        { status: 400 },
      );
    }

    if (!/^\d+$/.test(String(inputAmount || ''))) {
      return NextResponse.json(
        { success: false, error: 'inputAmount must be an integer base-unit amount.' },
        { status: 400 },
      );
    }

    const response = await fetch(`${TOWER_BASE_URL}/swap/quote`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputToken,
        outputToken,
        inputAmount: String(inputAmount),
        slippageTolerance: Number(slippageTolerance),
      }),
      cache: 'no-store',
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Unable to reach Tower for a swap quote.' },
      { status: 502 },
    );
  }
}
