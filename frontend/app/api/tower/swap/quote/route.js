import { NextResponse } from 'next/server';
import { createPublicClient, defineChain, http } from 'viem';
import { ACTIVE_MARKETS } from '../../../../../constants/markets';

const TOWER_BASE_URL = 'https://www.tower.exchange/api/public';
const ARC_CHAIN_ID = 5042002;
const CENT = '0x76e6d50D3151f0B4645ac0E53584F4204Fc6f0e3';
const USDC = '0x3600000000000000000000000000000000000000';
const WUSDC = '0x911b4000D3422F482F4062a913885f7b035382Df';
const UNITFLOW_V25_SWAP_ROUTER = '0x4AA8c7Ac458479d9A4FA5c1481e03061ac76824A';
const WUSDC_SCALE = 10n ** 12n;

const UNITFLOW_V25_ROUTER_ABI = [
  {
    type: 'function',
    name: 'getAmountsOut',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
];

function isAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isCentPair(inputToken, outputToken) {
  return (
    (inputToken.toLowerCase() === CENT.toLowerCase() && outputToken.toLowerCase() === USDC.toLowerCase()) ||
    (inputToken.toLowerCase() === USDC.toLowerCase() && outputToken.toLowerCase() === CENT.toLowerCase())
  );
}

function validTowerToken(value) {
  if (!isAddress(value)) return false;
  return ACTIVE_MARKETS.some((market) => market.address?.toLowerCase() === value.toLowerCase());
}

function isStructurallyValidQuote(quote) {
  if (!quote || typeof quote !== 'object') return false;
  try {
    const output = BigInt(String(quote.outputAmount || '0'));
    const minOut = BigInt(String(quote.minOut || '0'));
    return output > 0n && minOut > 0n && minOut <= output;
  } catch {
    return false;
  }
}

async function getUnitFlowQuote(inputToken, outputToken, inputAmount, slippageTolerance) {
  const rpcUrl = process.env.ARC_RPC_URL || process.env.ARC_RPC_URL_VARIABLE || 'https://rpc.testnet.arc.network';
  const client = createPublicClient({
    chain: defineChain({
      id: ARC_CHAIN_ID,
      name: 'Arc Testnet',
      nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    }),
    transport: http(rpcUrl),
  });

  const inputRaw = BigInt(String(inputAmount));
  const inputIsUsdc = inputToken.toLowerCase() === USDC.toLowerCase();
  const routerInput = inputIsUsdc ? inputRaw * WUSDC_SCALE : inputRaw;
  const path = inputIsUsdc ? [WUSDC, CENT] : [CENT, WUSDC];

  const amounts = await client.readContract({
    address: UNITFLOW_V25_SWAP_ROUTER,
    abi: UNITFLOW_V25_ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: [routerInput, path],
  });

  if (!amounts?.length || amounts.length < 2) {
    throw new Error('UnitFlow returned an incomplete quote.');
  }

  const outputRaw = BigInt(amounts[amounts.length - 1]);
  const minOut = outputRaw * BigInt(10_000 - Number(slippageTolerance)) / 10_000n;
  if (outputRaw <= 0n || minOut <= 0n) {
    throw new Error('UnitFlow returned an unusable quote.');
  }

  return {
    inputToken,
    outputToken,
    inputAmount: inputRaw.toString(),
    outputAmount: outputRaw.toString(),
    minOut: minOut.toString(),
    unitFlowMinOut: minOut.toString(),
    quoteDecimals: 18,
    priceImpact: null,
    feeBps: null,
    dexName: 'UnitFlow v2.5',
    dexId: 'unitflow-v25',
    route: inputIsUsdc ? 'USDC → WUSDC → CENT' : 'CENT → WUSDC → USDC',
    chainId: ARC_CHAIN_ID,
    direct: true,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { inputToken, outputToken, inputAmount, slippageTolerance = 50 } = body || {};

    if (!isAddress(inputToken) || !isAddress(outputToken)) {
      return NextResponse.json({ success: false, error: 'Unsupported swap token.' }, { status: 400 });
    }

    if (String(inputToken).toLowerCase() === String(outputToken).toLowerCase()) {
      return NextResponse.json({ success: false, error: 'Input and output tokens must be different.' }, { status: 400 });
    }

    if (!/^\d+$/.test(String(inputAmount || ''))) {
      return NextResponse.json({ success: false, error: 'inputAmount must be an integer base-unit amount.' }, { status: 400 });
    }

    const requestedSlippage = Number(slippageTolerance);
    const slippage = Number.isFinite(requestedSlippage)
      ? Math.max(0, Math.min(5000, requestedSlippage))
      : 50;

    if (isCentPair(inputToken, outputToken)) {
      const data = await getUnitFlowQuote(inputToken, outputToken, inputAmount, slippage);
      return NextResponse.json({ success: true, data });
    }

    if (!validTowerToken(inputToken) || !validTowerToken(outputToken)) {
      return NextResponse.json({ success: false, error: 'Unsupported swap token.' }, { status: 400 });
    }

    const apiKey = process.env.TOWER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Tower is not configured. Set TOWER_API_KEY on the server.' }, { status: 503 });
    }

    const response = await fetch(`${TOWER_BASE_URL}/swap/quote`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputToken, outputToken, inputAmount: String(inputAmount), slippageTolerance: slippage }),
      cache: 'no-store',
    });

    const data = await response.json();
    if (response.ok && data?.success === true && !isStructurallyValidQuote(data.data)) {
      return NextResponse.json({ success: false, error: 'Tower returned an incomplete quote. Try refreshing the quote or using a smaller amount.' }, { status: 422 });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || 'Unable to reach a swap routing provider.' }, { status: 502 });
  }
}
