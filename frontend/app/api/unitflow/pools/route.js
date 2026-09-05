import { NextResponse } from 'next/server';
import { createPublicClient, defineChain, fallback, http, getAddress } from 'viem';

const ARC_CHAIN_ID = 5042002;
const FACTORY = '0xd67F63A4F26a497b364d1C82e6747Aec8B5743a5';
const WUSDC = '0x911b4000D3422F482F4062a913885f7b035382Df';

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
    chain: defineChain({ id: ARC_CHAIN_ID, name: 'Arc Testnet', nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 6 }, rpcUrls: { default: { http: urls } } }),
    transport: fallback(urls.map((url) => http(url)), { rank: true }),
  });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedAddress = searchParams.get('address');
    const wallet = validAddress(requestedAddress) ? getAddress(requestedAddress) : null;
    const client = createClient();

    const length = Number(await client.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'allPairsLength' }));
    const take = Math.min(12, length);
    const indices = Array.from({ length: take }, (_, offset) => BigInt(length - 1 - offset));

    if (!indices.length) return NextResponse.json({ success: true, data: { count: 0, pools: [] } });

    const pairResults = await client.multicall({
      contracts: indices.map((index) => ({ address: FACTORY, abi: FACTORY_ABI, functionName: 'allPairs', args: [index] })),
      allowFailure: true,
    });

    const pairAddresses = pairResults
      .map((item) => item.status === 'success' ? item.result : null)
      .filter(Boolean)
      .map((address) => getAddress(address));

    const pairMetaResults = await client.multicall({
      contracts: pairAddresses.flatMap((pair) => [
        { address: pair, abi: PAIR_ABI, functionName: 'token0' },
        { address: pair, abi: PAIR_ABI, functionName: 'token1' },
        { address: pair, abi: PAIR_ABI, functionName: 'getReserves' },
        { address: pair, abi: PAIR_ABI, functionName: 'totalSupply' },
        ...(wallet ? [{ address: pair, abi: PAIR_ABI, functionName: 'balanceOf', args: [wallet] }] : []),
      ]),
      allowFailure: true,
    });

    const stride = wallet ? 5 : 4;
    const tokenAddresses = [];
    for (let i = 0; i < pairAddresses.length; i += 1) {
      const base = i * stride;
      const token0 = pairMetaResults[base]?.status === 'success' ? getAddress(pairMetaResults[base].result) : null;
      const token1 = pairMetaResults[base + 1]?.status === 'success' ? getAddress(pairMetaResults[base + 1].result) : null;
      if (token0) tokenAddresses.push(token0);
      if (token1) tokenAddresses.push(token1);
    }

    const uniqueTokens = [...new Set(tokenAddresses.map((address) => address.toLowerCase()))].map((address) => getAddress(address));
    const tokenMetaResults = await client.multicall({
      contracts: uniqueTokens.flatMap((token) => [
        { address: token, abi: ERC20_ABI, functionName: 'symbol' },
        { address: token, abi: ERC20_ABI, functionName: 'name' },
        { address: token, abi: ERC20_ABI, functionName: 'decimals' },
      ]),
      allowFailure: true,
    });

    const tokenMeta = new Map();
    uniqueTokens.forEach((token, index) => {
      if (token.toLowerCase() === WUSDC.toLowerCase()) {
        tokenMeta.set(token.toLowerCase(), WUSDC_META);
        return;
      }
      const base = index * 3;
      tokenMeta.set(token.toLowerCase(), {
        symbol: tokenMetaResults[base]?.status === 'success' ? String(tokenMetaResults[base].result) : `${token.slice(0, 6)}…`,
        name: tokenMetaResults[base + 1]?.status === 'success' ? String(tokenMetaResults[base + 1].result) : 'Token',
        decimals: tokenMetaResults[base + 2]?.status === 'success' ? Number(tokenMetaResults[base + 2].result) : 18,
      });
    });

    const pools = pairAddresses.map((pair, index) => {
      const base = index * stride;
      const token0 = pairMetaResults[base]?.status === 'success' ? getAddress(pairMetaResults[base].result) : null;
      const token1 = pairMetaResults[base + 1]?.status === 'success' ? getAddress(pairMetaResults[base + 1].result) : null;
      const reserves = pairMetaResults[base + 2]?.status === 'success' ? pairMetaResults[base + 2].result : [0n, 0n, 0];
      const totalSupply = pairMetaResults[base + 3]?.status === 'success' ? pairMetaResults[base + 3].result : 0n;
      const lpBalance = wallet && pairMetaResults[base + 4]?.status === 'success' ? pairMetaResults[base + 4].result : 0n;
      return {
        pair,
        token0,
        token1,
        token0Meta: token0 ? tokenMeta.get(token0.toLowerCase()) : null,
        token1Meta: token1 ? tokenMeta.get(token1.toLowerCase()) : null,
        reserve0: String(reserves[0] ?? 0),
        reserve1: String(reserves[1] ?? 0),
        totalSupply: String(totalSupply),
        lpBalance: String(lpBalance),
        createdIndex: length - 1 - index,
        hasPosition: Boolean(wallet && lpBalance > 0n),
      };
    }).filter((pool) => pool.token0 && pool.token1);

    return NextResponse.json({ success: true, data: { count: length, pools, wallet } }, { headers: { 'Cache-Control': 's-maxage=15, stale-while-revalidate=60' } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || 'Unable to load UnitFlow pools.' }, { status: 502 });
  }
}
