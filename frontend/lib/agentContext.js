const DEFAULT_THRESHOLDS = Object.freeze({
  healthy: 1.5,
  caution: 1.2,
  danger: 1.0,
});

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function usd(value) {
  const parsed = finiteNumber(value);
  if (parsed == null) return null;
  return parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildCentryPositionContext({
  marketSymbol,
  walletBalance,
  supplied,
  borrowed,
  borrowLimit,
  healthFactor,
  marketLiquidity,
  marketBorrowed,
  utilization,
}) {
  const numericHealth = finiteNumber(healthFactor);
  const numericCapacity = finiteNumber(borrowLimit);
  const numericUtilization = finiteNumber(utilization);

  return {
    market: marketSymbol || 'USDC',
    walletBalance: String(walletBalance ?? '0'),
    supplied: String(supplied ?? '0'),
    borrowed: String(borrowed ?? '0'),
    remainingBorrowCapacity: String(borrowLimit ?? '0'),
    healthFactor: String(healthFactor ?? '—'),
    marketLiquidity: String(marketLiquidity ?? '0'),
    marketBorrowed: String(marketBorrowed ?? '0'),
    utilizationPercent: numericUtilization == null ? 0 : numericUtilization,
    dataQuality: {
      healthFactor: numericHealth != null,
      borrowCapacity: numericCapacity != null,
      utilization: numericUtilization != null,
    },
  };
}

export function getPositionRisk(healthFactor) {
  const value = finiteNumber(healthFactor);
  if (value == null) return { level: 'unknown', label: 'No debt signal', threshold: null };
  if (value >= DEFAULT_THRESHOLDS.healthy) return { level: 'healthy', label: 'Healthy', threshold: DEFAULT_THRESHOLDS.healthy };
  if (value >= DEFAULT_THRESHOLDS.caution) return { level: 'caution', label: 'Caution', threshold: DEFAULT_THRESHOLDS.caution };
  return { level: 'danger', label: 'High risk', threshold: DEFAULT_THRESHOLDS.danger };
}

export function fallbackPositionAnswer(context, question) {
  const lower = String(question || '').toLowerCase();
  const risk = getPositionRisk(context.healthFactor);
  const capacity = finiteNumber(context.remainingBorrowCapacity);
  const utilization = finiteNumber(context.utilizationPercent) ?? 0;
  const borrowed = context.borrowed;
  const market = context.market;

  if (lower.includes('borrow') || lower.includes('safe')) {
    if (risk.level === 'danger') {
      return `Your health factor is ${context.healthFactor}. The current position is in a high-risk zone, so increasing debt would reduce the remaining buffer.`;
    }
    if (capacity != null && capacity > 0) {
      return `Your displayed remaining borrow capacity is about ${usd(capacity)} ${market}. Your health factor is ${context.healthFactor}. Capacity is a protocol limit, not a recommendation; leaving additional collateral buffer can reduce liquidation risk.`;
    }
    return `I don't see usable remaining borrow capacity in the current onchain snapshot. Check the position again after the latest transaction settles.`;
  }

  if (lower.includes('health') || lower.includes('risk')) {
    if (risk.level === 'healthy') return `Your health factor is ${context.healthFactor}. The current account-wide signal is above Centry's healthy threshold.`;
    if (risk.level === 'caution') return `Your health factor is ${context.healthFactor}. The position is in a caution zone, so additional borrowing would reduce the available buffer.`;
    if (risk.level === 'danger') return `Your health factor is ${context.healthFactor}. The position is in a high-risk zone and has limited safety buffer.`;
  }

  if (lower.includes('liquidity') || lower.includes('utilization')) {
    return `The ${market} market currently shows ${context.marketLiquidity} available liquidity, ${context.marketBorrowed} borrowed, and about ${utilization.toFixed(2)}% utilization.`;
  }

  if (lower.includes('position') || lower.includes('balance') || lower.includes('debt')) {
    return `Current ${market} snapshot: wallet ${context.walletBalance}, supplied ${context.supplied}, borrowed ${borrowed}, remaining borrow capacity ${context.remainingBorrowCapacity}, health factor ${context.healthFactor}.`;
  }

  return `I can analyze your current Centry position using the latest onchain snapshot. Ask about borrowing capacity, health, debt, liquidity, or utilization.`;
}

export const CENTRY_AGENT_SYSTEM_PROMPT = `You are Centry Intelligence, a financial-position assistant inside the Centry lending app.

Rules:
- Use only the position data supplied by the application and clearly label uncertainty.
- Treat supplied numbers as a point-in-time onchain snapshot; never invent missing values.
- Do not invent balances, prices, health factors, limits, transactions, or protocol behavior.
- Do not execute transactions, produce transaction calldata, or imply that an AI response is financial advice.
- Be concise and practical.
- Explain the relevant risk signal before discussing an action.
- Distinguish protocol borrowing capacity from a prudent user-defined buffer.
- Never proactively promote or mention self-repayment unless the user explicitly asks about it or it is directly necessary to answer their question.
- Never claim a transaction happened unless the application explicitly provides a confirmed transaction result.
- If the snapshot is missing a value needed to answer, say so instead of estimating it.`;
