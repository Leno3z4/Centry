const WAD = 1e18;

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function projectedBorrowRate(utilization, strategy) {
  if (!strategy) return 0;
  const util = Math.min(Math.max(finite(utilization) ?? 0, 0), 1);
  const kink = finite(strategy.kink) ?? 0;
  const base = finite(strategy.base) ?? 0;
  const slope1 = finite(strategy.slope1) ?? 0;
  const slope2 = finite(strategy.slope2) ?? 0;
  if (kink <= 0 || kink >= 1) return 0;

  const rate = util <= kink
    ? base + (slope1 * (util * WAD)) / (kink * WAD)
    : base + slope1 + (slope2 * ((util * WAD) - (kink * WAD))) / ((1 - kink) * WAD);

  return Math.max(0, (rate / WAD) * 100);
}

export function supplyApyFromBorrowRate(borrowApy, utilization, reserveFactorBps = 0) {
  const util = Math.min(Math.max(finite(utilization) ?? 0, 0), 1);
  const reserveFactor = Math.min(Math.max(Number(reserveFactorBps || 0) / 10000, 0), 1);
  return Math.max(0, finite(borrowApy) * util * (1 - reserveFactor));
}

export function healthDistanceToLiquidation(healthFactor) {
  const value = finite(healthFactor);
  if (value == null || value <= 0) return null;
  if (value <= 1) return 0;
  return (1 - (1 / value)) * 100;
}

export function liquidationPriceForCollateral({
  suppliedUsd,
  currentPriceUsd,
  liquidationThresholdBps,
  totalWeightedCollateralUsd,
  totalDebtUsd,
}) {
  const supplied = finite(suppliedUsd) ?? 0;
  const price = finite(currentPriceUsd) ?? 0;
  const threshold = (Number(liquidationThresholdBps || 0) / 10000);
  const weightedTotal = finite(totalWeightedCollateralUsd) ?? 0;
  const debt = finite(totalDebtUsd) ?? 0;

  if (supplied <= 0 || price <= 0 || threshold <= 0 || debt <= 0) return null;

  const otherWeightedCollateral = weightedTotal - (supplied * threshold);
  const requiredWeightedContribution = debt - otherWeightedCollateral;

  if (requiredWeightedContribution <= 0) return 0;
  return (requiredWeightedContribution * price) / (supplied * threshold);
}

export function buildRiskSummary(markets, contractHealthFactor = null) {
  const rows = Array.isArray(markets) ? markets : [];
  const totalCollateralUsd = rows.reduce((sum, row) => sum + (finite(row.suppliedUsd) || 0), 0);
  const totalDebtUsd = rows.reduce((sum, row) => sum + (finite(row.borrowedUsd) || 0), 0);
  const weightedCollateralUsd = rows.reduce(
    (sum, row) => sum + ((finite(row.suppliedUsd) || 0) * (Number(row.liquidationThresholdBps || 0) / 10000)),
    0,
  );

  const calculatedHealthFactor =
    totalDebtUsd > 0 ? weightedCollateralUsd / totalDebtUsd : null;
  const healthFactor = finite(contractHealthFactor) ?? calculatedHealthFactor;
  const distanceToLiquidationPct = healthDistanceToLiquidation(healthFactor);
  const positionStatus = totalDebtUsd <= 0
    ? 'No debt'
    : healthFactor != null && healthFactor < 1
      ? 'Liquidation threshold breached'
      : 'Above liquidation threshold';

  return {
    totalCollateralUsd,
    totalDebtUsd,
    weightedCollateralUsd,
    healthFactor,
    calculatedHealthFactor,
    distanceToLiquidationPct,
    positionStatus,
    liquidationThreshold: 1,
  };
}
