import { NextResponse } from 'next/server';
import { createPublicClient, defineChain, fallback, http, getAddress, encodeFunctionData, decodeFunctionResult } from 'viem';
import { MARKETS } from '../../../../constants/markets';

const ARC_CHAIN_ID = 5042002;
const FACTORY = '0xd67F63A4F26a497b364d1C82e6747Aec8B5743a5';
const WUSDC = '0x911b4000D3422F482F4062a913885f7b035382Df';
const CENT = '0x76e6d50D3151f0B4645ac0E53584F4204Fc6f0e3';
const ZERO = '0x0000000000000000000000000000000000000000';
const MAX_DISPLAY_POOLS = 24;
const SEARCH_RESULT_LIMIT = 50;
const RPC_TIMEOUT_MS = 4_000;
const REQUEST_TIMEOUT_MS = 12_000;
const REGISTRY_TTL_MS = 60_000;
const CACHE_TTL_MS = 30_000;
const META_CACHE_TTL_MS = 10 * 60_000;
const BATCH_SIZE = 100;
const BATCH_CONCURRENCY = 4;
const SEARCH_POOL_BATCH_SIZE = 1_000;

const FACTORY_ABI = [
  { type: 'function', name: 'allPairsLength', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allPairs', stateMutability: 'view', inputs: [{ name: 'index', type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'getPair', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'address' }] },
];

const PAIR_ABI = [
  { type: 'function', name: 'token0', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'token1', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'getReserves', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
];

const ERC20_ABI = {
  symbol: [{ type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] }],
  name: [{ type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] }],
  decimals: [{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }],
};

const RPC_URLS = [
  process.env.ARC_RPC_URL,
  process.env.NEXT_PUBLIC_ARC_RPC_URL,
  'https://rpc.testnet.arc.network',
  'https://rpc.quicknode.testnet.arc.network',
  'https://rpc.blockdaemon.testnet.arc.network',
].filter(Boolean);

const KNOWN_META = new Map(
  MARKETS.filter((m) => m?.address).map((m) => [m.address.toLowerCase(), {
    symbol: m.symbol,
    name: m.name,
    decimals: Number(m.decimals ?? 18),
    address: m.address,
  }]),
);
KNOWN_META.set(WUSDC.toLowerCase(), { symbol: 'USDC', name: 'USD Coin', decimals: 18, address: WUSDC });

let recentPairsCache = null;
let recentCache = null;
const searchCache = new Map();
const tokenMetadataCache = new Map();

function validAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeAddress(value) {
  if (!validAddress(value)) return null;
  try { return getAddress(value.toLowerCase()); } catch { return null; }
}

function createClient() {
  return createPublicClient({
    chain: defineChain({
      id: ARC_CHAIN_ID,
      name: 'Arc Testnet',
      nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
      rpcUrls: { default: { http: RPC_URLS } },
    }),
    transport: fallback(
      RPC_URLS.map((url) => http(url, { timeout: RPC_TIMEOUT_MS, retryCount: 0 })),
      { rank: true, retryCount: 0 },
    ),
  });
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function rpcBatch(calls) {
  if (!calls.length) return [];
  const body = calls.map((call, index) => ({ jsonrpc: '2.0', id: index + 1, method: 'eth_call', params: [call, 'latest'] }));
  let lastError = null;
  for (const url of RPC_URLS) {
    try {
      const response = await withTimeout(fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      }), RPC_TIMEOUT_MS, 'Arc RPC request timed out.');
      if (!response.ok) throw new Error(`Arc RPC HTTP ${response.status}`);
      const results = await response.json();
      if (!Array.isArray(results)) throw new Error('Arc RPC does not support JSON-RPC batching.');
      return results.sort((a, b) => Number(a.id) - Number(b.id));
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('All Arc RPC endpoints failed.');
}

async function batchEthCalls(calls) {
  if (!calls.length) return [];
  const chunks = [];
  for (let i = 0; i < calls.length; i += BATCH_SIZE) chunks.push(calls.slice(i, i + BATCH_SIZE));
  const output = new Array(chunks.length);
  for (let start = 0; start < chunks.length; start += BATCH_CONCURRENCY) {
    const group = chunks.slice(start, start + BATCH_CONCURRENCY);
    const responses = await Promise.all(group.map((chunk) => rpcBatch(chunk)));
    responses.forEach((response, i) => { output[start + i] = response; });
  }
  return output.flat();
}

function encodedCall(address, abi, functionName, args = []) {
  return { to: address, data: encodeFunctionData({ abi, functionName, args }) };
}

function decodeCall(result, abi, functionName) {
  if (!result || typeof result !== 'string' || result === '0x') return null;
  try { return decodeFunctionResult({ abi, functionName, data: result }); } catch { return null; }
}

async function loadPairCount(client) {
  const length = await withTimeout(
    client.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'allPairsLength' }),
    REQUEST_TIMEOUT_MS,
    'UnitFlow factory lookup timed out.',
  );
  const numeric = Number(length);
  if (!Number.isSafeInteger(numeric) || numeric < 0) throw new Error('UnitFlow factory returned an invalid pool count.');
  return numeric;
}

