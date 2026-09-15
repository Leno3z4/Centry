const DEFAULT_THRESHOLDS = Object.freeze({
  healthy: 1.5,
  caution: 1.2,
  danger: 1.0,
});

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
  return {
    market: marketSymbol || 'USDC',
    walletBalance: String(walletBalance ?? '0'),
    supplied: String(supplied ?? '0'),
    borrowed: String(borrowed ?? '0'),
    remainingBorrowCapacity: String(borrowLimit ?? '0'),
    healthFactor: String(healthFactor ?? '—'),
    marketLiquidity: String(marketLiquidity ?? '0'),
    marketBorrowed: String(marketBorrowed ?? '0'),
    utilizationPercent: Number.isFinite(Number(utilization)) ? Number(utilization) : 0,
  };
}

export function getPositionRisk(healthFactor) {
  const value = Number(healthFactor);
  if (!Number.isFinite(value)) return { level: 'unknown', label: 'No debt signal', threshold: null };
  if (value >= DEFAULT_THRESHOLDS.healthy) return { level: 'healthy', label: 'Healthy', threshold: DEFAULT_THRESHOLDS.healthy };
  if (value >= DEFAULT_THRESHOLDS.caution) return { level: 'caution', label: 'Caution', threshold: DEFAULT_THRESHOLDS.caution };
  return { level: 'danger', label: 'High risk', threshold: DEFAULT_THRESHOLDS.danger };
}

export function fallbackPositionAnswer(context, question) {
  const lower = String(question || '').toLowerCase();
  const risk = getPositionRisk(context.healthFactor);
  const capacity = Number(context.remainingBorrowCapacity);
  const utilization = Number(context.utilizationPercent);

  if (lower.includes('borrow') || lower.includes('safe')) {
    if (risk.level === 'danger') {
      return `Your health factor is ${context.healthFactor}, so I would not recommend increasing debt from this position. Reduce risk before borrowing more.`;
    }
    if (Number.isFinite(capacity) && capacity > 0) {
      return `Your current remaining borrow capacity is about ${capacity.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${context.market}. Your health factor is ${context.healthFactor}. Treat the displayed capacity as a protocol limit, not a recommendation; leaving additional buffer reduces liquidation risk.`;
    }
    return `I don't see usable remaining borrow capacity in the current onchain snapshot. Check the position again after the latest transaction settles.`;
  }

  if (lower.includes('health') || lower.includes('risk')) {
    if (risk.level === 'healthy') return `Your health factor is ${context.healthFactor}. The position currently has a healthy buffer based on Centry's displayed account-wide health signal.`;
    if (risk.level === 'caution') return `Your health factor is ${context.healthFactor}. You're in a caution zone; avoid maximizing borrowing capacity and keep extra collateral buffer.`;
    if (risk.level === 'danger') return `Your health factor is ${context.healthFactor}. This is a high-risk position and should be treated as needing risk reduction.`;
  }

  if (lower.includes('liquidity') || lower.includes('utilization')) {
    return `The ${context.market} market currently shows ${context.marketLiquidity} available liquidity, ${context.marketBorrowed} borrowed, and about ${utilization.toFixed(2)}% utilization.`;
  }

  return `I can analyze your current Centry position using the onchain snapshot: health factor ${context.healthFactor}, borrowed ${context.borrowed} ${context.market}, and remaining borrow capacity ${context.remainingBorrowCapacity} ${context.market}. Ask about borrowing, risk, liquidity, or your position.`;
}

export const CENTRY_AGENT_SYSTEM_PROMPT = `You are Centry Intelligence, a financial-position assistant inside the Centry lending app.

Rules:
- Use only the position data supplied by the application and clearly label uncertainty.
- Do not invent balances, prices, health factors, limits, transactions, or protocol behavior.
- Do not execute transactions or imply that an AI response is financial advice.
- Be concise and practical.
- Explain risk before suggesting an action.
- Never proactively promote or mention self-repayment unless the user explicitly asks about it or it is directly necessary to answer their question.
- When discussing borrowing, distinguish protocol capacity from a sensible risk buffer.
- If data is missing, say so instead of estimating it.`;
