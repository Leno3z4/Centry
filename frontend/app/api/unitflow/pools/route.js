import { NextResponse } from 'next/server';
import { createPublicClient, defineChain, fallback, http, getAddress, parseAbiItem } from 'viem';

const ARC_CHAIN_ID = 5042002;
const FACTORY = '0xd67F63A4F26a497b364d1C82e6747Aec8B5743a5';
const WUSDC = '0x911b4000D3422F482F4062a913885f7b035382Df';
const CENT = '0x76e6d50D3151f0B4645ac0E53584F4204Fc6f0e3';
const NATIVE_USDC = '0x3600000000000000000000000000000000000000';
const ZERO = '0x0000000000000000000000000000000000000000';
const MAX_DISPLAY_POOLS = 200;
const RECENT_BATCH_SIZE = 75;
const SEARCH_CACHE_TTL_MS = 30_000;
const METADATA_CACHE_TTL_MS = 5 * 60_000;

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

const PAIR_CREATED_EVENT = parseAbiItem('event PairCreated(address indexed token0, address indexed token1, address pair, uint256)');
const WUSDC_META = { symbol: 'USDC', name: 'USD Coin', decimals: 18 };
const NATIVE_USDC_META = { symbol: 'USDC', name: 'USD Coin', decimals: 6 };

let recentCache = null;
let searchCache = null;
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

async function readInBatches(items, worker, batchSize = RECENT_BATCH_SIZE) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    results.push(...await Promise.all(items.slice(i, i + batchSize).map(worker)));
  }
  return results;
}

async function getTokenMeta(client, token) {
  const address = getAddress(token);
  const key = address.toLowerCase();
  const existing = tokenMetadataCache.get(key);
  if (existing && Date.now() - existing.timestamp < METADATA_CACHE_TTL_MS) return existing.meta;

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
  const pairData = await readInBatches(pairs, async (pair) => {
    const [token0, token1, reserves, totalSupply, lpBalance] = await Promise.all([
      readSafe(client, { address: pair, abi: PAIR_ABI, functionName: 'token0' }),
      readSafe(client, { address: pair, abi: PAIR_ABI, functionName: 'token1' }),
      readSafe(client, { address: pair, abi: PAIR_ABI, functionName: 'getReserves' }),
      readSafe(client, { address: pair, abi: PAIR_ABI, functionName: 'totalSupply' }),
      wallet
        ? readSafe(client, { address: pair, abi: PAIR_ABI, functionName: 'balanceOf', args: [wallet] })
        : Promise.resolve({ status: 'failure', result: 0n }),
    ]);

    const t0 = token0.status === 'success' && token0.result ? getAddress(token0.result) : null;
    const t1 = token1.status === 'success' && token1.result ? getAddress(token1.result) : null;
    return { pair, token0: t0, token1: t1, reserves, totalSupply, lpBalance };
  });

  const tokenAddresses = [];
  for (const item of pairData) {
    if (item.token0) tokenAddresses.push(item.token0);
    if (item.token1) tokenAddresses.push(item.token1);
  }
  const uniqueTokens = [...new Set(tokenAddresses.map((token) => token.toLowerCase()))].map(getAddress);
  const tokenMetaPairs = await readInBatches(uniqueTokens, async (token) => [token.toLowerCase(), await getTokenMeta(client, token)]);
  const tokenMeta = new Map(tokenMetaPairs);

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
    };
  }).filter(Boolean);
}

function poolMatches(pool, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    pool.pair,
    pool.token0,
    pool.token1,
    pool.token0Meta?.symbol,
    pool.token1Meta?.symbol,
    pool.token0Meta?.name,
    pool.token1Meta?.name,
    `${pool.token0Meta?.symbol || ''} / ${pool.token1Meta?.symbol || ''}`,
  ].filter(Boolean).join(' ').toLowerCase().includes(q);
}

