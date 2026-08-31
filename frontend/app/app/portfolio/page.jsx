'use client';

import { useAccount } from 'wagmi';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { useLendingPool } from '../../../hooks/useLendingPool';

export default function Page() {
  const content = <PortfolioContent />;
  return <Providers><AppShell>{content}</AppShell></Providers>;
}

function PortfolioContent() {
  const { isConnected } = useAccount();
  const lending = useLendingPool();

  const metric = (label, value, detail) => (
    <div className="metric" key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
  );

  return (
    <div className="page-stack">
      <div className="section-header"><div><span className="section-kicker">PORTFOLIO</span><h1>Your position</h1><p>Account-wide collateral, debt, borrowing capacity, and health.</p></div></div>
      {!isConnected && <div className="connect-prompt large-prompt">Connect your wallet to load your onchain portfolio.</div>}
      <section className="portfolio-grid">
        {metric('USDC supplied', isConnected ? `${Number(lending.supplyBalance).toLocaleString(undefined,{maximumFractionDigits:2})} USDC` : '—', 'Selected market')}
        {metric('USDC debt', isConnected ? `${Number(lending.borrowBalance).toLocaleString(undefined,{maximumFractionDigits:2})} USDC` : '—', 'Selected market')}
        {metric('Borrow limit', isConnected ? `$${lending.borrowLimit}` : '—', 'Remaining account borrowing room')}
        {metric('Health', isConnected ? `${lending.healthFactorPercent}%` : '—', 'Account-wide safety')}
      </section>
      <div className="panel">
        <div className="panel-head"><div><span className="section-kicker">RISK</span><h2>Position health</h2></div></div>
        <div className="health-meter">
          <div className="health-meter-head"><span>Position health</span><strong>{isConnected ? `${lending.healthFactorPercent}%` : '—'}</strong></div>
          <div className="health-factor-label">Health factor {isConnected ? lending.healthFactor : '—'}</div>
          <div className="health-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={isConnected ? lending.healthFactorPercent : 0}><div className="health-fill" style={{ width: `${isConnected ? lending.healthFactorPercent : 0}%` }} /></div>
          <p>One account-wide health factor is used across Centry markets. A debt-free account is shown as 100%.</p>
        </div>
      </div>
    </div>
  );
}
