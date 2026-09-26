'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import { Providers } from '../../components/Providers';
import { AppShell } from '../../components/AppShell';
import DraggableWidgetGrid from '../../components/ui/draggable-widget-grid';
import { ACTIVE_MARKETS } from '../../constants/markets';
import { CONTRACT_ADDRESSES } from '../../constants/contracts';
import { LENDING_POOL_ABI } from '../../constants/abis';
import { useMultiMarketLending } from '../../hooks/useMultiMarketLending';

const AeroShards = dynamic(() => import('../../components/AeroShards'), {
  ssr: false,
  loading: () => null,
});

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
      <div
        className="health-track"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={safe}
        aria-label="Position health"
      >
        <div className="health-fill" style={{ width: safe + '%' }} />
      </div>
      <p>Higher is safer. A healthy account stays above the liquidation boundary.</p>
    </div>
  );
}

const OVERVIEW_WIDGETS = [
  { id: 'supplied', size: 'sm', label: 'Supplied' },
  { id: 'borrowed', size: 'sm', label: 'Borrowed' },
  { id: 'health', size: 'sm', label: 'Account health' },
  { id: 'capacity', size: 'sm', label: 'Available to borrow' },
  { id: 'markets', size: 'wide', label: 'Available markets' },
  { id: 'position', size: 'wide', label: 'Your position' },
];

function OverviewWidget({ title, meta, children, className = '' }) {
  return (
    <section className={'overview-widget ' + className}>
      <header className="overview-widget-head">
        <h3>{title}</h3>
        {meta ? <span>{meta}</span> : null}
      </header>
      <div className="overview-widget-body">{children}</div>
    </section>
  );
}

