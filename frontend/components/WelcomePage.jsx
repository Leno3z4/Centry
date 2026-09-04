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
                        <svg viewBox="0 0 148 148" role="img" aria-label="USDC">
                            <circle cx="74" cy="74" r="72" fill="#2775CA" />
                            <path
                                d="M43 40.5c-14.1 8.8-23.5 24.4-23.5 42.2s9.4 33.4 23.5 42.2"
                                fill="none"
                                stroke="#fff"
                                strokeWidth="9.5"
                                strokeLinecap="round"
                            />
                            <path
                                d="M105 40.5c14.1 8.8 23.5 24.4 23.5 42.2s-9.4 33.4-23.5 42.2"
                                fill="none"
                                stroke="#fff"
                                strokeWidth="9.5"
                                strokeLinecap="round"
                            />
                            <path
                                d="M77.7 36.5v11.2h7.1c12.6 0 20.5 6.8 20.5 17.7h-12c0-4.6-3.7-7.2-10.6-7.2H72c-6.1 0-9.4 2.4-9.4 6.4 0 4.1 3.2 6.1 11.6 7.7l6.2 1.2c13.2 2.5 19.2 7.3 19.2 16.6 0 10.3-8.5 17.6-20.8 17.6h-1.1v11.1h-7.2V107.7h-7.1c-12.6 0-20.5-6.8-20.5-17.7h12c0 4.7 3.7 7.2 10.6 7.2h10.7c6.1 0 9.4-2.3 9.4-6.5 0-4.2-3.2-6.2-11.6-7.8l-6.2-1.2C55 79.2 49 74.4 49 65.1c0-10.3 8.5-17.6 20.8-17.6h.7V36.5h7.2Z"
                                fill="#fff"
                            />
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
                    filter: drop-shadow(0 18px 35px rgba(39, 117, 202, .24));
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
