'use client';

import { useMemo } from 'react';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { ACTIVE_MARKETS } from '../../../constants/markets';
import { useMultiMarketLending } from '../../../hooks/useMultiMarketLending';

export default function Page() {
  return <Providers><AppShell><AnalyticsContent /></AppShell></Providers>;
}

function AnalyticsContent() {
  const market = useMemo(() => ACTIVE_MARKETS[0], []);
  const lending = useMultiMarketLending(market?.address, market?.decimals);
  const number = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div className="page-stack">
      <div className="section-header"><div><span className="section-kicker">ANALYTICS</span><h1>Market analytics</h1><p>Current figures are read from the deployed Centry lending pool.</p></div></div>
      <section className="stats-grid">
        <div className="metric"><span>USDC liquidity</span><strong>{number(lending.reserveData?.totalLiquidity)}</strong><small>Current reserve cash</small></div>
        <div className="metric"><span>USDC borrowed</span><strong>{number(lending.reserveData?.totalBorrows)}</strong><small>Current debt</small></div>
        <div className="metric"><span>USDC utilization</span><strong>{number(lending.reserveData?.utilization)}%</strong><small>Current utilization</small></div>
        <div className="metric"><span>Live markets</span><strong>{ACTIVE_MARKETS.length}</strong><small>USDC · EURC · cirBTC</small></div>
      </section>
      <div className="panel empty-chart-panel"><span className="section-kicker">HISTORY</span><h2>Historical charts</h2><p>Historical graphs will be added from indexed onchain events rather than fabricated data.</p></div>
    </div>
  );
}
