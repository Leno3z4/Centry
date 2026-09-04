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
];

const ERC20_BALANCE_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
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

function formatUsdFromPrice(amountRaw, priceE18Raw, decimals) {
  try {
    const amount = Number(formatUnits(amountRaw ?? 0n, decimals));
    const price = Number(formatUnits(priceE18Raw ?? 0n, 18));
    return Number.isFinite(amount) && Number.isFinite(price) ? amount * price : 0;
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
  const strategyResults = useReadContracts({
    contracts: [
      ['baseRatePerYear', 'base'],
      ['slope1PerYear', 'slope1'],
      ['slope2PerYear', 'slope2'],
      ['kink', 'kink'],
    ].map(([functionName]) => ({
      address: CONTRACT_ADDRESSES.interestRateModel,
      abi: STRATEGY_ABI,
      functionName,
    })),
  }).data;

  const strategy = strategyResults?.length === 4
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
      abi: ERC20_BALANCE_ABI,
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

      <section className="stats-grid analytics-stats">
        <div className="metric"><span>Total supplied</span><strong>${formatNumber(totals.suppliedUsd)}</strong><small>Across active markets</small></div>
        <div className="metric"><span>Total borrowed</span><strong>${formatNumber(totals.borrowedUsd)}</strong><small>Current outstanding debt</small></div>
        <div className="metric"><span>Available liquidity</span><strong>${formatNumber(totals.cashUsd)}</strong><small>Reserve cash</small></div>
        <div className="metric"><span>Utilization</span><strong>{percent(overallUtilization)}</strong><small>Borrowed ÷ supplied</small></div>
      </section>

      <section className="content-grid analytics-grid">
        <div className="panel panel-large">
          <div className="panel-head"><div><span className="section-kicker">MARKETS</span><h2>Live market snapshot</h2></div></div>
          <div className="analytics-market-list">
            {markets.map((market) => (
              <div className="analytics-market" key={market.id}>
                <div className="analytics-market-main">
                  <div className="analytics-asset"><span className="token usdc">{market.symbol === 'cirBTC' ? '₿' : market.symbol === 'EURC' ? '€' : '$'}</span><div><strong>{market.symbol}</strong><small>{market.name}</small></div></div>
                  <div className="analytics-market-status"><span className={market.active ? 'status-live' : ''}>{isLoading ? 'Loading' : market.active ? 'Live' : 'Inactive'}</span></div>
                </div>
                <div className="analytics-market-numbers">
                  <div><span>Supply</span><strong>{formatNumber(market.supply, 2)}</strong></div>
                  <div><span>Borrowed</span><strong>{formatNumber(market.borrow, 2)}</strong></div>
                  <div><span>Liquidity</span><strong>{formatNumber(market.cash, 2)}</strong></div>
                  <div><span>Supply APY</span><strong>{percent(market.supplyApy)}</strong></div>
                  <div><span>Borrow APY</span><strong>{percent(market.borrowApy)}</strong></div>
                </div>
                <div className="analytics-util">
                  <div className="analytics-util-head"><span>Utilization</span><strong>{percent(market.utilization)}</strong></div>
                  <div className="analytics-util-track"><div className="analytics-util-fill" style={{ width: `${Math.min(100, Math.max(0, market.utilization))}%` }} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><div><span className="section-kicker">RISK</span><h2>Reserve parameters</h2></div></div>
          <div className="risk-list">
            {markets.map((market) => (
              <div className="risk-card" key={market.id}>
                <div className="risk-card-head"><strong>{market.symbol}</strong><span>{market.active ? 'Active' : 'Inactive'}</span></div>
                <div><span>Loan to value</span><strong>{percent(market.ltv)}</strong></div>
                <div><span>Liquidation threshold</span><strong>{percent(market.liquidationThreshold)}</strong></div>
                <div><span>Liquidation bonus</span><strong>{percent(market.liquidationBonus)}</strong></div>
                <div><span>Reserve factor</span><strong>{percent(market.reserveFactor)}</strong></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="panel analytics-note">
        <span className="section-kicker">ABOUT THESE NUMBERS</span>
        <p>Market totals and rates are calculated from the deployed reserves and immutable interest-rate strategy. Historical time-series charts are intentionally omitted until an event indexer is available.</p>
      </div>

      <style jsx global>{`
        .analytics-stats{grid-template-columns:repeat(4,minmax(0,1fr))}
        .analytics-grid{align-items:start}
        .analytics-market-list{display:grid;gap:12px}
        .analytics-market{padding:17px;border:1px solid #2d233b;border-radius:14px;background:rgba(13,9,21,.68)}
        .analytics-market-main{display:flex;justify-content:space-between;align-items:center;gap:16px}
        .analytics-asset{display:flex;align-items:center;gap:12px}.analytics-asset .token{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:#241938;color:#d9c8ff;font-weight:800}.analytics-asset strong,.analytics-asset small{display:block}.analytics-asset small{margin-top:4px;color:#8f849d;font-size:11px}.analytics-market-status{font-size:11px;color:#8f849d}.analytics-market-numbers{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-top:16px}.analytics-market-numbers span,.analytics-util-head span,.risk-card span{display:block;color:#8f849d;font-size:11px}.analytics-market-numbers strong{display:block;margin-top:5px;font-size:13px;font-variant-numeric:tabular-nums}.analytics-util{margin-top:15px}.analytics-util-head{display:flex;justify-content:space-between;gap:12px}.analytics-util-head strong{font-size:11px}.analytics-util-track{height:5px;margin-top:9px;border-radius:999px;background:#251c30;overflow:hidden}.analytics-util-fill{height:100%;border-radius:999px;background:#9d85bc}.risk-list{display:grid;gap:12px}.risk-card{padding:15px;border:1px solid #2d233b;border-radius:14px;background:rgba(13,9,21,.56)}.risk-card-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.risk-card-head strong{font-size:13px}.risk-card-head span{color:#8f849d;font-size:10px}.risk-card>div:not(.risk-card-head){display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-top:1px solid #292133}.risk-card>div:not(.risk-card-head) strong{font-size:12px}.analytics-note{padding:16px}.analytics-note p{margin:7px 0 0;color:#8f849d;font-size:11px;line-height:1.6}
        @media (max-width:900px){.analytics-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.analytics-market-numbers{grid-template-columns:repeat(3,minmax(0,1fr))}}
        @media (max-width:640px){.analytics-stats{grid-template-columns:1fr}.analytics-market-numbers{grid-template-columns:repeat(2,minmax(0,1fr))}}
      `}</style>
    </div>
  );
}

export default function Page() {
  return <Providers><AppShell><AnalyticsContent /></AppShell></Providers>;
}
