import { NextResponse } from 'next/server';
import { createPublicClient, encodeFunctionData, defineChain, http } from 'viem';
import { ACTIVE_MARKETS } from '../../../../../constants/markets';
import { CONTRACT_ADDRESSES } from '../../../../../constants/contracts';
import { rateLimit, rateLimitResponse, withRateLimitHeaders } from '../../../../../lib/rateLimit';
import { toTowerQuote } from '../../../../../lib/towerQuoteDecimals';

const ARC_CHAIN_ID = 5042;
const ARC_RPC_URL = process.env.ARC_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.mainnet.arc.io';
const TOWER_BASE_URL = 'https://www.tower.exchange/api/public';
const UNITFLOW_V3_ROUTER = '0x6fD8351b9596C1F0b2f2479BfA6A171cb3d0f410';

const ERC20_ABI = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
];

const ROUTER_ABI = [{
  type: 'function',
  name: 'exactInputSingle',
  stateMutability: 'nonpayable',
  inputs: [{
    name: 'params',
    type: 'tuple',
    components: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'recipient', type: 'address' },
      { name: 'deadline', type: 'uint256' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMinimum', type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
  }],
  outputs: [{ type: 'uint256' }],
}];

function isAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function marketFor(value) {
  if (!isAddress(value)) return null;
  const normalized = value.toLowerCase();
  return [
    ...ACTIVE_MARKETS,
    { address: CONTRACT_ADDRESSES.centryToken, symbol: 'CENT', decimals: 18 },
  ].find((item) => item.address?.toLowerCase() === normalized) || null;
}

function isCentPair(inputToken, outputToken) {
  const input = String(inputToken || '').toLowerCase();
  const output = String(outputToken || '').toLowerCase();
  const cent = CONTRACT_ADDRESSES.centryToken.toLowerCase();
  const usdc = CONTRACT_ADDRESSES.USDC.toLowerCase();
  return (
    (input === cent && output === usdc) ||
    (input === usdc && output === cent)
  );
}

function publicClient() {
  return createPublicClient({
    chain: defineChain({
      id: ARC_CHAIN_ID,
      name: 'Arc Mainnet',
      nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
      rpcUrls: { default: { http: [ARC_RPC_URL] } },
    }),
    transport: http(ARC_RPC_URL),
  });
}

function parseQuoteBigInt(quote, key) {
  try {
    return BigInt(String(quote?.[key] || '0'));
  } catch {
    return 0n;
  }
}

async function buildUnitFlowSwap(quote, userAddress) {
  if (!isAddress(userAddress) || !isCentPair(quote?.inputToken, quote?.outputToken)) {
    throw new Error('Invalid CENT swap request.');
  }

  const input = marketFor(quote.inputToken);
  const output = marketFor(quote.outputToken);
  const amountIn = parseQuoteBigInt(quote, 'inputAmount');
  const minOut = parseQuoteBigInt(quote, 'minOut');
  const fee = Number(quote?.fee);

  if (!input || !output || amountIn <= 0n || minOut <= 0n || ![100, 500, 3000, 10000].includes(fee)) {
    throw new Error('Invalid UnitFlow V3 quote.');
  }

  const client = publicClient();
  const allowance = await client.readContract({
    address: input.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [userAddress, UNITFLOW_V3_ROUTER],
  });

  const approval = allowance >= amountIn
    ? null
    : {
        to: input.address,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [UNITFLOW_V3_ROUTER, amountIn],
        }),
        value: '0',
        chainId: ARC_CHAIN_ID,
      };

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
  const swap = {
    to: UNITFLOW_V3_ROUTER,
    data: encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: 'exactInputSingle',
      args: [{
        tokenIn: input.address,
        tokenOut: output.address,
        fee,
        recipient: userAddress,
        deadline,
        amountIn,
        amountOutMinimum: minOut,
        sqrtPriceLimitX96: 0n,
      }],
    }),
    value: '0',
    chainId: ARC_CHAIN_ID,
    fee,
    provider: 'UnitFlow V3',
    route: `${input.symbol} → ${output.symbol}`,
  };

  return { approval, swap };
}

export async function POST(request) {
  const limit = rateLimit(request, 'swap-build', { max: 20, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    const body = await request.json();
    const quote = body?.quote;
    const userAddress = body?.userAddress;

    if (!quote || typeof quote !== 'object' || !isAddress(userAddress)) {
      return withRateLimitHeaders(
        NextResponse.json({ success: false, error: 'A valid swap quote and wallet address are required.' }, { status: 400 }),
        limit,
      );
    }

    if (Number(quote.chainId || ARC_CHAIN_ID) !== ARC_CHAIN_ID) {
      return withRateLimitHeaders(
        NextResponse.json({ success: false, error: 'Only Arc Mainnet swaps are enabled in Centry right now.' }, { status: 400 }),
        limit,
      );
    }

    if (isCentPair(quote.inputToken, quote.outputToken)) {
      const data = await buildUnitFlowSwap(quote, userAddress);
      return withRateLimitHeaders(NextResponse.json({ success: true, data }), limit);
    }

    const input = marketFor(quote.inputToken);
    const output = marketFor(quote.outputToken);
    if (!input || !output || input.symbol === 'CENT' || output.symbol === 'CENT') {
      return withRateLimitHeaders(
        NextResponse.json({ success: false, error: 'Unsupported swap pair. CENT swaps use the dedicated UnitFlow route; other supported assets use Tower.' }, { status: 400 }),
        limit,
      );
    }

    const apiKey = process.env.TOWER_API_KEY;
    if (!apiKey) {
      return withRateLimitHeaders(
        NextResponse.json({ success: false, error: 'Tower is not configured. Set TOWER_API_KEY on the server.' }, { status: 503 }),
        limit,
      );
    }

    const towerQuote = toTowerQuote(quote);

    const response = await fetch(`${TOWER_BASE_URL}/swap/build-tx`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ quote: towerQuote, userAddress }),
      cache: 'no-store',
    });

    const data = await response.json();
    return withRateLimitHeaders(
      NextResponse.json(data, { status: response.status }),
      limit,
    );
  } catch (error) {
    return withRateLimitHeaders(
      NextResponse.json(
        { success: false, error: error?.message || 'Unable to build the swap transaction.' },
        { status: 502 },
      ),
      limit,
    );
  }
}
