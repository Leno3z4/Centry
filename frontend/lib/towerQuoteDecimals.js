function asRaw(value) {
  try {
    return BigInt(String(value ?? '0'));
  } catch {
    return 0n;
  }
}

function integerString(value) {
  const text = String(value ?? '');
  return /^\d+$/.test(text) ? text : null;
}

function scaleRawAmount(value, fromDecimals, toDecimals) {
  const raw = asRaw(value);
  if (raw <= 0n || fromDecimals === toDecimals) return raw;

  if (fromDecimals > toDecimals) {
    return raw / (10n ** BigInt(fromDecimals - toDecimals));
  }

  return raw * (10n ** BigInt(toDecimals - fromDecimals));
}

function tokenNativeAmount(quote, key, providerAmount, actualDecimals) {
  const raw = integerString(quote?.[key + 'Raw']);
  if (raw != null) return raw;

  const native = integerString(quote?.[key + 'Native']);
  if (native != null) return native;

  // Tower currently exposes normalized quote amounts at 1e18 precision.
  // When the explicit token-native field is unavailable, convert from that
  // documented scale instead of inventing a token-specific provider precision.
  if (quote?.amountScale === 'normalized_1e18') {
    return scaleRawAmount(providerAmount, 18, actualDecimals).toString();
  }

  return integerString(providerAmount);
}

function normalizeHopAmounts(route) {
  if (!route || typeof route !== 'object' || !Array.isArray(route.hops)) return route;

  return {
    ...route,
    hops: route.hops.map((hop) => {
      const actualDecimals = hop?.outputDecimals ?? hop?.tokenOutDecimals;
      if (hop?.amountOut == null || !Number.isInteger(Number(actualDecimals))) return hop;

      if (hop?.amountScale === 'normalized_1e18') {
        return {
          ...hop,
          amountOut: scaleRawAmount(hop.amountOut, 18, Number(actualDecimals)).toString(),
        };
      }

      // Tower route hops in the current response are already token-native.
      return hop;
    }),
  };
}

export function normalizeTowerQuoteDecimals(quote, actualOutputDecimals) {
  if (!quote || typeof quote !== 'object') throw new Error('Tower returned an invalid quote.');
  if (!Number.isInteger(actualOutputDecimals) || actualOutputDecimals < 0 || actualOutputDecimals > 36) {
    throw new Error('Invalid authoritative output-token decimals.');
  }

  const providerOutputAmount = String(quote.outputAmount ?? '0');
  const providerMinOut = String(quote.minOut ?? '0');
  const providerRoute = quote.route;
  const outputAmount = tokenNativeAmount(quote, 'outputAmount', providerOutputAmount, actualOutputDecimals);
  const minOut = tokenNativeAmount(quote, 'minOut', providerMinOut, actualOutputDecimals);
  const declaredOutputDecimals = Number(quote.outputTokenDecimals ?? actualOutputDecimals);

  if (outputAmount == null || minOut == null) {
    throw new Error('Tower returned a quote without token-native output amounts.');
  }

  if (!Number.isInteger(declaredOutputDecimals) || declaredOutputDecimals !== actualOutputDecimals) {
    throw new Error('Tower output-token decimals do not match Centry market configuration.');
  }

  const normalized = {
    ...quote,
    outputAmount,
    minOut,
    route: normalizeHopAmounts(providerRoute),
    providerOutputAmount,
    providerMinOut,
    providerRoute,
    providerQuoteDecimals: quote?.amountScale === 'normalized_1e18' ? 18 : actualOutputDecimals,
    providerAmountScale: quote?.amountScale || null,
    quoteDecimals: actualOutputDecimals,
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

export function toTowerQuote(quote) {
  if (!quote || typeof quote !== 'object') throw new Error('Invalid quote payload.');

  if (quote.decimalsNormalized !== true || quote.providerOutputAmount == null || quote.providerMinOut == null) {
    return quote;
  }

  const {
    providerOutputAmount,
    providerMinOut,
    providerRoute,
    providerAmountScale,
    providerQuoteDecimals,
    quoteDecimals,
    decimalsNormalized,
    ...rest
  } = quote;

  return {
    ...rest,
    ...(providerAmountScale ? { amountScale: providerAmountScale } : {}),
    outputAmount: providerOutputAmount,
    minOut: providerMinOut,
    ...(providerRoute !== undefined ? { route: providerRoute } : {}),
  };
}
