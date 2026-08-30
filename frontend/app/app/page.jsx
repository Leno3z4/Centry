'use client';

import React, { useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { Providers } from '../../components/Providers';
import { WalletConnect } from '../../components/WalletConnect';
import MultiMarketLending from '../../components/MultiMarketLending';
import { SelfRepayingContent } from './self-repaying/page';
import { useLendingPool } from '../../hooks/useLendingPool';
import { useVeGovernance } from '../../hooks/useVeGovernance';
import { ACTIVE_MARKETS, UPCOMING_MARKETS } from '../../constants/markets';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: '⌂' },
  { id: 'lending', label: 'Lending', icon: '◈' },
  { id: 'self-repaying', label: 'Self-Repaying', icon: '↻' },
  { id: 'portfolio', label: 'Portfolio', icon: '◒' },
  { id: 'governance', label: 'Governance', icon: '♢' },
  { id: 'rewards', label: 'Rewards', icon: '✦' },
  { id: 'analytics', label: 'Analytics', icon: '⌁' },
  { id: 'docs', label: 'Docs', icon: '□' },
];

const ASSET = 'USDC';

function formatNumber(value, digits = 2) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0.00';
  return number.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function errorText(error) {
  return error?.shortMessage || error?.message || 'Transaction failed. Check your wallet, network, allowance, and contract state.';
}