async function loadPairIndexes(start, count) {
  if (count <= 0) return [];
  const calls = Array.from({ length: count }, (_, offset) => encodedCall(FACTORY, FACTORY_ABI, 'allPairs', [BigInt(start + offset)]));
  const responses = await withTimeout(batchEthCalls(calls), REQUEST_TIMEOUT_MS, 'UnitFlow pool registry batch timed out.');
  return responses.map((item) => normalizeAddress(decodeCall(item?.result, FACTORY_ABI, 'allPairs')?.[0]))
    .filter((pair) => pair && pair.toLowerCase() !== ZERO);
}

async function loadRecentPairs(client) {
  const count = await loadPairCount(client);
  if (recentPairsCache && recentPairsCache.length === count && Date.now() - recentPairsCache.timestamp < REGISTRY_TTL_MS) {
    return { length: count, pairs: recentPairsCache.pairs };
  }
  const take = Math.min(MAX_DISPLAY_POOLS, count);
  const pairs = await loadPairIndexes(Math.max(0, count - take), take);
  recentPairsCache = { timestamp: Date.now(), length: count, pairs };
  return { length: count, pairs };
}

async function loadPairEndpoints(pairs) {
  if (!pairs.length) return [];
  const responses = await withTimeout(batchEthCalls(pairs.flatMap((pair) => [
    encodedCall(pair, PAIR_ABI, 'token0'),
    encodedCall(pair, PAIR_ABI, 'token1'),
  ])), REQUEST_TIMEOUT_MS, 'UnitFlow token lookup timed out.');
  return pairs.map((pair, i) => ({
    pair,
    token0: normalizeAddress(decodeCall(responses[i * 2]?.result, PAIR_ABI, 'token0')?.[0]),
    token1: normalizeAddress(decodeCall(responses[i * 2 + 1]?.result, PAIR_ABI, 'token1')?.[0]),
  }));
}

function fallbackMeta(address) {
  if (!address) return { symbol: 'Unknown', name: 'Unknown token', decimals: 18, address: null };
  return { symbol: `${address.slice(0, 6)}…${address.slice(-4)}`, name: `Unknown token (${address.slice(0, 6)}…${address.slice(-4)})`, decimals: 18, address };
}

