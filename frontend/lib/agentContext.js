import { getCentrionRisk } from './centrionRisk';

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function usd(value) {
  const parsed = finiteNumber(value);
  if (parsed == null) return null;
  return parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildCentryPositionContext({ marketSymbol, walletBalance, supplied, borrowed, borrowLimit, healthFactor, marketLiquidity, marketBorrowed, utilization, accountPosition }) {
  const numericHealth = finiteNumber(healthFactor);
  const numericCapacity = finiteNumber(borrowLimit);
  const numericUtilization = finiteNumber(utilization);
  const account = accountPosition && typeof accountPosition === 'object' ? accountPosition : null;
  const risk = getCentrionRisk(healthFactor);

  return {
    market: marketSymbol || 'USDC',
    walletBalance: String(walletBalance ?? '0'),
    supplied: String(supplied ?? '0'),
    borrowed: String(borrowed ?? '0'),
    remainingBorrowCapacity: String(borrowLimit ?? '0'),
    healthFactor: String(healthFactor ?? '—'),
    liquidationRisk: risk.atRisk,
    marketLiquidity: String(marketLiquidity ?? '0'),
    marketBorrowed: String(marketBorrowed ?? '0'),
    utilizationPercent: numericUtilization == null ? 0 : numericUtilization,
    accountPosition: account ? {
      ready: Boolean(account.ready),
      totalCollateralValueUsd: finiteNumber(account.totalCollateralValueUsd),
      totalDebtValueUsd: finiteNumber(account.totalDebtValueUsd),
      totalBorrowPowerUsd: finiteNumber(account.totalBorrowPowerUsd),
      remainingBorrowCapacityUsd: finiteNumber(account.remainingBorrowCapacityUsd),
      markets: Array.isArray(account.markets) ? account.markets.map((item) => ({
        market: item?.symbol || item?.marketId || 'unknown',
        supplied: String(item?.supplied ?? '0'),
        borrowed: String(item?.borrowed ?? '0'),
        suppliedValueUsd: finiteNumber(item?.suppliedValueUsd),
        borrowedValueUsd: finiteNumber(item?.borrowedValueUsd),
      })) : [],
    } : null,
    dataQuality: {
      healthFactor: numericHealth != null,
      borrowCapacity: numericCapacity != null,
      utilization: numericUtilization != null,
      accountPosition: Boolean(account?.ready),
    },
  };
}

export function getLiquidationRisk(healthFactor) {
  const risk = getCentrionRisk(healthFactor);
  return { atRisk: risk.atRisk, threshold: risk.threshold };
}

export function getPositionRisk(healthFactor) {
  const risk = getCentrionRisk(healthFactor);
  if (risk.healthFactor == null) return { level: 'unknown', label: 'No debt signal', threshold: risk.threshold };
  if (risk.atRisk) return { level: 'danger', label: 'Liquidation risk', threshold: risk.threshold };
  return { level: 'normal', label: 'Position healthy', threshold: risk.threshold };
}

export function fallbackPositionAnswer(context, question) {
  const lower = String(question || '').toLowerCase();
  const risk = getCentrionRisk(context.healthFactor);
  const capacity = finiteNumber(context.remainingBorrowCapacity);
  const utilization = finiteNumber(context.utilizationPercent) ?? 0;
  const borrowed = context.borrowed;
  const market = context.market;
  const account = context.accountPosition;

  if (lower.includes('borrow') || lower.includes('safe')) {
    if (risk.atRisk) return `Liquidation risk is active: your health factor is ${context.healthFactor}, below Centry's liquidation threshold of 1.00.`;
    if (capacity != null && capacity > 0) return `Health factor: ${context.healthFactor}. Remaining borrow capacity: about $${usd(capacity)}. Your account is not currently below the liquidation threshold.`;
    return `Health factor: ${context.healthFactor}. I don't see usable remaining borrow capacity in the current onchain snapshot.`;
  }

  if (lower.includes('health') || lower.includes('risk')) {
    if (risk.atRisk) return `Liquidation risk is active: health factor ${context.healthFactor} is below 1.00.`;
    return `Health factor: ${context.healthFactor}. The position is not currently below Centry's 1.00 liquidation threshold.`;
  }

  if (lower.includes('liquidity') || lower.includes('utilization')) return `${market} liquidity: ${context.marketLiquidity}. Borrowed: ${context.marketBorrowed}. Utilization: ${utilization.toFixed(2)}%.`;
  if (lower.includes('position') || lower.includes('balance') || lower.includes('debt')) {
    if (account?.ready) return `Collateral value: $${usd(account.totalCollateralValueUsd)}. Debt: $${usd(account.totalDebtValueUsd)}. Remaining borrow capacity: $${usd(account.remainingBorrowCapacityUsd)}. Current ${market} debt: ${borrowed}.`;
    return `${market}: wallet ${context.walletBalance}, supplied ${context.supplied}, borrowed ${borrowed}, remaining capacity ${context.remainingBorrowCapacity}, health factor ${context.healthFactor}.`;
  }
  return `I can analyze the current Centry position from the latest onchain snapshot.`;
}

export const CENTRY_AGENT_SYSTEM_PROMPT = `You are Centrion, the onchain assistant inside the Centry lending app.

Rules:
- Use only the position data supplied by the application.
- For ordinary questions, answer with the actual numbers in the snapshot, not generic financial boilerplate.
- Only mention liquidation risk when healthFactor is below 1.00. Do not label 1.2, 1.5, or other values as danger/caution.
- When the user explicitly asks for an action, return an execution plan and prioritize the requested action over commentary.
- Never invent balances, prices, health factors, limits, transactions, calldata, tokenIds, reward proofs, or hashes.
- Never claim a transaction happened until the application reports a confirmed receipt.
- Self-repay is background infrastructure unless explicitly requested.
- Be concise and specific.`;
