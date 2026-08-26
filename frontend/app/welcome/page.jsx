'use client';

import React from 'react';
import Link from 'next/link';
import './landing.css';

const pillars = [
    { title: 'Lend', text: 'Supply supported assets into Centry markets and earn market-driven interest.' },
    { title: 'Borrow', text: 'Use eligible collateral to access liquidity while Centry tracks account risk onchain.' },
    { title: 'Govern', text: 'Lock CENT into veCENT to participate in protocol governance.' },
];

export default function WelcomePage() {
    return (
        <main className="landing-page">
            <nav className="landing-nav">
                <div className="brand"><span className="brand-mark">C</span><span>Centry</span></div>
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
                    <p>Centry is an Arc-native lending protocol for supplying liquidity, borrowing against supported collateral, and coordinating the protocol through veCENT governance.</p>
                    <div className="landing-actions">
                        <Link className="primary-btn" href="/app">Enter Centry <span>→</span></Link>
                        <a className="secondary-btn" href="#how-it-works">Learn how it works</a>
                    </div>
                    <div className="landing-note"><span className="network-dot" />Currently deployed on Arc Testnet</div>
                </div>
                <div className="landing-orbit" aria-hidden="true">
                    <div className="landing-ring ring-one" />
                    <div className="landing-ring ring-two" />
                    <div className="landing-ring ring-three" />
                    <div className="landing-core"><span>C</span></div>
                </div>
            </section>

            <section id="how-it-works" className="landing-section">
                <div className="landing-section-heading">
                    <span className="section-kicker">THE PROTOCOL</span>
                    <h2>One market. Three ways in.</h2>
                    <p>Centry connects liquidity providers, borrowers, and governance participants through one onchain system.</p>
                </div>
                <div className="landing-pillars">
                    {pillars.map((pillar, index) => (
                        <article className="landing-pillar" key={pillar.title}>
                            <span>0{index + 1}</span><h3>{pillar.title}</h3><p>{pillar.text}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section id="markets" className="landing-section landing-market-section">
                <div>
                    <span className="section-kicker">MARKETS</span>
                    <h2>Start with a transparent test market.</h2>
                    <p>The current Arc Testnet deployment uses mUSDC, Centry's deployed test token. It is clearly separated from real Arc-issued assets until their contracts and oracle feeds are verified.</p>
                </div>
                <div className="landing-market-card">
                    <div><span className="token usdc">$</span><div><strong>mUSDC</strong><small>Test USDC · Arc Testnet</small></div></div>
                    <span className="live-badge"><i /> Live</span>
                </div>
            </section>

            <section id="governance" className="landing-section landing-governance">
                <span className="section-kicker">GOVERNANCE</span>
                <h2>CENT becomes influence through time.</h2>
                <p>Lock CENT into veCENT to receive voting power and participate in protocol governance.</p>
            </section>

            <footer className="landing-footer"><strong>Centry</strong><span>Arc Testnet · Experimental software</span></footer>
        </main>
    );
}
