'use client';

import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';

export default function Page() {
  return <Providers><AppShell><div className="page-stack"><div className="section-header"><div><h1>Centry documentation</h1><p>Protocol guides, market configuration, and integration notes.</p></div></div><div className="feature-grid"><div className="panel feature-card"><h2>Markets & risk</h2><p>Understand collateral, borrowing power, health factor, reserves, and liquidations.</p><a className="secondary-btn" href="/app/lending">Open lending</a></div><div className="panel feature-card"><h2>Routing</h2><p>Swap and cross-chain routing documentation will live here as the Tower integration is implemented.</p><a className="secondary-btn" href="/app/swap">Open swaps</a></div><div className="panel feature-card"><h2>CENT & veCENT</h2><p>Governance mechanics, lock behavior, and future protocol utility.</p><a className="secondary-btn" href="/app/governance">Open governance</a></div></div></div></AppShell></Providers>;
}
