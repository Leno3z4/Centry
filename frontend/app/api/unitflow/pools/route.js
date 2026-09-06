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
const REQUEST_TIMEOUT_MS = 15_000;
const REGISTRY_TTL_MS = 60_000;
const CACHE_TTL_MS = 30_000;
const META_CACHE_TTL_MS = 10 * 60_000;
const BATCH_SIZE = 250;

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

let registryCache = null;
let endpointCache = null;
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

function rpcRequestUrl() {
  return RPC_URLS[0];
}

async function rpcBatch(calls) {
  const url = rpcRequestUrl();
  if (!url) throw new Error('No Arc RPC endpoint configured.');
  const body = calls.map((call, index) => ({ jsonrpc: '2.0', id: index + 1, method: 'eth_call', params: [call, 'latest'] }));
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Arc RPC HTTP ${response.status}`);
  const results = await response.json();
  if (!Array.isArray(results)) throw new Error('Arc RPC does not support JSON-RPC batching.');
  return results.sort((a, b) => Number(a.id) - Number(b.id));
}

async function batchEthCalls(calls) {
  const output = [];
  for (let i = 0; i < calls.length; i += BATCH_SIZE) {
    output.push(...await rpcBatch(calls.slice(i, i + BATCH_SIZE)));
  }
  return output;
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

async function loadRegistry(client) {
  if (registryCache && Date.now() - registryCache.timestamp < REGISTRY_TTL_MS) return registryCache.pairs;
  const length = Number(await withTimeout(client.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'allPairsLength' }), REQUEST_TIMEOUT_MS, 'UnitFlow factory lookup timed out.'));
  if (!length) {
    registryCache = { timestamp: Date.now(), pairs: [] };
    endpointCache = null;
    return [];
  }
  const calls = Array.from({ length }, (_, index) => encodedCall(FACTORY, FACTORY_ABI, 'allPairs', [BigInt(index)]));
  let responses;
  try {
    responses = await withTimeout(batchEthCalls(calls), REQUEST_TIMEOUT_MS, 'UnitFlow pool registry timed out.');
  } catch {
    const pairs = [];
    for (let start = 0; start < length; start += BATCH_SIZE) {
      const chunk = Array.from({ length: Math.min(BATCH_SIZE, length - start) }, (_, offset) => BigInt(start + offset));
      const results = await withTimeout(Promise.all(chunk.map((index) => client.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'allPairs', args: [index] }))), REQUEST_TIMEOUT_MS, 'UnitFlow pool registry timed out.');
      pairs.push(...results.map((pair) => getAddress(pair)));
    }
    registryCache = { timestamp: Date.now(), pairs };
    return pairs;
  }
  const pairs = responses.map((item) => {
    const decoded = item?.error ? null : decodeCall(item?.result, FACTORY_ABI, 'allPairs');
    return decoded?.[0] ? getAddress(decoded[0]) : null;
  }).filter((pair) => pair && pair !== ZERO);
  registryCache = { timestamp: Date.now(), pairs };
  return pairs;
}

async function loadPairEndpoints(client, pairs) {
  const key = pairs.map((p) => p.toLowerCase()).join(',');
  if (endpointCache && endpointCache.key === key && Date.now() - endpointCache.timestamp < REGISTRY_TTL_MS) return endpointCache.records;
  if (!pairs.length) return [];
  const calls = pairs.flatMap((pair) => [encodedCall(pair, PAIR_ABI, 'token0'), encodedCall(pair, PAIR_ABI, 'token1')]);
  let responses;
  try {
    responses = await withTimeout(batchEthCalls(calls), REQUEST_TIMEOUT_MS, 'UnitFlow token lookup timed out.');
  } catch {
    const records = await withTimeout(Promise.all(pairs.map(async (pair) => {
      const [token0, token1] = await Promise.all([
        client.readContract({ address: pair, abi: PAIR_ABI, functionName: 'token0' }),
        client.readContract({ address: pair, abi: PAIR_ABI, functionName: 'token1' }),
      ]);
      return { pair, token0: getAddress(token0), token1: getAddress(token1) };
    })), REQUEST_TIMEOUT_MS, 'UnitFlow token lookup timed out.');
    endpointCache = { timestamp: Date.now(), key, records };
    return records;
  }
  const records = [];
  for (let i = 0; i < pairs.length; i += 1) {
    const token0 = responses[i * 2]?.error ? null : decodeCall(responses[i * 2]?.result, PAIR_ABI, 'token0')?.[0];
    const token1 = responses[i * 2 + 1]?.error ? null : decodeCall(responses[i * 2 + 1]?.result, PAIR_ABI, 'token1')?.[0];
    if (token0 && token1) records.push({ pair: pairs[i], token0: getAddress(token0), token1: getAddress(token1) });
  }
  endpointCache = { timestamp: Date.now(), key, records };
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

async function getTokenMetaBatch(tokens, mode) {
  const result = new Map();
  const unknown = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    const known = KNOWN_META.get(key);
    if (known) result.set(key, known);
    else {
      const cached = tokenMetadataCache.get(key);
      if (cached?.meta && Date.now() - cached.timestamp < META_CACHE_TTL_MS) result.set(key, cached.meta);
      else unknown.push(getAddress(token));
    }
  }
  if (!unknown.length) return result;
  const responses = await withTimeout(batchEthCalls(unknown.map((token) => encodedCall(token, ERC20_ABI[mode], mode))), REQUEST_TIMEOUT_MS, `UnitFlow token ${mode} lookup timed out.`);
  for (let i = 0; i < unknown.length; i += 1) {
    const token = unknown[i];
    const decoded = responses[i]?.error ? null : decodeCall(responses[i]?.result, ERC20_ABI[mode], mode);
    const partial = result.get(token.toLowerCase()) || fallbackMeta(token);
    if (decoded?.[0] !== undefined) partial[mode] = mode === 'decimals' ? Number(decoded[0]) : String(decoded[0]);
    result.set(token.toLowerCase(), partial);
    tokenMetadataCache.set(token.toLowerCase(), { timestamp: Date.now(), meta: partial });
  }
  return result;
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

async function hydratePairs(client, records, wallet) {
  const unique = [...new Map(records.map((record) => [record.pair.toLowerCase(), record])).values()];
  if (!unique.length) return [];
  const calls = unique.flatMap((record) => [
    encodedCall(record.pair, PAIR_ABI, 'getReserves'),
    encodedCall(record.pair, PAIR_ABI, 'totalSupply'),
    ...(wallet ? [encodedCall(record.pair, PAIR_ABI, 'balanceOf', [wallet])] : []),
  ]);
  let responses;
  try {
    responses = await withTimeout(batchEthCalls(calls), REQUEST_TIMEOUT_MS, 'UnitFlow pool details timed out.');
  } catch {
    const detailResults = await withTimeout(Promise.all(unique.map(async (record) => {
      const [reserves, totalSupply, lpBalance] = await Promise.all([
        client.readContract({ address: record.pair, abi: PAIR_ABI, functionName: 'getReserves' }),
        client.readContract({ address: record.pair, abi: PAIR_ABI, functionName: 'totalSupply' }),
        wallet ? client.readContract({ address: record.pair, abi: PAIR_ABI, functionName: 'balanceOf', args: [wallet] }) : Promise.resolve(0n),
      ]);
      return { record, reserves, totalSupply, lpBalance };
    })), REQUEST_TIMEOUT_MS, 'UnitFlow pool details timed out.');
    return formatHydrated(detailResults, wallet);
  }
  const stride = wallet ? 3 : 2;
  const detailResults = unique.map((record, index) => ({
    record,
    reserves: decodeCall(responses[index * stride]?.result, PAIR_ABI, 'getReserves') || [0n, 0n, 0],
    totalSupply: decodeCall(responses[index * stride + 1]?.result, PAIR_ABI, 'totalSupply')?.[0] ?? 0n,
    lpBalance: wallet ? decodeCall(responses[index * stride + 2]?.result, PAIR_ABI, 'balanceOf')?.[0] ?? 0n : 0n,
  }));
  return formatHydrated(detailResults, wallet);
}

async function formatHydrated(detailResults, wallet) {
  const tokens = [...new Set(detailResults.flatMap(({ record }) => [record.token0, record.token1]))];
  const metadata = await getAllTokenMeta(tokens);
  return detailResults.map(({ record, reserves, totalSupply, lpBalance }) => {
    const meta0 = metadata.get(record.token0.toLowerCase()) || fallbackMeta(record.token0);
    const meta1 = metadata.get(record.token1.toLowerCase()) || fallbackMeta(record.token1);
    const reserve0 = BigInt(reserves[0] ?? 0);
    const reserve1 = BigInt(reserves[1] ?? 0);
    const d0 = Number(meta0.decimals ?? 18);
    const d1 = Number(meta1.decimals ?? 18);
    const a = d0 === 18 ? reserve0 : d0 < 18 ? reserve0 * 10n ** BigInt(18 - d0) : reserve0 / 10n ** BigInt(d0 - 18);
    const b = d1 === 18 ? reserve1 : d1 < 18 ? reserve1 * 10n ** BigInt(18 - d1) : reserve1 / 10n ** BigInt(d1 - 18);
    const product = a * b;
    let score = 0n;
    if (product > 0n) {
      let x = product;
      let y = (x + 1n) >> 1n;
      while (y < x) { x = y; y = (x + product / x) >> 1n; }
      score = x;
    }
    return {
      pair: record.pair,
      token0: record.token0,
      token1: record.token1,
      token0Meta: { ...meta0, address: meta0.address || record.token0 },
      token1Meta: { ...meta1, address: meta1.address || record.token1 },
      reserve0: reserve0.toString(),
      reserve1: reserve1.toString(),
      totalSupply: BigInt(totalSupply ?? 0).toString(),
      lpBalance: BigInt(lpBalance ?? 0).toString(),
      hasPosition: Boolean(wallet && BigInt(lpBalance ?? 0) > 0n),
      featured: record.token0.toLowerCase() === CENT.toLowerCase() || record.token1.toLowerCase() === CENT.toLowerCase(),
      liquidityScore: score.toString(),
    };
  });
}

async function loadRecentPools(client, wallet) {
  const registry = await loadRegistry(client);
  const records = await loadPairEndpoints(client, registry.slice(-MAX_DISPLAY_POOLS).reverse());
  const pools = await hydratePairs(client, records, wallet);
  pools.sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    const aa = BigInt(a.liquidityScore || 0);
    const bb = BigInt(b.liquidityScore || 0);
    return aa === bb ? 0 : aa > bb ? -1 : 1;
  });
  return { pools, count: registry.length };
}

async function searchRegistry(client, query, wallet) {
  const key = query.trim().toLowerCase();
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return hydratePairs(client, cached.records, wallet);
  const registry = await loadRegistry(client);
  const endpoints = await loadPairEndpoints(client, registry);
  const addressQuery = validAddress(query) ? getAddress(query).toLowerCase() : null;
  let records;
  if (addressQuery) {
    records = endpoints.filter((record) => record.pair.toLowerCase() === addressQuery || record.token0.toLowerCase() === addressQuery || record.token1.toLowerCase() === addressQuery).slice(0, SEARCH_RESULT_LIMIT);
  } else {
    records = endpoints.filter((record) => {
      const m0 = KNOWN_META.get(record.token0.toLowerCase());
      const m1 = KNOWN_META.get(record.token1.toLowerCase());
      const haystack = [record.pair, record.token0, record.token1, m0?.symbol, m0?.name, m1?.symbol, m1?.name, `${m0?.symbol || ''} / ${m1?.symbol || ''}`].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(key);
    });
    if (records.length < SEARCH_RESULT_LIMIT) {
      const unknownTokens = [...new Set(endpoints.flatMap((record) => [record.token0, record.token1]).filter((token) => !KNOWN_META.has(token.toLowerCase())))];
      if (unknownTokens.length) {
        const symbols = await getTokenMetaBatch(unknownTokens, 'symbol');
        records = endpoints.filter((record) => {
          if (records.some((candidate) => candidate.pair === record.pair)) return true;
          const s0 = symbols.get(record.token0.toLowerCase())?.symbol;
          const s1 = symbols.get(record.token1.toLowerCase())?.symbol;
          return [s0, s1, `${s0 || ''} / ${s1 || ''}`].filter(Boolean).join(' ').toLowerCase().includes(key);
        });
      }
    }
    if (records.length < SEARCH_RESULT_LIMIT) {
      const unknownTokens = [...new Set(endpoints.flatMap((record) => [record.token0, record.token1]).filter((token) => !KNOWN_META.has(token.toLowerCase())))];
      if (unknownTokens.length) {
        const names = await getTokenMetaBatch(unknownTokens, 'name');
        records = endpoints.filter((record) => {
          if (records.some((candidate) => candidate.pair === record.pair)) return true;
          const n0 = names.get(record.token0.toLowerCase())?.name;
          const n1 = names.get(record.token1.toLowerCase())?.name;
          return [n0, n1, `${n0 || ''} / ${n1 || ''}`].filter(Boolean).join(' ').toLowerCase().includes(key);
        });
      }
    }
    records = records.slice(0, SEARCH_RESULT_LIMIT);
  }
  searchCache.set(key, { timestamp: Date.now(), records });
  return hydratePairs(client, records, wallet);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedAddress = searchParams.get('address');
    const query = searchParams.get('q')?.trim() || '';
    const wallet = validAddress(requestedAddress) ? getAddress(requestedAddress) : null;
    const client = createClient();

    if (!query) {
      const { pools, count } = await withTimeout(loadRecentPools(client, wallet), REQUEST_TIMEOUT_MS, 'UnitFlow pools timed out.');
      return NextResponse.json({ success: true, data: { count, loaded: pools.length, displayLimit: MAX_DISPLAY_POOLS, mode: 'recent', pools, wallet, searched: false } }, { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=120' } });
    }

    const pools = await withTimeout(searchRegistry(client, query, wallet), REQUEST_TIMEOUT_MS, 'UnitFlow pool search timed out.');
    return NextResponse.json({ success: true, data: { count: pools.length, loaded: pools.length, displayLimit: SEARCH_RESULT_LIMIT, mode: 'search', pools, wallet, searched: true, query } }, { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=120' } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || 'Unable to load UnitFlow pools.' }, { status: 502 });
  }
}
