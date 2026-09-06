import { NextResponse } from 'next/server';
import { createPublicClient, defineChain, fallback, http, getAddress } from 'viem';

const ARC_CHAIN_ID = 5042002;
const FACTORY = '0xd67F63A4F26a497b364d1C82e6747Aec8B5743a5';
const WUSDC = '0x911b4000D3422F482F4062a913885f7b035382Df';
const CENT = '0x76e6d50D3151f0B4645ac0E53584F4204Fc6f0e3';
const NATIVE_USDC = '0x3600000000000000000000000000000000000000';
const ZERO = '0x0000000000000000000000000000000000000000';
const MAX_DISPLAY_POOLS = 200;
const SEARCH_RESULT_LIMIT = 100;
const BATCH_SIZE = 50;
const CACHE_TTL_MS = 30_000;
const META_CACHE_TTL_MS = 5 * 60_000;
const SEARCH_TIMEOUT_MS = 8_000;
const PAIR_CREATED_TOPIC0 = '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9';

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

const ERC20_ABI = [
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
];

const WUSDC_META = { symbol: 'USDC', name: 'USD Coin', decimals: 18 };
const NATIVE_USDC_META = { symbol: 'USDC', name: 'USD Coin', decimals: 6 };

let recentCache = null;
const searchCache = new Map();
const tokenMetadataCache = new Map();

function validAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function createClient() {
  const urls = [
    process.env.ARC_RPC_URL,
    process.env.NEXT_PUBLIC_ARC_RPC_URL,
    'https://rpc.testnet.arc.network',
    'https://rpc.drpc.testnet.arc.network',
    'https://rpc.quicknode.testnet.arc.network',
    'https://rpc.blockdaemon.testnet.arc.network',
  ].filter(Boolean);

  return createPublicClient({
    chain: defineChain({
      id: ARC_CHAIN_ID,
      name: 'Arc Testnet',
      nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
      rpcUrls: { default: { http: urls } },
    }),
    transport: fallback(urls.map((url) => http(url)), { rank: true }),
  });
}

async function readSafe(client, args) {
  try {
    return { status: 'success', result: await client.readContract(args) };
  } catch {
    return { status: 'failure', result: null };
  }
}

async function readInBatches(items, worker, batchSize = BATCH_SIZE) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    results.push(...await Promise.all(items.slice(i, i + batchSize).map(worker)));
  }
  return results;
}

async function getTokenMeta(client, token) {
  const address = getAddress(token);
  const key = address.toLowerCase();
  const cached = tokenMetadataCache.get(key);
  if (cached && Date.now() - cached.timestamp < META_CACHE_TTL_MS) return cached.meta;

  if (key === WUSDC.toLowerCase()) {
    tokenMetadataCache.set(key, { timestamp: Date.now(), meta: WUSDC_META });
    return WUSDC_META;
  }
  if (key === NATIVE_USDC.toLowerCase()) {
    tokenMetadataCache.set(key, { timestamp: Date.now(), meta: NATIVE_USDC_META });
    return NATIVE_USDC_META;
  }

  const [symbol, name, decimals] = await Promise.all([
    readSafe(client, { address, abi: ERC20_ABI, functionName: 'symbol' }),
    readSafe(client, { address, abi: ERC20_ABI, functionName: 'name' }),
    readSafe(client, { address, abi: ERC20_ABI, functionName: 'decimals' }),
  ]);

  const meta = {
    symbol: symbol.status === 'success' ? String(symbol.result) : `${address.slice(0, 6)}…`,
    name: name.status === 'success' ? String(name.result) : 'Token',
    decimals: decimals.status === 'success' ? Number(decimals.result) : 18,
  };
  tokenMetadataCache.set(key, { timestamp: Date.now(), meta });
  return meta;
}

