import { NextResponse } from 'next/server';

const EXPLORER_API = 'https://api.arc-scan.org/api';
const MAX_BLOCK_LOOKBACK = 200_000;

function explorerError(message = 'Transaction history is temporarily unavailable.') {
  return NextResponse.json({ success: false, error: message }, { status: 502 });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Centry/1.0 transaction-history',
    },
    next: { revalidate: 15 },
  });

  const data = await response.json().catch(() => null);
  return { response, data };
}

export async function GET(request) {
  const address = new URL(request.url).searchParams.get('address')?.trim();

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ success: false, error: 'Valid wallet address is required.' }, { status: 400 });
  }

  try {
    // Arcscan's account history index accepts bounded block windows. The old
    // implementation queried genesis -> 999999999, which can be rejected as
    // an oversized range and surfaced as "history unavailable".
    const headParams = new URLSearchParams({
      module: 'proxy',
      action: 'eth_blockNumber',
    });
    const headResult = await fetchJson(EXPLORER_API + '?' + headParams.toString());

    if (!headResult.response.ok || typeof headResult.data?.result !== 'string') {
      return explorerError();
    }

    const headBlock = Number.parseInt(headResult.data.result, 16);
    if (!Number.isSafeInteger(headBlock) || headBlock < 0) {
      return explorerError();
    }

    const startBlock = Math.max(0, headBlock - MAX_BLOCK_LOOKBACK);
    const params = new URLSearchParams({
      module: 'account',
      action: 'txlist',
      address,
      startblock: String(startBlock),
      endblock: String(headBlock),
      page: '1',
      offset: '15',
      sort: 'desc',
    });

    const { response, data } = await fetchJson(EXPLORER_API + '?' + params.toString());

    if (!response.ok) {
      return explorerError();
    }

    if (data?.status === '0' && !Array.isArray(data?.result)) {
      return explorerError(data?.result || data?.message || 'Transaction history is temporarily unavailable.');
    }

    const result = Array.isArray(data?.result) ? data.result : [];

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
    return explorerError();
  }
}
