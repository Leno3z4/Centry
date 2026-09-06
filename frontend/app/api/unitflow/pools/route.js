import { NextResponse } from 'next/server';
import { createPublicClient, defineChain, fallback, http, getAddress, encodeFunctionData, decodeFunctionResult } from 'viem';
import { MARKETS } from '../../../../constants/markets';

const ARC_CHAIN_ID = 5042002;
const FACTORY = '0xd67F63A4F26a497b364d1C82e6747Aec8B5743a5';
const WUSDC = '0x911b4000D3422F482F4062a913885f7b035382Df';
const CENT = '0x76e6d50D3151f0B4645ac0E53584F4204Fc6f0e3';
const NATIVE_USDC = '0x3600000000000000000000000000000000000000';
const ZERO = '0x0000000000000000000000000000000000000000';
const MAX_DISPLAY_POOLS = 100;
const SEARCH_RESULT_LIMIT = 50;
const RPC_TIMEOUT_MS = 4_000;
const REQUEST_TIMEOUT_MS = 12_000;
const REGISTRY_TTL_MS = 60_000;
const CACHE_TTL_MS = 30_000;
const META_CACHE_TTL_MS = 10 * 60_000;
const BATCH_SIZE = 50;
const BATCH_CONCURRENCY = 4;
const SEARCH_POOL_BATCH_SIZE = 100;

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

let recentPairsCache = null;
let recentCache = null;
const searchCache = new Map();
const tokenMetadataCache = new Map();

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

async function rpcBatch(calls) {
  if (!RPC_URLS.length) throw new Error('No Arc RPC endpoint configured.');
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
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('All Arc RPC endpoints failed.');
}

async function batchEthCalls(calls) {
  if (!calls.length) return [];
  const chunks = [];
  for (let i = 0; i < calls.length; i += BATCH_SIZE) chunks.push(calls.slice(i, i + BATCH_SIZE));
  const output = new Array(chunks.length);

  for (let start = 0; start < chunks.length; start += BATCH_CONCURRENCY) {
    const end = Math.min(start + BATCH_CONCURRENCY, chunks.length);
    const responses = await Promise.all(chunks.slice(start, end).map((chunk) => rpcBatch(chunk)));
    for (let i = 0; i < responses.length; i += 1) output[start + i] = responses[i];
  }

  return output.flat();
}

function encodedCall(address, abi, functionName, args = []) {
  return { to: address, data: encodeFunctionData({ abi, functionName, args }) };
}

function decodeCall(result, abi, functionName) {
  if (!result || typeof result !== 'string' || result === '0x' || result.startsWith('0x08c379a0')) return null;
  try {
    return decodeFunctionResult({ abi, functionName, data: result });
  } catch {
    return null;
  }
}

async function loadPairCount(client) {
  return Number(await withTimeout(
    client.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'allPairsLength' }),
    REQUEST_TIMEOUT_MS,
    'UnitFlow factory lookup timed out.',
  ));
}

async function loadPairIndexes(start, count) {
  if (count <= 0) return [];
  const calls = Array.from({ length: count }, (_, offset) => encodedCall(
    FACTORY,
    FACTORY_ABI,
    'allPairs',
    [BigInt(start + offset)],
  ));
  const responses = await withTimeout(batchEthCalls(calls), REQUEST_TIMEOUT_MS, 'UnitFlow pool registry batch timed out.');
  return responses.map((item) => {
    const decoded = item?.error ? null : decodeCall(item?.result, FACTORY_ABI, 'allPairs');
    return decoded?.[0] ? getAddress(decoded[0]) : null;
  }).filter((pair) => pair && pair !== ZERO);
}

async function loadRecentPairs(client) {
  const count = await loadPairCount(client);
  if (recentPairsCache && recentPairsCache.length === count && Date.now() - recentPairsCache.timestamp < REGISTRY_TTL_MS) {
    return { length: count, pairs: recentPairsCache.pairs };
  }
  const take = Math.min(MAX_DISPLAY_POOLS, count);
  const start = Math.max(0, count - take);
  const pairs = await loadPairIndexes(start, take);
  recentPairsCache = { timestamp: Date.now(), length: count, pairs };
  return { length: count, pairs };
}

async function loadPairEndpoints(pairs) {
  if (!pairs.length) return [];
  const calls = pairs.flatMap((pair) => [
    encodedCall(pair, PAIR_ABI, 'token0'),
    encodedCall(pair, PAIR_ABI, 'token1'),
  ]);
  const responses = await withTimeout(batchEthCalls(calls), REQUEST_TIMEOUT_MS, 'UnitFlow token lookup timed out.');
  const records = [];
  for (let i = 0; i < pairs.length; i += 1) {
    const token0 = responses[i * 2]?.error ? null : decodeCall(responses[i * 2]?.result, PAIR_ABI, 'token0')?.[0];
    const token1 = responses[i * 2 + 1]?.error ? null : decodeCall(responses[i * 2 + 1]?.result, PAIR_ABI, 'token1')?.[0];
    if (token0 && token1) records.push({ pair: pairs[i], token0: getAddress(token0), token1: getAddress(token1) });
  }
  return records;
}