async function getPairDetails(client, pairs, wallet) {
  const uniquePairs = [...new Set(pairs.filter(Boolean).map((pair) => getAddress(pair)))];
  const pairData = await readInBatches(uniquePairs, async (pair) => {
    const [token0, token1, reserves, totalSupply, lpBalance] = await Promise.all([
      readSafe(client, { address: pair, abi: PAIR_ABI, functionName: 'token0' }),
      readSafe(client, { address: pair, abi: PAIR_ABI, functionName: 'token1' }),
      readSafe(client, { address: pair, abi: PAIR_ABI, functionName: 'getReserves' }),
      readSafe(client, { address: pair, abi: PAIR_ABI, functionName: 'totalSupply' }),
      wallet ? readSafe(client, { address: pair, abi: PAIR_ABI, functionName: 'balanceOf', args: [wallet] }) : Promise.resolve({ status: 'failure', result: 0n }),
    ]);
    return {
      pair,
      token0: token0.status === 'success' && token0.result ? getAddress(token0.result) : null,
      token1: token1.status === 'success' && token1.result ? getAddress(token1.result) : null,
      reserves,
      totalSupply,
      lpBalance,
    };
  });

  const uniqueTokens = [...new Set(pairData.flatMap((item) => [item.token0, item.token1]).filter(Boolean).map((token) => token.toLowerCase()))].map(getAddress);
  const tokenEntries = await readInBatches(uniqueTokens, async (token) => [token.toLowerCase(), await getTokenMeta(client, token)]);
  const tokenMeta = new Map(tokenEntries);

  return pairData.map((item) => {
    if (!item.token0 || !item.token1) return null;
    const meta0 = tokenMeta.get(item.token0.toLowerCase()) || null;
    const meta1 = tokenMeta.get(item.token1.toLowerCase()) || null;
    const reserves = item.reserves.status === 'success' ? item.reserves.result : [0n, 0n, 0];
    const reserve0 = BigInt(reserves[0] ?? 0);
    const reserve1 = BigInt(reserves[1] ?? 0);
    const totalSupply = item.totalSupply.status === 'success' ? item.totalSupply.result : 0n;
    const lpBalance = wallet && item.lpBalance.status === 'success' ? item.lpBalance.result : 0n;

    return {
      pair: item.pair,
      token0: item.token0,
      token1: item.token1,
      token0Meta: meta0,
      token1Meta: meta1,
      reserve0: reserve0.toString(),
      reserve1: reserve1.toString(),
      totalSupply: String(totalSupply),
      lpBalance: String(lpBalance),
      hasPosition: Boolean(wallet && lpBalance > 0n),
      featured: item.token0.toLowerCase() === CENT.toLowerCase() || item.token1.toLowerCase() === CENT.toLowerCase(),
      liquidityScore: (() => {
        const to18 = (value, decimals) => {
          const d = Number(decimals ?? 18);
          return d === 18 ? value : d < 18 ? value * 10n ** BigInt(18 - d) : value / 10n ** BigInt(d - 18);
        };
        const a = to18(reserve0, meta0?.decimals ?? 18);
        const b = to18(reserve1, meta1?.decimals ?? 18);
        const x = a * b;
        if (x <= 0n) return '0';
        let r = x;
        let n = (r + 1n) >> 1n;
        while (n < r) { r = n; n = (r + x / r) >> 1n; }
        return r.toString();
      })(),
    };
  }).filter(Boolean);
}

async function loadRecentPools(client, length, wallet) {
  const walletKey = wallet?.toLowerCase() || '';
  if (recentCache && recentCache.length === length && recentCache.walletKey === walletKey && Date.now() - recentCache.timestamp < CACHE_TTL_MS) return recentCache.pools;

  const take = Math.min(MAX_DISPLAY_POOLS, length);
  const indices = Array.from({ length: take }, (_, offset) => BigInt(length - 1 - offset));
  const pairResults = await readInBatches(indices, (index) => readSafe(client, { address: FACTORY, abi: FACTORY_ABI, functionName: 'allPairs', args: [index] }));
  const pairs = pairResults.map((item) => item.status === 'success' && item.result ? getAddress(item.result) : null).filter((pair) => pair && pair !== ZERO);
  const pools = await getPairDetails(client, pairs, wallet);
  pools.sort((a, b) => {
    const aa = BigInt(a.liquidityScore || 0);
    const bb = BigInt(b.liquidityScore || 0);
    return aa === bb ? 0 : aa > bb ? -1 : 1;
  });
  recentCache = { timestamp: Date.now(), length, walletKey, pools };
  return pools;
}

function hyperRpcUrls() {
  return [
    process.env.ARC_HYPERRPC_URL,
    process.env.HYPERRPC_URL,
    'https://arc-testnet.rpc.hypersync.xyz',
  ].filter(Boolean);
}

