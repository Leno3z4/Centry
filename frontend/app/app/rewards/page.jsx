'use client';

import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';

export default function Page() {
  return <Providers><AppShell><div className="page-stack"><div className="section-header"><div><span className="section-kicker">REWARDS</span><h1>Protocol rewards</h1><p>Rewards remain claimable only when an eligible distribution is configured.</p></div></div><div className="feature-grid"><div className="panel feature-card"><span className="section-kicker">REVENUE</span><h2>Revenue distribution</h2><p>Proof-based reward claims can be surfaced here when an epoch is published.</p></div><div className="panel feature-card"><span className="section-kicker">INCENTIVES</span><h2>Liquidity incentives</h2><p>Market-specific incentives can be added without changing the core lending interface.</p></div><div className="panel feature-card"><span className="section-kicker">GOVERNANCE</span><h2>veCENT utility</h2><p>Governance can direct future reward-routing and liquidity incentive decisions.</p></div></div></div></AppShell></Providers>;
}
