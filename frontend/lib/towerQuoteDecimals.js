import { CONTRACT_ADDRESSES } from '../constants/contracts';

const TOWER_EURC_OUTPUT_DECIMALS = 18;

const TOWER_OUTPUT_DECIMAL_OVERRIDES = Object.freeze({
  [CONTRACT_ADDRESSES.EURC.toLowerCase()]: TOWER_EURC_OUTPUT_DECIMALS,
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

function normalizeHopAmounts(route, providerDecimals, actualDecimals) {
  if (!route || typeof route !== 'object' || !Array.isArray(route.hops)) return route;

  return {
    ...route,
    hops: route.hops.map((hop) => (
      hop && typeof hop === 'object' && hop.amountOut != null
        ? {
            ...hop,
            amountOut: scaleRawAmount(hop.amountOut, providerDecimals, actualDecimals).toString(),
          }
        : hop
    )),
  };
}

export function normalizeTowerQuoteDecimals(quote, actualOutputDecimals) {
  if (!quote || typeof quote !== 'object') throw new Error('Tower returned an invalid quote.');
  if (!Number.isInteger(actualOutputDecimals) || actualOutputDecimals < 0 || actualOutputDecimals > 36) {
    throw new Error('Invalid authoritative output-token decimals.');
  }

  const outputToken = String(quote.outputToken || '').toLowerCase();
  const providerOutputDecimals = TOWER_OUTPUT_DECIMAL_OVERRIDES[outputToken] ?? actualOutputDecimals;

  if (providerOutputDecimals === actualOutputDecimals) {
    return {
      ...quote,
      quoteDecimals: actualOutputDecimals,
      providerQuoteDecimals: providerOutputDecimals,
      decimalsNormalized: false,
    };
  }

  const normalized = {
    ...quote,
    outputAmount: scaleRawAmount(quote.outputAmount, providerOutputDecimals, actualOutputDecimals).toString(),
    minOut: scaleRawAmount(quote.minOut, providerOutputDecimals, actualOutputDecimals).toString(),
    route: normalizeHopAmounts(quote.route, providerOutputDecimals, actualOutputDecimals),
    quoteDecimals: actualOutputDecimals,
    providerQuoteDecimals: providerOutputDecimals,
    decimalsNormalized: true,
  };

  if (asRaw(normalized.outputAmount) <= 0n || asRaw(normalized.minOut) <= 0n) {
    throw new Error('Tower returned an output quote too small to represent with the token\'s actual decimals.');
  }

  if (asRaw(normalized.minOut) > asRaw(normalized.outputAmount)) {
    throw new Error('Tower returned an invalid minimum-output quote after decimal normalization.');
  }

  return normalized;
}
