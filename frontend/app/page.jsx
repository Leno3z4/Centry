'use client';

import React from 'react';
import { useAccount, useChainId } from 'wagmi';
import { Providers } from '../components/Providers';
import { WalletConnect } from '../components/WalletConnect';
import { useLendingPool } from '../hooks/useLendingPool';
import { useSelfRepayingVault } from '../hooks/useSelfRepayingVault';

const nav = ['Overview', 'Lending', 'Vaults', 'Leverage', 'veGovernance', 'Rewards', 'Analytics', 'Docs'];

function fmt(value, digits = 2) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function Dashboard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { reserveData } = useLendingPool();
  const { vaultData } = useSelfRepayingVault();

  const liquidity = Number(reserveData?.totalLiquidity || 0);
  const borrows = Number(reserveData?.totalBorrows || 0);
  const utilization = liquidity > 0 ? (borrows / liquidity) * 100 : 0;
  const supplyApr = Number(reserveData?.currentLiquidityRate || 0) * 100;
  const vaultDebt = Number(vaultData?.debt || 0);
  const vaultCollateral = Number(vaultData?.collateral || 0);
  const vaultMaxBorrow = Number(vaultData?.maxBorrow || 0);
  const debtRatio = vaultMaxBorrow > 0 ? Math.min(100, (vaultDebt / vaultMaxBorrow) * 100) : 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">C</span><span>Centry</span></div>
        <nav className="side-nav">
          {nav.map((label, i) => <button className={`nav-item ${i === 0 ? 'active' : ''}`} key={label}><span className="nav-icon">{['⌂', '◈', '◫', '⤢', '♢', '✦', '⌁', '□'][i]}</span>{label}</button>)}
        </nav>
        <div className="network-card"><span className="network-dot" /><div><small>Network</small><strong>Arc Testnet</strong></div><span className="chain-id">{chainId || 5042002}</span></div>
        <div className="sidebar-footer">Centry Protocol<br /><span>Native USDC infrastructure on Arc</span></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>CENTRY</span><b>/</b> Overview</div><WalletConnect /></header>

        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span /> Native USDC infrastructure</div>
            <h1>The money market<br /><em>built for Arc.</em></h1>
            <p>Supply USDC, borrow against yield-bearing collateral, and build self-repaying strategies entirely onchain.</p>
            <div className="hero-actions"><a href="#markets" className="primary-btn">Explore markets <span>→</span></a><a href="#vault" className="secondary-btn">View vault</a></div>
          </div>
          <div className="orbital-art" aria-hidden="true"><div className="orbit orbit-a" /><div className="orbit orbit-b" /><div className="orbit orbit-c" /><div className="usdc-orb"><span>$</span></div></div>
        </section>

        <section className="stats-grid">
          <Metric label="USDC Liquidity" value={`${fmt(liquidity)} USDC`} detail="Onchain reserve" />
          <Metric label="USDC Borrowed" value={`${fmt(borrows)} USDC`} detail="Onchain reserve" />
          <Metric label="Utilization" value={`${fmt(utilization)}%`} detail="Borrowed / liquidity" />
          <Metric label="Supply APR" value={`${fmt(supplyApr, 4)}%`} detail="Current pool rate" />
        </section>

        <section className="content-grid" id="markets">
          <div className="panel market-panel">
            <div className="panel-head"><div><span className="section-kicker">MARKET</span><h2>USDC Lending Pool</h2></div><span className="live-badge"><i /> Live onchain</span></div>
            <div className="market-row market-head"><span>Asset</span><span>Liquidity</span><span>Borrowed</span><span>Utilization</span><span /></div>
            <div className="market-row"><div className="asset"><span className="token usdc">$</span><div><strong>USDC</strong><small>Native USDC</small></div></div><strong>{fmt(liquidity)}</strong><strong>{fmt(borrows)}</strong><strong>{fmt(utilization)}%</strong><button className="row-btn">Supply / Borrow</button></div>
            <div className="rate-strip"><span>Current liquidity rate</span><strong>{fmt(supplyApr, 4)}% APR</strong><span>•</span><span>Read directly from LendingPool</span></div>
          </div>

          <div className="panel vault-panel" id="vault">
            <div className="panel-head"><div><span className="section-kicker">VAULT</span><h2>Self-Repaying</h2></div><span className="live-badge"><i /> {isConnected ? 'Wallet linked' : 'Connect wallet'}</span></div>
            {isConnected ? <><div className="vault-title"><span className="token usyc">U</span><div><strong>USYC Vault</strong><small>Yield-bearing collateral</small></div></div><div className="vault-metrics"><MetricSmall label="Collateral" value={`${fmt(vaultCollateral)} USYC`} /><MetricSmall label="Debt" value={`${fmt(vaultDebt)} USDC`} /><MetricSmall label="Max borrow" value={`${fmt(vaultMaxBorrow)} USDC`} /></div><div className="debt-bar"><div><span>Debt / max borrow</span><strong>{fmt(debtRatio)}%</strong></div><div className="bar"><span style={{ width: `${debtRatio}%` }} /></div></div></> : <div className="empty-state">Connect your wallet to read your vault position from Arc.</div>}
          </div>
        </section>

        <section className="bottom-grid">
          <div className="panel feature-panel"><span className="section-kicker">PROTOCOL</span><h2>Yield that pays the debt.</h2><p>Centry routes yield from locked collateral toward outstanding USDC debt, reducing the balance over time instead of relying on manual repayment.</p><a href="#vault">Open a vault →</a></div>
          <div className="panel feature-panel purple"><span className="section-kicker">GOVERNANCE</span><h2>veCENTRY</h2><p>Lock protocol tokens into tradable veNFT positions and direct gauge emissions. Protocol revenue is denominated in native USDC.</p><a href="#governance">View governance →</a></div>
        </section>

        <footer className="page-footer"><span>Centry Protocol</span><span>Built on Arc · Testnet</span><span>{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Wallet not connected'}</span></footer>
      </main>
    </div>
  );
}

function Metric({ label, value, detail }) { return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function MetricSmall({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
export default function App() { return <Providers><Dashboard /></Providers>; }
