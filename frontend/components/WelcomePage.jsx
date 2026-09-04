'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { ACTIVE_MARKETS } from '../constants/markets';
import { CONTRACT_ADDRESSES } from '../constants/contracts';
import { LENDING_POOL_ABI, ORACLE_ABI } from '../constants/abis';

const AeroShards = dynamic(() => import('./AeroShards'), {
    ssr: false,
    loading: () => null,
});

const HOW_IT_WORKS = [
    ['01', 'Supply liquidity', 'Deposit a supported asset and earn interest as borrowers use available liquidity.'],
    ['02', 'Borrow against collateral', 'Supply eligible collateral, stay within the live risk limits, and borrow available liquidity.'],
    ['03', 'Coordinate with veCENT', 'Lock CENT into veCENT to build voting power and participate in Centry governance.'],
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

function usdFromPrice(amountRaw, priceRaw, decimals) {
    try {
        const amount = Number(formatUnits(amountRaw ?? 0n, decimals));
        const price = Number(formatUnits(priceRaw ?? 0n, 18));
        return Number.isFinite(amount) && Number.isFinite(price) ? amount * price : 0;
    } catch {
        return 0;
    }
}

export default function WelcomePage() {
    const marketContracts = useMemo(
        () => ACTIVE_MARKETS.flatMap((market) => [
            {
                address: CONTRACT_ADDRESSES.lendingPool,
                abi: LENDING_POOL_ABI,
                functionName: 'currentSupply',
                args: [market.address],
            },
            {
                address: CONTRACT_ADDRESSES.lendingPool,
                abi: LENDING_POOL_ABI,
                functionName: 'currentBorrow',
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

    const { data: marketResults, isLoading } = useReadContracts({
        contracts: marketContracts,
        query: { enabled: Boolean(CONTRACT_ADDRESSES.lendingPool && CONTRACT_ADDRESSES.oracle) },
    });

    const markets = ACTIVE_MARKETS.map((market, index) => {
        const offset = index * 3;
        const supplyRaw = marketResults?.[offset]?.result ?? 0n;
        const borrowRaw = marketResults?.[offset + 1]?.result ?? 0n;
        const priceResult = marketResults?.[offset + 2]?.result;
        const priceRaw = Array.isArray(priceResult) ? priceResult[0] : 0n;

        return {
            ...market,
            suppliedUsd: usdFromPrice(supplyRaw, priceRaw, market.decimals),
            borrowedUsd: usdFromPrice(borrowRaw, priceRaw, market.decimals),
        };
    });

    const totalSuppliedUsd = markets.reduce((sum, market) => sum + market.suppliedUsd, 0);
    const totalBorrowedUsd = markets.reduce((sum, market) => sum + market.borrowedUsd, 0);

    return (
        <main className="landing-page">
            <div className="landing-aero-background" aria-hidden="true">
                <AeroShards
                    backgroundColor="#120F17"
                    shardColor="#896ABD"
                    accentColor="#A855F7"
                    placement="full"
                    flow="stream"
                    material="pearl"
                    detail="balanced"
                    effect="none"
                    scale={1}
                    spread={1}
                    depth={1}
                    speed={1}
                    spin={1}
                    interaction="repel"
                    density={1.5}
                    shardSize={1.1}
                    stretch={1}
                    turbulence={1}
                    glow={1}
                    edgeSoftness={2}
                    bloom={0.5}
                    grain={0.05}
                    chromaticAberration={0.0075}
                    transitionDuration={1}
                    interactionRadius={1.5}
                    interactionStrength={0.5}
                    rippleIntensity={1}
                    holdToGather={true}
                />
            </div>

            <nav className="landing-nav">
                <Link href="/" className="landing-brand">Centry</Link>
                <div className="landing-nav-links">
                    <a href="#how-it-works">How it works</a>
                    <a href="#governance">Governance</a>
                    <Link href="/app">Open app</Link>
                </div>
                <span className="landing-network">ARC TESTNET</span>
            </nav>

            <section className="landing-hero">
                <div className="landing-hero-copy">
                    <span className="landing-status"><i /> ARC TESTNET · ONCHAIN</span>
                    <h1>Lending, without the noise.</h1>
                    <p>Supply liquidity, borrow against supported collateral, and coordinate the protocol through veCENT governance.</p>
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

                <div className="landing-hero-metrics" aria-label="Live protocol totals">
                    <div className="landing-metric">
                        <span>Total supplied</span>
                        <strong>{isLoading ? '—' : formatUsd(totalSuppliedUsd)}</strong>
                    </div>
                    <div className="landing-metric">
                        <span>Total borrowed</span>
                        <strong>{isLoading ? '—' : formatUsd(totalBorrowedUsd)}</strong>
                    </div>
                    <div className="landing-metric-note">Live dollar values across the supported markets.</div>
                </div>
            </section>

            <section id="how-it-works" className="landing-how-section">
                <div className="landing-how-copy">
                    <span className="landing-kicker">HOW CENTRY WORKS</span>
                    <h2>A lending system you can understand at a glance.</h2>
                    <p>Three core actions connect liquidity, borrowing, risk, rewards, and governance.</p>

                    <div className="landing-how-list">
                        {HOW_IT_WORKS.map(([number, title, text]) => (
                            <div className="landing-how-item" key={number}>
                                <span className="landing-how-number">{number}</span>
                                <div>
                                    <h3>{title}</h3>
                                    <p>{text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section id="governance" className="landing-governance-section">
                <div className="landing-governance-copy">
                    <span className="landing-kicker">GOVERNANCE</span>
                    <h2>CENT becomes influence through time.</h2>
                    <p>Lock CENT into veCENT, build voting power over time, and manage your position directly from the app.</p>
                    <Link className="secondary-btn" href="/app">Open governance</Link>
                </div>
                <div className="landing-governance-rule" aria-hidden="true" />
            </section>

            <section className="landing-cta">
                <div>
                    <span className="landing-kicker">READY WHEN YOU ARE</span>
                    <h2>Enter the live protocol.</h2>
                    <p>Supply, borrow, manage your position, and follow rewards from one interface.</p>
                </div>
                <Link className="primary-btn" href="/app">Launch app</Link>
            </section>

            <footer className="landing-footer">
                <strong>Centry</strong>
                <span>Arc Testnet · Experimental software</span>
            </footer>

            <style jsx global>{`
                .landing-page {
                    --landing-content: min(1180px, calc(100vw - 48px));
                    position: relative;
                    min-height: 100vh;
                    overflow-x: clip;
                    padding: 0 24px 36px;
                    background: #090711;
                    color: var(--text);
                    isolation: isolate;
                }

                .landing-aero-background {
                    position: fixed;
                    inset: 0;
                    z-index: 0;
                    width: 100vw;
                    height: 100vh;
                    opacity: .14;
                    pointer-events: none;
                    overflow: hidden;
                }

                .landing-aero-background > * {
                    width: 100%;
                    height: 100%;
                }

                .landing-nav,
                .landing-hero,
                .landing-how-section,
                .landing-governance-section,
                .landing-cta,
                .landing-footer {
                    width: var(--landing-content);
                    margin-inline: auto;
                }

                .landing-nav {
                    position: relative;
                    z-index: 2;
                    min-height: 76px;
                    display: grid;
                    grid-template-columns: auto 1fr auto;
                    align-items: center;
                    gap: 28px;
                    border-bottom: 1px solid rgba(139, 113, 171, .16);
                }

                .landing-brand {
                    font-family: var(--display-font, Georgia, serif);
                    font-size: 25px;
                    letter-spacing: -.5px;
                }

                .landing-nav-links {
                    justify-self: center;
                    display: flex;
                    align-items: center;
                    gap: 24px;
                    color: #91869f;
                    font-size: 11px;
                }

                .landing-nav-links a:hover { color: #fff; }

                .landing-network,
                .landing-status,
                .landing-kicker,
                .landing-data-heading span,
                .landing-metric span,
                .landing-metric-note,
                    font-family: 'DM Mono', monospace;
                    text-transform: uppercase;
                    letter-spacing: 1.3px;
                }

                .landing-network { color: #9b8da8; font-size: 9px; white-space: nowrap; }

                .landing-hero {
                    position: relative;
                    z-index: 1;
                    min-height: min(700px, calc(100vh - 76px));
                    display: grid;
                    grid-template-columns: minmax(0, 1.08fr) minmax(280px, .72fr);
                    align-items: center;
                    gap: clamp(42px, 7vw, 100px);
                    padding: 88px 0 90px;
                }

                .landing-status {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    color: #b09bc7;
                    font-size: 9px;
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
                    font-size: clamp(52px, 7vw, 94px);
                    line-height: .94;
                    letter-spacing: -4px;
                    font-weight: 400;
                }

                .landing-hero-copy > p {
                    max-width: 650px;
                    margin: 0;
                    color: #aaa0b1;
                    font-size: 14px;
                    line-height: 1.75;
                }

                .landing-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 30px; }
                .landing-trust-row { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 20px; color: #62596c; font: 9px 'DM Mono', monospace; text-transform: uppercase; letter-spacing: .7px; }

                .landing-hero-metrics { align-self: center; justify-self: end; width: min(440px, 100%); }
                .landing-metric { display: flex; flex-direction: column; gap: 10px; padding: 24px 0; border-top: 1px solid rgba(139, 113, 171, .18); }
                .landing-metric:last-of-type { border-bottom: 1px solid rgba(139, 113, 171, .18); }
                .landing-metric span { color: #736980; font-size: 9px; }
                .landing-metric strong { font-family: var(--display-font, Georgia, serif); font-size: clamp(30px, 4vw, 44px); line-height: 1; font-weight: 400; letter-spacing: -1.1px; font-variant-numeric: tabular-nums; }
                .landing-metric-note { margin-top: 14px; color: #5d5568; font-size: 7px; line-height: 1.5; }

                .landing-how-section { position: relative; z-index: 1; padding: 80px 0 125px; }
                .landing-how-copy { width: min(650px, 100%); }
                .landing-kicker { color: #987db9; font-size: 9px; }
                .landing-how-copy h2,
                .landing-section-heading h2,
                .landing-governance-copy h2,
                .landing-cta h2 {
                    margin: 10px 0 12px;
                    font-family: var(--display-font, Georgia, serif);
                    font-size: clamp(35px, 4vw, 57px);
                    line-height: 1;
                    letter-spacing: -2.2px;
                    font-weight: 400;
                }

                .landing-how-copy > p,
                .landing-section-heading > p,
                .landing-governance-copy > p,
                .landing-cta p { margin: 0; color: #8f8598; font-size: 12px; line-height: 1.7; }

                .landing-how-list { margin-top: 46px; }
                .landing-how-item { display: grid; grid-template-columns: 46px minmax(0,1fr); gap: 18px; padding: 24px 0; border-top: 1px solid rgba(139, 113, 171, .17); }
                .landing-how-item:last-child { border-bottom: 1px solid rgba(139, 113, 171, .17); }
                .landing-how-number { color: #6f5b82; font: 10px 'DM Mono', monospace; }
                .landing-how-item h3 { margin: -3px 0 7px; font-family: var(--display-font, Georgia, serif); font-size: 25px; font-weight: 400; letter-spacing: -.4px; }
                .landing-how-item p { margin: 0; color: #81778b; font-size: 11px; line-height: 1.7; }

                .landing-governance-section { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, .75fr) minmax(180px, .7fr); gap: 90px; align-items: center; padding: 90px 0 120px; }
                .landing-governance-copy { width: min(600px, 100%); }
                .landing-governance-copy .secondary-btn { margin-top: 24px; }
                .landing-governance-rule { height: 1px; background: linear-gradient(90deg, rgba(168, 85, 247, .42), transparent); }

                .landing-cta {
                    position: relative;
                    z-index: 1;
                    margin-top: 20px;
                    margin-bottom: 30px;
                    padding: 36px 40px;
                    display: grid;
                    grid-template-columns: minmax(0,1fr) auto;
                    gap: 32px;
                    align-items: center;
                    border: 1px solid #2c2239;
                    border-radius: 18px;
                    background: linear-gradient(135deg, rgba(23,16,33,.96), rgba(13,9,21,.96));
                    box-shadow: 0 30px 90px rgba(0,0,0,.24);
                }

                .landing-cta .primary-btn { justify-self: end; white-space: nowrap; }

                .landing-footer { position: relative; z-index: 1; padding-top: 26px; border-top: 1px solid rgba(139, 113, 171, .14); display: flex; justify-content: space-between; gap: 15px; color: #645b6d; font-size: 10px; }
                .landing-footer strong { color: #c7bed0; font-family: var(--display-font, Georgia, serif); font-size: 16px; font-weight: 400; }

                @media (max-width: 900px) {
                    .landing-page { --landing-content: min(720px, calc(100vw - 36px)); padding: 0 18px 28px; }
                    .landing-nav { grid-template-columns: auto auto; gap: 16px; min-height: 68px; }
                    .landing-nav-links { grid-column: 1 / -1; grid-row: 2; width: 100%; justify-content: flex-start; gap: 18px; padding: 0 0 13px; overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; }
                    .landing-nav-links::-webkit-scrollbar { display: none; }
                    .landing-network { justify-self: end; }
                    .landing-hero { grid-template-columns: 1fr; min-height: auto; gap: 48px; padding: 68px 0 84px; }
                    .landing-hero-metrics { justify-self: start; width: 100%; max-width: 620px; }
                    .landing-governance-section { grid-template-columns: 1fr; gap: 26px; }
                    .landing-governance-rule { width: 72%; }
                    .landing-cta { grid-template-columns: 1fr; padding: 30px; }
                    .landing-cta .primary-btn { justify-self: start; }
                }

                @media (max-width: 620px) {
                    .landing-page { --landing-content: calc(100vw - 28px); padding: 0 14px 22px; }
                    .landing-brand { font-size: 22px; }
                    .landing-network { font-size: 8px; }
                    .landing-nav { min-height: 64px; }
                    .landing-nav-links { gap: 15px; font-size: 10px; }
                    .landing-hero { padding: 52px 0 66px; }
                    .landing-hero h1 { font-size: clamp(43px, 13.5vw, 61px); letter-spacing: -2.6px; }
                    .landing-hero-copy > p { font-size: 13px; }
                    .landing-actions .primary-btn,
                    .landing-actions .secondary-btn,
                    .landing-governance-copy .secondary-btn { width: 100%; text-align: center; }
                    .landing-trust-row { gap: 10px 14px; line-height: 1.5; }
                    .landing-metric { padding: 20px 0; }
                    .landing-metric strong { font-size: 29px; }
                    .landing-how-section { padding: 66px 0 90px; }
                    .landing-how-copy h2,
                    .landing-section-heading h2,
                    .landing-governance-copy h2,
                    .landing-cta h2 { font-size: clamp(31px, 10vw, 43px); letter-spacing: -1.5px; }
                    .landing-how-item { grid-template-columns: 32px minmax(0,1fr); gap: 10px; }
                    .landing-how-item h3 { font-size: 22px; }
                    .landing-governance-section { padding: 66px 0 88px; }
                    .landing-cta { margin-top: 10px; padding: 26px 22px; }
                    .landing-cta .primary-btn { width: 100%; text-align: center; }
                    .landing-footer { flex-direction: column; }
                }

                @media (max-width: 360px) {
                    .landing-page { --landing-content: calc(100vw - 22px); padding-inline: 11px; }
                    .landing-nav-links { gap: 12px; font-size: 9px; }
                    .landing-hero h1 { font-size: 41px; }
                }

                @media (prefers-reduced-motion: reduce) {
                    .landing-page * { scroll-behavior: auto !important; transition: none !important; }
                }
            `}</style>
        </main>
    );
}
