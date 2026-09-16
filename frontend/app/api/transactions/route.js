import { NextResponse } from 'next/server';

const EXPLORER_API = 'https://testnet.arcscan.app/api/v2';

export async function GET(request) {
  const address = new URL(request.url).searchParams.get('address')?.trim();

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ success: false, error: 'Valid wallet address is required.' }, { status: 400 });
  }

  try {
    const response = await fetch(`${EXPLORER_API}/addresses/${address}/transactions?filter=from`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 15 },
    });

    if (!response.ok) {
      return NextResponse.json({ success: false, error: 'Transaction history is temporarily unavailable.' }, { status: 502 });
    }

    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : [];

    return NextResponse.json({
      success: true,
      items: items.slice(0, 15).map((tx) => ({
        hash: tx.hash,
        timestamp: tx.timestamp,
        status: tx.status,
        method: tx.method || tx.transaction_types?.[0] || 'Transaction',
        from: tx.from?.hash || null,
        to: tx.to?.hash || null,
        value: tx.value || '0',
        fee: tx.fee?.value || null,
      })),
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Transaction history is temporarily unavailable.' }, { status: 502 });
  }
}
