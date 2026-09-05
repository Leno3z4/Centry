import { NextResponse } from 'next/server';
import { createPublicClient, defineChain, fallback, http, getAddress, parseAbiItem } from 'viem';

const ARC_CHAIN_ID = 5042002;
const FACTORY = '0xd67F63A4F26a497b364d1C82e6747Aec8B5743a5';
const WUSDC = '0x911b4000D3422F482F4062a913885f7b035382Df';
const CENT = '0x76e6d50D3151f0B4645ac0E53584F4204Fc6f0e3';
const PAIR_CREATED_EVENT = parseAbiItem('event PairCreated(address indexed token0, address indexed token1, address pair, uint256)');

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
const ZERO = '0x0000000000000000000000000000000000000000';
const DISCOVERY_LIMIT = 200;

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

async function findCentPairs(client) {
  try {
    const [token0Logs, token1Logs] = await Promise.all([
      client.getLogs({
        address: FACTORY,
        event: PAIR_CREATED_EVENT,
        args: { token0: getAddress(CENT) },
        fromBlock: 0n,
        toBlock: 'latest',
      }),
      client.getLogs({
        address: FACTORY,
        event: PAIR_CREATED_EVENT,
        args: { token1: getAddress(CENT) },
        fromBlock: 0n,
        toBlock: 'latest',
      }),
    ]);

    return [...token0Logs, ...token1Logs]
      .map((log) => log.args?.pair)
      .filter(validAddress)
      .map((pair) => getAddress(pair));
  } catch {
    return [];
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedAddress = searchParams.get('address');
    const wallet = validAddress(requestedAddress) ? getAddress(requestedAddress) : null;
    const client = createClient();

    const length = Number(await client.readContract({
      address: FACTORY,
      abi: FACTORY_ABI,
      functionName: 'allPairsLength',
    }));

    const take = Math.min(DISCOVERY_LIMIT, length);
    const indices = Array.from({ length: take }, (_, offset) => BigInt(length - 1 - offset));

    const pairResults = indices.length
      ? await Promise.all(indices.map((index) => readSafe(client, {
          address: FACTORY,
          abi: FACTORY_ABI,
          functionName: 'allPairs',
          args: [index],
        })))
      : [];

    const recentPairs = pairResults
      .map((item) => item.status === 'success' ? item.result : null)
      .filter(Boolean)
      .filter((pair) => pair !== ZERO)
      .map((pair) => getAddress(pair));

    // Keep Centry token pools discoverable even when they are older than the
    // recent discovery window. PairCreated indexes token0/token1, so this
    // lookup avoids walking all 4k+ pair contracts just to find CENT pools.
    const centPairs = await findCentPairs(client);
    const pairAddresses = [...new Set(
      [...recentPairs, ...centPairs].map((pair) => pair.toLowerCase()),
    )].map((pair) => getAddress(pair));

    if (!pairAddresses.length) {
      return NextResponse.json({ success: true, data: { count: length, pools: [], wallet } });
    }

    const pairData = await Promise.all(
      pairAddresses.map(async (pair) => {
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
      }),
    );

    const tokenAddresses = [];
    for (const item of pairData) {
      if (item.token0.status === 'success' && item.token0.result) tokenAddresses.push(getAddress(item.token0.result));
      if (item.token1.status === 'success' && item.token1.result) tokenAddresses.push(getAddress(item.token1.result));
    }

    const uniqueTokens = [...new Set(tokenAddresses.map((token) => token.toLowerCase()))]
      .map((token) => getAddress(token));

    const tokenMetaEntries = await Promise.all(
      uniqueTokens.map(async (token) => {
        if (token.toLowerCase() === WUSDC.toLowerCase()) return [token.toLowerCase(), WUSDC_META];
        const [symbol, name, decimals] = await Promise.all([
          readSafe(client, { address: token, abi: ERC20_ABI, functionName: 'symbol' }),
          readSafe(client, { address: token, abi: ERC20_ABI, functionName: 'name' }),
          readSafe(client, { address: token, abi: ERC20_ABI, functionName: 'decimals' }),
        ]);
        return [token.toLowerCase(), {
          symbol: symbol.status === 'success' ? String(symbol.result) : `${token.slice(0, 6)}…`,
          name: name.status === 'success' ? String(name.result) : 'Token',
          decimals: decimals.status === 'success' ? Number(decimals.result) : 18,
        }];
      }),
    );

    const tokenMeta = new Map(tokenMetaEntries);
    const recentPairSet = new Set(recentPairs.map((pair) => pair.toLowerCase()));

    const pools = pairData.map((item) => {
      const token0 = item.token0.status === 'success' && item.token0.result ? getAddress(item.token0.result) : null;
      const token1 = item.token1.status === 'success' && item.token1.result ? getAddress(item.token1.result) : null;
      if (!token0 || !token1) return null;
      const reserves = item.reserves.status === 'success' ? item.reserves.result : [0n, 0n, 0];
      const totalSupply = item.totalSupply.status === 'success' ? item.totalSupply.result : 0n;
      const lpBalance = wallet && item.lpBalance.status === 'success' ? item.lpBalance.result : 0n;
      return {
        pair: item.pair,
        token0,
        token1,
        token0Meta: tokenMeta.get(token0.toLowerCase()) || null,
        token1Meta: tokenMeta.get(token1.toLowerCase()) || null,
        reserve0: String(reserves[0] ?? 0),
        reserve1: String(reserves[1] ?? 0),
        totalSupply: String(totalSupply),
        lpBalance: String(lpBalance),
        createdIndex: recentPairSet.has(item.pair.toLowerCase())
          ? length - 1 - recentPairs.findIndex((pair) => pair.toLowerCase() === item.pair.toLowerCase())
          : null,
        hasPosition: Boolean(wallet && lpBalance > 0n),
        featured: token0.toLowerCase() === CENT.toLowerCase() || token1.toLowerCase() === CENT.toLowerCase(),
      };
    }).filter(Boolean);

    pools.sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return (b.createdIndex ?? -1) - (a.createdIndex ?? -1);
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          count: length,
          loaded: pools.length,
          discoveryLimit: DISCOVERY_LIMIT,
          pools,
          wallet,
        },
      },
      { headers: { 'Cache-Control': 's-maxage=15, stale-while-revalidate=60' } },
    );
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || 'Unable to load UnitFlow pools.' }, { status: 502 });
  }
}
