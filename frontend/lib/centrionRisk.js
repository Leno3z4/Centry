const LIQUIDATION_HF = 1;
const STABLE_ASSETS = new Set(['USDC', 'EURC']);

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getCentrionRisk(healthFactor) {
  const value = number(healthFactor);
  if (value == null) return { status: 'unknown', atRisk: false, healthFactor: null };
  return {
    status: value < LIQUIDATION_HF ? 'liquidation-risk' : 'normal',
    atRisk: value < LIQUIDATION_HF,
    healthFactor: value,
    threshold: LIQUIDATION_HF,
  };
}

export function projectBorrowHealth({ healthFactor, totalDebtUsd, amount, symbol }) {
  const currentHf = number(healthFactor);
  const currentDebt = number(totalDebtUsd);
  const delta = number(amount);
  const normalizedSymbol = String(symbol || '').toUpperCase();

  if (
    currentHf == null ||
    currentDebt == null ||
    delta == null ||
    currentDebt <= 0 ||
    delta <= 0 ||
    !STABLE_ASSETS.has(normalizedSymbol)
  ) {
    return { available: false, projectedHealthFactor: null };
  }

  const adjustedCollateral = currentHf * currentDebt;
  const projectedDebt = currentDebt + delta;
  const projectedHealthFactor = adjustedCollateral / projectedDebt;

  return {
    available: Number.isFinite(projectedHealthFactor),
    projectedHealthFactor: Number.isFinite(projectedHealthFactor)
      ? projectedHealthFactor
      : null,
  };
}

export function evaluateCentrionActionRisk(action, context) {
  const current = getCentrionRisk(context?.healthFactor);
  const result = {
    ...current,
    projectedHealthFactor: null,
    projectedAtRisk: false,
    warning: current.atRisk ? `Health factor ${current.healthFactor.toFixed(2)} is below 1.00 and the position is currently liquidatable.` : null,
  };

  if (action?.type === 'lending.borrow') {
    const projection = projectBorrowHealth({
      healthFactor: context?.healthFactor,
      totalDebtUsd: context?.accountPosition?.totalDebtValueUsd,
      amount: action?.amount,
      symbol: action?.assetSymbol,
    });

    result.projectedHealthFactor = projection.projectedHealthFactor;
    result.projectedAtRisk = projection.projectedHealthFactor != null && projection.projectedHealthFactor < LIQUIDATION_HF;
    if (result.projectedAtRisk) {
      result.warning = `This borrow would project the health factor below 1.00 (${projection.projectedHealthFactor.toFixed(2)}).`;
    }
  }

  return result;
}

export { LIQUIDATION_HF };
