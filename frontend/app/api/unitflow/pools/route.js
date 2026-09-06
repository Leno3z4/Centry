import { NextResponse } from 'next/server';
import { createPublicClient, defineChain, fallback, http, getAddress } from 'viem';
import { MARKETS } from '../../../../constants/markets';

const ARC_CHAIN_ID = 5042002;
const FACTORY = '0xd67F63A4F26a497b364d1C82e6747Aec8B5743a5';
const WUSDC = '0x911b4000D3422F482F4062a913885f7b035382Df';
const CENT = '0x76e6d50D3151f0B4645ac0E53584F4204Fc6f0e3';
const ZERO = '0x0000000000000000000000000000000000000000';
const MAX_DISPLAY_POOLS = 24;
const SEARCH_RESULT_LIMIT = 50;
const RPC_TIMEOUT_MS = 4000;
const REQUEST_TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 30000;
const META_CACHE_TTL_MS = 10 * 60_000;
const LOG_PAGE_SIZE = 1000;
const MAX_LOG_PAGES = 50;
const ARCSCAN_API = 'https://api-testnet.arc-scan.org';
const PAIR_CREATED_TOPIC = '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e';

const FACTORY_ABI = [
  { type: 'function', name: 'allPairsLength', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allPairs', stateMutability: 'view', inputs: [{ name: 'index', type: 'uint256' }], outputs: [{ type: 'address' }] },
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
  'https://rpc-testnet.arc-scan.org',
  'https://rpc.testnet.arc.network',
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

const tokenMetadataCache = new Map();
const searchCache = new Map();
let recentCache = null;

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

function timeoutPromise(ms, message) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
}

async function withTimeout(promise, ms, message) {
  return Promise.race([promise, timeoutPromise(ms, message)]);
}

async function readMany(client, calls, concurrency = 12) {
  const output = new Array(calls.length);
  for (let start = 0; start < calls.length; start += concurrency) {
    const group = calls.slice(start, start + concurrency);
    const results = await Promise.allSettled(group.map((call) => withTimeout(client.readContract(call), RPC_TIMEOUT_MS, 'Arc RPC call timed out.')));
    results.forEach((result, i) => { output[start + i] = result.status === 'fulfilled' ? result.value : null; });
  }
  return output;
}

async function loadPairCount(client) {
  const value = await withTimeout(
    client.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'allPairsLength' }),
    REQUEST_TIMEOUT_MS,
    'UnitFlow factory lookup timed out.',
  );
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('UnitFlow factory returned an invalid pool count.');
  return count;
}

async function loadPairIndexes(client, start, count) {
  if (count <= 0) return [];
  const values = await readMany(client, Array.from({ length: count }, (_, offset) => ({
    address: FACTORY, abi: FACTORY_ABI, functionName: 'allPairs', args: [BigInt(start + offset)],
  })));
  return values.map(normalizeAddress).filter((pair) => pair && pair.toLowerCase() !== ZERO);
}

function extractLogs(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.logs)) return body.logs;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.result)) return body.result;
  return [];
}

function extractNextCursor(body) {
  return body?.page?.next ?? body?.next_cursor ?? body?.nextCursor ?? body?.pagination?.next ?? null;
}

