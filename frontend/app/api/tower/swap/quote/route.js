import { NextResponse } from 'next/server';
import { createPublicClient, defineChain, http } from 'viem';
import { ACTIVE_MARKETS } from '../../../../../constants/markets';
import { CONTRACT_ADDRESSES } from '../../../../../constants/contracts';
import { rateLimit, rateLimitResponse, withRateLimitHeaders } from '../../../../../lib/rateLimit';
import { normalizeTowerQuoteDecimals } from '../../../../../lib/towerQuoteDecimals';

const ARC_CHAIN_ID = 5042;
const ARC_RPC_URL = process.env.ARC_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.mainnet.arc.io';
const TOWER_BASE_URL = 'https://www.tower.exchange/api/public';
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
  return [
    ...ACTIVE_MARKETS,
    { address: CONTRACT_ADDRESSES.centryToken, symbol: 'CENT', decimals: 18 },
  ].find((item) => item.address?.toLowerCase() === normalized) || null;
}

function isCentPair(inputToken, outputToken) {
  const input = inputToken.toLowerCase();
  const output = outputToken.toLowerCase();
  const cent = CONTRACT_ADDRESSES.centryToken.toLowerCase();
  const usdc = CONTRACT_ADDRESSES.USDC.toLowerCase();
  return (
    (input === cent && output === usdc) ||
    (input === usdc && output === cent)
  );
}

function encodePath(tokenIn, fee, tokenOut) {
  return `0x${tokenIn.slice(2)}${fee.toString(16).padStart(6, '0')}${tokenOut.slice(2)}`;
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

async function quoteUnitFlowV3(inputToken, outputToken, inputAmount) {
  const input = supportedToken(inputToken);
  const output = supportedToken(outputToken);
  if (!input || !output) throw new Error('Unsupported CENT swap token pair.');

  const amount = BigInt(String(inputAmount));
  const client = publicClient();
  let best = null;

  for (const fee of UNITFLOW_FEES) {
    try {
      const result = await client.simulateContract({
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
      // Fee tier may not have a live pool.
    }
  }

  if (!best) throw new Error('No UnitFlow V3 route with available liquidity was found for the CENT pair.');

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

function structurallyValidTowerQuote(data) {
  if (!data || typeof data !== 'object') return false;
  try {
    const outputAmount = BigInt(String(data.outputAmount || '0'));
    const minOut = BigInt(String(data.minOut || '0'));
    return outputAmount > 0n && minOut > 0n && minOut <= outputAmount;
  } catch {
    return false;
  }
}

export async function POST(request) {
  const limit = rateLimit(request, 'swap-quote', { max: 30, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    const body = await request.json();
    const {
      inputToken,
      outputToken,
      inputAmount,
      slippageTolerance = 50,
    } = body || {};

    if (!isAddress(inputToken) || !isAddress(outputToken)) {
      return withRateLimitHeaders(
        NextResponse.json({ success: false, error: 'Invalid swap token address.' }, { status: 400 }),
        limit,
      );
    }

    if (inputToken.toLowerCase() === outputToken.toLowerCase()) {
      return withRateLimitHeaders(
        NextResponse.json({ success: false, error: 'Input and output tokens must be different.' }, { status: 400 }),
        limit,
      );
    }

    if (!/^\d+$/.test(String(inputAmount || '')) || BigInt(String(inputAmount)) <= 0n) {
      return withRateLimitHeaders(
        NextResponse.json({ success: false, error: 'inputAmount must be a positive integer base-unit amount.' }, { status: 400 }),
        limit,
      );
    }

    const requestedSlippage = Number(slippageTolerance);
    const slippage = Number.isFinite(requestedSlippage)
      ? Math.max(0, Math.min(5000, Math.round(requestedSlippage)))
      : 50;

    if (isCentPair(inputToken, outputToken)) {
      const quote = await quoteUnitFlowV3(inputToken, outputToken, inputAmount);
      const minOut = BigInt(quote.outputAmount) * BigInt(10_000 - slippage) / 10_000n;
      if (minOut <= 0n) throw new Error('Computed minimum output is zero.');

      const outputMarket = supportedToken(quote.outputToken);
      const data = {
        ...quote,
        minOut: minOut.toString(),
        unitFlowMinOut: minOut.toString(),
        quoteDecimals: outputMarket?.decimals ?? 18,
        priceImpact: null,
        priceImpactSource: 'unavailable',
        feeBps: quote.fee / 100,
        dexName: 'UnitFlow V3',
        dexId: 'unitflow-v3',
        route: `${quote.inputSymbol} → ${quote.outputSymbol}`,
        chainId: ARC_CHAIN_ID,
        direct: true,
      };

      return withRateLimitHeaders(
        NextResponse.json({ success: true, data }),
        limit,
      );
    }

    const inputMarket = ACTIVE_MARKETS.find((market) => market.address?.toLowerCase() === inputToken.toLowerCase());
    const outputMarket = ACTIVE_MARKETS.find((market) => market.address?.toLowerCase() === outputToken.toLowerCase());
    if (!inputMarket || !outputMarket) {
      return withRateLimitHeaders(
        NextResponse.json({ success: false, error: 'Unsupported swap token pair. CENT swaps are limited to the dedicated UnitFlow pair.' }, { status: 400 }),
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

    const response = await fetch(`${TOWER_BASE_URL}/swap/quote`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputToken,
        outputToken,
        inputAmount: String(inputAmount),
        slippageTolerance: slippage,
      }),
      cache: 'no-store',
    });

    const data = await response.json();

    if (response.ok && data?.success === true) {
      if (!structurallyValidTowerQuote(data.data)) {
        return withRateLimitHeaders(
          NextResponse.json(
            { success: false, error: 'Tower returned an incomplete quote. Try refreshing the quote or using a smaller amount.' },
            { status: 422 },
          ),
          limit,
        );
      }

      const normalizedQuote = normalizeTowerQuoteDecimals(data.data, outputMarket.decimals);
      data.data = normalizedQuote;

      const providerImpact = Number(data.data.priceImpact);
      data.data.priceImpact = Number.isFinite(providerImpact) && providerImpact >= 0 && providerImpact <= 100
        ? providerImpact
        : null;
      data.data.priceImpactSource = data.data.priceImpact == null ? 'unavailable' : 'tower';
      data.data.chainId = Number(data.data.chainId || ARC_CHAIN_ID);
      data.data.quoteDecimals = outputMarket.decimals;
    }

    return withRateLimitHeaders(
      NextResponse.json(data, { status: response.status }),
      limit,
    );
  } catch (error) {
    return withRateLimitHeaders(
      NextResponse.json(
        { success: false, error: error?.message || 'Unable to reach a swap routing provider.' },
        { status: 502 },
      ),
      limit,
    );
  }
}
