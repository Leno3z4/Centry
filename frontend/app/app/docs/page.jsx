'use client';

import { useState } from 'react';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { CONTRACT_ADDRESSES } from '../../../constants/contracts';

const docsSections = [
  ['overview', 'Overview'],
  ['lending', 'Lending'],
  ['governance', 'CENT & veCENT'],
  ['rewards', 'Revenue rewards'],
  ['self-repay', 'Self-repayment'],
  ['automation', 'Automation'],
  ['contracts', 'Contracts'],
  ['risk', 'Risk & mainnet'],
];

const docsGroups = [
  ['Core protocol', [['overview', 'Overview'], ['lending', 'Lending'], ['governance', 'CENT & veCENT'], ['rewards', 'Revenue rewards']]],
  ['Automation', [['self-repay', 'Self-repayment'], ['automation', 'Automation']]],
  ['Reference', [['contracts', 'Contracts'], ['risk', 'Risk & mainnet']]],
];

const addressRows = [
  ['Lending Pool', CONTRACT_ADDRESSES.lendingPool],
  ['Interest Rate Model', CONTRACT_ADDRESSES.interestRateModel],
  ['Oracle', CONTRACT_ADDRESSES.oracle],
  ['CENT', CONTRACT_ADDRESSES.centryToken],
  ['veCENT', CONTRACT_ADDRESSES.veCentry],
  ['Revenue Rewards', CONTRACT_ADDRESSES.veCentryRewards],
  ['Self-Repay Executor V2', CONTRACT_ADDRESSES.selfRepayExecutor],
];


function ContractRow({ label, address }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="contract-row">
      <div className="contract-label"><strong>{label}</strong><span>Arc deployment</span></div>
      <code>{address || 'Not configured'}</code>
      {address ? <button type="button" onClick={copy} className="contract-copy">{copied ? 'Copied' : 'Copy'}</button> : null}
      {address ? <a href={`https://explorer.arc.io/address/${address}`} target="_blank" rel="noreferrer" className="contract-explorer">Explorer ↗</a> : null}
    </div>
  );
}

function ProtocolFlow() {
  const steps = [
    ['01', 'Lend / Borrow', 'Supply collateral or borrow against it.'],
    ['02', 'Lock CENT', 'veCENT turns locked CENT into a position.'],
    ['03', 'Protocol revenue', 'Revenue funds the rewards engine.'],
    ['04', 'veCENT rewards', 'Epoch allocations are queued and claimed.'],
    ['05', 'Self-repay', 'Keeper execution can convert rewards into debt repayment.'],
  ];
  return (
    <div className="protocol-flow" aria-label="Centry protocol flow">
      {steps.map(([number, title, text], index) => (
        <div className="protocol-flow-step" key={number}>
          <div className="protocol-flow-node"><span>{number}</span></div>
          <strong>{title}</strong>
          <p>{text}</p>
          {index < steps.length - 1 ? <span className="protocol-flow-arrow" aria-hidden="true">→</span> : null}
        </div>
      ))}
    </div>
  );
}