async function getAllTokenMeta(tokens) {
  const result = new Map();
  const missing = [];
  for (const raw of tokens) {
    const token = normalizeAddress(raw);
    if (!token) continue;
    const key = token.toLowerCase();
    const known = KNOWN_META.get(key);
    if (known) result.set(key, known);
    else {
      const cached = tokenMetadataCache.get(key);
      if (cached && Date.now() - cached.timestamp < META_CACHE_TTL_MS) result.set(key, cached.meta);
      else missing.push(token);
    }
  }
  if (!missing.length) return result;
  const responses = await withTimeout(batchEthCalls(missing.flatMap((token) => [
    encodedCall(token, ERC20_ABI.symbol, 'symbol'),
    encodedCall(token, ERC20_ABI.name, 'name'),
    encodedCall(token, ERC20_ABI.decimals, 'decimals'),
  ])), REQUEST_TIMEOUT_MS, 'UnitFlow token metadata timed out.');
  missing.forEach((token, i) => {
    const base = fallbackMeta(token);
    const symbol = decodeCall(responses[i * 3]?.result, ERC20_ABI.symbol, 'symbol')?.[0];
    const name = decodeCall(responses[i * 3 + 1]?.result, ERC20_ABI.name, 'name')?.[0];
    const decimals = decodeCall(responses[i * 3 + 2]?.result, ERC20_ABI.decimals, 'decimals')?.[0];
    const meta = { symbol: symbol !== undefined ? String(symbol) : base.symbol, name: name !== undefined ? String(name) : base.name, decimals: decimals !== undefined ? Number(decimals) : 18, address: token };
    result.set(token.toLowerCase(), meta);
    tokenMetadataCache.set(token.toLowerCase(), { timestamp: Date.now(), meta });
  });
  return result;
}

function liquidityScore(a, b, da, db) {
  const scale = (v, d) => { const n = Number(d ?? 18); return n < 18 ? v * 10n ** BigInt(18 - n) : n > 18 ? v / 10n ** BigInt(n - 18) : v; };
  const x = scale(a, da) * scale(b, db);
  if (x <= 0n) return 0n;
  let r = x, n = (r + 1n) >> 1n;
  while (n < r) { r = n; n = (r + x / r) >> 1n; }
  return r;
}

async function hydratePairs(records, wallet) {
  const unique = [...new Map(records.map((r) => [r.pair.toLowerCase(), r])).values()];
  if (!unique.length) return [];
  const meta = await getAllTokenMeta(unique.flatMap((r) => [r.token0, r.token1]));
  const calls = unique.flatMap((r) => [
    encodedCall(r.pair, PAIR_ABI, 'getReserves'),
    encodedCall(r.pair, PAIR_ABI, 'totalSupply'),
    ...(wallet ? [encodedCall(r.pair, PAIR_ABI, 'balanceOf', [wallet])] : []),
  ]);
  const responses = await withTimeout(batchEthCalls(calls), REQUEST_TIMEOUT_MS, 'UnitFlow pool details timed out.');
  const stride = wallet ? 3 : 2;
  return unique.map((r, i) => {
    const m0 = meta.get(r.token0?.toLowerCase()) || fallbackMeta(r.token0);
    const m1 = meta.get(r.token1?.toLowerCase()) || fallbackMeta(r.token1);
    const reserves = decodeCall(responses[i * stride]?.result, PAIR_ABI, 'getReserves') || [0n, 0n, 0];
    const totalSupply = decodeCall(responses[i * stride + 1]?.result, PAIR_ABI, 'totalSupply')?.[0] ?? 0n;
    const lpBalance = wallet ? decodeCall(responses[i * stride + 2]?.result, PAIR_ABI, 'balanceOf')?.[0] ?? 0n : 0n;
    const reserve0 = BigInt(reserves[0] ?? 0), reserve1 = BigInt(reserves[1] ?? 0);
    return {
      pair: r.pair,
      token0: r.token0,
      token1: r.token1,
      token0Meta: m0,
      token1Meta: m1,
      reserve0: reserve0.toString(),
      reserve1: reserve1.toString(),
      totalSupply: String(totalSupply),
      lpBalance: String(lpBalance),
      hasPosition: Boolean(wallet && lpBalance > 0n),
      featured: Boolean(r.token0 && r.token0.toLowerCase() === CENT.toLowerCase()) || Boolean(r.token1 && r.token1.toLowerCase() === CENT.toLowerCase()),
      liquidityScore: liquidityScore(reserve0, reserve1, m0.decimals, m1.decimals).toString(),
    };
  });
}