async function hyperRpc(url, method, params) {
  const headers = { 'content-type': 'application/json' };
  const token = process.env.ENVIO_API_TOKEN || process.env.HYPERSYNC_API_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HyperRPC HTTP ${response.status}`);
    const body = await response.json();
    if (body.error) throw new Error(body.error.message || 'HyperRPC request failed');
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

function decodePairCreatedLog(log) {
  if (!log?.topics || log.topics.length < 3 || !log.data) return null;
  const word = (value) => value.slice(2).padStart(64, '0');
  const token0 = getAddress(`0x${word(log.topics[1]).slice(-40)}`);
  const token1 = getAddress(`0x${word(log.topics[2]).slice(-40)}`);
  const dataWord = word(log.data);
  const pair = getAddress(`0x${dataWord.slice(-64).slice(-40)}`);
  return { pair, token0, token1 };
}

async function loadPairEventsFromHyperRpc() {
  const urls = hyperRpcUrls();
  for (const url of urls) {
    try {
      const latest = await hyperRpc(url, 'eth_blockNumber', []);
      const logs = await hyperRpc(url, 'eth_getLogs', [{
        address: FACTORY,
        topics: [PAIR_CREATED_TOPIC0],
        fromBlock: '0x0',
        toBlock: latest,
      }]);
      const pairs = [];
      for (const log of logs || []) {
        const decoded = decodePairCreatedLog(log);
        if (decoded) pairs.push(decoded);
      }
      if (pairs.length) return pairs;
      return [];
    } catch {
      // Try the next HyperRPC endpoint, then fall back to recent RPC pairs.
    }
  }
  return null;
}

async function findSearchCandidates(client, length, query) {
  const cacheKey = query.trim().toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.candidates;

  const eventPairs = await loadPairEventsFromHyperRpc();
  const pairs = eventPairs || (await loadRecentPools(client, length, null)).map((pool) => ({ pair: pool.pair, token0: pool.token0, token1: pool.token1 }));
  const addressQuery = validAddress(query) ? getAddress(query).toLowerCase() : null;

  if (addressQuery) {
    const candidates = pairs.filter((item) => item.pair.toLowerCase() === addressQuery || item.token0.toLowerCase() === addressQuery || item.token1.toLowerCase() === addressQuery).slice(0, SEARCH_RESULT_LIMIT).map((item) => item.pair);
    searchCache.set(cacheKey, { timestamp: Date.now(), candidates });
    return candidates;
  }

  const uniqueTokens = [...new Set(pairs.flatMap((item) => [item.token0, item.token1]).map((token) => token.toLowerCase()))].map(getAddress);
  const metaEntries = await readInBatches(uniqueTokens, async (token) => [token.toLowerCase(), await getTokenMeta(client, token)], 25);
  const metaMap = new Map(metaEntries);
  const candidates = pairs.filter((item) => {
    const meta0 = metaMap.get(item.token0.toLowerCase());
    const meta1 = metaMap.get(item.token1.toLowerCase());
    const haystack = [item.pair, item.token0, item.token1, meta0?.symbol, meta1?.symbol, meta0?.name, meta1?.name, `${meta0?.symbol || ''} / ${meta1?.symbol || ''}`].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(cacheKey);
  }).slice(0, SEARCH_RESULT_LIMIT).map((item) => item.pair);

  searchCache.set(cacheKey, { timestamp: Date.now(), candidates });
  return candidates;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedAddress = searchParams.get('address');
    const query = searchParams.get('q')?.trim() || '';
    const wallet = validAddress(requestedAddress) ? getAddress(requestedAddress) : null;
    const client = createClient();
    const length = Number(await client.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'allPairsLength' }));

    if (!length) {
      return NextResponse.json({ success: true, data: { count: 0, loaded: 0, pools: [], wallet, searched: Boolean(query), mode: query ? 'search' : 'recent' } });
    }

    if (!query) {
      const pools = await loadRecentPools(client, length, wallet);
      return NextResponse.json({ success: true, data: { count: length, loaded: pools.length, displayLimit: MAX_DISPLAY_POOLS, mode: 'recent', pools, wallet, searched: false } }, { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=120' } });
    }

    const candidates = await findSearchCandidates(client, length, query);
    const pools = await getPairDetails(client, candidates.slice(0, SEARCH_RESULT_LIMIT), wallet);
    pools.sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      const aa = BigInt(a.liquidityScore || 0);
      const bb = BigInt(b.liquidityScore || 0);
      return aa === bb ? 0 : aa > bb ? -1 : 1;
    });

    return NextResponse.json({
      success: true,
      data: {
        count: length,
        loaded: pools.length,
        displayLimit: SEARCH_RESULT_LIMIT,
        mode: 'search',
        pools,
        wallet,
        searched: true,
        query,
      },
    }, { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=120' } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || 'Unable to load UnitFlow pools.' }, { status: 502 });
  }
}