function StatCard({ label, value, detail }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function HealthMeter({ value, connected = true, factor = null }) {
  const percent = connected ? Math.min(Math.max(Number(value || 0), 0), 100) : 0;

  return (
    <div className="health-meter">
      <div className="health-meter-head">
        <span>Position health</span>
        <strong>{connected ? `${percent}%` : '—'}</strong>
      </div>
      {factor && <div className="health-factor-label">Health factor {factor}</div>}
      <div
        role="progressbar"
        aria-label="Position health"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={connected ? percent : 0}
        className="health-track"
      >
        <div className="health-fill" style={{ width: `${percent}%` }} />
      </div>
      <p>Higher is safer. 0% is the liquidation boundary; 100% is the visual ceiling for a strong safety buffer.</p>
    </div>
  );
}

function AppShell({ activeView, setActiveView, chainId, address, children }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">C</span><span>Centry</span></div>
        <nav className="side-nav" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${activeView === item.id ? 'active' : ''}`}
              onClick={() => setActiveView(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="network-card">
          <span className="network-dot" />
          <div><small>Network</small><strong>Arc Testnet</strong></div>
          <span className="chain-id">{chainId || 5042002}</span>
        </div>
        <div className="sidebar-footer"><strong>Centry Protocol</strong><span>Arc-native liquidity</span></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <span>CENTRY</span><b>/</b>{NAV_ITEMS.find((item) => item.id === activeView)?.label}
          </div>
          <WalletConnect />
        </header>
        <div className="page-view">{children}</div>
        <footer className="page-footer">
          <span>Centry Protocol</span>
          <span>Arc Testnet</span>
          <span>{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Wallet not connected'}</span>
        </footer>
      </main>
    </div>
  );
}

function Overview({ lending, governance, connected, setActiveView }) {
  const liquidity = Number(lending.reserveData?.totalLiquidity || 0);
  const borrowed = Number(lending.reserveData?.totalBorrows || 0);
  const utilization = Number(lending.reserveData?.utilization || 0);

  return (
    <div className="page-stack">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span />Arc-native lending market</div>
          <h1>Liquidity,<br /><em>built for Arc.</em></h1>
          <p>Centry is building an Arc-native money market for lending, borrowing, and onchain risk management.</p>
          <div className="hero-actions">
            <button type="button" className="primary-btn" onClick={() => setActiveView('lending')}>Open lending</button>
            <button type="button" className="secondary-btn" onClick={() => setActiveView('self-repaying')}>Self-repaying</button>
          </div>
        </div>
        <div className="orbital-art" aria-hidden="true">
          <div className="orbit orbit-a" /><div className="orbit orbit-b" /><div className="orbit orbit-c" />
          <div className="usdc-orb"><span>$</span></div>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard label="Active liquidity" value={`${formatNumber(liquidity)} ${ASSET}`} detail="Centry test reserve" />
        <StatCard label="Borrowed" value={`${formatNumber(borrowed)} ${ASSET}`} detail="Outstanding debt" />
        <StatCard label="Utilization" value={`${formatNumber(utilization)}%`} detail="Pool utilization" />
        <StatCard label="Health" value={connected ? `${lending.healthFactorPercent}%` : '—'} detail={connected ? 'Your safety buffer' : 'Connect wallet'} />
      </section>

      <section className="content-grid">
        <div className="panel panel-large">
          <div className="panel-head"><div><span className="section-kicker">MARKETS</span><h2>Available markets</h2></div><span className="live-badge"><i /> Testnet</span></div>
          <div className="market-list">
            {ACTIVE_MARKETS.map((market) => (
              <button key={market.id} type="button" className="market-list-item" onClick={() => setActiveView('lending')}>
                <div className="asset"><span className="token usdc">$</span><div><strong>{market.symbol}</strong><small>{market.name}</small></div></div>
                <div><span>Status</span><strong className="status-live">Live</strong></div>
                <div><span>Market</span><strong>Enabled</strong></div>
                <span className="market-arrow">Open</span>
              </button>
            ))}
          </div>
          {UPCOMING_MARKETS.length > 0 && (
            <div className="upcoming-markets">
              <div className="subsection-head"><span className="section-kicker">COMING SOON</span><span>Assets pending reserve and oracle configuration.</span></div>
              <div className="chip-row">{UPCOMING_MARKETS.map((market) => <div className="market-chip" key={market.id}><strong>{market.symbol}</strong><span>Coming soon</span></div>)}</div>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head"><div><span className="section-kicker">GOVERNANCE</span><h2>veCENT</h2></div></div>
          <p className="panel-copy">Lock CENT to receive non-transferable voting power that decays over time.</p>
          <div className="governance-stats">
            <StatCard label="CENT balance" value={connected ? formatNumber(governance.centBalance) : '—'} detail="Wallet balance" />
            <StatCard label="Voting power" value={connected ? formatNumber(governance.votingPower) : '—'} detail="Current veCENT" />
          </div>
          <button type="button" className="primary-btn full-btn" onClick={() => setActiveView('governance')}>Manage veCENT</button>
        </div>
      </section>
    </div>
  );
}

function Portfolio({ lending, connected }) {
  return (
    <div className="page-stack">
      <div className="section-header"><div><span className="section-kicker">PORTFOLIO</span><h1>Your position</h1><p>Collateral, debt, borrowing capacity, and account health.</p></div></div>
      {!connected && <div className="connect-prompt large-prompt">Connect your wallet to load your onchain portfolio.</div>}
      <section className="portfolio-grid">
        <StatCard label="Supplied" value={connected ? `${formatNumber(lending.supplyBalance)} ${ASSET}` : '—'} detail="Collateral" />
        <StatCard label="Borrowed" value={connected ? `${formatNumber(lending.borrowBalance)} ${ASSET}` : '—'} detail="Debt" />
        <StatCard label="Borrow limit" value={connected ? `${formatNumber(lending.borrowLimit)} USD` : '—'} detail="Remaining borrowing room" />
        <StatCard label="Health" value={connected ? `${lending.healthFactorPercent}%` : '—'} detail="Safety buffer" />
      </section>
      <div className="panel"><div className="panel-head"><div><span className="section-kicker">RISK</span><h2>Position health</h2></div></div><div className="risk-card"><HealthMeter value={lending.healthFactorPercent} connected={connected} factor={lending.healthFactor} /></div></div>
    </div>
  );
}

function Governance({ governance, connected }) {
  const [amount, setAmount] = useState('');
  const [weeks, setWeeks] = useState('52');
  const [notice, setNotice] = useState('');
  const busy = governance.isPending || governance.isConfirming;
  const needsApproval = connected && Number(amount || 0) > Number(governance.centAllowance || 0);

  const submit = async () => {
    if (!connected || !amount || Number(amount) <= 0 || busy) return;
    try {
      setNotice('');
      if (needsApproval) {
        await governance.approveCENT(amount);
        setNotice(`Approved ${amount} CENT.`);
        return;
      }
      await governance.createLock(amount, weeks);
      await governance.refetchAll();
      setAmount('');
      setNotice('CENT lock confirmed onchain.');
    } catch (error) {
      setNotice(errorText(error));
    }
  };

  return (
    <div className="page-stack">
      <div className="section-header"><div><span className="section-kicker">GOVERNANCE</span><h1>veCENT</h1><p>Lock CENT to create your governance position.</p></div></div>
      <section className="governance-hero-grid">
        <div className="panel governance-hero-card">
          <span className="section-kicker">CURRENT POSITION</span>
          <div className="big-number">{connected ? formatNumber(governance.votingPower) : '—'}</div>
          <span className="muted-label">Voting power</span>
          <div className="governance-stat-line"><span>CENT balance</span><strong>{connected ? formatNumber(governance.centBalance) : '—'}</strong></div>
          <div className="governance-stat-line"><span>Locked CENT</span><strong>{connected ? formatNumber(governance.lockedAmount) : '—'}</strong></div>
          <div className="governance-stat-line"><span>veNFTs</span><strong>{connected ? governance.veBalance : '—'}</strong></div>
          <div className="governance-stat-line"><span>Lock end</span><strong>{connected && governance.lockEnd ? governance.lockEnd.toLocaleDateString() : '—'}</strong></div>
        </div>
        <div className="panel">
          <span className="section-kicker">CREATE LOCK</span><h2>Lock CENT</h2>
          <p className="panel-copy">The current MVP supports one lock per wallet with weekly lock expiry.</p>
          <label className="field-label" htmlFor="cent-amount">CENT amount</label>
          <div className="amount-input-wrap"><input id="cent-amount" type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} /><span>CENT</span></div>
          <label className="field-label" htmlFor="lock-weeks">Lock duration</label>
          <select id="lock-weeks" value={weeks} onChange={(event) => setWeeks(event.target.value)}><option value="4">4 weeks</option><option value="13">13 weeks</option><option value="26">26 weeks</option><option value="52">52 weeks</option></select>
          {!connected ? <div className="connect-prompt">Connect your wallet to manage veCENT.</div> : <button type="button" className="primary-btn full-btn large-btn" disabled={busy || !amount} onClick={submit}>{busy ? 'Waiting for confirmation…' : needsApproval ? 'Approve CENT' : `Lock CENT for ${weeks} weeks`}</button>}
          {notice && <div className="notice">{notice}</div>}
        </div>
      </section>
    </div>
  );
}

function Rewards() {
  return <div className="page-stack"><div className="section-header"><div><span className="section-kicker">REWARDS</span><h1>Protocol rewards</h1><p>Claims stay inactive until an eligible revenue epoch and proof set exist.</p></div></div><div className="feature-grid"><div className="panel feature-card"><span className="section-kicker">REVENUE</span><h2>Revenue distributor</h2><p>The deployed distributor supports proof-based claims once an eligible epoch is configured.</p></div><div className="panel feature-card"><span className="section-kicker">INCENTIVES</span><h2>Liquidity incentives</h2><p>Future market incentives can be added without changing the lending-pool core.</p></div><div className="panel feature-card"><span className="section-kicker">GOVERNANCE</span><h2>veCENT utility</h2><p>veCENT provides the governance position used by future reward-routing mechanics.</p></div></div></div>;
}

function Analytics({ lending }) {
  return <div className="page-stack"><div className="section-header"><div><span className="section-kicker">ANALYTICS</span><h1>Market analytics</h1><p>Current figures are read from the deployed Centry lending pool.</p></div></div><section className="stats-grid"><StatCard label="Liquidity" value={`${formatNumber(lending.reserveData?.totalLiquidity)} ${ASSET}`} detail="Current supply" /><StatCard label="Borrowed" value={`${formatNumber(lending.reserveData?.totalBorrows)} ${ASSET}`} detail="Current debt" /><StatCard label="Utilization" value={`${formatNumber(lending.reserveData?.utilization)}%`} detail="Current utilization" /><StatCard label="Enabled markets" value={ACTIVE_MARKETS.length} detail="Configured in UI" /></section><div className="panel empty-chart-panel"><span className="section-kicker">HISTORY</span><h2>Historical charts</h2><p>Historical graphs require indexed onchain events. Centry will not fabricate a historical series.</p></div></div>;
}

function Docs() {
  return <div className="page-stack"><div className="section-header"><div><span className="section-kicker">DOCS</span><h1>Centry documentation</h1><p>Current testnet architecture and user flows.</p></div></div><div className="docs-grid">{[['Lending', [`Supply ${ASSET}`, `Borrow against collateral`, `Repay debt`, `Withdraw collateral`]], ['Governance', ['CENT token', 'veCENT locks', 'Voting power decay', 'Revenue distribution']], ['Markets', [`${ASSET}`, 'EURC', 'cirBTC', 'Future stablecoins']], ['Security', ['Oracle validation', 'Reserve caps', 'Pause controls', 'Independent audit before production']]].map(([title, items]) => <div className="panel doc-card" key={title}><span className="section-kicker">{title.toUpperCase()}</span><h2>{title}</h2><div className="doc-list">{items.map((item) => <div className="doc-item" key={item}><span className="doc-marker">•</span><strong>{item}</strong></div>)}</div></div>)}</div></div>;
}

function Dashboard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const lending = useLendingPool();
  const governance = useVeGovernance();
  const [activeView, setActiveView] = useState('overview');

  const content = useMemo(() => {
    if (activeView === 'lending') return <MultiMarketLending />;
    if (activeView === 'self-repaying') return <SelfRepayingContent />;
    if (activeView === 'portfolio') return <Portfolio lending={lending} connected={isConnected} />;
    if (activeView === 'governance') return <Governance governance={governance} connected={isConnected} />;
    if (activeView === 'rewards') return <Rewards />;
    if (activeView === 'analytics') return <Analytics lending={lending} />;
    if (activeView === 'docs') return <Docs />;
    return <Overview lending={lending} governance={governance} connected={isConnected} setActiveView={setActiveView} />;
  }, [activeView, lending, governance, isConnected]);

  return <AppShell activeView={activeView} setActiveView={setActiveView} chainId={chainId} address={address}>{content}</AppShell>;
}

export default function Page() {
  return <Providers><Dashboard /></Providers>;
}
