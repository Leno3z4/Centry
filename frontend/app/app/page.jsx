'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import { Providers } from '../../components/Providers';
import { AppShell } from '../../components/AppShell';
import { ACTIVE_MARKETS } from '../../constants/markets';
import { CONTRACT_ADDRESSES } from '../../constants/contracts';
import { LENDING_POOL_ABI } from '../../constants/abis';
import { useMultiMarketLending } from '../../hooks/useMultiMarketLending';

const AeroShards = dynamic(() => import('../../components/AeroShards'), { ssr: false, loading: () => null });


function formatNumber(value, digits = 1) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0.0';
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
        <span>Account health</span>
        <strong>{safe}%</strong>
      </div>
      <div className="health-factor-label">Health factor {factor || '—'}</div>
      <div className="health-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={safe} aria-label="Position health">
        <div className="health-fill" style={{ width: `${safe}%` }} />
      </div>
      <p>Higher is safer. A healthy account stays above the liquidation boundary.</p>
    </div>
  );
}

function OverviewContent() {
  const { isConnected } = useAccount();
  const firstMarket = useMemo(() => ACTIVE_MARKETS[0], []);
  const lending = useMultiMarketLending(firstMarket?.address, firstMarket?.decimals);
  const marketConfigContracts = useMemo(
    () => ACTIVE_MARKETS.map((market) => ({
      address: CONTRACT_ADDRESSES.lendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'getReserveConfig',
      args: [market.address],
    })),
    [],
  );
  const { data: marketConfigs, isLoading: marketConfigsLoading } = useReadContracts({
    contracts: marketConfigContracts,
    query: { enabled: Boolean(CONTRACT_ADDRESSES.lendingPool) },
  });
  return (
    <div className="page-stack">
      <div className="overview-aero-background" aria-hidden="true">
        <AeroShards
          backgroundColor="#0b0d10"
          shardColor="#4a4f58"
          accentColor="#a79bdb"
          placement="full"
          flow="stream"
          material="pearl"
          detail="balanced"
          effect="none"
          scale={1}
          spread={1}
          depth={1}
          speed={1}
          spin={1}
          interaction="repel"
          density={1.5}
          shardSize={1.1}
          stretch={1}
          turbulence={1}
          glow={1}
          edgeSoftness={2}
          bloom={0.5}
          grain={0.05}
          chromaticAberration={0.0075}
          transitionDuration={1}
          interactionRadius={1.5}
          interactionStrength={0.5}
          rippleIntensity={1}
          holdToGather={true}
        />
      </div>
      <section className="hero">
        <div className="hero-copy">
          <div className="section-kicker">ARC MAINNET · ACCOUNT OVERVIEW</div>
          <h1>Your account,<br /><em>at a glance.</em></h1>
          <p>Positions, available liquidity and execution tools in one Centry workspace.</p>
          <div className="hero-actions">
            <a className="primary-btn" href="/app/portfolio">View portfolio</a>
            <a className="secondary-btn" href="/app/agents">Manage agents</a>
          </div>
        </div>
        <div className="overview-account-console" aria-hidden="true">
          <span className="overview-console-kicker">CENTRY ACCOUNT</span>
          <strong>{isConnected ? `${formatNumber(lending.supplyBalance, 1)} ${firstMarket?.symbol || ''}` : '—'}</strong>
          <small>Supplied</small>
          <div className="overview-console-row"><span>Borrowed</span><b>{isConnected ? `${formatNumber(lending.borrowBalance, 1)} ${firstMarket?.symbol || ''}` : '—'}</b></div>
          <div className="overview-console-row"><span>Health</span><b>{isConnected ? lending.healthFactor : '—'}</b></div>
          <div className="overview-console-row"><span>Borrow capacity</span><b>{isConnected ? `${formatNumber(lending.borrowLimit, 1)}` : '—'}</b></div>
        </div>
      </section>

      <section className="stats-grid overview-stats-grid">
        <div className="metric"><span>Supplied</span><strong>{isConnected ? `${formatNumber(lending.supplyBalance, 1)} ${firstMarket?.symbol || ''}` : '—'}</strong><small>Your active deposit</small></div>
        <div className="metric"><span>Borrowed</span><strong>{isConnected ? `${formatNumber(lending.borrowBalance, 1)} ${firstMarket?.symbol || ''}` : '—'}</strong><small>Your active debt</small></div>
        <div className="metric"><span>Account health</span><strong>{isConnected ? lending.healthFactor : '—'}</strong><small>{isConnected ? `${lending.healthFactorPercent}% account health` : 'Connect wallet'}</small></div>
        <div className="metric"><span>Available to borrow</span><strong>{isConnected ? `$${formatNumber(lending.borrowLimit, 1)}` : '—'}</strong><small>Based on your current position</small></div>
      </section>
      <section className="content-grid">
        <div className="panel panel-large">
          <div className="panel-head"><div><h2>Available markets</h2></div><a className="text-link" href="/app/markets">View markets →</a></div>
          <div className="market-list">
            {ACTIVE_MARKETS.map((market, index) => {
              const configRead = marketConfigs?.[index];
              const reserveActive = configRead?.status === 'success' ? Boolean(configRead.result?.[0]) : null;
              const reserveStatus = marketConfigsLoading || reserveActive === null
                ? 'Checking…'
                : reserveActive
                  ? 'Active'
                  : 'Inactive';
              const marketIcon = market.symbol === 'cirBTC' ? '₿' : market.symbol === 'EURC' ? '€' : '$';

              return (
                <a key={market.id} href={'/app/markets/' + market.id} className="market-list-item">
                  <div className="asset">
                    <span className="token usdc">{marketIcon}</span>
                    <div><strong>{market.symbol}</strong><small>{market.name}</small></div>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong className={reserveActive ? 'status-live' : ''}>{reserveStatus}</strong>
                  </div>
                  <span className="market-arrow">Open</span>
                </a>
              );
            })}
          </div>
        </div>

        <div className="panel overview-account-panel">
          <div className="panel-head"><div><h2>Your position</h2></div></div>
          {isConnected ? <HealthMeter percent={lending.healthFactorPercent} factor={lending.healthFactor} /> : <div className="connect-prompt">Connect your wallet to see account health and position details.</div>}
          <a className="secondary-btn full-btn" href="/app/portfolio">View portfolio</a>
        </div>
      </section>

      <style jsx global>{`
        .page-stack{position:relative;isolation:isolate}
        .overview-aero-background{position:fixed;inset:0;z-index:0;opacity:.12;pointer-events:none;overflow:hidden}
        .overview-aero-background > *{width:100%;height:100%}
        .page-stack > :not(.overview-aero-background){position:relative;z-index:1}
        .overview-account-console{
          position:absolute;right:42px;top:50%;transform:translateY(-50%);
          width:min(360px,36%);padding:24px;border:1px solid #3a3a38;border-radius:16px;background:#151515;
        }
        .overview-console-kicker{color:#70706c;font-size:11px;font-weight:650;letter-spacing:.02em}
        .overview-account-console strong{display:block;margin:14px 0 4px;font-size:38px;letter-spacing:-.05em}
        .overview-account-console small{color:#70706c;font-size:12px}
        .overview-console-row{display:flex;justify-content:space-between;gap:12px;padding:14px 0;border-top:1px solid #2c2c2c;margin-top:14px;font-size:12px}
        .overview-console-row span{color:#70706c}.overview-console-row b{color:#fff;font-weight:600}
        @media (max-width:760px){
          .overview-account-console{position:relative;right:auto;top:auto;transform:none;width:100%;margin-top:12px}
        }
      `}</style>    </div>
  );
}

export default function Page() {
  return <Providers><AppShell><OverviewContent /></AppShell></Providers>;
}
