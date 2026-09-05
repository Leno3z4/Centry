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
const CACHE_TTL_MS = 60_000;

const FACTORY_ABI = [
  { type: 'function', name: 'allPairsLength', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allPairs', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
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
let registryCache = null;

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

async function readInBatches(items, worker) {
  const results = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    results.push(...await Promise.all(items.slice(i, i + BATCH_SIZE).map(worker)));
  }
  return results;
}

function normalizeTo18(raw, decimals) {
  const value = BigInt(raw || 0);
  const d = Number(decimals ?? 18);
  if (d === 18) return value;
  if (d < 18) return value * 10n ** BigInt(18 - d);
  return value / 10n ** BigInt(d - 18);
}

function sqrt(value) {
  if (value <= 0n) return 0n;
  let x = value;
  let y = (x + 1n) >> 1n;
  while (y < x) {
    x = y;
    y = (x + value / x) >> 1n;
  }
  return x;
}

function matchesQuery(pool, query) {
  const q = query.toLowerCase();
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

async function loadRegistry(client, length, wallet) {
  const walletKey = wallet?.toLowerCase() || '';
  if (
    registryCache &&
    registryCache.count === length &&
    registryCache.walletKey === walletKey &&
    Date.now() - registryCache.timestamp < CACHE_TTL_MS
  ) {
    return registryCache;
  }

  const indices = Array.from({ length }, (_, index) => BigInt(index));
  const pairResults = await readInBatches(indices, (index) => readSafe(client, {
    address: FACTORY,
    abi: FACTORY_ABI,
    functionName: 'allPairs',
    args: [index],
  }));

  const pairAddresses = pairResults
    .map((item) => item.status === 'success' && item.result ? getAddress(item.result) : null)
    .filter(Boolean)
    .filter((pair) => pair !== ZERO);

  const pairData = await readInBatches(pairAddresses, async (pair) => {
    const [token0, token1, reserves, totalSupply, lpBalance] = await Promise.all([
      readSafe(client, { address: pair, abi: PAIR_ABI, functionName: 'token0' }),
      readSafe(client, { address: pair, abi: PAIR_ABI, functionName: 'token1' }),
      readSafe(client, { address: pair, abi: PAIR_ABI, functionName: 'getReserves' }),
      readSafe(client, { address: pair, abi: PAIR_ABI, functionName: 'totalSupply' }),
      wallet
        ? readSafe(client, { address: pair, abi: PAIR_ABI, functionName: 'balanceOf', args: [wallet] })
        : Promise.resolve({ status: 'failure', result: 0n }),
    ]);
    return { pair, token0, token1, reserves, totalSupply, lpBalance };
  });

  const addresses = [];
  for (const item of pairData) {
    if (item.token0.status === 'success' && item.token0.result) addresses.push(getAddress(item.token0.result));
    if (item.token1.status === 'success' && item.token1.result) addresses.push(getAddress(item.token1.result));
  }
  const uniqueTokens = [...new Set(addresses.map((address) => address.toLowerCase()))].map(getAddress);

  const tokenMetaEntries = await readInBatches(uniqueTokens, async (token) => {
    const normalized = token.toLowerCase();
    if (normalized === WUSDC.toLowerCase()) return [normalized, WUSDC_META];
    if (normalized === NATIVE_USDC.toLowerCase()) return [normalized, NATIVE_USDC_META];
    const [symbol, name, decimals] = await Promise.all([
      readSafe(client, { address: token, abi: ERC20_ABI, functionName: 'symbol' }),
      readSafe(client, { address: token, abi: ERC20_ABI, functionName: 'name' }),
      readSafe(client, { address: token, abi: ERC20_ABI, functionName: 'decimals' }),
    ]);
    return [normalized, {
      symbol: symbol.status === 'success' ? String(symbol.result) : `${token.slice(0, 6)}…`,
      name: name.status === 'success' ? String(name.result) : 'Token',
      decimals: decimals.status === 'success' ? Number(decimals.result) : 18,
    }];
  });

  const tokenMeta = new Map(tokenMetaEntries);
  const pools = pairData.map((item, index) => {
    const token0 = item.token0.status === 'success' && item.token0.result ? getAddress(item.token0.result) : null;
    const token1 = item.token1.status === 'success' && item.token1.result ? getAddress(item.token1.result) : null;
    if (!token0 || !token1) return null;

    const meta0 = tokenMeta.get(token0.toLowerCase()) || { symbol: `${token0.slice(0, 6)}…`, name: 'Token', decimals: 18 };
    const meta1 = tokenMeta.get(token1.toLowerCase()) || { symbol: `${token1.slice(0, 6)}…`, name: 'Token', decimals: 18 };
    const reserves = item.reserves.status === 'success' ? item.reserves.result : [0n, 0n, 0];
    const reserve0 = BigInt(reserves[0] ?? 0);
    const reserve1 = BigInt(reserves[1] ?? 0);
    const normalized0 = normalizeTo18(reserve0, meta0.decimals);
    const normalized1 = normalizeTo18(reserve1, meta1.decimals);
    const liquidityScore = sqrt(normalized0 * normalized1);
    const totalSupply = item.totalSupply.status === 'success' ? item.totalSupply.result : 0n;
    const lpBalance = wallet && item.lpBalance.status === 'success' ? item.lpBalance.result : 0n;

    return {
      pair: item.pair,
      token0,
      token1,
      token0Meta: meta0,
      token1Meta: meta1,
      reserve0: reserve0.toString(),
      reserve1: reserve1.toString(),
      totalSupply: String(totalSupply),
      lpBalance: String(lpBalance),
      liquidityScore: liquidityScore.toString(),
      createdIndex: index,
      hasPosition: Boolean(wallet && lpBalance > 0n),
      featured: token0.toLowerCase() === CENT.toLowerCase() || token1.toLowerCase() === CENT.toLowerCase(),
    };
  }).filter(Boolean);

  pools.sort((a, b) => {
    const aa = BigInt(a.liquidityScore || 0);
    const bb = BigInt(b.liquidityScore || 0);
    if (aa === bb) return b.createdIndex - a.createdIndex;
    return aa > bb ? -1 : 1;
  });

  registryCache = { timestamp: Date.now(), count: length, walletKey, pools };
  return registryCache;
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

    if (!length) return NextResponse.json({ success: true, data: { count: 0, pools: [], wallet } });

    const registry = await loadRegistry(client, length, wallet);
    const topPools = registry.pools.slice(0, MAX_DISPLAY_POOLS);
    const matches = query ? registry.pools.filter((pool) => matchesQuery(pool, query)).slice(0, 50) : [];
    const seen = new Set();
    const pools = [...matches, ...topPools].filter((pool) => {
      const key = pool.pair.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          count: length,
          loaded: pools.length,
          topLimit: MAX_DISPLAY_POOLS,
          rankedBy: 'normalized-reserve-liquidity',
          pools,
          wallet,
          searchMatches: matches.length,
        },
      },
      { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } },
    );
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || 'Unable to load UnitFlow pools.' }, { status: 502 });
  }
}
