import { NextResponse } from 'next/server';

const TOWER_BASE_URL = 'https://www.tower.exchange/api/public';

const SUPPORTED_CHAINS = new Set([
  1,
  10,
  137,
  8453,
  42161,
  43114,
  5042,
]);

function isAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function findTransactionHash(value, seen = new Set(), depth = 0) {
  if (typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value)) return value;
  if (!value || typeof value !== 'object' || depth > 6 || seen.has(value)) return null;
  seen.add(value);

  for (const key of ['transactionHash', 'txHash', 'hash']) {
    const candidate = value?.[key];
    if (typeof candidate === 'string' && /^0x[a-fA-F0-9]{64}$/.test(candidate)) return candidate;
  }

  for (const key of ['transaction', 'tx', 'bridge', 'data', 'result', 'response']) {
    const nested = findTransactionHash(value?.[key], seen, depth + 1);
    if (nested) return nested;
  }

  return null;
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
    const { fromChainId, toChainId, amount, recipientAddress, senderAddress, useForwarder = true } = body || {};
    const from = Number(fromChainId);
    const to = Number(toChainId);

    if (!SUPPORTED_CHAINS.has(from) || !SUPPORTED_CHAINS.has(to)) {
      return NextResponse.json({ success: false, error: 'Unsupported mainnet bridge network.' }, { status: 400 });
    }
    if (from === to) {
      return NextResponse.json({ success: false, error: 'Source and destination networks must be different.' }, { status: 400 });
    }
    if (!isAddress(recipientAddress) || (senderAddress && !isAddress(senderAddress))) {
      return NextResponse.json({ success: false, error: 'Invalid wallet address.' }, { status: 400 });
    }
    if (typeof amount !== 'string' || !/^\d+(\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) {
      return NextResponse.json({ success: false, error: 'Enter a valid USDC amount.' }, { status: 400 });
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
    const transactionHash = findTransactionHash(data);
    const status = data?.status ?? data?.data?.status ?? data?.result?.status ?? null;
    const estimatedTime = data?.estimatedTime ?? data?.data?.estimatedTime ?? data?.result?.estimatedTime ?? null;

    console.info('[tower-bridge] response', {
      httpStatus: response.status,
      success: data?.success === true,
      topLevelKeys: data && typeof data === 'object' ? Object.keys(data) : [],
      dataKeys: data?.data && typeof data.data === 'object' ? Object.keys(data.data) : [],
      resultKeys: data?.result && typeof data.result === 'object' ? Object.keys(data.result) : [],
      hasTransactionHash: Boolean(transactionHash),
      status: status || null,
      estimatedTime: estimatedTime || null,
    });

    return NextResponse.json(
      { ...data, ...(transactionHash ? { transactionHash } : {}), ...(status ? { status } : {}), ...(estimatedTime ? { estimatedTime } : {}) },
      { status: response.status },
    );
  } catch {
    return NextResponse.json({ success: false, error: 'Unable to reach Tower for the bridge request.' }, { status: 502 });
  }
}
