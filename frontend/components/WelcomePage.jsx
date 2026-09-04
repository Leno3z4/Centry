'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import ProtocolStats from './ProtocolStats';
import { ACTIVE_MARKETS } from '../constants/markets';
import { CONTRACT_ADDRESSES } from '../constants/contracts';
import { LENDING_POOL_ABI, ORACLE_ABI } from '../constants/abis';

const FLOW = [
    {
        number: '01',
        title: 'Supply liquidity',
        text: 'Put supported assets to work and earn market-driven interest as liquidity is used across the protocol.',
    },
    {
        number: '02',
        title: 'Borrow against collateral',
        text: 'Use eligible collateral to access liquidity while Centry continuously tracks account risk onchain.',
    },
    {
        number: '03',
        title: 'Coordinate with veCENT',
        text: 'Lock CENT for veCENT voting power and participate in the protocol\'s governance layer.',
    },
];

const PRINCIPLES = [
    ['Onchain first', 'Balances, risk, rates, and governance state come from the deployed contracts.'],
    ['Built for Arc', 'A stablecoin-native lending experience designed around Arc Testnet today.'],
    ['Simple by design', 'A focused protocol surface without pretending to be bigger than the current deployment.'],
];

function formatUsd(value) {
    const number = Number(value ?? 0);
    if (!Number.isFinite(number)) return '—';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(number);
}

function formatUsdFromPrice(amountRaw, priceRaw, decimals) {
    try {
        const amount = Number(formatUnits(amountRaw ?? 0n, decimals));
        const price = Number(formatUnits(priceRaw ?? 0n, 18));
        return Number.isFinite(amount) && Number.isFinite(price) ? amount * price : null;
    } catch {
        return null;
    }
}