function fallbackMeta(address) {
  return {
    symbol: `${address.slice(0, 6)}…${address.slice(-4)}`,
    name: `Unknown token (${address.slice(0, 6)}…${address.slice(-4)})`,
    decimals: 18,
    address,
  };
}

async function getAllTokenMeta(tokens) {
  const result = new Map();
  const missing = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    const known = KNOWN_META.get(key);
    if (known) result.set(key, known);
    else {
      const cached = tokenMetadataCache.get(key);
      if (cached?.meta && Date.now() - cached.timestamp < META_CACHE_TTL_MS) result.set(key, cached.meta);
      else missing.push(getAddress(token));
    }
  }
  if (!missing.length) return result;
  const calls = missing.flatMap((token) => [
    encodedCall(token, ERC20_ABI.symbol, 'symbol'),
    encodedCall(token, ERC20_ABI.name, 'name'),
    encodedCall(token, ERC20_ABI.decimals, 'decimals'),
  ]);
  const responses = await withTimeout(batchEthCalls(calls), REQUEST_TIMEOUT_MS, 'UnitFlow token metadata timed out.');
  for (let i = 0; i < missing.length; i += 1) {
    const token = missing[i];
    const base = fallbackMeta(token);
    const symbol = decodeCall(responses[i * 3]?.result, ERC20_ABI.symbol, 'symbol');
    const name = decodeCall(responses[i * 3 + 1]?.result, ERC20_ABI.name, 'name');
    const decimals = decodeCall(responses[i * 3 + 2]?.result, ERC20_ABI.decimals, 'decimals');
    const meta = {
      symbol: symbol?.[0] !== undefined ? String(symbol[0]) : base.symbol,
      name: name?.[0] !== undefined ? String(name[0]) : base.name,
      decimals: decimals?.[0] !== undefined ? Number(decimals[0]) : 18,
      address: token,
    };
    result.set(token.toLowerCase(), meta);
    tokenMetadataCache.set(token.toLowerCase(), { timestamp: Date.now(), meta });
  }
  return result;
}

function liquidityScore(reserve0, reserve1, decimals0, decimals1) {
  const to18 = (value, decimals) => {
    const d = Number(decimals ?? 18);
    return d === 18 ? value : d < 18 ? value * 10n ** BigInt(18 - d) : value / 10n ** BigInt(d - 18);
  };
  const a = to18(reserve0, decimals0);
  const b = to18(reserve1, decimals1);
  const x = a * b;
  if (x <= 0n) return 0n;
  let r = x;
  let n = (r + 1n) >> 1n;
  while (n < r) { r = n; n = (r + x / r) >> 1n; }
  return r;
}

async function hydratePairs(records, wallet) {
  const unique = [...new Map(records.map((record) => [record.pair.toLowerCase(), record])).values()];
  if (!unique.length) return [];
  const tokens = [...new Set(unique.flatMap((record) => [record.token0, record.token1]).map((token) => token.toLowerCase()))].map(getAddress);
  const tokenMeta = await getAllTokenMeta(tokens);
  const calls = unique.flatMap((record) => [
    encodedCall(record.pair, PAIR_ABI, 'getReserves'),
    encodedCall(record.pair, PAIR_ABI, 'totalSupply'),
    ...(wallet ? [encodedCall(record.pair, PAIR_ABI, 'balanceOf', [wallet])] : []),
  ]);
  const responses = await withTimeout(batchEthCalls(calls), REQUEST_TIMEOUT_MS, 'UnitFlow pool details timed out.');
  const stride = wallet ? 3 : 2;
  return unique.map((record, index) => {
    const meta0 = tokenMeta.get(record.token0.toLowerCase()) || fallbackMeta(record.token0);
    const meta1 = tokenMeta.get(record.token1.toLowerCase()) || fallbackMeta(record.token1);
    const reserves = decodeCall(responses[index * stride]?.result, PAIR_ABI, 'getReserves') || [0n, 0n, 0];
    const totalSupply = decodeCall(responses[index * stride + 1]?.result, PAIR_ABI, 'totalSupply')?.[0] ?? 0n;
    const lpBalance = wallet ? decodeCall(responses[index * stride + 2]?.result, PAIR_ABI, 'balanceOf')?.[0] ?? 0n : 0n;
    const reserve0 = BigInt(reserves[0] ?? 0);
    const reserve1 = BigInt(reserves[1] ?? 0);
    return {
      pair: record.pair,
      token0: record.token0,
      token1: record.token1,
      token0Meta: meta0,
      token1Meta: meta1,
      reserve0: reserve0.toString(),
      reserve1: reserve1.toString(),
      totalSupply: String(totalSupply),
      lpBalance: String(lpBalance),
      hasPosition: Boolean(wallet && lpBalance > 0n),
      featured: record.token0.toLowerCase() === CENT.toLowerCase() || record.token1.toLowerCase() === CENT.toLowerCase(),
      liquidityScore: liquidityScore(reserve0, reserve1, meta0.decimals, meta1.decimals).toString(),
    };
  });
}

