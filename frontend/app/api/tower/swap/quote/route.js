import { NextResponse } from 'next/server';
import { ACTIVE_MARKETS } from '../../../../constants/markets';

const TOWER_BASE_URL = 'https://www.tower.exchange/api/public';

function validToken(value) {
  if (typeof value !== 'string' || value.length === 0) return false;

  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(value);
  const isSymbol = ACTIVE_MARKETS.some(
    (market) => market.symbol.toLowerCase() === value.toLowerCase(),
  );

  return isAddress || isSymbol;
}

function isStructurallyValidQuote(quote) {
  if (!quote || typeof quote !== 'object') return false;

  try {
    const output = BigInt(String(quote.outputAmount || '0'));
    const minOut = BigInt(String(quote.minOut || '0'));

    return output > 0n && minOut > 0n && minOut <= output;
  } catch {
    return false;
  }
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

    if (!validToken(inputToken) || !validToken(outputToken)) {
      return NextResponse.json(
        { success: false, error: 'Unsupported swap token.' },
        { status: 400 },
      );
    }

    if (String(inputToken).toLowerCase() === String(outputToken).toLowerCase()) {
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

    if (response.ok && data?.success === true && !isStructurallyValidQuote(data.data)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Tower returned an incomplete quote. Try refreshing the quote or using a smaller amount.',
        },
        { status: 422 },
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Unable to reach Tower for a swap quote.' },
      { status: 502 },
    );
  }
}
