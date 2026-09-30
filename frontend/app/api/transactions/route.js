import { NextResponse } from 'next/server';

const BLOCKSCOUT_API = 'https://explorer.arc.io/api/v2';
const ARCSCAN_API = 'https://api.arc-scan.org/api';
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
    cache: 'no-store',
  });

  const data = await response.json().catch(() => null);
  return { response, data };
}

function readAddress(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.hash || value.address_hash || null;
}

function normalizeBlockscoutTransaction(tx) {
  const fee =
    tx?.fee?.value ??
    tx?.fee ??
    (tx?.gas_used && (tx?.gas_price?.value ?? tx?.gas_price)
      ? (BigInt(tx.gas_used) * BigInt(tx.gas_price?.value ?? tx.gas_price)).toString()
      : null);

  const status = String(tx?.status || tx?.result || '').toLowerCase();

  return {
    hash: tx?.hash || null,
    timestamp: tx?.timestamp || null,
    status: status === 'success' || status === 'ok' ? 'ok' : status === 'error' || status === 'fail' || status === 'failed' ? 'error' : 'ok',
    method: tx?.method || tx?.decoded_input?.method_call || tx?.decoded_input?.method || 'Transaction',
    from: readAddress(tx?.from),
    to: readAddress(tx?.to),
    value: tx?.value ?? '0',
    fee,
  };
}

function normalizeArcscanTransaction(tx) {
  return {
    hash: tx?.hash || null,
    timestamp: tx?.timeStamp ? new Date(Number(tx.timeStamp) * 1000).toISOString() : null,
    status: tx?.isError === '1' ? 'error' : 'ok',
    method: tx?.functionName || tx?.methodId || 'Transaction',
    from: tx?.from || null,
    to: tx?.to || null,
    value: tx?.value || '0',
    fee: tx?.gasUsed && tx?.gasPrice ? (BigInt(tx.gasUsed) * BigInt(tx.gasPrice)).toString() : null,
  };
}

async function fetchBlockscoutHistory(address) {
  const params = new URLSearchParams({
    filter: 'from',
    limit: '15',
  });
  const fromResult = await fetchJson(
    \`\${BLOCKSCOUT_API}/addresses/\${address}/transactions?\${params.toString()}\`
  );

  if (fromResult.response.ok && Array.isArray(fromResult.data?.items)) {
    return fromResult.data.items.map(normalizeBlockscoutTransaction).filter((tx) => tx.hash);
  }

  const toParams = new URLSearchParams({
    filter: 'to',
    limit: '15',
  });
  const toResult = await fetchJson(
    \`\${BLOCKSCOUT_API}/addresses/\${address}/transactions?\${toParams.toString()}\`
  );

  if (toResult.response.ok && Array.isArray(toResult.data?.items)) {
    return toResult.data.items.map(normalizeBlockscoutTransaction).filter((tx) => tx.hash);
  }

  return null;
}

async function fetchArcscanHistory(address) {
  const headParams = new URLSearchParams({
    module: 'proxy',
    action: 'eth_blockNumber',
  });
  const headResult = await fetchJson(ARCSCAN_API + '?' + headParams.toString());

  if (!headResult.response.ok || typeof headResult.data?.result !== 'string') {
    return null;
  }

  const headBlock = Number.parseInt(headResult.data.result, 16);
  if (!Number.isSafeInteger(headBlock) || headBlock < 0) {
    return null;
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

  const { response, data } = await fetchJson(ARCSCAN_API + '?' + params.toString());
  if (!response.ok || !Array.isArray(data?.result)) return null;

  return data.result.map(normalizeArcscanTransaction).filter((tx) => tx.hash);
}

export async function GET(request) {
  const address = new URL(request.url).searchParams.get('address')?.trim();

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ success: false, error: 'Valid wallet address is required.' }, { status: 400 });
  }

  try {
    // Blockscout is the same explorer linked by the Centry transaction UI and
    // exposes an indexed address transaction feed. Arcscan remains a fallback
    // for resilience if the explorer API is unavailable.
    const blockscoutItems = await fetchBlockscoutHistory(address);
    const items = blockscoutItems ?? await fetchArcscanHistory(address);

    if (items === null) {
      return explorerError();
    }

    return NextResponse.json({ success: true, items });
  } catch {
    return explorerError();
  }
}
