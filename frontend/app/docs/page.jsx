'use client';

import { useState } from 'react';
import { Providers } from '../../components/Providers';
import { CONTRACT_ADDRESSES } from '../../constants/contracts';

const coreAddressRows = [
  ['Lending Pool', CONTRACT_ADDRESSES.lendingPool],
  ['Interest Rate Model', CONTRACT_ADDRESSES.interestRateModel],
  ['Oracle', CONTRACT_ADDRESSES.oracle],
  ['Self-Repay Executor V2', CONTRACT_ADDRESSES.selfRepayExecutor],
  ['UnitFlow Swap Adapter', CONTRACT_ADDRESSES.unitFlowSwapAdapter],
  ['UnitFlow Router', CONTRACT_ADDRESSES.unitFlowRouter],
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
    <div className="docs-contract-row">
      <div>
        <strong>{label}</strong>
        <span>Arc deployment</span>
      </div>
      <code>{address || 'Not configured'}</code>
      {address ? (
        <button type="button" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      ) : null}
      {address ? (
        <a
          href={`https://explorer.arc.io/address/${address}`}
          target="_blank"
          rel="noreferrer"
        >
          Explorer ↗
        </a>
      ) : null}
    </div>
  );
}

function FlowStep({ number, title, children }) {
  return (
    <div className="docs-flow-step">
      <span>{number}</span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function InfoBlock({ eyebrow, title, children }) {
  return (
    <div className="docs-info-block">
      <div className="docs-info-eyebrow">{eyebrow}</div>
      <h3>{title}</h3>
      <div className="docs-info-copy">{children}</div>
    </div>
  );
}

export default function Page() {
  return (
    <Providers>
        <main className="docs-page">
          <header className="docs-hero">
            <div className="docs-hero-copy">
              <span className="docs-kicker">CENTRY / DOCUMENTATION</span>
              <h1>Centry, explained.</h1>
              <p>
                Centry is an Arc-based onchain capital application focused on lending,
                collateralized borrowing, swaps, bridge liquidity, portfolio visibility,
                and user-owned automation.
              </p>
              <div className="docs-hero-meta">
                <span>Arc · Chain ID 5042</span>
                <span>USDC · EURC · cirBTC</span>
                <span>Non-custodial</span>
              </div>
              <a className="docs-primary-link" href="/app">
                open Centry <span aria-hidden="true">↗</span>
              </a>
            </div>
          </header>

          <div className="docs-body">
            <section className="docs-section">
              <div className="docs-section-heading">
                <span>01</span>
                <div>
                  <div className="docs-kicker">THE PROJECT</div>
                  <h2>One account for onchain capital.</h2>
                </div>
              </div>

              <div className="docs-copy-wide">
                <p>
                  Centry brings core onchain capital actions into one account-driven experience.
                  Users can supply supported assets, borrow against collateral, swap supported
                  tokens, move USDC between configured networks, and monitor the resulting position
                  from a single application.
                </p>
                <p>
                  The application is non-custodial: the wallet remains the signing authority,
                  while Centry's contracts and validation layers enforce the rules around supported
                  assets, risk, permissions, and execution.
                </p>
              </div>

              <div className="docs-flow">
                <FlowStep number="01" title="Fund">
                  Start with assets in the connected wallet or an eligible funding route.
                </FlowStep>
                <FlowStep number="02" title="Supply">
                  Supply an active reserve and receive a live lending position.
                </FlowStep>
                <FlowStep number="03" title="Borrow">
                  Borrow supported liquidity while staying inside the account's collateral limits.
                </FlowStep>
                <FlowStep number="04" title="Manage">
                  Swap, bridge, repay, or monitor the position as conditions change.
                </FlowStep>
              </div>
            </section>

            <section className="docs-section">
              <div className="docs-section-heading">
                <span>02</span>
                <div>
                  <div className="docs-kicker">LENDING</div>
                  <h2>Markets built around collateral.</h2>
                </div>
              </div>

              <div className="docs-grid docs-grid-3">
                <InfoBlock eyebrow="SUPPLY" title="Earn lending yield">
                  Users supply assets into active reserves. The lending pool tracks scaled
                  balances and applies the reserve's interest model over time.
                </InfoBlock>
                <InfoBlock eyebrow="BORROW" title="Borrow against collateral">
                  Borrowing is constrained by the account's live borrow capacity, reserve
                  liquidity, and the configured risk parameters for the market.
                </InfoBlock>
                <InfoBlock eyebrow="RISK" title="Risk stays onchain">
                  Loan-to-value limits, liquidation thresholds, reserve caps, oracle checks,
                  and repayment accounting are enforced by protocol logic.
                </InfoBlock>
              </div>

              <div className="docs-market-list">
                {[
                  ['USDC', 'USD Coin', 'Primary stablecoin reserve on Arc.'],
                  ['EURC', 'Euro Coin', 'Arc-native euro stablecoin reserve.'],
                  ['cirBTC', 'Circle Wrapped Bitcoin', 'Bitcoin-denominated lending reserve.'],
                ].map(([symbol, name, description]) => (
                  <a key={symbol} href={`/app/markets/${symbol.toLowerCase()}`} className="docs-market-row">
                    <div className="docs-market-symbol">{symbol}</div>
                    <div>
                      <strong>{name}</strong>
                      <span>{description}</span>
                    </div>
                    <span className="docs-row-arrow" aria-hidden="true">→</span>
                  </a>
                ))}
              </div>
            </section>

            <section className="docs-section">
              <div className="docs-section-heading">
                <span>03</span>
                <div>
                  <div className="docs-kicker">TRADING & LIQUIDITY</div>
                  <h2>Move capital without leaving the account.</h2>
                </div>
              </div>

              <div className="docs-grid docs-grid-2">
                <InfoBlock eyebrow="SWAP" title="Configured swaps">
                  Centry uses validated swap infrastructure rather than arbitrary contract calls.
                  Cask and the application only prepare supported swap paths using configured
                  token addresses and fresh route data.
                </InfoBlock>
                <InfoBlock eyebrow="BRIDGE" title="USDC liquidity routes">
                  Configured bridge routes support USDC across Arc, Base, Arbitrum, and Ethereum.
                  Fees, route state, and timing should always come from the current transaction or
                  bridge preview.
                </InfoBlock>
              </div>

              <div className="docs-callout">
                <span className="docs-callout-label">GATEWAY</span>
                <div>
                  <strong>Pending liquidity is not spendable liquidity.</strong>
                  <p>
                    Gateway balances are separated into finalized and pending amounts. Centry only
                    treats finalized liquidity as available for supported account actions.
                  </p>
                </div>
              </div>
            </section>

            <section className="docs-section">
              <div className="docs-section-heading">
                <span>04</span>
                <div>
                  <div className="docs-kicker">ACCOUNT & DATA</div>
                  <h2>See the position as it actually exists.</h2>
                </div>
              </div>

              <div className="docs-copy-wide">
                <p>
                  The Overview and Portfolio surfaces combine wallet balances, supplied assets,
                  debt, borrow capacity, health, market composition, and reserve information.
                  Market pages expose the same underlying account and reserve state in a more
                  focused workspace.
                </p>
                <p>
                  Analytics are designed around current protocol and market data. The application
                  does not need a separate historical analytics story to explain the position shown
                  today.
                </p>
              </div>

              <div className="docs-grid docs-grid-3">
                <InfoBlock eyebrow="OVERVIEW" title="Account snapshot">
                  A quick view of supplied value, debt, net position, health, and active markets.
                </InfoBlock>
                <InfoBlock eyebrow="PORTFOLIO" title="Position composition">
                  See collateral, debt, available capacity, and the assets making up the account.
                </InfoBlock>
                <InfoBlock eyebrow="MARKETS" title="Reserve health">
                  Compare supply and borrow rates, liquidity, utilization, and market-specific risk.
                </InfoBlock>
              </div>
            </section>

            <section className="docs-section">
              <div className="docs-section-heading">
                <span>05</span>
                <div>
                  <div className="docs-kicker">CASK</div>
                  <h2>A Centry assistant, not a wallet.</h2>
                </div>
              </div>

              <div className="docs-copy-wide">
                <p>
                  Cask is Centry's conversational interface. It can answer general questions about
                  the project, explain supported features, and use verified application data when a
                  connected account is available.
                </p>
                <p>
                  A wallet is only required for personal state or a state-changing action. For a
                  transaction, Cask prepares a supported transaction plan and opens the wallet
                  signing flow. The user remains responsible for approving the transaction.
                </p>
              </div>

              <div className="docs-callout">
                <span className="docs-callout-label">BOUNDARY</span>
                <div>
                  <strong>No arbitrary execution.</strong>
                  <p>
                    Cask does not receive the owner's private key and does not create arbitrary
                    calldata, contract targets, token addresses, recipients, or hidden transaction
                    parameters.
                  </p>
                </div>
              </div>
            </section>

            <section className="docs-section">
              <div className="docs-section-heading">
                <span>06</span>
                <div>
                  <div className="docs-kicker">AGENTS</div>
                  <h2>User-owned automation with explicit permissions.</h2>
                </div>
              </div>

              <div className="docs-copy-wide">
                <p>
                  Centry agents use user-owned smart accounts. The owner controls activation and
                  operator authorization, while supported automation runs through scoped actions
                  and onchain permission checks.
                </p>
                <p>
                  The runtime coordinates scheduled work, owner requests, activity, and execution
                  receipts. Offchain services coordinate the work; the smart account remains the
                  enforcement boundary for what an operator is allowed to execute.
                </p>
              </div>

              <div className="docs-grid docs-grid-3">
                <InfoBlock eyebrow="OWNERSHIP" title="You keep control">
                  The smart account has an owner and a separate operator model. Chat does not
                  change ownership or silently broaden permissions.
                </InfoBlock>
                <InfoBlock eyebrow="PERMISSIONS" title="Actions are bounded">
                  Supported functions, expiration, native-value limits, and financial caps can be
                  enforced before execution.
                </InfoBlock>
                <InfoBlock eyebrow="A2A" title="Agent-to-agent opt-in">
                  Incoming agent tasks require the recipient to opt in, with optional sender
                  allowlisting.
                </InfoBlock>
              </div>
            </section>

            <section className="docs-section">
              <div className="docs-section-heading">
                <span>07</span>
                <div>
                  <div className="docs-kicker">SECURITY</div>
                  <h2>Validation before execution.</h2>
                </div>
              </div>

              <div className="docs-grid docs-grid-2">
                <InfoBlock eyebrow="APPLICATION" title="Fresh state checks">
                  User-specific transaction plans use verified account and market state rather
                  than treating browser-provided values as authoritative.
                </InfoBlock>
                <InfoBlock eyebrow="ONCHAIN" title="Contract enforcement">
                  Permissions, financial limits, supported recipients, protocol spenders, and
                  execution rules are enforced at the smart-account boundary.
                </InfoBlock>
                <InfoBlock eyebrow="RUNTIME" title="Short-lived authorization">
                  Hosted agent permissions are designed to expire rather than remaining active
                  indefinitely through the normal configuration flow.
                </InfoBlock>
                <InfoBlock eyebrow="DATA" title="Signed service traffic">
                  Internal agent-store requests use timestamped HMAC signatures with replay
                  protection instead of an always-on bearer header.
                </InfoBlock>
              </div>

              <div className="docs-callout docs-callout-warning">
                <span className="docs-callout-label">IMPORTANT</span>
                <div>
                  <strong>Protocol configuration is still live infrastructure.</strong>
                  <p>
                    Oracles, reserves, risk parameters, deployed contract addresses, and automation
                    services should be checked against current application and onchain state before
                    relying on them.
                  </p>
                </div>
              </div>
            </section>

            <section className="docs-section">
              <div className="docs-section-heading">
                <span>08</span>
                <div>
                  <div className="docs-kicker">REFERENCE</div>
                  <h2>Core contracts.</h2>
                </div>
              </div>

              <p className="docs-reference-copy">
                These addresses are the core contracts currently referenced by the application.
                Token and reward-system contracts are intentionally kept out of the core reference
                and documented separately below.
              </p>

              <div className="docs-contract-list">
                {coreAddressRows.map(([label, address]) => (
                  <ContractRow key={label} label={label} address={address} />
                ))}
              </div>
            </section>

            <section className="docs-rewards">
              <div className="docs-rewards-inner">
                <div className="docs-rewards-kicker">09 / COMING SOON</div>
                <h2>Rewards & governance.</h2>
                <p>
                  The token and voting layer is intentionally separated from the core Centry
                  product discussion. When this area is enabled, it will cover the protocol token,
                  locked voting positions, revenue-funded rewards, claims, and the governance
                  system around them.
                </p>

                <div className="docs-grid docs-grid-2">
                  <InfoBlock eyebrow="CENT" title="Protocol token">
                    The CENT token is the protocol's reward and governance asset. Its user-facing
                    flows are kept separate from the current lending and capital-management
                    experience.
                  </InfoBlock>
                  <InfoBlock eyebrow="veCENT" title="Locked voting positions">
                    veCENT represents locked token positions used for voting and reward
                    accounting. Detailed locking, voting, and position lifecycle docs will live
                    here when the feature is released.
                  </InfoBlock>
                  <InfoBlock eyebrow="REVENUE REWARDS" title="Funded rewards">
                    Revenue can feed a rewards system that allocates rewards to eligible locked
                    positions through an auditable epoch-based process.
                  </InfoBlock>
                  <InfoBlock eyebrow="GOVERNANCE" title="Protocol voting">
                    Governance documentation will cover voting power, proposal flow, timelocks, and
                    execution once those controls are part of the active product.
                  </InfoBlock>
                </div>

                <div className="docs-rewards-status">
                  <span>COMING SOON</span>
                  <strong>Separate from the current Centry lending experience.</strong>
                </div>

                <div className="docs-rewards-contracts">
                  <ContractRow label="CENT Token" address={CONTRACT_ADDRESSES.centryToken} />
                  <ContractRow label="veCENT" address={CONTRACT_ADDRESSES.veCentry} />
                  <ContractRow label="Revenue Rewards" address={CONTRACT_ADDRESSES.veCentryRewards} />
                </div>
              </div>
            </section>
          </div>
        </main>

        <style jsx global>{`
          .docs-page{
            width:min(1080px,100%);
            margin:0 auto;
            padding:56px 0 96px;
            color:#f7f7f7;
          }

          .docs-hero{
            padding:20px 0 68px;
          }

          .docs-hero-copy{
            max-width:860px;
          }

          .docs-kicker{
            color:rgba(255,255,255,.40);
            font-size:10px;
            font-weight:700;
            letter-spacing:.12em;
            text-transform:uppercase;
          }

          .docs-hero h1{
            margin:14px 0 22px;
            color:#fff;
            font-size:clamp(52px,8vw,86px);
            line-height:.94;
            letter-spacing:-4.4px;
            font-weight:650;
          }

          .docs-hero-copy>p{
            max-width:760px;
            margin:0;
            color:rgba(255,255,255,.60);
            font-size:16px;
            line-height:1.7;
          }

          .docs-hero-meta{
            display:flex;
            flex-wrap:wrap;
            gap:8px 24px;
            margin-top:24px;
            color:rgba(255,255,255,.38);
            font-size:11px;
          }

          .docs-primary-link{
            display:inline-flex;
            align-items:center;
            gap:9px;
            margin-top:30px;
            padding:12px 16px;
            border-radius:10px;
            background:#0a84ff;
            color:#fff;
            font-size:12px;
            font-weight:700;
            text-decoration:none;
          }

          .docs-primary-link:hover{
            background:#168dff;
          }

          .docs-body{
            display:grid;
            gap:0;
          }

          .docs-section{
            padding:66px 0;
            border-top:1px solid rgba(255,255,255,.07);
          }

          .docs-section-heading{
            display:block;
          }

          .docs-section-heading>span{
            display:inline-flex;
            min-width:30px;
            min-height:24px;
            align-items:center;
            justify-content:center;
            padding:0 7px;
            border:1px solid rgba(10,132,255,.22);
            border-radius:7px;
            background:rgba(10,132,255,.07);
            color:#76b7ff;
            font:9px ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
            letter-spacing:.08em;
          }

          .docs-section-heading>div{
            margin-top:10px;
          }

          .docs-section-heading h2{
            max-width:780px;
            margin:8px 0 0;
            color:#fff;
            font-size:clamp(30px,4vw,48px);
            line-height:1.02;
            letter-spacing:-2px;
            font-weight:600;
          }

          .docs-copy-wide{
            max-width:780px;
            margin:28px 0 0;
          }

          .docs-copy-wide p,
          .docs-reference-copy{
            margin:0 0 16px;
            color:rgba(255,255,255,.58);
            font-size:14px;
            line-height:1.8;
          }

          .docs-copy-wide p:last-child{
            margin-bottom:0;
          }

          .docs-grid{
            display:grid;
            gap:10px;
            margin:28px 0 0;
          }

          .docs-grid-2{
            grid-template-columns:repeat(2,minmax(0,1fr));
          }

          .docs-grid-3{
            grid-template-columns:repeat(3,minmax(0,1fr));
          }

          .docs-info-block{
            min-width:0;
            padding:20px;
            border:1px solid rgba(255,255,255,.08);
            border-radius:16px;
            background:#111317;
          }

          .docs-info-eyebrow{
            color:rgba(255,255,255,.35);
            font:9px ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
            letter-spacing:.10em;
          }

          .docs-info-block h3{
            margin:10px 0 0;
            color:#fff;
            font-size:18px;
            line-height:1.15;
            letter-spacing:-.4px;
          }

          .docs-info-copy{
            margin-top:10px;
            color:rgba(255,255,255,.51);
            font-size:12px;
            line-height:1.65;
          }

          .docs-flow{
            display:grid;
            grid-template-columns:repeat(2,minmax(0,1fr));
            gap:10px;
            margin:28px 0 0;
          }

          .docs-flow-step{
            min-width:0;
            padding:20px;
            border:1px solid rgba(255,255,255,.08);
            border-radius:14px;
            background:#0e1013;
          }

          .docs-flow-step>span{
            color:#0a84ff;
            font:10px ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
          }

          .docs-flow-step strong{
            display:block;
            margin-top:30px;
            color:#fff;
            font-size:14px;
          }

          .docs-flow-step p{
            margin:8px 0 0;
            color:rgba(255,255,255,.45);
            font-size:11px;
            line-height:1.6;
          }

          .docs-market-list{
            display:grid;
            gap:2px;
            margin:28px 0 0;
          }

          .docs-market-row{
            display:grid;
            grid-template-columns:100px minmax(0,1fr) auto;
            gap:18px;
            align-items:center;
            padding:18px 0;
            border-top:1px solid rgba(255,255,255,.06);
            color:inherit;
            text-decoration:none;
          }

          .docs-market-row:last-child{
            border-bottom:1px solid rgba(255,255,255,.06);
          }

          .docs-market-row:hover{
            padding-left:8px;
            padding-right:8px;
            background:rgba(255,255,255,.02);
          }

          .docs-market-symbol{
            color:#fff;
            font-size:18px;
            font-weight:700;
          }

          .docs-market-row strong{
            display:block;
            color:rgba(255,255,255,.84);
            font-size:12px;
          }

          .docs-market-row span{
            display:block;
            margin-top:4px;
            color:rgba(255,255,255,.38);
            font-size:10px;
          }

          .docs-row-arrow{
            color:#6f9ed3!important;
            font-size:16px!important;
          }

          .docs-callout{
            display:grid;
            grid-template-columns:auto minmax(0,1fr);
            gap:12px;
            align-items:start;
            margin:28px 0 0;
            padding:17px;
            border:1px solid rgba(255,255,255,.08);
            border-radius:14px;
            background:#111317;
          }

          .docs-callout-label{
            padding:5px 7px;
            border:1px solid rgba(255,255,255,.12);
            border-radius:7px;
            color:rgba(255,255,255,.48);
            font:8px ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
            letter-spacing:.08em;
          }

          .docs-callout strong{
            color:#fff;
            font-size:12px;
          }

          .docs-callout p{
            margin:5px 0 0;
            color:rgba(255,255,255,.46);
            font-size:11px;
            line-height:1.6;
          }

          .docs-callout-warning{
            border-color:rgba(255,176,0,.16);
            background:rgba(255,176,0,.035);
          }

          .docs-reference-copy{
            max-width:780px;
            margin:26px 0 0;
          }

          .docs-contract-list,
          .docs-rewards-contracts{
            display:grid;
            gap:8px;
            margin:22px 0 0;
          }

          .docs-contract-row{
            display:grid;
            grid-template-columns:180px minmax(0,1fr) auto auto;
            gap:10px;
            align-items:center;
            padding:12px 14px;
            border:1px solid rgba(255,255,255,.07);
            border-radius:12px;
            background:#101215;
          }

          .docs-contract-row>div{
            display:grid;
            gap:3px;
            min-width:0;
          }

          .docs-contract-row strong{
            color:rgba(255,255,255,.85);
            font-size:10px;
          }

          .docs-contract-row>div span{
            color:rgba(255,255,255,.30);
            font-size:8px;
          }

          .docs-contract-row code{
            min-width:0;
            overflow-wrap:anywhere;
            padding:8px 10px;
            border-radius:8px;
            background:#0a0c0f;
            color:#c7d8e9;
            font:9px ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
          }

          .docs-contract-row button,
          .docs-contract-row a{
            min-height:30px;
            display:inline-flex;
            align-items:center;
            justify-content:center;
            padding:0 9px;
            border:0;
            border-radius:8px;
            background:#1a1e23;
            color:rgba(255,255,255,.62);
            font-size:9px;
            font-weight:650;
            text-decoration:none;
            cursor:pointer;
          }

          .docs-contract-row button:hover,
          .docs-contract-row a:hover{
            background:#232a31;
            color:#fff;
          }

          .docs-rewards{
            margin-top:24px;
            padding:56px 0 0;
            border-top:1px solid rgba(255,255,255,.10);
          }

          .docs-rewards-inner{
            padding:30px;
            border:1px solid rgba(126,101,255,.18);
            border-radius:20px;
            background:
              radial-gradient(circle at 85% 10%, rgba(126,101,255,.08), transparent 32%),
              #101015;
          }

          .docs-rewards-kicker{
            color:#9d8dff;
            font:10px ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
            letter-spacing:.12em;
            font-weight:700;
          }

          .docs-rewards h2{
            margin:10px 0 0;
            color:#fff;
            font-size:clamp(32px,4vw,50px);
            letter-spacing:-2px;
          }

          .docs-rewards-inner>p{
            max-width:760px;
            margin:14px 0 0;
            color:rgba(255,255,255,.52);
            font-size:14px;
            line-height:1.75;
          }

          .docs-rewards .docs-grid{
            margin-left:0;
          }

          .docs-rewards .docs-rewards-contracts{
            margin-left:0;
          }

          .docs-rewards-status{
            display:flex;
            flex-wrap:wrap;
            align-items:center;
            gap:10px;
            margin-top:24px;
            padding-top:18px;
            border-top:1px solid rgba(255,255,255,.07);
          }

          .docs-rewards-status span{
            padding:5px 7px;
            border-radius:7px;
            background:rgba(157,141,255,.10);
            color:#b5a8ff;
            font:8px ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
            letter-spacing:.08em;
          }

          .docs-rewards-status strong{
            color:rgba(255,255,255,.66);
            font-size:10px;
          }

          @media(max-width:800px){
            .docs-page{
              padding:34px 0 64px;
            }

            .docs-hero{
              padding-bottom:48px;
            }

            .docs-hero h1{
              font-size:48px;
              letter-spacing:-2.5px;
            }

            .docs-section{
              padding:48px 0;
            }

            .docs-section-heading{
              grid-template-columns:34px minmax(0,1fr);
              gap:12px;
            }

            .docs-grid-3,
            .docs-grid-2,
            .docs-flow{
              grid-template-columns:1fr;
            }

            .docs-market-row{
              grid-template-columns:80px minmax(0,1fr) auto;
            }

            .docs-contract-row{
              grid-template-columns:1fr;
            }

            .docs-contract-row button,
            .docs-contract-row a{
              justify-self:start;
            }

            .docs-rewards-inner{
              padding:22px;
            }

            .docs-rewards .docs-grid,
            .docs-rewards .docs-rewards-contracts{
              margin-left:0;
            }
          }

          @media(max-width:560px){
            .docs-page{
              padding-right:16px;
              padding-left:16px;
            }

            .docs-hero h1{
              font-size:40px;
            }

            .docs-hero-copy>p{
              font-size:14px;
            }

            .docs-hero-meta{
              gap:8px 16px;
            }

            .docs-section-heading{
              grid-template-columns:1fr;
              gap:6px;
            }

            .docs-copy-wide,
            .docs-grid,
            .docs-flow,
            .docs-market-list,
            .docs-callout,
            .docs-reference-copy,
            .docs-contract-list{
              margin-left:0;
            }

            .docs-flow{
              grid-template-columns:1fr;
            }

            .docs-flow-step{
              border-right:0;
              border-bottom:1px solid rgba(255,255,255,.07);
            }

            .docs-flow-step:last-child{
              border-bottom:0;
            }

            .docs-market-row{
              grid-template-columns:1fr auto;
              gap:8px;
            }

            .docs-market-symbol{
              grid-column:1 / -1;
            }

            .docs-rewards h2{
              font-size:34px;
            }
          }

          @media(prefers-reduced-motion:reduce){
            .docs-market-row{
              transition:none;
            }
          }
        `}</style>
    </Providers>
  );
}
