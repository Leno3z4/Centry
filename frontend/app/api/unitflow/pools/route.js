import { NextResponse } from 'next/server';
import { createPublicClient, defineChain, fallback, http, getAddress } from 'viem';

const ARC_CHAIN_ID = 5042002;
const FACTORY = '0xd67F63A4F26a497b364d1C82e6747Aec8B5743a5';
const WUSDC = '0x911b4000D3422F482F4062a913885f7b035382Df';
const CENT = '0x76e6d50D3151f0B4645ac0E53584F4204Fc6f0e3';
const NATIVE_USDC = '0x3600000000000000000000000000000000000000';
const ZERO = '0x0000000000000000000000000000000000000000';
const MAX_DISPLAY_POOLS = 200;
const BATCH_SIZE = 75;
const CACHE_TTL_MS = 30_000;
const META_CACHE_TTL_MS = 5 * 60_000;

const FACTORY_ABI = [
  { type: 'function', name: 'allPairsLength', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allPairs', stateMutability: 'view', inputs: [{ name: 'index', type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'getPair', stateMutability: 'view', inputs: [{ name: 'tokenA', type: 'address' }, { name: 'tokenB', type: 'address' }], outputs: [{ type: 'address' }] },
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
      wallet
        ? readSafe(client, { address: pair, abi: PAIR_ABI, functionName: 'balanceOf', args: [wallet] })
        : Promise.resolve({ status: 'failure', result: 0n }),
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

  const tokenAddresses = [];
  for (const item of pairData) {
    if (item.token0) tokenAddresses.push(item.token0);
    if (item.token1) tokenAddresses.push(item.token1);
  }
  const uniqueTokens = [...new Set(tokenAddresses.map((token) => token.toLowerCase()))].map(getAddress);
  const tokenEntries = await readInBatches(uniqueTokens, async (token) => [
    token.toLowerCase(),
    await getTokenMeta(client, token),
  ]);
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
        let x = a * b;
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
  if (
    recentCache &&
    recentCache.length === length &&
    recentCache.walletKey === walletKey &&
    Date.now() - recentCache.timestamp < CACHE_TTL_MS
  ) return recentCache.pools;

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

  const pools = await getPairDetails(client, pairs, wallet);
  pools.sort((a, b) => {
    const aa = BigInt(a.liquidityScore || 0);
    const bb = BigInt(b.liquidityScore || 0);
    if (aa !== bb) return aa > bb ? -1 : 1;
    return 0;
  });

  recentCache = { timestamp: Date.now(), length, walletKey, pools };
  return pools;
}

async function findSearchCandidates(client, length, query) {
  const cacheKey = query.trim().toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.candidates;

  // Address search can use the factory mapping directly and does not require scanning history.
  if (validAddress(query)) {
    const address = getAddress(query);
    const recentIndexes = Array.from({ length: Math.min(MAX_DISPLAY_POOLS, length) }, (_, offset) => BigInt(length - 1 - offset));
    const recentPairs = await readInBatches(recentIndexes, (index) => readSafe(client, {
      address: FACTORY,
      abi: FACTORY_ABI,
      functionName: 'allPairs',
      args: [index],
    }));
    const pairCandidates = recentPairs
      .map((item) => item.status === 'success' && item.result ? getAddress(item.result) : null)
      .filter(Boolean);
    const candidates = [...new Set(pairCandidates.filter((pair) => pair.toLowerCase() === address.toLowerCase()))];
    searchCache.set(cacheKey, { timestamp: Date.now(), candidates });
    return candidates;
  }

  // Symbol/name search needs the complete UnitFlow v2.5 pair registry, but it does
  // not need historical logs. We scan only token0/token1 for each pair, then fetch
  // full reserves/metadata only for the matching pairs.
  const indices = Array.from({ length }, (_, index) => BigInt(index));
  const pairResults = await readInBatches(indices, (index) => readSafe(client, {
    address: FACTORY,
    abi: FACTORY_ABI,
    functionName: 'allPairs',
    args: [index],
  }));
  const pairAddresses = pairResults
    .map((item) => item.status === 'success' && item.result ? getAddress(item.result) : null)
    .filter((pair) => pair && pair !== ZERO);

  const endpoints = await readInBatches(pairAddresses, async (pair) => {
    const [token0, token1] = await Promise.all([
      readSafe(client, { address: pair, abi: PAIR_ABI, functionName: 'token0' }),
      readSafe(client, { address: pair, abi: PAIR_ABI, functionName: 'token1' }),
    ]);
    return {
      pair,
      token0: token0.status === 'success' && token0.result ? getAddress(token0.result) : null,
      token1: token1.status === 'success' && token1.result ? getAddress(token1.result) : null,
    };
  });

  const uniqueTokens = [...new Set(
    endpoints.flatMap((item) => [item.token0, item.token1]).filter(Boolean).map((token) => token.toLowerCase()),
  )].map(getAddress);
  const metas = await readInBatches(uniqueTokens, async (token) => ({ token, meta: await getTokenMeta(client, token) }));
  const matchingTokens = new Set(
    metas
      .filter(({ token, meta }) => `${token} ${meta.symbol} ${meta.name}`.toLowerCase().includes(cacheKey))
      .map(({ token }) => token.toLowerCase()),
  );

  const candidates = endpoints
    .filter((item) => matchingTokens.has(item.token0?.toLowerCase()) || matchingTokens.has(item.token1?.toLowerCase()))
    .map((item) => item.pair);
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

    const length = Number(await client.readContract({
      address: FACTORY,
      abi: FACTORY_ABI,
      functionName: 'allPairsLength',
    }));

    if (!length) {
      return NextResponse.json({ success: true, data: { count: 0, loaded: 0, pools: [], wallet, searched: Boolean(query), mode: query ? 'exhaustive-search' : 'recent' } });
    }

    if (!query) {
      const pools = await loadRecentPools(client, length, wallet);
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
      }, { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=120' } });
    }

    const candidates = await findSearchCandidates(client, length, query);
    const pools = await getPairDetails(client, candidates, wallet);
    pools.sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return 0;
    });

    return NextResponse.json({
      success: true,
      data: {
        count: length,
        loaded: pools.length,
        displayLimit: 100,
        mode: 'exhaustive-search',
        pools: pools.slice(0, 100),
        wallet,
        searched: true,
      },
    }, { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || 'Unable to load UnitFlow pools.' }, { status: 502 });
  }
}
