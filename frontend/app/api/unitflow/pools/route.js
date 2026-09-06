import { NextResponse } from 'next/server';
import { createPublicClient, defineChain, fallback, http, getAddress, encodeFunctionData, decodeFunctionResult } from 'viem';
import { MARKETS } from '../../../constants/markets';

const ARC_CHAIN_ID = 5042002;
const FACTORY = '0xd67F63A4F26a497b364d1C82e6747Aec8B5743a5';
const WUSDC = '0x911b4000D3422F482F4062a913885f7b035382Df';
const CENT = '0x76e6d50D3151f0B4645ac0E53584F4204Fc6f0e3';
const NATIVE_USDC = '0x3600000000000000000000000000000000000000';
const ZERO = '0x0000000000000000000000000000000000000000';
const MAX_DISPLAY_POOLS = 100;
const SEARCH_RESULT_LIMIT = 50;
const RPC_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 30_000;
const META_CACHE_TTL_MS = 10 * 60_000;
const PAIR_INDEX_CACHE_TTL_MS = 60_000;
const PAIR_CREATED_TOPIC0 = '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9';
const ERC20_METHOD_ABI = {
  symbol: [{ type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] }],
  name: [{ type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] }],
  decimals: [{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }],
};

const FACTORY_ABI = [
  { type: 'function', name: 'allPairsLength', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allPairs', stateMutability: 'view', inputs: [{ name: 'index', type: 'uint256' }], outputs: [{ type: 'address' }] },
];

const PAIR_ABI = [
  { type: 'function', name: 'token0', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'token1', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'getReserves', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
];

const RPC_URLS = [
  process.env.ARC_RPC_URL,
  process.env.NEXT_PUBLIC_ARC_RPC_URL,
  'https://rpc.testnet.arc.network',
  'https://rpc.drpc.testnet.arc.network',
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
KNOWN_META.set(NATIVE_USDC.toLowerCase(), { symbol: 'USDC', name: 'USD Coin', decimals: 6, address: WUSDC });

let recentCache = null;
let pairIndexCache = null;
const searchCache = new Map();
const tokenMetadataCache = new Map(KNOWN_META);

function validAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
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
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function readSafe(client, args) {
  try {
    return { status: 'success', result: await client.readContract(args) };
  } catch {
    return { status: 'failure', result: null };
  }
}

async function readBatches(items, worker, batchSize = 40) {
  const out = [];
  for (let i = 0; i < items.length; i += batchSize) {
    out.push(...await Promise.all(items.slice(i, i + batchSize).map(worker)));
  }
  return out;
}

function shortAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

async function getTokenMeta(client, token) {
  const address = getAddress(token);
  const key = address.toLowerCase();
  const cached = tokenMetadataCache.get(key);
  if (cached && Date.now() - cached.timestamp < META_CACHE_TTL_MS) return cached.meta;

  const known = KNOWN_META.get(key);
  if (known) {
    tokenMetadataCache.set(key, { timestamp: Date.now(), meta: known });
    return known;
  }

  const calls = await Promise.all(['symbol', 'name', 'decimals'].map(async (method) => {
    const result = await readSafe(client, { address, abi: ERC20_METHOD_ABI[method], functionName: method });
    return [method, result];
  }));
  const byMethod = new Map(calls);
  const fallbackLabel = shortAddress(address);
  const meta = {
    symbol: byMethod.get('symbol')?.status === 'success' && byMethod.get('symbol').result ? String(byMethod.get('symbol').result) : fallbackLabel,
    name: byMethod.get('name')?.status === 'success' && byMethod.get('name').result ? String(byMethod.get('name').result) : `Unknown token (${fallbackLabel})`,
    decimals: byMethod.get('decimals')?.status === 'success' ? Number(byMethod.get('decimals').result) : 18,
    address,
  };
  tokenMetadataCache.set(key, { timestamp: Date.now(), meta });
  return meta;
}

function normalizePairRecord(record) {
  if (!record?.pair || !record.token0 || !record.token1) return null;
  return {
    pair: getAddress(record.pair),
    token0: getAddress(record.token0),
    token1: getAddress(record.token1),
  };
}

function parsePairCreatedLog(log) {
  const topic0 = String(log?.topic0 || log?.topics?.[0] || '').toLowerCase();
  const topic1 = log?.topic1 || log?.topics?.[1];
  const topic2 = log?.topic2 || log?.topics?.[2];
  const data = log?.data;
  if (topic0 !== PAIR_CREATED_TOPIC0 || !topic1 || !topic2 || !data) return null;
  const word = (value) => String(value).replace(/^0x/, '').padStart(64, '0');
  const dataHex = String(data).replace(/^0x/, '');
  if (dataHex.length < 64) return null;
  return normalizePairRecord({
    token0: `0x${word(topic1).slice(-40)}`,
    token1: `0x${word(topic2).slice(-40)}`,
    pair: `0x${dataHex.slice(0, 64).slice(-40)}`,
  });
}

async function hyperSyncQuery(fromBlock = 0) {
  const endpoint = process.env.ARC_HYPERSYNC_URL || 'https://arc-testnet.hypersync.xyz/query';
  const token = process.env.ENVIO_API_TOKEN || process.env.HYPERSYNC_API_TOKEN;
  if (!token) throw new Error('UnitFlow pool index requires ENVIO_API_TOKEN or HYPERSYNC_API_TOKEN.');
  return withTimeout(fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
    body: JSON.stringify({
      from_block: fromBlock,
      logs: [{ address: [FACTORY], topics: [[PAIR_CREATED_TOPIC0]] }],
      field_selection: {
        log: ['address', 'data', 'topic0', 'topic1', 'topic2', 'block_number', 'log_index'],
      },
      max_num_logs: 10_000,
    }),
    signal: undefined,
  }).then(async (response) => {
    if (!response.ok) throw new Error(`HyperSync HTTP ${response.status}`);
    const body = await response.json();
    if (body?.error) throw new Error(body.error.message || 'HyperSync query failed.');
    return body;
  }), REQUEST_TIMEOUT_MS, 'UnitFlow pool index timed out.');
}

async function loadPairIndex() {
  if (pairIndexCache && Date.now() - pairIndexCache.timestamp < PAIR_INDEX_CACHE_TTL_MS) return pairIndexCache.pairs;
  const body = await hyperSyncQuery(0);
  const rawLogs = body?.data?.logs || body?.logs || [];
  const logs = Array.isArray(rawLogs) ? rawLogs : [];
  const pairs = [];
  for (const log of logs) {
    const parsed = parsePairCreatedLog(log);
    if (parsed) pairs.push(parsed);
  }
  if (!pairs.length) throw new Error('UnitFlow index returned no PairCreated events.');
  const unique = [...new Map(pairs.map((pair) => [pair.pair.toLowerCase(), pair])).values()];
  pairIndexCache = { timestamp: Date.now(), pairs: unique };
  return unique;
}

async function hydratePairs(client, records, wallet) {
  const unique = [...new Map(records.map((record) => [record.pair.toLowerCase(), normalizePairRecord(record)]).filter(([, value]) => value)).values()];
  const pairData = await readBatches(unique, async (record) => {
    const [reserves, totalSupply, lpBalance] = await Promise.all([
      readSafe(client, { address: record.pair, abi: PAIR_ABI, functionName: 'getReserves' }),
      readSafe(client, { address: record.pair, abi: PAIR_ABI, functionName: 'totalSupply' }),
      wallet ? readSafe(client, { address: record.pair, abi: PAIR_ABI, functionName: 'balanceOf', args: [wallet] }) : Promise.resolve({ status: 'failure', result: 0n }),
    ]);
    return { ...record, reserves, totalSupply, lpBalance };
  });

  const tokens = [...new Set(pairData.flatMap((item) => [item.token0, item.token1]).filter(Boolean).map((token) => token.toLowerCase()))].map(getAddress);
  const metadata = new Map(await readBatches(tokens, async (token) => [token.toLowerCase(), await getTokenMeta(client, token)], 30));

  return pairData.map((item) => {
    const meta0 = metadata.get(item.token0.toLowerCase()) || KNOWN_META.get(item.token0.toLowerCase()) || { symbol: shortAddress(item.token0), name: 'Token', decimals: 18, address: item.token0 };
    const meta1 = metadata.get(item.token1.toLowerCase()) || KNOWN_META.get(item.token1.toLowerCase()) || { symbol: shortAddress(item.token1), name: 'Token', decimals: 18, address: item.token1 };
    const reserveValues = item.reserves.status === 'success' ? item.reserves.result : [0n, 0n, 0];
    const reserve0 = BigInt(reserveValues[0] ?? 0);
    const reserve1 = BigInt(reserveValues[1] ?? 0);
    const totalSupply = item.totalSupply.status === 'success' ? BigInt(item.totalSupply.result) : 0n;
    const lpBalance = wallet && item.lpBalance.status === 'success' ? BigInt(item.lpBalance.result) : 0n;
    const to18 = (value, decimals) => {
      const d = Number(decimals ?? 18);
      return d === 18 ? value : d < 18 ? value * 10n ** BigInt(18 - d) : value / 10n ** BigInt(d - 18);
    };
    const a = to18(reserve0, meta0.decimals);
    const b = to18(reserve1, meta1.decimals);
    const product = a * b;
    let liquidityScore = 0n;
    if (product > 0n) {
      let x = product;
      let y = (x + 1n) >> 1n;
      while (y < x) { x = y; y = (x + product / x) >> 1n; }
      liquidityScore = x;
    }
    return {
      pair: item.pair,
      token0: item.token0,
      token1: item.token1,
      token0Meta: { ...meta0, address: meta0.address || item.token0 },
      token1Meta: { ...meta1, address: meta1.address || item.token1 },
      reserve0: reserve0.toString(),
      reserve1: reserve1.toString(),
      totalSupply: totalSupply.toString(),
      lpBalance: lpBalance.toString(),
      hasPosition: Boolean(wallet && lpBalance > 0n),
      featured: item.token0.toLowerCase() === CENT.toLowerCase() || item.token1.toLowerCase() === CENT.toLowerCase(),
      liquidityScore: liquidityScore.toString(),
    };
  });
}

async function loadRecentPools(client, length, wallet) {
  const walletKey = wallet?.toLowerCase() || '';
  if (recentCache && recentCache.length === length && recentCache.walletKey === walletKey && Date.now() - recentCache.timestamp < CACHE_TTL_MS) return recentCache.pools;
  const index = await loadPairIndex();
  const records = index.slice(-MAX_DISPLAY_POOLS).reverse();
  const pools = await hydratePairs(client, records, wallet);
  pools.sort((a, b) => {
    const aa = BigInt(a.liquidityScore || 0);
    const bb = BigInt(b.liquidityScore || 0);
    return aa === bb ? 0 : aa > bb ? -1 : 1;
  });
  recentCache = { timestamp: Date.now(), length, walletKey, pools };
  return pools;
}

function staticMatch(record, query) {
  const needle = query.toLowerCase();
  const meta0 = KNOWN_META.get(record.token0.toLowerCase());
  const meta1 = KNOWN_META.get(record.token1.toLowerCase());
  return [
    record.pair,
    record.token0,
    record.token1,
    meta0?.symbol,
    meta0?.name,
    meta1?.symbol,
    meta1?.name,
    `${meta0?.symbol || ''} / ${meta1?.symbol || ''}`,
  ].filter(Boolean).join(' ').toLowerCase().includes(needle);
}

async function searchPairIndex(client, query) {
  const key = query.trim().toLowerCase();
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.pairs;
  const index = await loadPairIndex();
  const addressQuery = validAddress(query) ? getAddress(query).toLowerCase() : null;
  if (addressQuery) {
    const matches = index.filter((record) => record.pair.toLowerCase() === addressQuery || record.token0.toLowerCase() === addressQuery || record.token1.toLowerCase() === addressQuery).slice(0, SEARCH_RESULT_LIMIT);
    searchCache.set(key, { timestamp: Date.now(), pairs: matches });
    return matches;
  }

  const directKnown = index.filter((record) => staticMatch(record, key));
  if (directKnown.length >= SEARCH_RESULT_LIMIT) {
    const matches = directKnown.slice(0, SEARCH_RESULT_LIMIT);
    searchCache.set(key, { timestamp: Date.now(), pairs: matches });
    return matches;
  }

  const unknownTokens = [...new Set(index.flatMap((record) => [record.token0, record.token1]).filter((token) => !KNOWN_META.has(token.toLowerCase())).map((token) => token.toLowerCase()))].map(getAddress);
  if (!unknownTokens.length) {
    searchCache.set(key, { timestamp: Date.now(), pairs: directKnown });
    return directKnown;
  }

  const metas = await withTimeout(readBatches(unknownTokens, async (token) => [token.toLowerCase(), await getTokenMeta(client, token)], 40), 8_000, 'Token search timed out.');
  const metadata = new Map(metas);
  const dynamicMatches = index.filter((record) => {
    if (staticMatch(record, key)) return true;
    const meta0 = metadata.get(record.token0.toLowerCase());
    const meta1 = metadata.get(record.token1.toLowerCase());
    return [meta0?.symbol, meta0?.name, meta1?.symbol, meta1?.name, `${meta0?.symbol || ''} / ${meta1?.symbol || ''}`].filter(Boolean).join(' ').toLowerCase().includes(key);
  });
  const matches = dynamicMatches.slice(0, SEARCH_RESULT_LIMIT);
  searchCache.set(key, { timestamp: Date.now(), pairs: matches });
  return matches;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedAddress = searchParams.get('address');
    const query = searchParams.get('q')?.trim() || '';
    const wallet = validAddress(requestedAddress) ? getAddress(requestedAddress) : null;
    const client = createClient();

    if (!query) {
      const pools = await withTimeout(loadRecentPools(client, 0, wallet), REQUEST_TIMEOUT_MS, 'UnitFlow pools timed out.');
      const index = await loadPairIndex();
      return NextResponse.json({ success: true, data: { count: index.length, loaded: pools.length, displayLimit: MAX_DISPLAY_POOLS, mode: 'recent', pools, wallet, searched: false } }, { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=120' } });
    }

    const candidates = await withTimeout(searchPairIndex(client, query), REQUEST_TIMEOUT_MS, 'UnitFlow pool search timed out.');
    const pools = await withTimeout(hydratePairs(client, candidates.slice(0, SEARCH_RESULT_LIMIT), wallet), REQUEST_TIMEOUT_MS, 'UnitFlow pool details timed out.');
    pools.sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      const aa = BigInt(a.liquidityScore || 0);
      const bb = BigInt(b.liquidityScore || 0);
      return aa === bb ? 0 : aa > bb ? -1 : 1;
    });
    return NextResponse.json({ success: true, data: { count: pools.length, loaded: pools.length, displayLimit: SEARCH_RESULT_LIMIT, mode: 'search', pools, wallet, searched: true, query } }, { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=120' } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || 'Unable to load UnitFlow pools.' }, { status: 502 });
  }
}