function queryKnownAddress(query) {
  const key = query.trim().toLowerCase();
  const exact = normalizeAddress(query);
  if (exact) return exact;
  for (const meta of KNOWN_META.values()) if (meta.symbol?.toLowerCase() === key || meta.name?.toLowerCase() === key) return meta.address;
  return null;
}

async function inspectPair(pair, wallet) {
  const records = await loadPairEndpoints([pair]);
  if (!records[0]?.token0 && !records[0]?.token1) return [];
  return hydratePairs(records, wallet);
}

async function searchRegistry(client, query, wallet) {
  const pairCount = await loadPairCount(client);
  const q = query.trim().toLowerCase();
  const knownAddress = queryKnownAddress(query);
  const cacheKey = `${wallet?.toLowerCase() || ''}:${q}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return { count: pairCount, pools: cached.pools };

  if (validAddress(query)) {
    const direct = await inspectPair(normalizeAddress(query), wallet);
    if (direct.length) {
      searchCache.set(cacheKey, { timestamp: Date.now(), pools: direct });
      return { count: pairCount, pools: direct };
    }
  }

  const matched = [];
  const totalBatches = Math.ceil(pairCount / SEARCH_POOL_BATCH_SIZE);
  for (let batch = 0; batch < totalBatches; batch += 1) {
    const end = pairCount - batch * SEARCH_POOL_BATCH_SIZE;
    const start = Math.max(0, end - SEARCH_POOL_BATCH_SIZE);
    const pairs = await loadPairIndexes(start, end - start);
    const records = await loadPairEndpoints(pairs);
    if (knownAddress) {
      for (const r of records) {
        if (r.token0?.toLowerCase() === knownAddress.toLowerCase() || r.token1?.toLowerCase() === knownAddress.toLowerCase()) matched.push(r);
        if (matched.length >= SEARCH_RESULT_LIMIT) break;
      }
    } else {
      const metadata = await getAllTokenMeta(records.flatMap((r) => [r.token0, r.token1]));
      for (const r of records) {
        const m0 = metadata.get(r.token0?.toLowerCase()) || fallbackMeta(r.token0);
        const m1 = metadata.get(r.token1?.toLowerCase()) || fallbackMeta(r.token1);
        const haystack = [r.pair, r.token0, r.token1, m0.name, m0.symbol, m1.name, m1.symbol].filter(Boolean).join(' ').toLowerCase();
        if (haystack.includes(q)) matched.push(r);
        if (matched.length >= SEARCH_RESULT_LIMIT) break;
      }
    }
    if (matched.length >= SEARCH_RESULT_LIMIT) break;
  }
  const pools = await hydratePairs(matched.slice(0, SEARCH_RESULT_LIMIT), wallet);
  searchCache.set(cacheKey, { timestamp: Date.now(), pools });
  return { count: pairCount, pools };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim() || '';
    const wallet = normalizeAddress(searchParams.get('address'));
    const client = createClient();
    if (!query) {
      const { length, pairs } = await loadRecentPairs(client);
      const pools = await hydratePairs(await loadPairEndpoints(pairs), wallet);
      pools.sort((a, b) => { const aa = BigInt(a.liquidityScore || 0), bb = BigInt(b.liquidityScore || 0); return aa === bb ? 0 : aa > bb ? -1 : 1; });
      return NextResponse.json({ success: true, data: { count: length, loaded: pools.length, displayLimit: MAX_DISPLAY_POOLS, mode: 'recent', pools, wallet, searched: false } });
    }
    const { count, pools } = await searchRegistry(client, query, wallet);
    return NextResponse.json({ success: true, data: { count, loaded: pools.length, displayLimit: SEARCH_RESULT_LIMIT, mode: 'search', pools, wallet, searched: true, query } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load UnitFlow pools.';
    return NextResponse.json({ success: false, error: message }, { status: /timed out/i.test(message) ? 504 : 502 });
  }
}