async function loadRecentPools(client, length, wallet, recentRecords) {
  const walletKey = wallet?.toLowerCase() || '';
  if (recentCache && recentCache.length === length && recentCache.walletKey === walletKey && Date.now() - recentCache.timestamp < CACHE_TTL_MS) return recentCache.pools;
  const pools = await hydratePairs(recentRecords, wallet);
  pools.sort((a, b) => {
    const aa = BigInt(a.liquidityScore || 0);
    const bb = BigInt(b.liquidityScore || 0);
    return aa === bb ? 0 : aa > bb ? -1 : 1;
  });
  recentCache = { timestamp: Date.now(), length, walletKey, pools };
  return pools;
}

function matchesRecord(record, tokenMeta, key, addressQuery) {
  if (addressQuery) {
    return record.pair.toLowerCase() === addressQuery
      || record.token0.toLowerCase() === addressQuery
      || record.token1.toLowerCase() === addressQuery;
  }

  const meta0 = tokenMeta.get(record.token0.toLowerCase()) || fallbackMeta(record.token0);
  const meta1 = tokenMeta.get(record.token1.toLowerCase()) || fallbackMeta(record.token1);
  const haystack = [
    record.pair,
    record.token0,
    record.token1,
    meta0.name,
    meta0.symbol,
    meta1.name,
    meta1.symbol,
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(key);
}

async function searchRegistry(client, query, wallet) {
  const pairCount = await loadPairCount(client);
  if (!pairCount) return { count: 0, pools: [] };

  const key = query.toLowerCase();
  const addressQuery = validAddress(query) ? getAddress(query).toLowerCase() : null;
  const searchKey = `${wallet?.toLowerCase() || ''}:${key}`;
  const cached = searchCache.get(searchKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return { count: pairCount, pools: cached.pools };

  const matchedRecords = [];
  const totalBatches = Math.ceil(pairCount / SEARCH_POOL_BATCH_SIZE);

  for (let batch = 0; batch < totalBatches; batch += 1) {
    const end = pairCount - (batch * SEARCH_POOL_BATCH_SIZE);
    const start = Math.max(0, end - SEARCH_POOL_BATCH_SIZE);
    const pairs = await loadPairIndexes(start, end - start);
    const records = await loadPairEndpoints(pairs);

    let tokenMeta = new Map();
    if (!addressQuery) {
      const tokens = [...new Set(records.flatMap((record) => [record.token0, record.token1]))];
      tokenMeta = await getAllTokenMeta(tokens);
    }

    for (const record of records) {
      if (matchesRecord(record, tokenMeta, key, addressQuery)) matchedRecords.push(record);
      if (matchedRecords.length >= SEARCH_RESULT_LIMIT) break;
    }

    if (matchedRecords.length >= SEARCH_RESULT_LIMIT) break;
  }

  const pools = await hydratePairs(matchedRecords.slice(0, SEARCH_RESULT_LIMIT), wallet);
  searchCache.set(searchKey, { timestamp: Date.now(), pools });
  return { count: pairCount, pools };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedAddress = searchParams.get('address');
    const query = searchParams.get('q')?.trim() || '';
    const wallet = validAddress(requestedAddress) ? getAddress(requestedAddress) : null;
    const client = createClient();

    if (!query) {
      const { length, pairs } = await loadRecentPairs(client);
      const recentRecords = await loadPairEndpoints(pairs);
      const pools = await loadRecentPools(client, length, wallet, recentRecords);
      return NextResponse.json({
        success: true,
        data: {
          count: length,
          loaded: pools.length,
          displayLimit: MAX_DISPLAY_POOLS,
          mode: 'recent',
          pools,
          wallet,
          searched: false,
        },
      });
    }

    const { count, pools } = await searchRegistry(client, query, wallet);
    return NextResponse.json({
      success: true,
      data: {
        count,
        loaded: pools.length,
        displayLimit: SEARCH_RESULT_LIMIT,
        mode: 'search',
        pools,
        wallet,
        searched: true,
        query,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load UnitFlow pools.';
    const status = /timed out/i.test(message) ? 504 : 502;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
