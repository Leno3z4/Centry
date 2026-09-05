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
const TOWER_QUOTE_DECIMALS = 18;

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

function findUsdPrice(prices, tokenAddress) {
  if (!prices || !tokenAddress) return null;
  const normalized = tokenAddress.toLowerCase();
  const market = ACTIVE_MARKETS.find((item) => item.address?.toLowerCase() === normalized);
  if (!market) return null;

  const aliases = {
    usdc: ['usd-coin', 'usdc'],
    eurc: ['eurc', 'euro-coin'],
    usdt: ['tether', 'usdt'],
    cirbtc: ['wrapped-bitcoin', 'bitcoin', 'btc', 'cirbtc'],
  };
  const keys = [
    ...(aliases[market.id] || []),
    market.id,
    market.symbol?.toLowerCase(),
    market.name?.toLowerCase(),
  ].filter(Boolean);

  for (const key of keys) {
    const value = prices?.[key]?.usd;
    if (Number.isFinite(Number(value)) && Number(value) > 0) return Number(value);
  }

  return null;
}

async function getExternalBtcUsd() {
  try {
    const response = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const value = Number(payload?.data?.amount);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function toUnits(raw, decimals) {
  try {
    return Number(BigInt(String(raw))) / 10 ** decimals;
  } catch {
    return null;
  }
}

function executionPriceImpact(inputUnits, outputUnits, inputPriceUsd, outputPriceUsd) {
  if (![inputUnits, outputUnits, inputPriceUsd, outputPriceUsd].every((value) => Number.isFinite(value) && value > 0)) {
    return null;
  }

  const fairOutput = (inputUnits * inputPriceUsd) / outputPriceUsd;
  if (!Number.isFinite(fairOutput) || fairOutput <= 0) return null;

  return Math.max(0, Math.min(100, (1 - outputUnits / fairOutput) * 100));
}

async function calculateQuotePriceImpact(quote, inputToken, outputToken) {
  const providerImpact = Number(quote?.priceImpact);
  const providerIsSane = Number.isFinite(providerImpact) && providerImpact >= 0 && providerImpact <= 100;

  const inputMarket = ACTIVE_MARKETS.find((item) => item.address?.toLowerCase() === inputToken.toLowerCase());
  const outputMarket = ACTIVE_MARKETS.find((item) => item.address?.toLowerCase() === outputToken.toLowerCase());
  if (!inputMarket || !outputMarket) return providerIsSane ? providerImpact : null;

  const apiKey = process.env.TOWER_API_KEY;
  if (!apiKey) return providerIsSane ? providerImpact : null;

  try {
    const response = await fetch(`${TOWER_BASE_URL}/prices`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });
    let prices = null;
    if (response.ok) {
      const payload = await response.json();
      prices = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
    }

    const inputPriceUsd = findUsdPrice(prices, inputToken);
    let outputPriceUsd = findUsdPrice(prices, outputToken);
    if (outputMarket.id === 'cirbtc') outputPriceUsd = outputPriceUsd || await getExternalBtcUsd();
    if (!inputPriceUsd || !outputPriceUsd) return providerIsSane ? providerImpact : null;

    const inputRaw = BigInt(String(quote.inputAmount || '0'));
    const outputRaw = BigInt(String(quote.outputAmount || '0'));
    if (inputRaw <= 0n || outputRaw <= 0n) return providerIsSane ? providerImpact : null;

    // Tower normalizes quote output amounts to its quote precision (18 decimals).
    // Input amounts remain in the sold token's native atomic units.
    // This was the source of the bogus 99% cirBTC impact: cirBTC itself has 8 decimals,
    // but Tower's quote output is represented at 18-decimal quote precision.
    const inputUnits = toUnits(inputRaw, Number(inputMarket.decimals ?? 6));
    const outputUnits = toUnits(outputRaw, TOWER_QUOTE_DECIMALS);
    const calculated = executionPriceImpact(inputUnits, outputUnits, inputPriceUsd, outputPriceUsd);
    if (calculated == null) return providerIsSane ? providerImpact : null;

    // Prefer the independently calculated figure whenever Tower's value materially
    // disagrees. This keeps stablecoin and cirBTC routes on the same unit-safe path.
    if (!providerIsSane || Math.abs(providerImpact - calculated) > 5) {
      return Number(calculated.toFixed(4));
    }

    return Number(providerImpact.toFixed(4));
  } catch {
    return providerIsSane ? providerImpact : null;
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
    if (response.ok && data?.success === true) {
      if (!isStructurallyValidQuote(data.data)) {
        return NextResponse.json({ success: false, error: 'Tower returned an incomplete quote. Try refreshing the quote or using a smaller amount.' }, { status: 422 });
      }

      const calculatedImpact = await calculateQuotePriceImpact(data.data, inputToken, outputToken);
      if (calculatedImpact != null) {
        data.data.priceImpact = calculatedImpact;
        data.data.priceImpactSource = 'sanity-checked';
      } else if (!Number.isFinite(Number(data.data.priceImpact)) || Number(data.data.priceImpact) < 0 || Number(data.data.priceImpact) > 100) {
        data.data.priceImpact = null;
        data.data.priceImpactSource = 'unavailable';
      }
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || 'Unable to reach a swap routing provider.' }, { status: 502 });
  }
}
