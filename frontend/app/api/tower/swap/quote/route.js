import { NextResponse } from 'next/server';
import { createPublicClient, defineChain, http } from 'viem';
import { ACTIVE_MARKETS } from '../../../../../constants/markets';
import { CONTRACT_ADDRESSES } from '../../../../../constants/contracts';
import { rateLimit, rateLimitResponse, withRateLimitHeaders } from '../../../../../lib/rateLimit';

const ARC_CHAIN_ID = 5042;
const ARC_RPC_URL = process.env.ARC_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.mainnet.arc.io';
const UNITFLOW_V3_QUOTER = '0x5AF6E89F0960Ff375AF84d9911D8153ef6240E34';
const UNITFLOW_FEES = [100, 500, 3000, 10000];

const QUOTER_ABI = [{
  type: 'function',
  name: 'quoteExactInput',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'path', type: 'bytes' },
    { name: 'amountIn', type: 'uint256' },
  ],
  outputs: [
    { name: 'amountOut', type: 'uint256' },
    { name: 'sqrtPriceX96AfterList', type: 'uint160[]' },
    { name: 'initializedTicksCrossedList', type: 'uint32[]' },
    { name: 'gasEstimate', type: 'uint256' },
  ],
}];

function isAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function supportedToken(value) {
  if (!isAddress(value)) return null;
  const normalized = value.toLowerCase();
  const market = [...ACTIVE_MARKETS, { address: CONTRACT_ADDRESSES.centryToken, symbol: 'CENT', decimals: 18 }]
    .find((item) => item.address?.toLowerCase() === normalized);
  return market || null;
}

function encodePath(tokenIn, fee, tokenOut) {
  return `0x${tokenIn.slice(2)}${fee.toString(16).padStart(6, '0')}${tokenOut.slice(2)}`;
}

function client() {
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

async function quoteUnitFlowV3(inputToken, outputToken, inputAmount) {
  const input = supportedToken(inputToken);
  const output = supportedToken(outputToken);
  if (!input || !output) throw new Error('Unsupported swap token.');
  const amount = BigInt(String(inputAmount));
  const publicClient = client();
  let best = null;

  for (const fee of UNITFLOW_FEES) {
    try {
      const result = await publicClient.simulateContract({
        address: UNITFLOW_V3_QUOTER,
        abi: QUOTER_ABI,
        functionName: 'quoteExactInput',
        args: [encodePath(input.address, fee, output.address), amount],
      });
      const outputAmount = BigInt(result.result?.[0] ?? 0n);
      if (outputAmount > 0n && (!best || outputAmount > best.outputAmount)) {
        best = { fee, outputAmount };
      }
    } catch {
      // No pool/liquidity at this fee tier.
    }
  }

  if (!best) throw new Error('No UnitFlow V3 route with available liquidity was found.');

  return {
    inputToken: input.address,
    outputToken: output.address,
    inputAmount: amount.toString(),
    outputAmount: best.outputAmount.toString(),
    fee: best.fee,
    inputSymbol: input.symbol,
    outputSymbol: output.symbol,
  };
}

export async function POST(request) {
  const limit = rateLimit(request, 'unitflow-v3-quote', { max: 30, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    const body = await request.json();
    const { inputToken, outputToken, inputAmount, slippageTolerance = 50 } = body || {};

    if (!isAddress(inputToken) || !isAddress(outputToken) || inputToken.toLowerCase() === outputToken.toLowerCase()) {
      return withRateLimitHeaders(NextResponse.json({ success: false, error: 'Unsupported swap token pair.' }, { status: 400 }), limit);
    }
    if (!/^\d+$/.test(String(inputAmount || '')) || BigInt(String(inputAmount)) <= 0n) {
      return withRateLimitHeaders(NextResponse.json({ success: false, error: 'inputAmount must be a positive integer base-unit amount.' }, { status: 400 }), limit);
    }

    const slippage = Number.isFinite(Number(slippageTolerance))
      ? Math.max(0, Math.min(5000, Math.round(Number(slippageTolerance))))
      : 50;
    const quote = await quoteUnitFlowV3(inputToken, outputToken, inputAmount);
    const minOut = BigInt(quote.outputAmount) * BigInt(10_000 - slippage) / 10_000n;
    if (minOut <= 0n) throw new Error('Computed minimum output is zero.');

    const data = {
      ...quote,
      minOut: minOut.toString(),
      unitFlowMinOut: minOut.toString(),
      quoteDecimals: quote.outputSymbol === 'CENT' ? 18 : (ACTIVE_MARKETS.find((m) => m.address?.toLowerCase() === quote.outputToken.toLowerCase())?.decimals ?? 18),
      priceImpact: null,
      priceImpactSource: 'unavailable',
      feeBps: quote.fee / 100,
      dexName: 'UnitFlow V3',
      dexId: 'unitflow-v3',
      route: `${quote.inputSymbol} → ${quote.outputSymbol}`,
      chainId: ARC_CHAIN_ID,
      direct: true,
    };

    return withRateLimitHeaders(NextResponse.json({ success: true, data }), limit);
  } catch (error) {
    return withRateLimitHeaders(NextResponse.json({ success: false, error: error?.message || 'Unable to quote the UnitFlow V3 route.' }, { status: 502 }), limit);
  }
}