async function recentPools(client, length, wallet) {
  const walletKey = wallet?.toLowerCase() || '';
  if (recentCache && recentCache.length === length && recentCache.walletKey === walletKey && Date.now() - recentCache.timestamp < SEARCH_CACHE_TTL_MS) {
    return recentCache.pools;
  }

  const take = Math.min(MAX_DISPLAY_POOLS, length);
  const indices = Array.from({ length: take }, (_, offset) => BigInt(length - 1 - offset));
  const pairResults = await readInBatches(indices, (index) => readSafe(client, {
    address: FACTORY,
    abi: FACTORY_ABI,
    functionName: 'allPairs',
    args: [index],
  }));
  const pairs = pairResults
    .map((item) => item.status === 'success' && item.result ? getAddress(item.result) : null)
    .filter((pair) => pair && pair !== ZERO);
  const pools = await getPairDetails(client, [...new Set(pairs)], wallet);
  recentCache = { timestamp: Date.now(), length, walletKey, pools };
  return pools;
}

async function allPairEvents(client) {
  if (searchCache && Date.now() - searchCache.timestamp < SEARCH_CACHE_TTL_MS) return searchCache.events;
  const events = await client.getLogs({ address: FACTORY, event: PAIR_CREATED_EVENT, fromBlock: 0n, toBlock: 'latest' });
  const normalized = events.map((event) => ({
    pair: event.args?.pair ? getAddress(event.args.pair) : null,
    token0: event.args?.token0 ? getAddress(event.args.token0) : null,
    token1: event.args?.token1 ? getAddress(event.args.token1) : null,
    index: event.args?.[3] != null ? Number(event.args[3]) : null,
  })).filter((event) => event.pair && event.token0 && event.token1);
  searchCache = { timestamp: Date.now(), events: normalized };
  return normalized;
}

async function searchPools(client, query, wallet) {
  const events = await allPairEvents(client);
  const q = query.trim().toLowerCase();
  if (!q) return recentPools(client, events.length, wallet);

  const knownAddress = validAddress(query) ? query.toLowerCase() : null;
  const uniqueTokens = [...new Set(events.flatMap((event) => [event.token0, event.token1]).filter(Boolean).map((token) => token.toLowerCase()))].map(getAddress);

  const candidateTokenAddresses = new Set();
  if (knownAddress) {
    candidateTokenAddresses.add(knownAddress);
  } else {
    const metadata = await readInBatches(uniqueTokens, async (token) => ({ token, meta: await getTokenMeta(client, token) }));
    for (const item of metadata) {
      const haystack = `${item.token} ${item.meta.symbol} ${item.meta.name}`.toLowerCase();
      if (haystack.includes(q)) candidateTokenAddresses.add(item.token.toLowerCase());
    }
  }

  const matches = events.filter((event) => {
    if (knownAddress) return event.pair.toLowerCase() === knownAddress || event.token0.toLowerCase() === knownAddress || event.token1.toLowerCase() === knownAddress;
    return candidateTokenAddresses.has(event.token0.toLowerCase()) || candidateTokenAddresses.has(event.token1.toLowerCase());
  });

  const pools = await getPairDetails(client, matches.map((event) => event.pair), wallet);
  return pools.filter((pool) => poolMatches(pool, q)).slice(0, 100);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedAddress = searchParams.get('address');
    const query = searchParams.get('q')?.trim() || '';
    const wallet = validAddress(requestedAddress) ? getAddress(requestedAddress) : null;
    const client = createClient();

    const length = Number(await client.readContract({
      address: FACTORY,
      abi: FACTORY_ABI,
      functionName: 'allPairsLength',
    }));

    if (!length) return NextResponse.json({ success: true, data: { count: 0, loaded: 0, pools: [], wallet, searched: Boolean(query) } });

    const pools = query ? await searchPools(client, query, wallet) : await recentPools(client, length, wallet);

    return NextResponse.json(
      {
        success: true,
        data: {
          count: length,
          loaded: pools.length,
          displayLimit: query ? 100 : MAX_DISPLAY_POOLS,
          mode: query ? 'exhaustive-search' : 'recent',
          pools,
          wallet,
          searched: Boolean(query),
        },
      },
      { headers: { 'Cache-Control': query ? 's-maxage=30, stale-while-revalidate=60' : 's-maxage=30, stale-while-revalidate=120' } },
    );
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || 'Unable to load UnitFlow pools.' }, { status: 502 });
  }
}
