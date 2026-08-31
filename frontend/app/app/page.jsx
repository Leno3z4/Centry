'use client';

import { useMemo } from 'react';
import { useAccount } from 'wagmi';
import { Providers } from '../../components/Providers';
import { AppShell } from '../../components/AppShell';
import { MultiMarketLending } from '../../components/MultiMarketLending';
import { ACTIVE_MARKETS } from '../../constants/markets';
import { useMultiMarketLending } from '../../hooks/useMultiMarketLending';

function formatNumber(value, digits = 2) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0.00';
  return number.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function HealthMeter({ percent, factor }) {
  const safe = Math.min(Math.max(Number(percent || 0), 0), 100);
  return (
    <div className="health-meter">
      <div className="health-meter-head">
        <span>Position health</span>
        <strong>{safe}%</strong>
      </div>
      <div className="health-factor-label">Health factor {factor || '—'}</div>
      <div className="health-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={safe} aria-label="Position health">
        <div className="health-fill" style={{ width: `${safe}%` }} />
      </div>
      <p>100% means no account debt; lower values move toward the liquidation boundary.</p>
    </div>
  );
}

function OverviewContent() {
  const { isConnected } = useAccount();
  const firstMarket = useMemo(() => ACTIVE_MARKETS[0], []);
  const lending = useMultiMarketLending(firstMarket?.address, firstMarket?.decimals);

  return (
    <div className="page-stack">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span />Arc-native lending market</div>
          <h1>Liquidity,<br /><em>built for Arc.</em></h1>
          <p>Centry is an Arc-native money market for lending, borrowing, swaps, and onchain risk management.</p>
          <div className="hero-actions">
            <a className="primary-btn" href="/app/lending">Open lending</a>
            <a className="secondary-btn" href="/app/swap">Swap assets</a>
          </div>
        </div>
        <div className="orbital-art" aria-hidden="true">
          <div className="orbit orbit-a" /><div className="orbit orbit-b" /><div className="orbit orbit-c" />
          <div className="usdc-orb"><span>$</span></div>
        </div>
      </section>

      <section className="stats-grid">
        <div className="metric"><span>Live markets</span><strong>{ACTIVE_MARKETS.length}</strong><small>USDC · EURC · cirBTC</small></div>
        <div className="metric"><span>Health</span><strong>{isConnected ? `${lending.healthFactorPercent}%` : '—'}</strong><small>{isConnected ? 'Account safety' : 'Connect wallet'}</small></div>
        <div className="metric"><span>Borrow limit</span><strong>{isConnected ? `$${formatNumber(lending.borrowLimit)}` : '—'}</strong><small>Remaining borrowing room</small></div>
        <div className="metric"><span>Network</span><strong>Arc</strong><small>Testnet 5042002</small></div>
      </section>

      <section className="content-grid">
        <div className="panel panel-large">
          <div className="panel-head"><div><span className="section-kicker">MARKETS</span><h2>Available markets</h2></div></div>
          <div className="market-list">
            {ACTIVE_MARKETS.map((market) => (
              <a key={market.id} href="/app/lending" className="market-list-item">
                <div className="asset"><span className="token usdc">{market.symbol === 'cirBTC' ? '₿' : market.symbol === 'EURC' ? '€' : '$'}</span><div><strong>{market.symbol}</strong><small>{market.name}</small></div></div>
                <div><span>Status</span><strong className="status-live">Live</strong></div>
                <div><span>Network</span><strong>Arc Testnet</strong></div>
                <span className="market-arrow">Open</span>
              </a>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><div><span className="section-kicker">YOUR ACCOUNT</span><h2>Risk snapshot</h2></div></div>
          {isConnected ? <HealthMeter percent={lending.healthFactorPercent} factor={lending.healthFactor} /> : <div className="connect-prompt">Connect your wallet to see account health.</div>}
          <a className="primary-btn full-btn" href="/app/portfolio">View portfolio</a>
        </div>
      </section>
    </div>
  );
}

export default function Page() {
  return <Providers><AppShell><OverviewContent /></AppShell></Providers>;
}
