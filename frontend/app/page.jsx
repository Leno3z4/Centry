'use client';

import React from 'react';
import { useAccount, useChainId } from 'wagmi';
import { Providers } from '../components/Providers';
import { WalletConnect } from '../components/WalletConnect';
import { useLendingPool } from '../hooks/useLendingPool';
import { useVeGovernance } from '../hooks/useVeGovernance';

const nav = ['Overview', 'Lending', 'Governance', 'Rewards', 'Analytics', 'Docs'];

function fmt(value, digits = 2) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function Dashboard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { reserveData, supplyBalance, usdcBalance, approveUSDC, depositLiquidity, withdrawLiquidity, isPending, isConfirming, error: lendingError } = useLendingPool();
  const { veBalance, centBalance, approveCENT, createLock, refetchAll: refetchGov, isPending: govPending, isConfirming: govConfirming, error: govError } = useVeGovernance();

  const liquidity = Number(reserveData?.totalLiquidity || 0);
  const borrows = Number(reserveData?.totalBorrows || 0);
  const utilization = Number(reserveData?.utilization || 0);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">C</span><span>Centry</span></div>
        <nav className="side-nav">
          {nav.map((label, i) => <button className={`nav-item ${i === 0 ? 'active' : ''}`} key={label}><span className="nav-icon">{['⌂', '◈', '♢', '✦', '⌁', '□'][i]}</span>{label}</button>)}
        </nav>
        <div className="network-card"><span className="network-dot" /><div><small>Network</small><strong>Arc Testnet</strong></div><span className="chain-id">{chainId || 5042002}</span></div>
        <div className="sidebar-footer">Centry Protocol<br /><span>Arc-native USDC lending</span></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>CENTRY</span><b>/</b> Overview</div><WalletConnect /></header>

        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span /> Arc-native lending market</div>
            <h1>USDC liquidity<br /><em>built for Arc.</em></h1>
            <p>Supply USDC, borrow against your collateral, and manage risk directly through Centry's onchain money market.</p>
            <div className="hero-actions"><a href="#markets" className="primary-btn">Explore market <span>→</span></a><a href="#governance" className="secondary-btn">View governance</a></div>
          </div>
          <div className="orbital-art" aria-hidden="true"><div className="orbit orbit-a" /><div className="orbit orbit-b" /><div className="orbit orbit-c" /><div className="usdc-orb"><span>$</span></div></div>
        </section>

        <section className="stats-grid">
          <Metric label="USDC Liquidity" value={`${fmt(liquidity)} USDC`} detail="Reserve liquidity" />
          <Metric label="USDC Borrowed" value={`${fmt(borrows)} USDC`} detail="Outstanding debt" />
          <Metric label="Utilization" value={`${fmt(utilization)}%`} detail="Borrowed / available" />
          <Metric label="Health factor" value={isConnected ? 'Read in wallet' : 'Connect wallet'} detail="Per-account risk" />
        </section>

        <section className="content-grid" id="markets">
          <div className="panel market-panel">
            <div className="panel-head"><div><span className="section-kicker">MARKET</span><h2>USDC Lending Pool</h2></div><span className="live-badge"><i /> {reserveData ? 'Live onchain' : 'Configure contracts'}</span></div>
            <div className="market-row market-head"><span>Asset</span><span>Liquidity</span><span>Borrowed</span><span>Utilization</span><span /></div>
            <div className="market-row"><div className="asset"><span className="token usdc">$</span><div><strong>USDC</strong><small>Arc-native gas asset</small></div></div><strong>{fmt(liquidity)}</strong><strong>{fmt(borrows)}</strong><strong>{fmt(utilization)}%</strong><a className="row-btn" href="#actions">Manage</a></div>
            <div className="rate-strip"><span>Risk model</span><strong>Oracle-protected</strong><span>•</span><span>Variable interest</span><strong>Onchain</strong></div>

            <div id="actions" className="market-actions">
              <div className="action-card">
                <h3>Supply USDC</h3>
                <p>Wallet balance: {fmt(usdcBalance)} USDC</p>
                <div className="action-row"><span>{fmt(supplyBalance)} supplied</span></div>
                <div className="action-buttons"><button disabled={isPending || isConfirming || !isConnected} onClick={() => approveUSDC('10')}>Approve</button><button disabled={isPending || isConfirming || !isConnected} onClick={async () => { await depositLiquidity('10'); }}>Supply 10</button><button disabled={isPending || isConfirming || !isConnected} onClick={async () => { await withdrawLiquidity(); }}>Withdraw all</button></div>
              </div>
              <div className="action-card muted-card"><h3>Borrow / repay</h3><p>The pool supports borrowing and repayment once collateral and available liquidity satisfy the configured risk rules.</p><div className="notice">Borrow controls will be exposed in the next UI pass with live health-factor feedback.</div></div>
            </div>
          </div>

          <div className="panel governance-panel" id="governance">
            <div className="panel-head"><div><span className="section-kicker">GOVERNANCE</span><h2>veCENT</h2></div><span className="live-badge"><i /> {isConnected ? 'Wallet linked' : 'Connect wallet'}</span></div>
            <p className="governance-copy">Lock CENT to receive a non-transferable veCENT position with voting power that decays over the lock period.</p>
            <div className="governance-stats"><MetricSmall label="CENT balance" value={fmt(centBalance)} /><MetricSmall label="veNFTs" value={fmt(veBalance, 0)} /></div>
            <div className="action-card"><h3>Lock CENT</h3><p>Approve CENT first, then create your lock.</p><div className="action-buttons"><button disabled={govPending || govConfirming || !isConnected} onClick={() => approveCENT('10')}>Approve 10 CENT</button><button disabled={govPending || govConfirming || !isConnected} onClick={async () => { await createLock('10', 52); refetchGov(); }}>Lock 10 CENT / 1 year</button></div></div>
            <div className="notice">One lock per wallet in the current MVP. veCENT is intentionally non-transferable.</div>
          </div>
        </section>

        {(lendingError || govError) && <div className="panel error-panel"><strong>Transaction/read error</strong><p>{(lendingError || govError)?.shortMessage || (lendingError || govError)?.message || 'Check that the contract addresses and Arc network are configured.'}</p></div>}

        <section className="bottom-grid">
          <div className="panel feature-panel"><span className="section-kicker">PROTOCOL</span><h2>Simple core. Strong controls.</h2><p>Centry keeps the lending engine modular: isolated reserves, configurable risk limits, oracle validation, interest accrual, and liquidation protection.</p><a href="#markets">Open the market →</a></div>
          <div className="panel feature-panel purple"><span className="section-kicker">TREASURY</span><h2>Revenue in USDC.</h2><p>Protocol revenue can be distributed through the dedicated revenue distributor while administration remains separated from the lending pool.</p><a href="#governance">View governance →</a></div>
        </section>

        <footer className="page-footer"><span>Centry Protocol</span><span>Built on Arc · Testnet</span><span>{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Wallet not connected'}</span></footer>
      </main>
    </div>
  );
}

function Metric({ label, value, detail }) { return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function MetricSmall({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
export default function App() { return <Providers><Dashboard /></Providers>; }