async function fetchPairLogPage(cursor = null) {
  const params = new URLSearchParams({ limit: String(LOG_PAGE_SIZE), topic0: PAIR_CREATED_TOPIC });
  if (cursor) params.set('cursor', cursor);
  const url = `${ARCSCAN_API}/v1/address/${FACTORY}/logs?${params.toString()}`;
  const response = await withTimeout(fetch(url, { cache: 'no-store' }), 5000, 'Arcscan index request timed out.');
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Arcscan index request failed (${response.status}).`);
  if (body?.error) throw new Error('Arcscan index unavailable.');
  return { logs: extractLogs(body), next: extractNextCursor(body) };
}

function addressFromTopic(topic) {
  if (typeof topic !== 'string' || topic.length < 42) return null;
  return normalizeAddress(`0x${topic.slice(-40)}`);
}

function pairFromLog(log) {
  const topics = Array.isArray(log?.topics) ? log.topics : [];
  const data = typeof log?.data === 'string' ? log.data : '';
  const token0 = addressFromTopic(topics[1]);
  const token1 = addressFromTopic(topics[2]);
  const pairWord = data.startsWith('0x') ? data.slice(2, 66) : '';
  const pair = pairWord.length === 64 ? normalizeAddress(`0x${pairWord.slice(24)}`) : null;
  return pair && token0 && token1 ? { pair, token0, token1 } : null;
}

async function loadRecentRegistryRecords(client, count) {
  try {
    const page = await fetchPairLogPage();
    const records = page.logs.map(pairFromLog).filter(Boolean).slice(0, MAX_DISPLAY_POOLS);
    if (records.length) return { records, source: 'arcscan' };
  } catch {}

  const take = Math.min(MAX_DISPLAY_POOLS, count);
  const pairs = await loadPairIndexes(client, Math.max(0, count - take), take);
  const values = await readMany(client, pairs.flatMap((pair) => [
    { address: pair, abi: PAIR_ABI, functionName: 'token0' },
    { address: pair, abi: PAIR_ABI, functionName: 'token1' },
  ]));
  return {
    source: 'rpc',
    records: pairs.map((pair, i) => ({ pair, token0: normalizeAddress(values[i * 2]), token1: normalizeAddress(values[i * 2 + 1]) })),
  };
}

function fallbackMeta(address) {
  if (!address) return { symbol: 'Unknown', name: 'Unknown token', decimals: 18, address: null };
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return { symbol: short, name: `Unknown token (${short})`, decimals: 18, address };
}

async function loadTokenMeta(client, addresses) {
  const result = new Map();
  const missing = [];
  for (const raw of addresses) {
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

  const values = await readMany(client, missing.flatMap((token) => [
    { address: token, abi: ERC20_ABI.symbol, functionName: 'symbol' },
    { address: token, abi: ERC20_ABI.name, functionName: 'name' },
    { address: token, abi: ERC20_ABI.decimals, functionName: 'decimals' },
  ]));
  missing.forEach((token, i) => {
    const base = fallbackMeta(token);
    const symbol = values[i * 3];
    const name = values[i * 3 + 1];
    const decimals = values[i * 3 + 2];
    const meta = {
      symbol: symbol != null ? String(symbol) : base.symbol,
      name: name != null ? String(name) : base.name,
      decimals: decimals != null ? Number(decimals) : 18,
      address: token,
    };
    result.set(token.toLowerCase(), meta);
    tokenMetadataCache.set(token.toLowerCase(), { timestamp: Date.now(), meta });
  });
  return result;
}

function liquidityScore(a, b, da, db) {
  const scale = (value, decimals) => {
    const d = Number(decimals ?? 18);
    if (d < 18) return value * 10n ** BigInt(18 - d);
    if (d > 18) return value / 10n ** BigInt(d - 18);
    return value;
  };
  const product = scale(a, da) * scale(b, db);
  if (product <= 0n) return 0n;
  let x = product;
  let y = (x + 1n) >> 1n;
  while (y < x) { x = y; y = (x + product / x) >> 1n; }
  return x;
}

async function hydratePairs(client, records, wallet) {
  const unique = [...new Map(records.filter((r) => r?.pair).map((r) => [r.pair.toLowerCase(), r])).values()];
  if (!unique.length) return [];
  const metadata = await loadTokenMeta(client, unique.flatMap((r) => [r.token0, r.token1]));
  const values = await readMany(client, unique.flatMap((r) => [
    { address: r.pair, abi: PAIR_ABI, functionName: 'getReserves' },
    { address: r.pair, abi: PAIR_ABI, functionName: 'totalSupply' },
    ...(wallet ? [{ address: r.pair, abi: PAIR_ABI, functionName: 'balanceOf', args: [wallet] }] : []),
  ]));
  const stride = wallet ? 3 : 2;
  return unique.map((r, i) => {
    const m0 = metadata.get(r.token0?.toLowerCase()) || fallbackMeta(r.token0);
    const m1 = metadata.get(r.token1?.toLowerCase()) || fallbackMeta(r.token1);
    const reserves = Array.isArray(values[i * stride]) ? values[i * stride] : [0n, 0n, 0];
    const reserve0 = BigInt(reserves[0] ?? 0);
    const reserve1 = BigInt(reserves[1] ?? 0);
    const totalSupply = values[i * stride + 1] ?? 0n;
    const lpBalance = wallet ? values[i * stride + 2] ?? 0n : 0n;
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
      hasPosition: Boolean(wallet && BigInt(lpBalance) > 0n),
      featured: Boolean(r.token0?.toLowerCase() === CENT.toLowerCase() || r.token1?.toLowerCase() === CENT.toLowerCase()),
      liquidityScore: liquidityScore(reserve0, reserve1, m0.decimals, m1.decimals).toString(),
    };
  });
}

function knownTokenAddress(query) {
  const exact = normalizeAddress(query);
  if (exact) return exact;
  const key = query.trim().toLowerCase();
  for (const meta of KNOWN_META.values()) {
    if (meta.symbol?.toLowerCase() === key || meta.name?.toLowerCase() === key) return meta.address;
  }
  return null;
}

async function searchByRegistryLogs(tokenAddress, wallet) {
  const wanted = tokenAddress?.toLowerCase() || null;
  const matched = [];
  let cursor = null;
  for (let page = 0; page < MAX_LOG_PAGES && matched.length < SEARCH_RESULT_LIMIT; page += 1) {
    const result = await fetchPairLogPage(cursor);
    for (const log of result.logs) {
      const record = pairFromLog(log);
      if (!record) continue;
      if (!wanted || record.token0.toLowerCase() === wanted || record.token1.toLowerCase() === wanted) matched.push(record);
      if (matched.length >= SEARCH_RESULT_LIMIT) break;
    }
    if (!result.next || result.next === cursor || result.logs.length < 1) break;
    cursor = result.next;
  }
  return hydratePairs(createClient(), matched.slice(0, SEARCH_RESULT_LIMIT), wallet);
}

async function searchRegistry(client, query, wallet) {
  const count = await loadPairCount(client);
  const q = query.trim().toLowerCase();
  const cacheKey = `${wallet?.toLowerCase() || ''}:${q}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return { count, pools: cached.pools, source: cached.source };

  const directPair = normalizeAddress(query);
  if (directPair) {
    const values = await readMany(client, [
      { address: directPair, abi: PAIR_ABI, functionName: 'token0' },
      { address: directPair, abi: PAIR_ABI, functionName: 'token1' },
    ], 2);
    if (values[0] && values[1]) {
      const pools = await hydratePairs(client, [{ pair: directPair, token0: values[0], token1: values[1] }], wallet);
      searchCache.set(cacheKey, { timestamp: Date.now(), pools, source: 'rpc-direct' });
      return { count, pools, source: 'rpc-direct' };
    }
  }

  const tokenAddress = knownTokenAddress(query);
  if (tokenAddress) {
    try {
      const pools = await searchByRegistryLogs(tokenAddress, wallet);
      searchCache.set(cacheKey, { timestamp: Date.now(), pools, source: 'arcscan-registry' });
      return { count, pools, source: 'arcscan-registry' };
    } catch {}
  }

  let cursor = null;
  const matched = [];
  for (let page = 0; page < MAX_LOG_PAGES && matched.length < SEARCH_RESULT_LIMIT; page += 1) {
    const result = await fetchPairLogPage(cursor);
    const tokens = result.logs.map(pairFromLog).filter(Boolean);
    const meta = await loadTokenMeta(client, tokens.flatMap((r) => [r.token0, r.token1]));
    for (const r of tokens) {
      const m0 = meta.get(r.token0.toLowerCase()) || fallbackMeta(r.token0);
      const m1 = meta.get(r.token1.toLowerCase()) || fallbackMeta(r.token1);
      const haystack = [r.pair, r.token0, r.token1, m0.name, m0.symbol, m1.name, m1.symbol].join(' ').toLowerCase();
      if (haystack.includes(q)) matched.push(r);
      if (matched.length >= SEARCH_RESULT_LIMIT) break;
    }
    if (!result.next || result.next === cursor || result.logs.length < 1) break;
    cursor = result.next;
  }
  const pools = await hydratePairs(client, matched, wallet);
  searchCache.set(cacheKey, { timestamp: Date.now(), pools, source: 'arcscan-search' });
  return { count, pools, source: 'arcscan-search' };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim() || '';
    const wallet = normalizeAddress(searchParams.get('address'));
    const client = createClient();
    const count = await loadPairCount(client);

    if (!query) {
      if (recentCache && Date.now() - recentCache.timestamp < CACHE_TTL_MS && recentCache.count === count && (!wallet || recentCache.wallet === wallet)) {
        return NextResponse.json({ success: true, data: { ...recentCache.data, wallet } });
      }
      const registry = await withTimeout(loadRecentRegistryRecords(client, count), REQUEST_TIMEOUT_MS, 'UnitFlow pool discovery timed out.');
      const pools = await withTimeout(hydratePairs(client, registry.records, wallet), REQUEST_TIMEOUT_MS, 'UnitFlow pool details timed out.');
      pools.sort((a, b) => {
        const aa = BigInt(a.liquidityScore || 0);
        const bb = BigInt(b.liquidityScore || 0);
        return aa === bb ? 0 : aa > bb ? -1 : 1;
      });
      const data = { count, loaded: pools.length, displayLimit: MAX_DISPLAY_POOLS, mode: 'recent', pools, wallet, searched: false, source: registry.source };
      recentCache = { timestamp: Date.now(), count, wallet: wallet || null, data };
      return NextResponse.json({ success: true, data });
    }

    const result = await withTimeout(searchRegistry(client, query, wallet), REQUEST_TIMEOUT_MS + 5000, 'UnitFlow pool search timed out.');
    return NextResponse.json({ success: true, data: { count: result.count, loaded: result.pools.length, displayLimit: SEARCH_RESULT_LIMIT, mode: 'search', pools: result.pools, wallet, searched: true, query, source: result.source } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load UnitFlow pools.';
    const safeMessage = message === 'NOTOK' || /Arcscan/i.test(message) ? 'UnitFlow pool registry is temporarily unavailable.' : message;
    return NextResponse.json({ success: false, error: safeMessage }, { status: /timed out/i.test(safeMessage) ? 504 : 502 });
  }
}