export default function Page() {
  const [mobileDocsNavOpen, setMobileDocsNavOpen] = useState(false);

  const scrollToSection = (id) => {
    setMobileDocsNavOpen(false);
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <Providers>
      <AppShell>
        <div className="page-stack docs-page">
          <div className="section-header">
            <div>
              <div className="section-kicker">CENTRY / DOCUMENTATION</div>
              <h1>How Centry works.</h1>
              <p>
                Centry is an Arc-native lending protocol built around USDC lending and borrowing,
                CENT governance, revenue-funded veCENT rewards, and automated self-repayment.
                These docs describe the live protocol architecture and the flow between its contracts.
              </p>
            </div>
            <a className="secondary-btn" href="/app">open Centry</a>
          </div>

          <div className="docs-layout">
            <aside className="panel docs-sidebar" aria-label="Documentation sections">
              <div className="section-kicker">ON THIS PAGE</div>
              <div className="docs-sidebar-groups">
                {docsGroups.map(([groupLabel, items]) => (
                  <details key={groupLabel} open>
                    <summary>{groupLabel}</summary>
                    <div className="docs-sidebar-links">
                      {items.map(([id, label]) => (
                        <a key={id} href={`#${id}`} onClick={() => setMobileDocsNavOpen(false)}>{label}</a>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </aside>

            <button
              type="button"
              className="docs-mobile-menu-button"
              aria-label="Open documentation sections"
              aria-expanded={mobileDocsNavOpen}
              onClick={() => setMobileDocsNavOpen(true)}
            >
              <span aria-hidden="true">☰</span>
              <span>Sections</span>
            </button>

            {mobileDocsNavOpen && (
              <div className="docs-mobile-menu-layer">
                <button
                  type="button"
                  className="docs-mobile-menu-backdrop"
                  aria-label="Close documentation sections"
                  onClick={() => setMobileDocsNavOpen(false)}
                />
                <aside className="docs-mobile-menu" aria-label="Documentation sections">
                  <div className="docs-mobile-menu-header">
                    <div>
                      <div className="section-kicker">ON THIS PAGE</div>
                      <strong>Documentation</strong>
                    </div>
                    <button
                      type="button"
                      className="docs-mobile-menu-close"
                      aria-label="Close documentation sections"
                      onClick={() => setMobileDocsNavOpen(false)}
                    >
                      ×
                    </button>
                  </div>
                  <nav className="docs-mobile-menu-links">
                    {docsSections.map(([id, label]) => (
                      <a
                        key={id}
                        href={`#${id}`}
                        onClick={(event) => {
                          event.preventDefault();
                          scrollToSection(id);
                        }}
                      >
                        {label}
                      </a>
                    ))}
                  </nav>
                </aside>
              </div>
            )}

            <main className="docs-content">
              <section id="overview" className="panel">
                <div className="section-kicker">01 / OVERVIEW</div>
                <h2>Centry in one flow</h2>
                <p className="panel-copy">
                  Users supply assets to earn lending yield or borrow supported debt against collateral.
                  CENT is the protocol token, while veCENT represents locked CENT positions as transferable NFTs.
                  Protocol revenue can be converted into CENT and distributed to veCENT positions. Those rewards can
                  also be routed through Centry&apos;s self-repay system to reduce supported debt automatically.
                </p>
                <ProtocolFlow />
              </section>

              <section id="lending" className="panel">
                <div className="section-kicker">02 / LENDING</div>
                <h2>Lending markets & risk</h2>
                <p className="panel-copy">
                  Centry&apos;s lending pool is a multi-reserve ERC-20 market. Each reserve has its own LTV,
                  liquidation threshold, liquidation bonus, reserve factor, supply cap, and borrow cap.
                  Interest accrues through liquidity and borrow indexes, so supplier balances and debt balances
                  grow over time without storing a fixed balance per account.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16 }}>
                  <div style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 11 }}>
                    <strong style={{ fontSize: 11 }}>Supply</strong>
                    <p className="panel-copy" style={{ marginBottom: 0 }}>Deposit an active reserve and receive an interest-bearing scaled position.</p>
                  </div>
                  <div style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 11 }}>
                    <strong style={{ fontSize: 11 }}>Borrow</strong>
                    <p className="panel-copy" style={{ marginBottom: 0 }}>Borrow supported debt only when the account remains within its collateral limits.</p>
                  </div>
                  <div style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 11 }}>
                    <strong style={{ fontSize: 11 }}>Liquidation</strong>
                    <p className="panel-copy" style={{ marginBottom: 0 }}>Unhealthy accounts can be liquidated, repaying debt and seizing collateral with the configured bonus.</p>
                  </div>
                </div>
                <div className="docs-callout docs-callout-info"><span className="docs-callout-label">NETWORK</span><div><strong>Arc Mainnet · Chain ID <code>5042</code></strong><p>The live USDC reserve uses the Arc-native USDC ERC-20 interface. Verify current onchain parameters before relying on any risk assumption.</p></div></div>
              </section>

              <section id="governance" className="panel">
                <div className="section-kicker">03 / GOVERNANCE</div>
                <h2>CENT & veCENT</h2>
                <p className="panel-copy">
                  Locking CENT creates a veCENT position. A position is an ERC-721 NFT identified by tokenId, with a
                  locked amount and a lock end time. The current implementation allows locks from 1 week up to 104 weeks.
                  The position can be increased or extended while it is active.
                </p>
                <div className="docs-callout docs-callout-warning"><span className="docs-callout-label">RISK</span><div><strong>Verify live parameters before use.</strong><p>Oracle data, reserve limits, liquidation settings, and keeper infrastructure are live system dependencies.</p></div></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                  <div style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 11 }}>
                    <strong style={{ fontSize: 11 }}>Lock</strong>
                    <p className="panel-copy" style={{ marginBottom: 0 }}>CENT is escrowed in the veCENT contract and the position receives voting-power accounting over time.</p>
                  </div>
                  <div style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 11 }}>
                    <strong style={{ fontSize: 11 }}>Withdraw</strong>
                    <p className="panel-copy" style={{ marginBottom: 0 }}>A mature position can withdraw its full amount. Early withdrawal applies the protocol&apos;s configured 25% fee split.</p>
                  </div>
                </div>
                <div className="docs-callout docs-callout-warning"><span className="docs-callout-label">25% FEE</span><div><strong>Early withdrawal economics</strong><p>Early withdrawal returns 75% of the locked amount. Of the fee, 60% goes to the rewards controller and 40% to treasury.</p></div></div>
              </section>

              <section id="rewards" className="panel">
                <div className="section-kicker">04 / REVENUE REWARDS</div>
                <h2>Revenue becomes funded veCENT rewards</h2>
                <p className="panel-copy">
                  Rewards are not a fixed token emission. Protocol revenue is acquired as CENT and funded into the
                  veCENT revenue rewards controller. A keeper produces a Merkle allocation for an epoch, the root is queued,
                  and the contract enforces a two-day delay before activation.
                </p>
                <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
                  {[
                    ['1', 'Revenue', 'Protocol revenue is routed through the revenue engine and acquisition adapter.'],
                    ['2', 'Fund', 'The acquired CENT is deposited into the revenue rewards controller.'],
                    ['3', 'Allocate', 'A keeper calculates each eligible veCENT position’s epoch allocation and builds a Merkle root.'],
                    ['4', 'Queue', 'The root and reward budget are queued with a 2-day activation delay.'],
                    ['5', 'Claim', 'Position owners claim by tokenId using the published amount and Merkle proof.'],
                  ].map(([n, title, text]) => (
                    <div key={n} style={{ display: 'grid', gridTemplateColumns: '34px 110px minmax(0, 1fr)', gap: 10, alignItems: 'start', padding: 12, border: '1px solid var(--line)', borderRadius: 10 }}>
                      <span style={{ color: '#0071e3', font: '10px DM Mono, monospace' }}>{n}</span>
                      <strong style={{ fontSize: 11 }}>{title}</strong>
                      <span style={{ color: 'var(--muted-2)', fontSize: 10, lineHeight: 1.6 }}>{text}</span>
                    </div>
                  ))}
                </div>
                <p className="panel-copy" style={{ marginBottom: 0, marginTop: 14 }}>
                  The reward position key is the veCENT NFT tokenId. The rewards controller also tracks the last owner of a
                  withdrawn position so an already-earned allocation remains associated with the position through its lifecycle.
                </p>
              </section>

              <section id="self-repay" className="panel">
                <div className="section-kicker">05 / SELF-REPAY</div>
                <h2>Automated debt repayment</h2>
                <p className="panel-copy">
                  A veCENT owner can configure a self-repay recipient on the rewards controller. A keeper can then claim the
                  owner&apos;s funded reward allocation through the Self-Repay Executor V2, swap reward CENT into a supported debt asset,
                  and repay debt in the lending pool. The executor never chooses a route by itself: keepers provide fresh swap data,
                  minimum outputs, and the reward proof for each execution.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 9, marginTop: 16 }}>
                  {['Reward claim', 'Swap CENT', 'Repay debt', 'Return leftover'].map((step, index) => (
                    <div key={step} style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 11 }}>
                      <span style={{ color: 'var(--muted-2)', font: '9px DM Mono, monospace' }}>0{index + 1}</span>
                      <strong style={{ display: 'block', marginTop: 7, fontSize: 11 }}>{step}</strong>
                    </div>
                  ))}
                </div>
                <p className="panel-copy" style={{ marginBottom: 0, marginTop: 14 }}>
                  The executor is keeper-gated, checks supported debt assets, verifies the minimum swap output, and repays through
                  the configured lending pool. Any reward amount not consumed by the instructions is returned to the borrower.
                </p>
              </section>

              <section id="automation" className="panel">
                <div className="section-kicker">06 / AUTOMATION</div>
                <h2>GitHub Actions keeps the protocol moving</h2>
                <p className="panel-copy">
                  Centry separates off-chain coordination from on-chain enforcement. GitHub Actions handles repeatable keeper
                  tasks such as generating reward allocations, validating manifests, queueing epochs, activating epochs after the
                  delay, and running the self-repay keeper flow. The contracts remain the source of truth for balances, ownership,
                  proofs, permissions, and settlement.
                </p>
                <div className="docs-grid" style={{ marginTop: 16 }}>
                  <div className="panel feature-card">
                    <h2 style={{ fontSize: 15 }}>Reward pipeline</h2>
                    <p className="panel-copy">Generate allocation → validate root → queue epoch → wait 2 days → activate → claim.</p>
                  </div>
                  <div className="panel feature-card">
                    <h2 style={{ fontSize: 15 }}>Keeper pipeline</h2>
                    <p className="panel-copy">Read active allocations → resolve token owner → build swap instructions → execute self-repay when debt exists.</p>
                  </div>
                </div>
              </section>

              <section id="contracts" className="panel">
                <div className="section-kicker">07 / CONTRACTS</div>
                <h2>Live Arc mainnet deployment</h2>
                <p className="panel-copy">These are the protocol addresses currently configured by the frontend.</p>
                <div className="contracts-list">{addressRows.map(([label, address]) => <ContractRow key={label} label={label} address={address} />)}</div>
                <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--line)', borderRadius: 9 }}>
                  <div className="section-kicker">ASSETS</div>
                  <p className="panel-copy" style={{ marginBottom: 0 }}>
                    Arc native USDC: <code>{CONTRACT_ADDRESSES.USDC}</code> · EURC: <code>{CONTRACT_ADDRESSES.EURC}</code> ·
                    Centry currently also tracks BTC and SOL collateral integrations in the frontend market configuration.
                  </p>
                </div>
              </section>

              <section id="risk" className="panel">
                <div className="section-kicker">08 / RISK & MAINNET</div>
                <h2>Important before using Centry</h2>
                <p className="panel-copy">
                  Centry is running on Arc mainnet. Risk parameters, oracle configuration, reserves, and automation are still
                  live mainnet infrastructure. Review current onchain configuration before relying on these values.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
                  <div style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 11 }}>
                    <strong style={{ fontSize: 11 }}>Oracles</strong>
                    <p className="panel-copy" style={{ marginBottom: 0 }}>Borrowing and liquidation safety depend on fresh, correctly normalized price data.</p>
                  </div>
                  <div style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 11 }}>
                    <strong style={{ fontSize: 11 }}>Smart contracts</strong>
                    <p className="panel-copy" style={{ marginBottom: 0 }}>Independent security review is required before any production/mainnet use.</p>
                  </div>
                  <div style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 11 }}>
                    <strong style={{ fontSize: 11 }}>Mainnet parameters</strong>
                    <p className="panel-copy" style={{ marginBottom: 0 }}>USDC limits and risk settings are development values and can change as the system is tested.</p>
                  </div>
                  <div style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 11 }}>
                    <strong style={{ fontSize: 11 }}>Automation</strong>
                    <p className="panel-copy" style={{ marginBottom: 0 }}>Keepers coordinate execution, but the contracts verify proofs, permissions, outputs, and repayments on-chain.</p>
                  </div>
                </div>
              </section>
            </main>
          </div>
        </div>
    <style jsx global>{`
      .docs-page .section-header h1{font-size:clamp(44px,6vw,72px);letter-spacing:-3px}
      .docs-page .section-header p{max-width:760px;line-height:1.6;color:rgba(255,255,255,.68)}
      .docs-layout{grid-template-columns:minmax(0,1fr) 190px;gap:18px}
      .docs-sidebar{grid-column:2;grid-row:1;top:84px;background:#17191c!important;border-color:#343941!important}
      .docs-content{grid-column:1;grid-row:1;gap:16px}
      .docs-sidebar-links{gap:5px;margin-top:8px}
      .docs-sidebar-groups{display:grid;gap:9px;margin-top:12px}
      .docs-sidebar-groups details{border:1px solid rgba(255,255,255,.06);border-radius:10px;background:#111317;overflow:hidden}
      .docs-sidebar-groups summary{padding:9px 10px;color:#a0a4ad;font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;list-style:none}
      .docs-sidebar-groups summary::-webkit-details-marker{display:none}
      .docs-sidebar-groups summary:after{content:"+";float:right;color:#69717b}
      .docs-sidebar-groups details[open] summary:after{content:"−"}

      .docs-sidebar-links a{border-color:#2c3036;background:#111317;color:rgba(255,255,255,.62);transition:background .15s ease,border-color .15s ease,color .15s ease}
      .docs-sidebar-links a:hover{background:#1e2227;border-color:#414852;color:#fff}
      .docs-content>.panel{padding:22px;border-color:#343941!important;background:#1e1e24!important;box-shadow:0 12px 30px rgba(0,0,0,.12)}
      .docs-content>.panel h2{font-size:27px;letter-spacing:-.7px}
      .docs-content>.panel p{line-height:1.62}
      .protocol-flow{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:20px;padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:#17191f}
      .protocol-flow-step{position:relative;min-width:0;padding:4px 10px}
      .protocol-flow-node{display:flex;align-items:center;justify-content:space-between}
      .protocol-flow-node:before{content:"";display:block;width:27px;height:1px;background:#35404b}
      .protocol-flow-node span{display:grid;width:28px;height:28px;place-items:center;border:1px solid #3a4652;border-radius:9px;background:#1d232a;color:#8fbdf2;font-size:9px;font-weight:700}
      .protocol-flow-step:first-child .protocol-flow-node:before{display:none}
      .protocol-flow-step strong{display:block;margin-top:12px;font-size:12px}
      .protocol-flow-step p{margin:5px 0 0;color:rgba(255,255,255,.5);font-size:10px;line-height:1.55}
      .protocol-flow-arrow{position:absolute;top:21px;right:-7px;color:#52606f;font-size:12px}
      .docs-callout{display:grid;grid-template-columns:auto minmax(0,1fr);gap:11px;align-items:start;margin-top:16px;padding:14px;border:1px solid #343941;border-radius:12px;background:#171a1e}
      .docs-callout-label{padding:5px 7px;border:1px solid #3b4652;border-radius:7px;color:#9fb2c8;font-size:8px;font-weight:750;letter-spacing:.06em}
      .docs-callout strong{font-size:12px}
      .docs-callout p{margin:5px 0 0!important;color:rgba(255,255,255,.56)!important;font-size:11px!important}
      .docs-callout-info{background:#151b21;border-color:#31404e}
      .docs-callout-warning{background:#1c1916;border-color:#4a3b2b}
      .docs-callout-warning .docs-callout-label{color:#ffd08a;border-color:#5c4930}
      .contracts-list{display:grid;gap:8px;margin-top:14px}
      .contract-row{display:grid;grid-template-columns:150px minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:#17191f}
      .contract-label{display:grid;gap:3px;min-width:0}
      .contract-label strong{font-size:10px}
      .contract-label span{font-size:8px;color:#8a8f9e}
      .contract-row code{min-width:0;padding:8px 9px;overflow-wrap:anywhere;border:1px solid #2c323a;border-radius:8px;background:#101215;color:#dbe3ec;font:10px ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
      .contract-copy,.contract-explorer{min-height:32px;padding:0 9px;border:1px solid #35404a;border-radius:8px;background:#1d2227;color:#b9d7f3;font-size:9px;font-weight:650;text-decoration:none;cursor:pointer}
      .contract-copy:hover,.contract-explorer:hover{border-color:#0a84ff;background:#202830;color:#fff}
      .contract-copy{font:inherit}
      @media(max-width:900px){.docs-layout{grid-template-columns:minmax(0,1fr)}.docs-sidebar{display:none}.docs-content{grid-column:1}.protocol-flow{grid-template-columns:repeat(2,minmax(0,1fr))}.protocol-flow-arrow{display:none}}
      @media(max-width:640px){.docs-content>.panel{padding:18px}.docs-page .section-header h1{font-size:42px;letter-spacing:-2px}.protocol-flow{grid-template-columns:1fr}.contract-row{grid-template-columns:1fr}.contract-copy,.contract-explorer{justify-self:start;padding:0 12px}}
    `}</style>
      </AppShell>
    </Providers>
  );
}
