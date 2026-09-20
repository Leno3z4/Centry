import { NextResponse } from 'next/server';

const EXPLORER_API = 'https://api.arc-scan.org/api';

export async function GET(request) {
  const address = new URL(request.url).searchParams.get('address')?.trim();

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ success: false, error: 'Valid wallet address is required.' }, { status: 400 });
  }

  try {
    const params = new URLSearchParams({
      module: 'account',
      action: 'txlist',
      address,
      startblock: '0',
      endblock: '999999999',
      page: '1',
      offset: '15',
      sort: 'desc',
    });

    const response = await fetch(`${EXPLORER_API}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 15 },
    });

    if (!response.ok) {
      return NextResponse.json({ success: false, error: 'Transaction history is temporarily unavailable.' }, { status: 502 });
    }

    const data = await response.json();
    const result = Array.isArray(data?.result) ? data.result : [];
    if (data?.status === '0' && !Array.isArray(data?.result)) {
      return NextResponse.json({ success: false, error: data?.message || 'Transaction history is temporarily unavailable.' }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      items: result.map((tx) => ({
        hash: tx.hash,
        timestamp: tx.timeStamp ? new Date(Number(tx.timeStamp) * 1000).toISOString() : null,
        status: tx.isError === '1' ? 'error' : 'ok',
        method: tx.functionName || tx.methodId || 'Transaction',
        from: tx.from || null,
        to: tx.to || null,
        value: tx.value || '0',
        fee: tx.gasUsed && tx.gasPrice ? (BigInt(tx.gasUsed) * BigInt(tx.gasPrice)).toString() : null,
      })),
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Transaction history is temporarily unavailable.' }, { status: 502 });
  }
}