export default function WelcomePage() {
    const suppliedContracts = useMemo(
        () => ACTIVE_MARKETS.flatMap((market) => [
            {
                address: CONTRACT_ADDRESSES.lendingPool,
                abi: LENDING_POOL_ABI,
                functionName: 'currentSupply',
                args: [market.address],
            },
            {
                address: CONTRACT_ADDRESSES.oracle,
                abi: ORACLE_ABI,
                functionName: 'getPrice',
                args: [market.address],
            },
        ]),
        [],
    );

    const { data: suppliedResults, isLoading: suppliedLoading } = useReadContracts({
        contracts: suppliedContracts,
        query: { enabled: Boolean(CONTRACT_ADDRESSES.lendingPool && CONTRACT_ADDRESSES.oracle) },
    });

    const suppliedAssets = ACTIVE_MARKETS.map((market, index) => {
        const supplyResult = suppliedResults?.[index * 2];
        const priceResult = suppliedResults?.[index * 2 + 1];
        const supplyRaw = supplyResult?.result ?? 0n;
        const priceResultRaw = Array.isArray(priceResult?.result) ? priceResult.result[0] : 0n;
        const valueUsd = formatUsdFromPrice(supplyRaw, priceResultRaw, market.decimals);

        return {
            ...market,
            valueUsd,
            supplied: supplyRaw > 0n,
            ready: supplyResult?.status === 'success' && priceResult?.status === 'success',
        };
    }).filter((market) => market.supplied);

    const suppliedTotalUsd = suppliedAssets.reduce(
        (total, market) => total + (market.valueUsd ?? 0),
        0,
    );

    return (
        <main className="landing-page">
            <nav className="landing-nav">
                <Link href="/" className="landing-brand">Centry</Link>
                <div className="landing-nav-links">
                    <a href="#how-it-works">How it works</a>
                    <a href="#markets">Markets</a>
                    <a href="#governance">Governance</a>
                    <Link href="/app">Open app</Link>
                </div>
                <span className="landing-network">ARC TESTNET</span>
            </nav>

            <section className="landing-hero">
                <div className="landing-hero-copy">
                    <span className="landing-status"><i /> ARC TESTNET · ONCHAIN</span>
                    <h1>Lending, without the noise.</h1>
                    <p>
                        Centry is an Arc-native money market for supplying liquidity, borrowing against supported collateral,
                        and coordinating the protocol through veCENT governance.
                    </p>
                    <div className="landing-actions">
                        <Link className="primary-btn" href="/app">Enter Centry</Link>
                        <a className="secondary-btn" href="#how-it-works">Explore the protocol</a>
                    </div>
                    <div className="landing-trust-row">
                        <span>Native USDC</span>
                        <span>Live contracts</span>
                        <span>veCENT governance</span>
                    </div>
                </div>

                <div className="landing-hero-panel">
                    <div className="landing-hero-panel-top">
                        <span>SUPPLIED LIQUIDITY</span>
                        <strong>{suppliedLoading ? '—' : formatUsd(suppliedTotalUsd)}</strong>
                    </div>
                    <div className="landing-supplied-list">
                        {suppliedLoading && (
                            <div className="landing-supplied-empty">Reading live supplied assets…</div>
                        )}
                        {!suppliedLoading && suppliedAssets.map((market) => (
                            <div className="landing-supplied-row" key={market.id}>
                                <span>{market.symbol}</span>
                                <b>{market.valueUsd === null ? '—' : formatUsd(market.valueUsd)}</b>
                            </div>
                        ))}
                        {!suppliedLoading && suppliedAssets.length === 0 && (
                            <div className="landing-supplied-empty">No supplied assets yet.</div>
                        )}
                    </div>
                    <Link className="landing-panel-link" href="/app">View portfolio <span>→</span></Link>
                </div>
            </section>

            <ProtocolStats />

            <section id="how-it-works" className="landing-section">
                <div className="landing-section-heading">
                    <span className="landing-kicker">HOW IT WORKS</span>
                    <h2>A focused lending system.</h2>
                    <p>Everything that matters is kept close to the core: liquidity, borrowing, risk, rewards, and governance.</p>
                </div>
                <div className="landing-flow-grid">
                    {FLOW.map((item) => (
                        <article key={item.number} className="landing-flow-card">
                            <span className="landing-flow-number">{item.number}</span>
                            <h3>{item.title}</h3>
                            <p>{item.text}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="landing-section landing-principles-section">
                <div className="landing-section-heading">
                    <span className="landing-kicker">THE CENTRY MODEL</span>
                    <h2>Transparent where it counts.</h2>
                </div>
                <div className="landing-principles-grid">
                    {PRINCIPLES.map(([title, text]) => (
                        <article key={title} className="landing-principle-card">
                            <h3>{title}</h3>
                            <p>{text}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section id="markets" className="landing-section landing-market-section">
                <div className="landing-market-copy">
                    <span className="landing-kicker">MARKETS</span>
                    <h2>Start with the market that is actually live.</h2>
                    <p>
                        Centry currently keeps the market surface intentionally focused on native USDC on Arc Testnet.
                        That means the interface can show real liquidity, utilization, rates, and risk data rather than placeholder numbers.
                    </p>
                    <Link className="secondary-btn" href="/app">Open markets</Link>
                </div>
                <div className="landing-live-card">
                    <div className="landing-live-card-head">
                        <div>
                            <span className="landing-usdc-badge">$</span>
                            <div>
                                <strong>USDC</strong>
                                <small>USD Coin · Arc Testnet</small>
                            </div>
                        </div>
                        <span className="live-badge"><i /> Live</span>
                    </div>
                    <div className="landing-live-grid">
                        <div><span>Asset model</span><strong>Native USDC</strong></div>
                        <div><span>Network</span><strong>Arc Testnet</strong></div>
                        <div><span>Risk model</span><strong>Health factor</strong></div>
                        <div><span>Protocol state</span><strong>Onchain</strong></div>
                    </div>
                </div>
            </section>

            <section id="governance" className="landing-section landing-governance-section">
                <div>
                    <span className="landing-kicker">GOVERNANCE</span>
                    <h2>CENT becomes influence through time.</h2>
                    <p>Lock CENT into veCENT, build voting power over time, and manage your position directly from the app.</p>
                </div>
                <div className="landing-governance-card">
                    <div><span>Lock</span><strong>CENT</strong></div>
                    <div><span>Receive</span><strong>veCENT</strong></div>
                    <div><span>Use</span><strong>Governance</strong></div>
                    <Link className="primary-btn" href="/app">Open governance</Link>
                </div>
            </section>

            <section className="landing-cta">
                <div>
                    <span className="landing-kicker">READY WHEN YOU ARE</span>
                    <h2>Enter the live protocol.</h2>
                    <p>Supply, borrow, manage your position, and follow rewards from one interface.</p>
                </div>
                <Link className="primary-btn" href="/app">Launch app <span>→</span></Link>
            </section>

            <footer className="landing-footer">
                <strong>Centry</strong>
                <span>Arc Testnet · Experimental software</span>
            </footer>

            <style jsx global>{`
                .landing-page {
                    min-height: 100vh;
                    padding: 0 42px 42px;
                    background:
                        radial-gradient(circle at 78% 16%, rgba(119, 66, 208, .14), transparent 28%),
                        radial-gradient(circle at 10% 52%, rgba(70, 52, 112, .08), transparent 30%),
                        var(--bg);
                    color: var(--text);
                }

                .landing-nav {
                    width: min(1240px, 100%);
                    height: 82px;
                    margin: 0 auto;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 28px;
                    border-bottom: 1px solid #211a2e;
                }

                .landing-brand {
                    font-family: var(--display-font, Georgia, serif);
                    font-size: 25px;
                    letter-spacing: -.5px;
                }

                .landing-nav-links {
                    display: flex;
                    align-items: center;
                    gap: 28px;
                    margin-left: auto;
                    color: #91869f;
                    font-size: 11px;
                }

                .landing-nav-links a:hover { color: #fff; }

                .landing-network,
                .landing-status,
                .landing-kicker {
                    font: 9px 'DM Mono', monospace;
                    letter-spacing: 1.5px;
                    text-transform: uppercase;
                }

                .landing-network { color: #9b8da8; white-space: nowrap; }

                .landing-hero {
                    width: min(1240px, 100%);
                    margin: 0 auto;
                    min-height: 620px;
                    display: grid;
                    grid-template-columns: minmax(0, 1.25fr) minmax(330px, .75fr);
                    align-items: center;
                    gap: 72px;
                    padding: 88px 0 82px;
                }

                .landing-status {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    color: #b09bc7;
                }

                .landing-status i {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: var(--green);
                    box-shadow: 0 0 12px var(--green);
                }

                .landing-hero h1 {
                    max-width: 760px;
                    margin: 20px 0 18px;
                    font-family: var(--display-font, Georgia, serif);
                    font-size: clamp(56px, 7.3vw, 96px);
                    line-height: .94;
                    letter-spacing: -4px;
                    font-weight: 400;
                }

                .landing-hero-copy > p {
                    max-width: 690px;
                    margin: 0;
                    color: #aaa0b1;
                    font-size: 14px;
                    line-height: 1.75;
                }

                .landing-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 30px; }
                .landing-trust-row { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 20px; color: #62596c; font: 9px 'DM Mono', monospace; text-transform: uppercase; letter-spacing: .7px; }

                .landing-hero-panel {
                    padding: 28px;
                    border: 1px solid #2b2138;
                    border-radius: 18px;
                    background: linear-gradient(155deg, #120d1f, #0a0710);
                    box-shadow: 0 30px 90px rgba(0,0,0,.25);
                }

                .landing-hero-panel-top { display: flex; justify-content: space-between; align-items: baseline; gap: 18px; padding-bottom: 22px; border-bottom: 1px solid #231a2f; }
                .landing-hero-panel-top span { color: #756d83; font: 9px 'DM Mono', monospace; letter-spacing: 1.5px; }
                .landing-hero-panel-top strong { font-family: var(--display-font, Georgia, serif); font-size: 28px; font-weight: 400; white-space: nowrap; }
                .landing-supplied-list { min-height: 155px; }
                .landing-supplied-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 17px 0; border-bottom: 1px solid #1b1425; font-size: 11px; }
                .landing-supplied-row span { color: #9b91a4; }
                .landing-supplied-row b { color: #e4dcf0; font-weight: 500; font-variant-numeric: tabular-nums; }
                .landing-supplied-empty { display: flex; min-height: 155px; align-items: center; color: #645b6d; font-size: 11px; }
                .landing-panel-link { display: flex; justify-content: space-between; margin-top: 20px; color: #c6adff; font-size: 11px; }

                .protocol-stats { width: min(1240px, 100%); margin: 0 auto; }

                .landing-section { width: min(1240px, 100%); margin: 0 auto; padding: 92px 0; }
                .landing-section-heading { max-width: 720px; margin-bottom: 34px; }
                .landing-kicker { color: #987db9; }
                .landing-section-heading h2,
                .landing-market-copy h2,
                .landing-governance-section h2,
                .landing-cta h2 {
                    margin: 10px 0 10px;
                    font-family: var(--display-font, Georgia, serif);
                    font-size: clamp(35px, 4vw, 58px);
                    line-height: 1;
                    letter-spacing: -2.3px;
                    font-weight: 400;
                }
                .landing-section-heading p,
                .landing-market-copy p,
                .landing-governance-section p,
                .landing-cta p { margin: 0; color: #8f8598; font-size: 12px; line-height: 1.7; }

                .landing-flow-grid,
                .landing-principles-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; }
                .landing-flow-card,
                .landing-principle-card { min-height: 240px; padding: 25px; border: 1px solid #282033; border-radius: 15px; background: linear-gradient(145deg, #100b1b, #0b0813); }
                .landing-flow-number { color: #6e5a82; font: 10px 'DM Mono', monospace; }
                .landing-flow-card h3,
                .landing-principle-card h3 { margin: 56px 0 10px; font-family: var(--display-font, Georgia, serif); font-size: 25px; font-weight: 400; }
                .landing-principle-card h3 { margin-top: 30px; }
                .landing-flow-card p,
                .landing-principle-card p { margin: 0; color: #877d90; font-size: 11px; line-height: 1.7; }

                .landing-principles-section { padding-top: 25px; }

                .landing-market-section,
                .landing-governance-section,
                .landing-cta { display: grid; grid-template-columns: minmax(0,1fr) minmax(320px,.9fr); gap: 55px; align-items: center; }
                .landing-market-copy .secondary-btn { margin-top: 25px; }

                .landing-live-card,
                .landing-governance-card { padding: 25px; border: 1px solid #282033; border-radius: 16px; background: #0c0814; }
                .landing-live-card-head { display: flex; align-items: center; justify-content: space-between; gap: 15px; padding-bottom: 20px; border-bottom: 1px solid #21182d; }
                .landing-live-card-head > div { display: flex; align-items: center; gap: 11px; }
                .landing-usdc-badge { display: grid; width: 39px; height: 39px; place-items: center; border-radius: 50%; background: #2775ca; color: #fff; font-weight: 700; }
                .landing-live-card-head strong { display: block; font-size: 13px; }
                .landing-live-card-head small { display: block; margin-top: 3px; color: #62596c; font-size: 9px; }
                .live-badge { display: inline-flex; align-items: center; gap: 7px; padding: 6px 10px; border: 1px solid #303044; border-radius: 999px; color: #aaa2b9; background: #0d0b15; font: 9px 'DM Mono', monospace; white-space: nowrap; }
                .live-badge i { width: 6px; height: 6px; border-radius: 50%; background: var(--green); box-shadow: 0 0 10px var(--green); }
                .landing-live-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; margin-top: 18px; }
                .landing-live-grid > div { padding: 13px; border: 1px solid #21182d; border-radius: 11px; }
                .landing-live-grid span { display: block; color: #5f566a; font: 9px 'DM Mono', monospace; }
                .landing-live-grid strong { display: block; margin-top: 7px; font-size: 11px; }

                .landing-governance-card { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; align-items: stretch; }
                .landing-governance-card > div { padding: 16px; border: 1px solid #21182d; border-radius: 11px; background: #0f0a17; }
                .landing-governance-card span { display: block; color: #5f566a; font: 9px 'DM Mono', monospace; }
                .landing-governance-card strong { display: block; margin-top: 9px; font-size: 12px; }
                .landing-governance-card .primary-btn { grid-column: 1 / -1; margin-top: 3px; }

                .landing-cta { margin: 30px auto 30px; width: min(1240px, 100%); padding: 36px 40px; border: 1px solid #2c2239; border-radius: 18px; background: linear-gradient(135deg, #171021, #0d0915); }
                .landing-cta .primary-btn { justify-self: end; }

                .landing-footer { width: min(1240px, 100%); margin: 0 auto; padding-top: 28px; border-top: 1px solid #211a2e; display: flex; justify-content: space-between; gap: 15px; color: #645b6d; font-size: 10px; }
                .landing-footer strong { color: #c7bed0; font-family: var(--display-font, Georgia, serif); font-size: 16px; font-weight: 400; }

                @media (max-width: 900px) {
                    .landing-page { padding: 0 22px 28px; }
                    .landing-nav-links { display: none; }
                    .landing-hero { grid-template-columns: 1fr; gap: 30px; padding: 62px 0 55px; }
                    .landing-hero-panel { max-width: 680px; }
                    .landing-market-section,
                    .landing-governance-section,
                    .landing-cta { grid-template-columns: 1fr; gap: 28px; }
                    .landing-cta .primary-btn { justify-self: start; }
                }

                @media (max-width: 640px) {
                    .landing-page { padding: 0 16px 22px; }
                    .landing-network { display: none; }
                    .landing-hero h1 { font-size: 52px; letter-spacing: -2.5px; }
                    .landing-section { padding: 66px 0; }
                    .landing-flow-grid,
                    .landing-principles-grid { grid-template-columns: 1fr; }
                    .landing-live-grid { grid-template-columns: 1fr; }
                    .landing-governance-card { grid-template-columns: 1fr; }
                    .landing-governance-card .primary-btn { grid-column: auto; }
                    .landing-footer { flex-direction: column; }
                }

                @media (prefers-reduced-motion: reduce) {
                    .landing-page * { scroll-behavior: auto !important; transition: none !important; }
                }
            `}</style>
        </main>
    );
}
