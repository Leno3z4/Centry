'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { ACTIVE_MARKETS } from '../../../constants/markets';
import { CONTRACT_ADDRESSES } from '../../../constants/contracts';
import { LENDING_POOL_ABI, ORACLE_ABI } from '../../../constants/abis';
import { arcMainnet } from '../../../config/multiWagmi';

const STRATEGY_ABI = [
  { type: 'function', name: 'baseRatePerYear', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'slope1PerYear', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'slope2PerYear', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'kink', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
];

const ERC20_BALANCE_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
];

const EVENT_LABELS = {
  Supplied: 'Supply',
  Withdrawn: 'Withdraw',
  Borrowed: 'Borrow',
  Repaid: 'Repay',
  Liquidated: 'Liquidation',
  InterestAccrued: 'Interest accrual',
  ProtocolFeesSwept: 'Fee sweep',
};

function formatNumber(value, digits = 2) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0.00';
  return number.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function percent(value, digits = 2) {
  return formatNumber(value, digits) + '%';
}

function formatUsd(value, digits = 2) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits });
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

function toNumericE18(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number / 1e18 : 0;
}

function formatDate(timestamp) {
  if (!timestamp) return '—';
  const date = new Date(Number(timestamp) * 1000);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDateTime(timestamp) {
  if (!timestamp) return '—';
  const date = new Date(Number(timestamp) * 1000);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function tokenDecimals(symbol) {
  if (symbol === 'CIRBTC') return 8;
  return 6;
}

function HistoryChart({ title, subtitle, points, valueKey, formatter }) {
  const values = points.map((point) => Number(point[valueKey] || 0)).filter(Number.isFinite);
  const width = 760;
  const height = 220;
  const padX = 28;
  const padY = 24;

  if (points.length < 2 || values.length < 2) {
    return (
      <div className="history-chart">
        <div className="history-chart-head">
          <div><h3>{title}</h3><p>{subtitle}</p></div>
        </div>
        <div className="history-empty">
          <strong>Collecting history</strong>
          <span>The indexer needs more hourly snapshots before this chart has a time series.</span>
        </div>
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || Math.max(Math.abs(max) * 0.08, 1);
  const plottedMin = min - spread * 0.08;
  const plottedMax = max + spread * 0.08;

  const coordinates = points.map((point, index) => {
    const x = padX + (index / Math.max(1, points.length - 1)) * (width - padX * 2);
    const value = Number(point[valueKey] || 0);
    const y = height - padY - ((value - plottedMin) / (plottedMax - plottedMin)) * (height - padY * 2);
    return { x, y, value, bucketStart: point.bucketStart };
  });

  const polyline = coordinates.map((point) => point.x + ',' + point.y).join(' ');
  const area = [
    padX + ',' + (height - padY),
    ...coordinates.map((point) => point.x + ',' + point.y),
    (width - padX) + ',' + (height - padY),
  ].join(' ');

  return (
    <div className="history-chart">
      <div className="history-chart-head">
        <div><h3>{title}</h3><p>{subtitle}</p></div>
        <strong>{formatter(values[values.length - 1])}</strong>
      </div>
      <svg viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label={title}>
        <polygon points={area} fill="rgba(10,132,255,.08)" />
        <line x1={padX} x2={width - padX} y1={height - padY} y2={height - padY} stroke="rgba(255,255,255,.09)" />
        <polyline points={polyline} fill="none" stroke="#0a84ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {coordinates.map((point) => (
          <circle key={point.bucketStart} cx={point.x} cy={point.y} r="2.8" fill="#ffffff" />
        ))}
      </svg>
      <div className="history-chart-axis">
        <span>{formatDate(points[0]?.bucketStart)}</span>
        <span>{formatDate(points[Math.floor(points.length / 2)]?.bucketStart)}</span>
        <span>{formatDate(points[points.length - 1]?.bucketStart)}</span>
      </div>
    </div>
  );
}

function AnalyticsContent() {
  const { address } = useAccount();
  const [days, setDays] = useState(7);
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError('');

    fetch('/api/analytics?days=' + days, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'analytics_unavailable');
        return body;
      })
      .then((body) => {
        if (!cancelled) setHistory(body);
      })
      .catch((error) => {
        if (!cancelled) setHistoryError(error instanceof Error ? error.message : 'analytics_unavailable');
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [days]);

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
    { address: CONTRACT_ADDRESSES.lendingPool, abi: LENDING_POOL_ABI, functionName: 'getReserveConfig', args: [market.address] },
    { address: CONTRACT_ADDRESSES.lendingPool, abi: LENDING_POOL_ABI, functionName: 'currentSupply', args: [market.address] },
    { address: CONTRACT_ADDRESSES.lendingPool, abi: LENDING_POOL_ABI, functionName: 'currentBorrow', args: [market.address] },
    { address: CONTRACT_ADDRESSES.lendingPool, abi: LENDING_POOL_ABI, functionName: 'utilization', args: [market.address] },
    { address: market.address, abi: ERC20_BALANCE_ABI, functionName: 'balanceOf', args: [CONTRACT_ADDRESSES.lendingPool] },
    { address: CONTRACT_ADDRESSES.oracle, abi: ORACLE_ABI, functionName: 'getPrice', args: [market.address] },
  ]), []);

  const { data: results, isLoading: liveLoading } = useReadContracts({ contracts: marketContracts });

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

    return {
      ...market,
      decimals,
      active: Boolean(config?.[0]),
      ltv: config ? Number(config[2]) / 100 : 0,
      liquidationThreshold: config ? Number(config[3]) / 100 : 0,
      liquidationBonus: config ? (Number(config[4]) - 10000) / 100 : 0,
      reserveFactor: config ? Number(config[5]) / 100 : 0,
      supply,
      borrow,
      cash,
      utilization: utilization * 100,
      suppliedUsd: formatUsdFromPrice(supplyRaw, priceRaw, decimals),
      borrowedUsd: formatUsdFromPrice(borrowRaw, priceRaw, decimals),
      cashUsd: formatUsdFromPrice(cashRaw, priceRaw, decimals),
    };
  });

  const liveTotals = markets.reduce((acc, market) => ({
    suppliedUsd: acc.suppliedUsd + market.suppliedUsd,
    borrowedUsd: acc.borrowedUsd + market.borrowedUsd,
    cashUsd: acc.cashUsd + market.cashUsd,
  }), { suppliedUsd: 0, borrowedUsd: 0, cashUsd: 0 });

  const totalPoints = (history?.points || [])
    .filter((point) => point.asset === 'TOTAL')
    .map((point) => ({
      ...point,
      tvlUsd: toNumericE18(point.supplyUsdE18),
      borrowedUsd: toNumericE18(point.borrowUsdE18),
      cashUsd: toNumericE18(point.cashUsdE18),
      utilizationPct: toNumericE18(point.utilizationE18) * 100,
      borrowApyPct: toNumericE18(point.borrowRateE18) * 100,
      supplyApyPct: toNumericE18(point.supplyRateE18) * 100,
    }));

  const latestHistoryPoint = totalPoints[totalPoints.length - 1] || null;
  const eventCounts = (history?.events || []).reduce((acc, event) => {
    acc[event.event_name] = (acc[event.event_name] || 0) + 1;
    return acc;
  }, {});

  const historyRangeLabel = history?.points?.length
    ? formatDate(history.points[0].bucketStart) + ' — ' + formatDate(history.points[history.points.length - 1].bucketStart)
    : 'No hourly snapshots yet';

  const rangeLabel = days === 1 ? '24h' : days + 'd';

  return (
    <div className="page-stack">
      <div className="section-header analytics-page-header">
        <div>
          <div className="section-kicker">Protocol intelligence</div>
          <h1>Historical analytics</h1>
          <p>Hourly onchain snapshots and indexed protocol events for the Centry lending markets.</p>
        </div>
        <div className="history-range-picker" aria-label="Analytics range">
          {[1, 7, 30].map((option) => (
            <button
              key={option}
              type="button"
              className={days === option ? 'active' : ''}
              onClick={() => setDays(option)}
            >
              {option === 1 ? '24h' : option + 'd'}
            </button>
          ))}
        </div>
      </div>

      {historyError ? <div className="analytics-alert">Historical data is temporarily unavailable: {historyError}</div> : null}

      <section className="stats-grid analytics-stats">
        <div className="metric"><span>Protocol TVL</span><strong>{formatUsd(latestHistoryPoint?.tvlUsd ?? liveTotals.suppliedUsd)}</strong><small>{historyLoading ? 'Loading indexed history' : historyRangeLabel}</small></div>
        <div className="metric"><span>Total borrowed</span><strong>{formatUsd(latestHistoryPoint?.borrowedUsd ?? liveTotals.borrowedUsd)}</strong><small>Latest indexed snapshot</small></div>
        <div className="metric"><span>Utilization</span><strong>{latestHistoryPoint ? percent(latestHistoryPoint.utilizationPct) : '—'}</strong><small>Weighted across reserves</small></div>
        <div className="metric"><span>Liquidations</span><strong>{eventCounts.Liquidated || 0}</strong><small>{rangeLabel} indexed event count</small></div>
      </section>

      <section className="history-grid">
        <HistoryChart title="Protocol TVL" subtitle="Total supplied collateral by oracle value." points={totalPoints} valueKey="tvlUsd" formatter={formatUsd} />
        <HistoryChart title="Borrowed" subtitle="Outstanding borrowed value across reserves." points={totalPoints} valueKey="borrowedUsd" formatter={formatUsd} />
        <HistoryChart title="Utilization" subtitle="Value-weighted reserve utilization." points={totalPoints} valueKey="utilizationPct" formatter={(value) => percent(value)} />
        <HistoryChart title="Borrow APY" subtitle="Weighted annualized borrow rate from the deployed model." points={totalPoints} valueKey="borrowApyPct" formatter={(value) => percent(value)} />
      </section>

      <section className="content-grid analytics-grid">
        <div className="panel panel-large">
          <div className="panel-head">
            <div>
              <h2>Latest market state</h2>
              <p>Current RPC reads remain separate from the historical index.</p>
            </div>
          </div>
          <div className="analytics-market-list">
            {markets.map((market) => (
              <div className="analytics-market" key={market.id}>
                <div className="analytics-market-main">
                  <div className="analytics-asset">
                    <span className="token usdc">{market.symbol === 'cirBTC' ? '₿' : market.symbol === 'EURC' ? '€' : '$'}</span>
                    <div><strong>{market.symbol}</strong><small>{market.name}</small></div>
                  </div>
                  <div className="analytics-market-status"><span className={market.active ? 'status-live' : ''}>{liveLoading ? 'Loading' : market.active ? 'Live' : 'Inactive'}</span></div>
                </div>
                <div className="analytics-market-numbers">
                  <div><span>Supply</span><strong>{formatNumber(market.supply, 2)}</strong></div>
                  <div><span>Borrowed</span><strong>{formatNumber(market.borrow, 2)}</strong></div>
                  <div><span>Liquidity</span><strong>{formatNumber(market.cash, 2)}</strong></div>
                  <div><span>LTV</span><strong>{percent(market.ltv)}</strong></div>
                  <div><span>Liquidation threshold</span><strong>{percent(market.liquidationThreshold)}</strong></div>
                </div>
                <div className="analytics-util">
                  <div className="analytics-util-head"><span>Utilization</span><strong>{percent(market.utilization)}</strong></div>
                  <div className="analytics-util-track"><div className="analytics-util-fill" style={{ width: Math.min(100, Math.max(0, market.utilization)) + '%' }} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><div><h2>Indexed activity</h2><p>Events observed directly on the lending pool.</p></div></div>
          <div className="activity-counts">
            {Object.entries(EVENT_LABELS).map(([key, label]) => (
              <div key={key}><span>{label}</span><strong>{eventCounts[key] || 0}</strong></div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel event-feed-panel">
        <div className="panel-head">
          <div>
            <h2>Recent protocol events</h2>
            <p>Immutable event records captured by the analytics indexer.</p>
          </div>
          <span className="indexed-meta">{history?.events?.length || 0} records · {rangeLabel}</span>
        </div>

        <div className="event-feed">
          {history?.events?.length ? history.events.slice(0, 12).map((event) => {
            let metadata = {};
            try { metadata = event.metadata_json ? JSON.parse(event.metadata_json) : {}; } catch {}
            const normalizedAsset = String(event.asset || '').toLowerCase();
            const symbol = normalizedAsset === CONTRACT_ADDRESSES.USDC.toLowerCase()
              ? 'USDC'
              : normalizedAsset === CONTRACT_ADDRESSES.EURC.toLowerCase()
                ? 'EURC'
                : normalizedAsset === CONTRACT_ADDRESSES.CIRBTC.toLowerCase()
                  ? 'CIRBTC'
                  : '';
            const amount = event.amount_raw
              ? Number(event.amount_raw) / (10 ** tokenDecimals(symbol))
              : null;
            return (
              <div className="event-row" key={event.id}>
                <div>
                  <strong>{EVENT_LABELS[event.event_name] || event.event_name}</strong>
                  <span>Block {event.block_number} · {formatDateTime(event.timestamp)}</span>
                </div>
                <div className="event-row-mid">
                  <span>{symbol && amount != null ? formatNumber(amount, symbol === 'CIRBTC' ? 6 : 2) + ' ' + symbol : 'Protocol event'}</span>
                </div>
                <a href={arcMainnet.blockExplorers.default.url + '/tx/' + event.transaction_hash} target="_blank" rel="noreferrer">
                  {event.transaction_hash.slice(0, 8)}…{event.transaction_hash.slice(-6)}
                </a>
              </div>
            );
          }) : (
            <div className="history-empty">
              <strong>{historyLoading ? 'Loading index…' : 'No indexed events yet'}</strong>
              <span>{historyLoading ? 'The analytics feed is loading from D1.' : 'The runner will populate this feed as it processes Arc blocks.'}</span>
            </div>
          )}
        </div>
      </section>

      <div className="panel analytics-note">
        <p>
          History is sampled hourly from the deployed Centry reserves and indexed from lending-pool events. The indexer progresses from its configured start block and records new history continuously; it does not fabricate historical values in the browser.
        </p>
      </div>

      <style jsx global>{`
        .analytics-page-header{align-items:flex-end}
        .section-kicker{margin-bottom:7px;color:rgba(255,255,255,.42);font:10px 'DM Mono',monospace;letter-spacing:.08em;text-transform:uppercase}
        .history-range-picker{display:flex;gap:5px;padding:4px;border:1px solid #202020;border-radius:11px;background:#0d0d0d}
        .history-range-picker button{border:0;border-radius:8px;padding:8px 11px;background:transparent;color:rgba(255,255,255,.48);font-size:11px;font-weight:700;cursor:pointer}
        .history-range-picker button.active{background:#171717;color:#fff}
        .analytics-alert{padding:12px 14px;border:1px solid rgba(255,69,58,.3);border-radius:11px;background:rgba(255,69,58,.07);color:rgba(255,255,255,.78);font-size:11px}
        .history-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
        .history-chart{min-width:0;padding:18px;border:1px solid #202020;border-radius:15px;background:#0d0d0d}
        .history-chart-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
        .history-chart-head h3{margin:0;color:#fff;font-size:13px}
        .history-chart-head p{margin:5px 0 0;color:rgba(255,255,255,.48);font-size:10px;line-height:1.45}
        .history-chart-head>strong{color:#fff;font-size:14px;white-space:nowrap}
        .history-chart svg{display:block;width:100%;height:auto;margin-top:12px;overflow:visible}
        .history-chart-axis{display:flex;justify-content:space-between;gap:10px;color:rgba(255,255,255,.36);font-size:9px}
        .history-empty{display:grid;gap:5px;min-height:150px;place-items:center;text-align:center;color:rgba(255,255,255,.46);font-size:11px}
        .history-empty strong{color:rgba(255,255,255,.78);font-size:12px}
        .history-empty span{max-width:280px;line-height:1.5}
        .activity-counts{display:grid;gap:8px}
        .activity-counts>div{display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid #202020}
        .activity-counts>div:last-child{border-bottom:0}
        .activity-counts span{color:rgba(255,255,255,.5);font-size:11px}
        .activity-counts strong{color:#fff;font-size:12px}
        .event-feed-panel{margin-top:14px;padding:18px}
        .indexed-meta{color:rgba(255,255,255,.42);font-size:10px}
        .event-feed{display:grid;margin-top:6px}
        .event-row{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:15px;padding:12px 0;border-bottom:1px solid #202020}
        .event-row:last-child{border-bottom:0}
        .event-row strong,.event-row span{display:block}
        .event-row strong{color:#fff;font-size:11px}
        .event-row>div:first-child span{margin-top:4px;color:rgba(255,255,255,.4);font-size:9px}
        .event-row-mid{color:rgba(255,255,255,.62);font-size:10px}
        .event-row a{color:#0a84ff;font:10px ui-monospace,monospace;text-decoration:none}
        .event-row a:hover{text-decoration:underline}
        @media (max-width:900px){.history-grid{grid-template-columns:1fr}.analytics-page-header{align-items:flex-start;gap:12px}}
        @media (max-width:700px){.event-row{grid-template-columns:1fr}.event-row-mid{display:none}.event-row a{justify-self:start}}
      `}</style>
    </div>
  );
}

export default function Page() {
  return <Providers><AppShell><AnalyticsContent /></AppShell></Providers>;
}
