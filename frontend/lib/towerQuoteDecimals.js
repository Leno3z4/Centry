import { CONTRACT_ADDRESSES } from '../constants/contracts';

const TOWER_EURC_OUTPUT_DECIMALS = 18;
const TOWER_USDC_OUTPUT_DECIMALS = 12;
const TOWER_CIRBTC_OUTPUT_DECIMALS = 18;

const TOWER_OUTPUT_DECIMAL_OVERRIDES = Object.freeze({
  [CONTRACT_ADDRESSES.EURC.toLowerCase()]: TOWER_EURC_OUTPUT_DECIMALS,
  [CONTRACT_ADDRESSES.USDC.toLowerCase()]: TOWER_USDC_OUTPUT_DECIMALS,
  [CONTRACT_ADDRESSES.CIRBTC.toLowerCase()]: TOWER_CIRBTC_OUTPUT_DECIMALS,
});

function asRaw(value) {
  try {
    return BigInt(String(value ?? '0'));
  } catch {
    return 0n;
  }
}

function scaleRawAmount(value, fromDecimals, toDecimals) {
  const raw = asRaw(value);
  if (raw <= 0n || fromDecimals === toDecimals) return raw;

  if (fromDecimals > toDecimals) {
    return raw / (10n ** BigInt(fromDecimals - toDecimals));
  }

  return raw * (10n ** BigInt(toDecimals - fromDecimals));
}

function hopOutputToken(hop) {
  if (!hop || typeof hop !== 'object') return null;
  return hop.outputToken || hop.tokenOut || hop.toToken || hop.outputTokenAddress || null;
}

function normalizeHopAmounts(route) {
  if (!route || typeof route !== 'object' || !Array.isArray(route.hops)) return route;

  return {
    ...route,
    hops: route.hops.map((hop) => {
      const outputToken = hopOutputToken(hop);
      if (!outputToken || hop.amountOut == null) return hop;

      const providerDecimals = TOWER_OUTPUT_DECIMAL_OVERRIDES[String(outputToken).toLowerCase()];
      const actualDecimals = hop.outputDecimals ?? hop.tokenOutDecimals;
      if (providerDecimals == null || !Number.isInteger(Number(actualDecimals))) return hop;

      return {
        ...hop,
        amountOut: scaleRawAmount(hop.amountOut, providerDecimals, Number(actualDecimals)).toString(),
      };
    }),
  };
}

export function normalizeTowerQuoteDecimals(quote, actualOutputDecimals) {
  if (!quote || typeof quote !== 'object') throw new Error('Tower returned an invalid quote.');
  if (!Number.isInteger(actualOutputDecimals) || actualOutputDecimals < 0 || actualOutputDecimals > 36) {
    throw new Error('Invalid authoritative output-token decimals.');
  }

  if (quote.decimalsNormalized === true && quote.providerOutputAmount != null && quote.providerMinOut != null) {
    return {
      ...quote,
      quoteDecimals: actualOutputDecimals,
      decimalsNormalized: true,
    };
  }

  const outputToken = String(quote.outputToken || '').toLowerCase();
  // Tower's quoteDecimals/providerQuoteDecimals metadata is not authoritative
  // for the raw amount. Use our token-address mapping as the provider-unit
  // source of truth, then convert into the actual ERC-20 decimals.
  const providerOutputDecimals = TOWER_OUTPUT_DECIMAL_OVERRIDES[outputToken] ?? actualOutputDecimals;
  const providerOutputAmount = String(quote.outputAmount ?? '0');
  const providerMinOut = String(quote.minOut ?? '0');
  const providerRoute = quote.route;

  const normalized = {
    ...quote,
    outputAmount: scaleRawAmount(providerOutputAmount, providerOutputDecimals, actualOutputDecimals).toString(),
    minOut: scaleRawAmount(providerMinOut, providerOutputDecimals, actualOutputDecimals).toString(),
    route: normalizeHopAmounts(providerRoute),
    providerOutputAmount,
    providerMinOut,
    providerRoute,
    quoteDecimals: actualOutputDecimals,
    providerQuoteDecimals: providerOutputDecimals,
    decimalsNormalized: true,
  };

  if (providerOutputDecimals === actualOutputDecimals) {
    return {
      ...normalized,
      outputAmount: providerOutputAmount,
      minOut: providerMinOut,
      quoteDecimals: actualOutputDecimals,
      providerQuoteDecimals: providerOutputDecimals,
      decimalsNormalized: false,
    };
  }

  if (asRaw(normalized.outputAmount) <= 0n || asRaw(normalized.minOut) <= 0n) {
    throw new Error('Tower returned an output quote too small to represent with the token\'s actual decimals.');
  }

  if (asRaw(normalized.minOut) > asRaw(normalized.outputAmount)) {
    throw new Error('Tower returned an invalid minimum-output quote after decimal normalization.');
  }

  return normalized;
}

export function toTowerQuote(quote) {
  if (!quote || typeof quote !== 'object') throw new Error('Invalid quote payload.');

  if (quote.decimalsNormalized !== true || quote.providerOutputAmount == null || quote.providerMinOut == null) {
    return quote;
  }

  const {
    providerOutputAmount,
    providerMinOut,
    providerRoute,
    providerQuoteDecimals,
    quoteDecimals,
    decimalsNormalized,
    ...rest
  } = quote;

  return {
    ...rest,
    outputAmount: providerOutputAmount,
    minOut: providerMinOut,
    ...(providerRoute !== undefined ? { route: providerRoute } : {}),
  };
}
