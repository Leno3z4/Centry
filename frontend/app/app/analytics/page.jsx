'use client';

import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { ACTIVE_MARKETS } from '../../../constants/markets';
import { CONTRACT_ADDRESSES } from '../../../constants/contracts';
import { LENDING_POOL_ABI, ORACLE_ABI } from '../../../constants/abis';

const STRATEGY_ABI = [
  { type: 'function', name: 'baseRatePerYear', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'slope1PerYear', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'slope2PerYear', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'kink', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'maxRatePerYear', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
];

function formatNumber(value, digits = 2) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0.00';
  return number.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function percent(value, digits = 2) {
  return `${formatNumber(value, digits)}%`;
}

function formatUnitsSafe(value, decimals) {
  try {
    return Number(formatUnits(value ?? 0n, decimals));
  } catch {
    return 0;
  }
}

function formatUsdFromPrice(amount, priceE18, decimals) {
  if (!amount || !priceE18) return 0;
  try {
    const tokenAmount = Number(formatUnits(amount, decimals));
    const usdPrice = Number(formatUnits(priceE18, 18));
    if (!Number.isFinite(tokenAmount) || !Number.isFinite(usdPrice)) return 0;
    return tokenAmount * usdPrice;
  } catch {
    return 0;
  }
}

function projectedBorrowRate(utilization, strategy) {
  if (!strategy) return 0;
  const WAD = 1e18;
  const kink = Number(strategy.kink || 0n);
  const base = Number(strategy.base || 0n);
  const slope1 = Number(strategy.slope1 || 0n);
  const slope2 = Number(strategy.slope2 || 0n);
  const util = Math.min(Math.max(utilization, 0), 1) * WAD;
  if (!kink || !Number.isFinite(util)) return 0;
  const rate = util <= kink
    ? base + (slope1 * util) / kink
    : base + slope1 + (slope2 * (util - kink)) / (WAD - kink);
  return rate / WAD * 100;
}

function AnalyticsContent() {
  const strategyQueries = [
    ['base', 'baseRatePerYear'],
    ['slope1', 'slope1PerYear'],
    ['slope2', 'slope2PerYear'],
    ['kink', 'kink'],
  ];

  const strategyResults = useReadContracts({
    contracts: strategyQueries.map(([, functionName]) => ({
      address: CONTRACT_ADDRESSES.interestRateModel,
      abi: STRATEGY_ABI,
      functionName,
    })),
  }).data;

  const strategy = strategyResults && strategyResults.length === 4
    ? {
        base: strategyResults[0]?.result ?? 0n,
        slope1: strategyResults[1]?.result ?? 0n,
        slope2: strategyResults[2]?.result ?? 0n,
        kink: strategyResults[3]?.result ?? 0n,
      }
    : null;

  const marketContracts = useMemo(() => ACTIVE_MARKETS.flatMap((market) => [
    {
      address: CONTRACT_ADDRESSES.lendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'getReserveConfig',
      args: [market.address],
    },
    {
      address: CONTRACT_ADDRESSES.lendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'currentSupply',
      args: [market.address],
    },
    {
      address: CONTRACT_ADDRESSES.lendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'currentBorrow',
      args: [market.address],
    },
    {
      address: CONTRACT_ADDRESSES.lendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'utilization',
      args: [market.address],
    },
    {
      address: market.address,
      abi: [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] }],
      functionName: 'balanceOf',
      args: [CONTRACT_ADDRESSES.lendingPool],
    },
    {
      address: CONTRACT_ADDRESSES.oracle,
      abi: ORACLE_ABI,
      functionName: 'getPrice',
      args: [market.address],
    },
  ]), []);

  const { data: results, isLoading } = useReadContracts({ contracts: marketContracts });

  const markets = ACTIVE_MARKETS.map((market, index) => {
    const offset = index * 6;
    const config = results?.[offset]?.result;
    const supplyRaw = results?.[offset + 1]?.result ?? 0n;
    const borrowRaw = results?.[offset + 2]?.result ?? 0n;
    const utilizationRaw = results?.[offset + 3]?.result ?? 0n;
    const cashRaw = results?.[offset + 4]?.result ?? 0n;
    const priceResult = results?.[offset + 5]?.result;
    const priceRaw = Array.isArray(priceResult) ? priceResult[0] : 0n;

    const decimals = market.decimals;
    const utilization = formatUnitsSafe(utilizationRaw, 18);
    const supply = formatUnitsSafe(supplyRaw, decimals);
    const borrow = formatUnitsSafe(borrowRaw, decimals);
    const cash = formatUnitsSafe(cashRaw, decimals);
    const borrowApy = projectedBorrowRate(utilization, strategy);
    const reserveFactor = config ? Number(config[5]) / 100 : 0;
    const supplyApy = borrowApy * utilization * (1 - reserveFactor / 100);

    return {
      ...market,
      decimals,
      active: Boolean(config?.[0]),
      ltv: config ? Number(config[2]) / 100 : 0,
      liquidationThreshold: config ? Number(config[3]) / 100 : 0,
      liquidationBonus: config ? Number(config[4]) / 100 : 0,
      reserveFactor,
      supply,
      borrow,
      cash,
      utilization: utilization * 100,
      borrowApy,
      supplyApy,
      suppliedUsd: formatUsdFromPrice(supplyRaw, priceRaw, decimals),
      borrowedUsd: formatUsdFromPrice(borrowRaw, priceRaw, decimals),
      cashUsd: formatUsdFromPrice(cashRaw, priceRaw, decimals),
    };
  });

  const totals = markets.reduce((acc, market) => ({
    suppliedUsd: acc.suppliedUsd + market.suppliedUsd,
    borrowedUsd: acc.borrowedUsd + market.borrowedUsd,
    cashUsd: acc.cashUsd + market.cashUsd,
  }), { suppliedUsd: 0, borrowedUsd: 0, cashUsd: 0 });

  const overallUtilization = totals.suppliedUsd > 0 ? (totals.borrowedUsd / totals.suppliedUsd) * 100 : 0;

  return (
    <div className="page-stack">
      <div className="section-header">
        <div>
          <span className="section-kicker">ANALYTICS</span>
          <h1>Protocol analytics</h1>
          <p>Live market, liquidity, utilization, and risk data from the deployed Centry contracts.</p>
        </div>
      </div>

      <section className="stats-grid analyticsStats">
        <div className="analyticsMetric"><span>Total supplied</span><strong>${formatNumber(totals.suppliedUsd)}</strong><small>Across active markets</small></div>
        <div className="analyticsMetric"><span>Total borrowed</span><strong className={totals.borrowedUsd === 0 ? "zero-value" : ""}>${formatNumber(totals.borrowedUsd)}</strong><small>Current outstanding debt</small></div>
        <div className="analyticsMetric"><span>Available liquidity</span><strong className={totals.cashUsd === 0 ? "zero-value" : ""}>${formatNumber(totals.cashUsd)}</strong><small>Reserve cash</small></div>
        <div className="analyticsMetric"><span>Utilization</span><strong className={overallUtilization === 0 ? "zero-value" : ""}>{percent(overallUtilization)}</strong><small>Borrowed ÷ supplied</small></div>
      </section>

      <section className="content-grid analyticsGrid">
        <div className="panel panel-large">
          <div className="panel-head"><div><span className="section-kicker">MARKETS</span><h2>Live market snapshot</h2></div></div>
          <div className="analyticsMarketList">
            {markets.map((market) => (
              <div className="analyticsMarket" key={market.id}>
                <div className="analyticsMarketMain">
                  <div className="analyticsAsset"><span className="analyticsToken">{market.symbol === 'cirBTC' ? '₿' : market.symbol === 'EURC' ? '€' : '$'}</span><div><strong>{market.symbol}</strong><small>{market.name}</small></div></div>
                  <div className="analyticsMarketStatus"><span className={market.active ? 'status-live' : ''}>{isLoading ? 'Loading' : market.active ? 'Live' : 'Inactive'}</span></div>
                </div>
                <div className="analyticsMarketNumbers">
                  <div><span>Supply</span><strong className={Number(market.supply) === 0 ? "zero-value" : ""}>{formatNumber(market.supply, 2)}</strong></div>
                  <div><span>Borrowed</span><strong className={Number(market.borrow) === 0 ? "zero-value" : ""}>{formatNumber(market.borrow, 2)}</strong></div>
                  <div><span>Liquidity</span><strong className={Number(market.cash) === 0 ? "zero-value" : ""}>{formatNumber(market.cash, 2)}</strong></div>
                  <div className="analyticsPrimaryMetric"><span>Supply APY</span><strong className="metric-accent">{percent(market.supplyApy)}</strong></div>
                  <div className="analyticsPrimaryMetric"><span>Borrow APY</span><strong className="metric-accent">{percent(market.borrowApy)}</strong></div>
                </div>
                <div className="analyticsUtil">
                  <div className="analyticsUtilHead"><span>Utilization</span><strong>{percent(market.utilization)}</strong></div>
                  <div className="analyticsUtilTrack"><div className="analyticsUtilFill" style={{ width: `${Math.min(100, Math.max(0, market.utilization))}%` }} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><div><span className="section-kicker">RISK</span><h2>Reserve parameters</h2></div></div>
          <div className="analyticsRiskList">
            {markets.map((market) => (
              <div className="analyticsRiskCard" key={market.id}>
                <div className="analyticsRiskCardHead"><strong>{market.symbol}</strong><span>{market.active ? 'Active' : 'Inactive'}</span></div>
                <div><span>Loan to value</span><strong>{percent(market.ltv)}</strong></div>
                <div><span>Liquidation threshold</span><strong>{percent(market.liquidationThreshold)}</strong></div>
                <div><span>Liquidation bonus</span><strong>{percent(market.liquidationBonus)}</strong></div>
                <div><span>Reserve factor</span><strong>{percent(market.reserveFactor)}</strong></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <style jsx global>{`
        .analyticsStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
        .analyticsStats .analyticsMetric{min-width:0;padding:16px 18px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:#1e1e24;box-shadow:0 10px 28px rgba(0,0,0,.12)}
        .analyticsStats .analyticsMetric>span{display:block;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.04em;color:#9aa1ad}
        .analyticsStats .analyticsMetric>strong{display:block;margin-top:6px;color:#f4f6f8;font-size:22px;font-weight:650;font-variant-numeric:tabular-nums}
        .analyticsStats .analyticsMetric>small{display:block;margin-top:4px;color:#8a8f9e}
        .analyticsStats .analyticsMetric .zero-value{color:#8a8f9e}
        .analyticsGrid{align-items:start;gap:14px}
        .analyticsMarketList{display:grid;gap:12px}
        .analyticsMarket{padding:18px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:#1e1e24;box-shadow:0 12px 28px rgba(0,0,0,.14)}
        .analyticsMarketMain{display:flex;justify-content:space-between;align-items:center;gap:16px}
        .analyticsAsset{display:flex;align-items:center;gap:12px;min-width:0}
        .analyticsToken{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;flex:0 0 auto;border-radius:50%;background:#171a1f!important;border:1px solid #424a55!important;color:#f0f3f7!important;font-size:13px;font-weight:800}
        .analyticsAsset>div{min-width:0}
        .analyticsAsset strong{font-size:14px}
        .analyticsAsset small{display:block;margin-top:3px;color:#8a8f9e;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .analyticsMarketStatus{font-size:10px;color:#8a8f9e;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
        .analyticsMarketStatus .status-live{color:#78d6a2}
        .analyticsMarket-numbers{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:17px}
        .analyticsMarket-numbers>div{min-width:0;padding:11px 12px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:#17191f}
        .analyticsMarket-numbers span{display:block;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.04em;color:#8a8f9e}
        .analyticsMarket-numbers strong{display:block;margin-top:6px;color:#f0f3f6;font-size:16px;font-weight:650;font-variant-numeric:tabular-nums}
        .analyticsMarket-numbers strong.zero-value{color:#8a8f9e}
        .analyticsMarket-numbers .analyticsPrimaryMetric{background:#18211f;border-color:rgba(93,211,168,.18)}
        .analyticsMarket-numbers .analyticsPrimaryMetric .metric-accent{color:#70d9ad;font-size:18px}
        .analyticsUtil{margin-top:15px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06)}
        .analyticsUtilHead{display:flex;justify-content:space-between;gap:12px;align-items:center}
        .analyticsUtilHead span{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.04em;color:#8a8f9e}
        .analyticsUtilHead strong{font-size:12px;color:#dfe5ed}
        .analyticsUtilTrack{height:7px;margin-top:9px;border-radius:999px;background:#2a2e36;overflow:hidden}
        .analyticsUtilFill{height:100%;border-radius:999px;background:#62d2a2;box-shadow:0 0 10px rgba(98,210,162,.14)}
        .analyticsRiskList{display:grid;gap:12px}
        .analyticsRiskCard{padding:16px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:#1e1e24;box-shadow:0 10px 26px rgba(0,0,0,.12)}
        .analyticsRiskCardHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:11px}
        .analyticsRiskCardHead strong{font-size:13px}
        .analyticsRiskCardHead span{color:#8a8f9e;font-size:10px}
        .analyticsRiskCard>div:not(.analyticsRiskCardHead){display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-top:1px solid rgba(255,255,255,.06)}
        .analyticsRiskCard>div:not(.analyticsRiskCardHead) span{font-size:11px;color:#8a8f9e}
        .analyticsRiskCard>div:not(.analyticsRiskCardHead) strong{font-size:12px;color:#eef1f4}
        @media(max-width:900px){.analyticsStats{grid-template-columns:repeat(2,minmax(0,1fr))}.analyticsMarket-numbers{grid-template-columns:repeat(3,minmax(0,1fr))}}
        @media(max-width:640px){.analyticsStats{grid-template-columns:1fr}.analyticsMarket-numbers{grid-template-columns:repeat(2,minmax(0,1fr))}.analyticsMarketMain{align-items:flex-start}}
        @media(prefers-reduced-motion:reduce){.analyticsUtilFill{transition:none!important}}
      `}</style>
    </div>
  );
}

export default function Page() {
  return <Providers><AppShell><AnalyticsContent /></AppShell></Providers>;
}