function OverviewContent() {
  const { isConnected } = useAccount();
  const firstMarket = useMemo(() => ACTIVE_MARKETS[0], []);
  const lending = useMultiMarketLending(
    firstMarket?.address,
    firstMarket?.decimals,
  );

  const marketConfigContracts = useMemo(
    () =>
      ACTIVE_MARKETS.map((market) => ({
        address: CONTRACT_ADDRESSES.lendingPool,
        abi: LENDING_POOL_ABI,
        functionName: 'getReserveConfig',
        args: [market.address],
      })),
    [],
  );

  const {
    data: marketConfigs,
    isLoading: marketConfigsLoading,
  } = useReadContracts({
    contracts: marketConfigContracts,
    query: { enabled: Boolean(CONTRACT_ADDRESSES.lendingPool) },
  });

  const renderOverviewWidget = (item) => {
    if (item.id === 'supplied') {
      return (
        <OverviewWidget title="Supplied">
          <strong className="overview-widget-value">
            {isConnected
              ? formatNumber(lending.supplyBalance, 1) +
                ' ' +
                (firstMarket?.symbol || '')
              : '—'}
          </strong>
          <p className="overview-widget-note">Your active deposit</p>
        </OverviewWidget>
      );
    }

    if (item.id === 'borrowed') {
      return (
        <OverviewWidget title="Borrowed">
          <strong className="overview-widget-value">
            {isConnected
              ? formatNumber(lending.borrowBalance, 1) +
                ' ' +
                (firstMarket?.symbol || '')
              : '—'}
          </strong>
          <p className="overview-widget-note">Your active debt</p>
        </OverviewWidget>
      );
    }

    if (item.id === 'health') {
      return (
        <OverviewWidget title="Account health">
          <strong className="overview-widget-value">
            {isConnected ? lending.healthFactor : '—'}
          </strong>
          <p className="overview-widget-note">
            {isConnected
              ? lending.healthFactorPercent + '% account health'
              : 'Connect wallet'}
          </p>
        </OverviewWidget>
      );
    }

    if (item.id === 'capacity') {
      return (
        <OverviewWidget title="Available to borrow">
          <strong className="overview-widget-value">
            {isConnected ? '$' + formatNumber(lending.borrowLimit, 1) : '—'}
          </strong>
          <p className="overview-widget-note">
            Based on your current position
          </p>
        </OverviewWidget>
      );
    }

    if (item.id === 'markets') {
      return (
        <OverviewWidget
          title="Available markets"
          meta={<a href="/app/markets">View markets →</a>}
          className="overview-market-widget"
        >
          <div className="overview-market-list">
            {ACTIVE_MARKETS.map((market, index) => {
              const configRead = marketConfigs?.[index];
              const reserveActive =
                configRead?.status === 'success'
                  ? Boolean(configRead.result?.[0])
                  : null;
              const reserveStatus =
                marketConfigsLoading || reserveActive === null
                  ? 'Checking…'
                  : reserveActive
                    ? 'Active'
                    : 'Inactive';
              const marketIcon =
                market.symbol === 'cirBTC'
                  ? '₿'
                  : market.symbol === 'EURC'
                    ? '€'
                    : '$';

              return (
                <a
                  key={market.id}
                  href={'/app/markets/' + market.id}
                  className="overview-market-row"
                >
                  <div className="overview-market-asset">
                    <span className="overview-market-icon">{marketIcon}</span>
                    <span>
                      <strong>{market.symbol}</strong>
                      <small>{market.name}</small>
                    </span>
                  </div>
                  <div className="overview-market-status">
                    <span>Status</span>
                    <strong className={reserveActive ? 'status-live' : ''}>
                      {reserveStatus}
                    </strong>
                  </div>
                  <span className="overview-market-open">Open</span>
                </a>
              );
            })}
          </div>
        </OverviewWidget>
      );
    }

    return (
      <OverviewWidget title="Your position">
        <div className="overview-position-content">
          {isConnected ? (
            <HealthMeter
              percent={lending.healthFactorPercent}
              factor={lending.healthFactor}
            />
          ) : (
            <div className="connect-prompt">
              Connect your wallet to see account health and position details.
            </div>
          )}
          <a
            className="secondary-btn full-btn overview-widget-button"
            href="/app/portfolio"
          >
            View portfolio
          </a>
        </div>
      </OverviewWidget>
    );
  };

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
          <h1>
            See where you<br /><em>stand.</em>
          </h1>
          <p>Check your balances, then choose what to do next.</p>
          <div className="hero-actions">
            <a className="primary-btn" href="/app/portfolio">
              View portfolio
            </a>
            <a className="secondary-btn" href="/app/swap">
              Swap assets
            </a>
          </div>
        </div>

        <div className="orbital-art" aria-hidden="true">
          <div className="orbit orbit-a" />
          <div className="orbit orbit-b" />
          <div className="orbit orbit-c" />
          <div className="usdc-orb"><span>$</span></div>
        </div>
      </section>

      <section
        className="overview-widget-board"
        aria-labelledby="overview-widgets-title"
      >
        <div className="overview-board-head">
          <div>
            <h2 id="overview-widgets-title">Overview</h2>
            <p className="overview-board-hint"><span className="overview-desktop-hint">Drag cards to arrange your workspace.</span><span className="overview-phone-hint">Cards stack for easy scrolling on phones.</span></p>
          </div>
        </div>

        <DraggableWidgetGrid
          items={OVERVIEW_WIDGETS}
          maxColumns={4}
          cellSize={235}
          gap={12}
          radius={22}
          renderItem={renderOverviewWidget}
        />
      </section>

      <style jsx global>{`
        .page-stack{position:relative;isolation:isolate}
        .overview-aero-background{position:fixed;inset:0;z-index:0;opacity:.025;pointer-events:none;overflow:hidden}
        .overview-aero-background > *{width:100%;height:100%}
        .page-stack > :not(.overview-aero-background){position:relative;z-index:1}

        .overview-widget-board{margin-top:4px}
        .overview-board-head{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:14px;padding:0 2px}
        .overview-board-head h2{margin:0;color:#fff;font-size:18px;font-weight:600;letter-spacing:-.02em}
        .overview-board-head p{margin:5px 0 0;color:rgba(255,255,255,.5);font-size:13px}
        .overview-phone-hint{display:none}

        .overview-widget{height:100%;min-height:0;padding:20px;background:#111;border-radius:22px;color:#fff}
        .overview-widget-head{display:flex;align-items:center;justify-content:space-between;gap:14px}
        .overview-widget-head h3{margin:0;color:rgba(255,255,255,.82);font-size:14px;font-weight:600;letter-spacing:-.01em}
        .overview-widget-head > span,.overview-widget-head > a{color:rgba(255,255,255,.48);font-size:12px;text-decoration:none}
        .overview-widget-head > a:hover{color:#fff}
        .overview-widget-body{display:flex;min-height:0;flex:1;flex-direction:column;margin-top:18px}
        .overview-widget-value{font-size:32px;line-height:1.05;font-weight:650;letter-spacing:-1.3px;color:#fff}
        .overview-widget-note{margin:auto 0 0;color:rgba(255,255,255,.5);font-size:12px;line-height:1.4}

        .overview-market-widget .overview-widget-body{margin-top:14px}
        .overview-market-list{display:flex;min-height:0;flex:1;flex-direction:column;gap:8px}
        .overview-market-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:16px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.08);text-decoration:none}
        .overview-market-row:last-child{border-bottom:0}
        .overview-market-asset{display:flex;align-items:center;min-width:0;gap:10px}
        .overview-market-icon{display:inline-flex;width:30px;height:30px;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:#181818;color:#fff;font-size:15px}
        .overview-market-asset strong{display:block;color:#fff;font-size:13px;font-weight:600}
        .overview-market-asset small{display:block;margin-top:3px;color:rgba(255,255,255,.42);font-size:11px}
        .overview-market-status span{display:block;color:rgba(255,255,255,.38);font-size:10px}
        .overview-market-status strong{display:block;margin-top:4px;color:rgba(255,255,255,.65);font-size:12px;font-weight:600}
        .overview-market-status strong.status-live{color:#63d08a}
        .overview-market-open{color:rgba(255,255,255,.68);font-size:12px;font-weight:600;white-space:nowrap}
        .overview-market-row:hover .overview-market-open{color:#fff}

        .overview-position-content{display:flex;min-height:0;flex:1;flex-direction:column}
        .overview-position-content .health-meter{margin:0}
        .overview-position-content .connect-prompt{display:flex;min-height:0;flex:1;align-items:center;color:rgba(255,255,255,.55)}
        .overview-widget-button{margin-top:auto !important}

        @media (max-width:640px){
          .overview-desktop-hint{display:none}
          .overview-phone-hint{display:inline}
          .overview-widget{padding:17px;border-radius:18px}
          .overview-widget-value{font-size:28px}
          .overview-market-row{grid-template-columns:minmax(0,1fr) auto;gap:11px}
          .overview-market-status{display:none}
        }
      `}</style>
    </div>
  );
}

export default function Page() {
  return (
    <Providers>
      <AppShell>
        <OverviewContent />
      </AppShell>
    </Providers>
  );
}
