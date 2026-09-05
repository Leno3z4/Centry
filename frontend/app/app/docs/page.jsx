'use client';

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
  ['risk', 'Risk & testnet'],
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

export default function Page() {
  return (
    <Providers>
      <AppShell>
        <div className="page-stack">
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
            <a className="secondary-btn" href="/app/lending">Open app</a>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '210px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
            <aside className="panel" style={{ position: 'sticky', top: 20 }}>
              <div className="section-kicker">ON THIS PAGE</div>
              <div style={{ display: 'grid', gap: 7, marginTop: 14 }}>
                {docsSections.map(([id, label]) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    style={{
                      padding: '8px 10px',
                      border: '1px solid #21182d',
                      borderRadius: 9,
                      color: '#aaa2b9',
                      fontSize: 11,
                    }}
                  >
                    {label}
                  </a>
                ))}
              </div>
            </aside>

            <main style={{ display: 'grid', gap: 16, minWidth: 0 }}>
              <section id="overview" className="panel">
                <div className="section-kicker">01 / OVERVIEW</div>
                <h2>Centry in one flow</h2>
                <p className="panel-copy">
                  Users supply assets to earn lending yield or borrow supported debt against collateral.
                  CENT is the protocol token, while veCENT represents locked CENT positions as transferable NFTs.
                  Protocol revenue can be converted into CENT and distributed to veCENT positions. Those rewards can
                  also be routed through Centry&apos;s self-repay system to reduce supported debt automatically.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 9, marginTop: 18 }}>
                  {[
                    ['Lend', 'Supply liquidity'],
                    ['Borrow', 'Borrow against collateral'],
                    ['Earn', 'Revenue → CENT rewards'],
                    ['Repay', 'Rewards can repay debt'],
                  ].map(([title, text]) => (
                    <div key={title} style={{ padding: 14, border: '1px solid #21182d', borderRadius: 11, background: '#0c0814' }}>
                      <strong style={{ display: 'block', fontSize: 12 }}>{title}</strong>
                      <span style={{ display: 'block', marginTop: 6, color: '#756d83', fontSize: 10, lineHeight: 1.5 }}>{text}</span>
                    </div>
                  ))}
                </div>
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
                  <div style={{ padding: 14, border: '1px solid #21182d', borderRadius: 11 }}>
                    <strong style={{ fontSize: 11 }}>Supply</strong>
                    <p className="panel-copy" style={{ marginBottom: 0 }}>Deposit an active reserve and receive an interest-bearing scaled position.</p>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #21182d', borderRadius: 11 }}>
                    <strong style={{ fontSize: 11 }}>Borrow</strong>
                    <p className="panel-copy" style={{ marginBottom: 0 }}>Borrow supported debt only when the account remains within its collateral limits.</p>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #21182d', borderRadius: 11 }}>
                    <strong style={{ fontSize: 11 }}>Liquidation</strong>
                    <p className="panel-copy" style={{ marginBottom: 0 }}>Unhealthy accounts can be liquidated, repaying debt and seizing collateral with the configured bonus.</p>
                  </div>
                </div>
                <div style={{ marginTop: 16, padding: 14, border: '1px solid #21182d', borderRadius: 11, background: '#0c0814' }}>
                  <div className="section-kicker">CURRENT ARC TESTNET CONFIGURATION</div>
                  <p className="panel-copy" style={{ marginBottom: 0 }}>
                    Arc testnet chain ID: <code>5042002</code>. The live USDC reserve uses the Arc native USDC ERC-20 interface.
                    Development risk parameters are intentionally treated as testnet values and are not production recommendations.
                  </p>
                </div>
              </section>

              <section id="governance" className="panel">
                <div className="section-kicker">03 / GOVERNANCE</div>
                <h2>CENT & veCENT</h2>
                <p className="panel-copy">
                  Locking CENT creates a veCENT position. A position is an ERC-721 NFT identified by tokenId, with a
                  locked amount and a lock end time. The current implementation allows locks from 1 week up to 104 weeks.
                  The position can be increased or extended while it is active.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
                  <div style={{ padding: 14, border: '1px solid #21182d', borderRadius: 11 }}>
                    <strong style={{ fontSize: 11 }}>Lock</strong>
                    <p className="panel-copy" style={{ marginBottom: 0 }}>CENT is escrowed in the veCENT contract and the position receives voting-power accounting over time.</p>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #21182d', borderRadius: 11 }}>
                    <strong style={{ fontSize: 11 }}>Withdraw</strong>
                    <p className="panel-copy" style={{ marginBottom: 0 }}>A mature position can withdraw its full amount. Early withdrawal applies the protocol&apos;s configured 25% fee split.</p>
                  </div>
                </div>
                <div style={{ marginTop: 16, padding: 14, border: '1px solid #3a2754', borderRadius: 11, background: '#120b20' }}>
                  <strong style={{ fontSize: 11 }}>Early withdrawal economics</strong>
                  <p className="panel-copy" style={{ margin: '7px 0 0' }}>
                    Early withdrawal returns 75% of the locked amount. Of the 25% fee, 60% is routed to the rewards controller
                    and 40% to the treasury. That means 15% of the original principal feeds rewards and 10% goes to treasury.
                  </p>
                </div>
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
                    <div key={n} style={{ display: 'grid', gridTemplateColumns: '34px 110px minmax(0, 1fr)', gap: 10, alignItems: 'start', padding: 12, border: '1px solid #21182d', borderRadius: 10 }}>
                      <span style={{ color: '#9b62ff', font: '10px DM Mono, monospace' }}>{n}</span>
                      <strong style={{ fontSize: 11 }}>{title}</strong>
                      <span style={{ color: '#756d83', fontSize: 10, lineHeight: 1.6 }}>{text}</span>
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
                    <div key={step} style={{ padding: 14, border: '1px solid #21182d', borderRadius: 11 }}>
                      <span style={{ color: '#8f82a0', font: '9px DM Mono, monospace' }}>0{index + 1}</span>
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
                <h2>Live Arc testnet deployment</h2>
                <p className="panel-copy">These are the protocol addresses currently configured by the frontend.</p>
                <div style={{ display: 'grid', gap: 7, marginTop: 14 }}>
                  {addressRows.map(([label, address]) => (
                    <div key={label} style={{ display: 'grid', gridTemplateColumns: '190px minmax(0, 1fr)', gap: 12, alignItems: 'center', padding: '10px 12px', border: '1px solid #21182d', borderRadius: 9, background: '#0c0814' }}>
                      <strong style={{ fontSize: 10 }}>{label}</strong>
                      <code style={{ color: '#bda7dc', fontSize: 10, overflowWrap: 'anywhere' }}>{address || 'Not configured'}</code>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14, padding: 12, border: '1px solid #21182d', borderRadius: 9 }}>
                  <div className="section-kicker">ASSETS</div>
                  <p className="panel-copy" style={{ marginBottom: 0 }}>
                    Arc native USDC: <code>{CONTRACT_ADDRESSES.USDC}</code> · EURC: <code>{CONTRACT_ADDRESSES.EURC}</code> ·
                    Centry currently also tracks BTC and SOL collateral integrations in the frontend market configuration.
                  </p>
                </div>
              </section>

              <section id="risk" className="panel">
                <div className="section-kicker">08 / RISK & TESTNET</div>
                <h2>Important before using Centry</h2>
                <p className="panel-copy">
                  Centry is running on Arc testnet. Risk parameters, oracle configuration, reserves, and automation are still
                  development infrastructure. Testnet behavior should not be treated as production-ready financial infrastructure.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
                  <div style={{ padding: 14, border: '1px solid #21182d', borderRadius: 11 }}>
                    <strong style={{ fontSize: 11 }}>Oracles</strong>
                    <p className="panel-copy" style={{ marginBottom: 0 }}>Borrowing and liquidation safety depend on fresh, correctly normalized price data.</p>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #21182d', borderRadius: 11 }}>
                    <strong style={{ fontSize: 11 }}>Smart contracts</strong>
                    <p className="panel-copy" style={{ marginBottom: 0 }}>Independent security review is required before any production/mainnet use.</p>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #21182d', borderRadius: 11 }}>
                    <strong style={{ fontSize: 11 }}>Testnet parameters</strong>
                    <p className="panel-copy" style={{ marginBottom: 0 }}>USDC limits and risk settings are development values and can change as the system is tested.</p>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #21182d', borderRadius: 11 }}>
                    <strong style={{ fontSize: 11 }}>Automation</strong>
                    <p className="panel-copy" style={{ marginBottom: 0 }}>Keepers coordinate execution, but the contracts verify proofs, permissions, outputs, and repayments on-chain.</p>
                  </div>
                </div>
              </section>
            </main>
          </div>
        </div>
      </AppShell>
    </Providers>
  );
}
