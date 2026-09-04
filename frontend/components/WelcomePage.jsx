'use client';

import React from 'react';
import Link from 'next/link';
import ProtocolStats from './ProtocolStats';

export default function WelcomePage() {
    return (
        <main className="landing-page">
            <nav className="landing-nav">
                <div className="brand">
                    <span className="brand-mark">C</span>
                    <span>Centry</span>
                </div>
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
                    <span className="eyebrow"><i /> Arc-native money market</span>
                    <h1>Liquidity for the <em>next network.</em></h1>
                    <p>
                        Centry is an Arc-native lending protocol for supplying liquidity,
                        borrowing against supported collateral, and coordinating the protocol through veCENT governance.
                    </p>
                    <div className="landing-actions">
                        <Link className="primary-btn" href="/app">Enter Centry</Link>
                        <a className="secondary-btn" href="#how-it-works">Learn how it works</a>
                    </div>
                    <div className="landing-note">
                        <span className="network-dot" />
                        Currently deployed on Arc Testnet
                    </div>
                </div>
                <div className="landing-orbit" aria-hidden="true">
                    <div className="landing-ring ring-one" />
                    <div className="landing-ring ring-two" />
                    <div className="landing-ring ring-three" />
                    <div className="landing-usdc">
                        <svg viewBox="0 0 2000 2000" role="img" aria-label="USDC" preserveAspectRatio="xMidYMid meet">
                            <path d="M1000 2000c554.17 0 1000-445.83 1000-1000S1554.17 0 1000 0 0 445.83 0 1000s445.83 1000 1000 1000z" fill="#2775ca" />
                            <path d="M1275 1158.33c0-145.83-87.5-195.83-262.5-216.66-125-16.67-150-50-150-108.34s41.67-95.83 125-95.83c75 0 116.67 25 137.5 87.5 4.17 12.5 16.67 20.83 29.17 20.83h66.66c16.67 0 29.17-12.5 29.17-29.16v-4.17c-16.67-91.67-91.67-162.5-187.5-170.83v-100c0-16.67-12.5-29.17-33.33-33.34h-62.5c-16.67 0-29.17 12.5-33.34 33.34v95.83c-125 16.67-204.16 100-204.16 204.17 0 137.5 83.33 191.66 258.33 212.5 116.67 20.83 154.17 45.83 154.17 112.5s-58.34 112.5-137.5 112.5c-108.34 0-145.84-45.84-158.34-108.34-4.16-16.66-16.66-25-29.16-25h-70.84c-16.66 0-29.16 12.5-29.16 29.17v4.17c16.66 104.16 83.33 179.16 220.83 200v100c0 16.66 12.5 29.16 33.33 33.33h62.5c16.67 0 29.17-12.5 33.34-33.33v-100c125-20.84 208.33-108.34 208.33-220.84z" fill="#fff" />
                            <path d="M787.5 1595.83c-325-116.66-491.67-479.16-370.83-800 62.5-175 200-308.33 370.83-370.83 16.67-8.33 25-20.83 25-41.67V325c0-16.67-8.33-29.17-25-33.33-4.17 0-12.5 0-16.67 4.16-395.83 125-612.5 545.84-487.5 941.67 75 233.33 254.17 412.5 487.5 487.5 16.67 8.33 33.34 0 37.5-16.67 4.17-4.16 4.17-8.33 4.17-16.66v-58.34c0-12.5-12.5-29.16-25-37.5zM1229.17 295.83c-16.67-8.33-33.34 0-37.5 16.67-4.17 4.17-4.17 8.33-4.17 16.67v58.33c0 16.67 8.33 33.33 25 41.67 325 116.66 491.67 479.16 370.83 800-62.5 175-200 308.33-370.83 370.83-16.67 8.33-25 20.83-25 41.67V1700c0 16.67 8.33 29.17 25 33.33 4.17 0 12.5 0 16.67-4.16 395.83-125 612.5-545.84 487.5-941.67-75-237.5-258.34-416.67-487.5-491.67z" fill="#fff" />
                        </svg>
                    </div>
                </div>
            </section>

            <ProtocolStats />

            <section id="how-it-works" className="landing-section">
                <div className="landing-section-heading">
                    <span className="section-kicker">THE PROTOCOL</span>
                    <h2>One market. Three ways in.</h2>
                    <p>
                        Centry connects liquidity providers, borrowers, and governance participants
                        through one onchain system.
                    </p>
                </div>
                <div className="landing-pillars">
                    <article className="landing-pillar">
                        <span>01</span>
                        <h3>Lend</h3>
                        <p>Supply supported assets into Centry markets and earn market-driven interest.</p>
                    </article>
                    <article className="landing-pillar">
                        <span>02</span>
                        <h3>Borrow</h3>
                        <p>Use eligible collateral to access liquidity while Centry tracks account risk onchain.</p>
                    </article>
                    <article className="landing-pillar">
                        <span>03</span>
                        <h3>Govern</h3>
                        <p>Lock CENT into veCENT to participate in protocol governance.</p>
                    </article>
                </div>
            </section>

            <section id="markets" className="landing-section landing-market-section">
                <div>
                    <span className="section-kicker">MARKETS</span>
                    <h2>Start with a transparent test market.</h2>
                    <p>
                        The current Arc Testnet deployment uses native USDC, with the token and oracle configuration verified for the current test market.
                    </p>
                </div>
                <div className="landing-market-card">
                    <div>
                        <span className="token usdc">$</span>
                        <div>
                            <strong>USDC</strong>
                            <small>Arc Testnet USDC</small>
                        </div>
                    </div>
                    <span className="live-badge"><i /> Live</span>
                </div>
            </section>

            <section id="governance" className="landing-section landing-governance">
                <span className="section-kicker">GOVERNANCE</span>
                <h2>CENT becomes influence through time.</h2>
                <p>Lock CENT into veCENT to receive voting power and participate in protocol governance.</p>
                <Link className="secondary-btn landing-governance-link" href="/app">View governance</Link>
            </section>

            <footer className="landing-footer">
                <strong>Centry</strong>
                <span>Arc Testnet · Experimental software</span>
            </footer>

            <style jsx global>{`
                .landing-usdc {
                    position: absolute;
                    z-index: 4;
                    top: 50%;
                    left: 50%;
                    width: 166px;
                    height: 166px;
                    transform: translate(-50%, -50%);
                    display: grid;
                    place-items: center;
                    pointer-events: none;
                    filter: none;
                }

                .landing-usdc svg {
                    display: block;
                    width: 100%;
                    height: 100%;
                }

                @media (max-width: 800px) {
                    .landing-usdc {
                        width: 136px;
                        height: 136px;
                    }
                }
            `}</style>
        </main>
    );
}
