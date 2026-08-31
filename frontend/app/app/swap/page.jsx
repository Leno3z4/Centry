'use client';

import { useState } from 'react';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { MARKETS } from '../../../constants/markets';

const LIVE = MARKETS.filter((market) => market.status === 'live' && market.address);

export default function Page() {
  return <Providers><AppShell><SwapContent /></AppShell></Providers>;
}

function SwapContent() {
  const [from, setFrom] = useState('usdc');
  const [to, setTo] = useState('eurc');
  const [amount, setAmount] = useState('');
  const fromMarket = LIVE.find((market) => market.id === from) || LIVE[0];
  const toMarket = LIVE.find((market) => market.id === to) || LIVE[1] || LIVE[0];

  return (
    <div className="page-stack">
      <div className="section-header"><div><span className="section-kicker">SWAP</span><h1>Swap assets</h1><p>Swap supported Arc assets through a routed liquidity path.</p></div></div>
      <section className="content-grid">
        <div className="panel">
          <div className="panel-head"><div><span className="section-kicker">ARC SWAP</span><h2>Exchange</h2></div><span className="test-badge">ROUTER</span></div>
          <label className="field-label" htmlFor="swap-from">From</label>
          <div className="amount-input-wrap"><input id="swap-from" type="number" min="0" step="0.00000001" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} /><select value={from} onChange={(event) => { setFrom(event.target.value); if (event.target.value === to) setTo(LIVE.find((item) => item.id !== event.target.value)?.id || to); }} aria-label="Swap source asset">{LIVE.map((market) => <option key={market.id} value={market.id}>{market.symbol}</option>)}</select></div>
          <div className="swap-direction" aria-hidden="true">↓</div>
          <label className="field-label" htmlFor="swap-to">To</label>
          <div className="amount-input-wrap"><input id="swap-to" type="text" readOnly placeholder="Quote appears here" value="" /><select id="swap-to" value={to} onChange={(event) => setTo(event.target.value)} aria-label="Swap destination asset">{LIVE.filter((market) => market.id !== from).map((market) => <option key={market.id} value={market.id}>{market.symbol}</option>)}</select></div>
          <div className="swap-quote"><span>Route</span><strong>Tower</strong><small>Quote and transaction builder will be connected next.</small></div>
          <button type="button" className="primary-btn full-btn large-btn" disabled={!amount || Number(amount) <= 0}>Get quote</button>
        </div>

        <div className="panel">
          <div className="panel-head"><div><span className="section-kicker">BRING FUNDS TO ARC</span><h2>Cross-chain</h2></div></div>
          <p className="panel-copy">Centry will detect supported stablecoins on connected chains and route eligible USDC through Tower to Arc.</p>
          <div className="feature-card"><span className="section-kicker">INITIAL ROUTE</span><h2>USDC → Arc</h2><p>Cross-chain USDC routing is the first bridge flow to implement. Other assets can be added when Tower exposes a compatible route.</p></div>
          <button type="button" className="secondary-btn full-btn" disabled>Detect supported balances</button>
        </div>
      </section>
    </div>
  );
}
