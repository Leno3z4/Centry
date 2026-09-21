'use client';

import React from 'react';
import Link from 'next/link';

const PRODUCTS = [
    {
        number: '01',
        title: 'Swap',
        text: 'Trade supported assets with a clear quote, route, and wallet confirmation.',
        href: '/app/swap',
    },
    {
        number: '02',
        title: 'Markets',
        text: 'Supply liquidity, borrow supported assets, and manage your position.',
        href: '/app/markets',
    },
    {
        number: '03',
        title: 'Rewards',
        text: 'See what your veCENT positions earned and choose where rewards should go.',
        href: '/app/rewards',
    },
    {
        number: '04',
        title: 'Governance',
        text: 'Lock CENT into veCENT, manage voting power, and shape the protocol.',
        href: '/app/governance',
    },
    {
        number: '05',
        title: 'Automation',
        text: 'Create controlled agents with explicit permissions and wallet-owned smart accounts.',
        href: '/app/agents',
    },
];

const EXPLORE = [
    ['Bridge', 'Move supported assets into the network.', '/app/bridge'],
    ['Portfolio', 'See your positions and balances in one place.', '/app/portfolio'],
    ['Analytics', 'Understand protocol activity and market data.', '/app/analytics'],
];

export default function LandingHome() {
    return (
        <main className="landing-home">
            <div className="landing-home-glow" aria-hidden="true" />

            <nav className="landing-home-nav">
                <Link href="/" className="landing-home-brand">Centry</Link>
                <div className="landing-home-nav-links">
                    <a href="#products">Main</a>
                    <a href="#explore">Explore</a>
                    <Link href="/app" className="landing-home-open">Open app</Link>
                </div>
            </nav>

            <section className="landing-home-hero">
                <div className="landing-home-kicker">CENTRY PROTOCOL</div>
                <h1>Trade, lend,<br />earn, govern.</h1>
                <p>
                    Centry brings markets, rewards, governance, and controlled automation into one system.
                </p>
                <div className="landing-home-actions">
                    <Link href="/app" className="landing-home-primary">Enter Centry</Link>
                    <a href="#products" className="landing-home-secondary">Explore</a>
                </div>
            </section>

            <section id="products" className="landing-home-section">
                <div className="landing-home-section-heading">
                    <h2>Start with what you need.</h2>
                </div>

                <div className="landing-home-products">
                    {PRODUCTS.map((product) => (
                        <Link href={product.href} className="landing-home-product" key={product.title}>
                            <span className="landing-home-product-number">{product.number}</span>
                            <div>
                                <h3>{product.title}</h3>
                                <p>{product.text}</p>
                            </div>
                            <span className="landing-home-arrow" aria-hidden="true">↗</span>
                        </Link>
                    ))}
                </div>
            </section>

            <section id="explore" className="landing-home-section landing-home-explore">
                <div className="landing-home-section-heading">
                    <h2>Explore Centry</h2>
                    <p>Bridge · Portfolio · Analytics</p>
                </div>

                <div className="landing-home-explore-grid">
                    {EXPLORE.map(([title, text, href]) => (
                        <Link href={href} className="landing-home-explore-card" key={title}>
                            <h3>{title}</h3>
                            <p>{text}</p>
                            <span aria-hidden="true">→</span>
                        </Link>
                    ))}
                </div>
            </section>

            <section className="landing-home-cta">
                <div>
                    <span>READY WHEN YOU ARE</span>
                    <h2>Start with what you need.</h2>
                    <p>Trade, manage liquidity, earn through veCENT, govern with your locked position, or build controlled automation.</p>
                </div>
                <Link href="/app" className="landing-home-primary">Launch app</Link>
            </section>

            <footer className="landing-home-footer">
                <strong>Centry</strong>
                <span>Experimental software</span>
                <Link href="/app/docs">Docs</Link>
            </footer>

            <style jsx global>{`
                .landing-home {
                    --landing-home-content: min(1180px, calc(100vw - 48px));
                    position: relative;
                    min-height: 100vh;
                    overflow: hidden;
                    padding: 0 24px 36px;
                    background: #07080a;
                    color: var(--text);
                    isolation: isolate;
                }

                .landing-home-glow {
                    position: absolute;
                    top: 0;
                    left: 50%;
                    width: 720px;
                    height: 260px;
                    transform: translateX(-50%);
                    background: #0b0d10;
                    opacity: .35;
                    pointer-events: none;
                }

                .landing-home-nav,
                .landing-home-hero,
                .landing-home-section,
                .landing-home-cta,
                .landing-home-footer {
                    position: relative;
                    z-index: 1;
                    width: var(--landing-home-content);
                    margin-inline: auto;
                }

                .landing-home-nav {
                    min-height: 76px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 24px;
                    border-bottom: 1px solid rgba(139, 113, 171, .16);
                }

                .landing-home-brand {
                    font-family: var(--display-font, Georgia, serif);
                    font-size: 25px;
                    letter-spacing: -.5px;
                }

                .landing-home-nav-links {
                    display: flex;
                    align-items: center;
                    gap: 24px;
                    color: #91869f;
                    font-size: 11px;
                }

                .landing-home-nav-links a:hover { color: #fff; }

                .landing-home-open {
                    padding: 9px 14px;
                    border: 1px solid #2a2a2a;
                    border-radius: 999px;
                    color: #ffffff !important;
                    background: #111111;
                    font-weight: 600;
                }

                .landing-home-hero {
                    padding: 130px 0 120px;
                    text-align: center;
                }

                .landing-home-kicker,
                .landing-home-section-heading > span,
                .landing-home-cta > div > span {
                    color: rgba(255,255,255,.60);
                    font: 9px/1.5 'DM Mono', monospace;
                    letter-spacing: 1.8px;
                }

                .landing-home-hero h1 {
                    margin: 18px 0 20px;
                    font-family: var(--display-font, Georgia, serif);
                    font-size: clamp(64px, 10vw, 116px);
                    line-height: .9;
                    letter-spacing: -5px;
                    font-weight: 400;
                    color: #ffffff;
                }

                .landing-home-hero p {
                    max-width: 610px;
                    margin: 0 auto;
                    color: rgba(255,255,255,.78);
                    font-size: 14px;
                    line-height: 1.8;
                }

                .landing-home-actions {
                    display: flex;
                    justify-content: center;
                    flex-wrap: wrap;
                    gap: 10px;
                    margin-top: 30px;
                }

                .landing-home-primary,
                .landing-home-secondary {
                    min-height: 46px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 18px;
                    border-radius: 10px;
                    font-size: 11px;
                }

                .landing-home-primary {
                    border: 1px solid #0a84ff;
                    background: #0a84ff;
                    color: #ffffff;
                    font-weight: 600;
                }

                .landing-home-primary:hover { background: #0077ee; }

                .landing-home-secondary {
                    border: 1px solid #2a2a2a;
                    background: #111111;
                    color: #ffffff;
                }

                .landing-home-secondary:hover { border-color: #574463; }

                .landing-home-section { padding: 90px 0 110px; }

                .landing-home-section-heading { max-width: 640px; margin-bottom: 42px; }

                .landing-home-section-heading h2,
                .landing-home-cta h2 {
                    margin: 10px 0 12px;
                    font-family: var(--display-font, Georgia, serif);
                    font-size: clamp(38px, 5vw, 62px);
                    line-height: .98;
                    letter-spacing: -2.5px;
                    font-weight: 400;
                }

                .landing-home-section-heading p,
                .landing-home-cta p {
                    margin: 0;
                    color: #847a8d;
                    font-size: 12px;
                    line-height: 1.7;
                }

                .landing-home-products {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    border-top: 1px solid rgba(139, 113, 171, .18);
                    border-left: 1px solid rgba(139, 113, 171, .18);
                }

                .landing-home-product {
                    min-height: 220px;
                    position: relative;
                    display: grid;
                    grid-template-columns: 42px minmax(0, 1fr) auto;
                    gap: 20px;
                    padding: 30px;
                    border-right: 1px solid #23282d;
                    border-bottom: 1px solid #23282d;
                    background: #0c0f12;
                    transition: background .18s ease, border-color .18s ease, transform .18s ease;
                }

                .landing-home-product:hover {
                    background: #111418;
                    border-color: #444a52;
                }

                .landing-home-product-number { color: #6f5b82; font: 10px 'DM Mono', monospace; }
                .landing-home-product h3 { margin: -5px 0 10px; font-family: var(--display-font, Georgia, serif); font-size: 32px; font-weight: 400; letter-spacing: -1px; }
                .landing-home-product p { max-width: 330px; margin: 0; color: #81778b; font-size: 11px; line-height: 1.7; }
                .landing-home-arrow { color: #a27ab8; font-size: 18px; }

                .landing-home-explore { padding-top: 70px; }

                .landing-home-explore-grid {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 10px;
                }

                .landing-home-explore-card {
                    min-height: 175px;
                    position: relative;
                    padding: 24px;
                    border: 1px solid #28202f;
                    border-radius: 14px;
                    background: rgba(15, 11, 21, .7);
                }

                .landing-home-explore-card:hover { border-color: #4b3858; background: rgba(24, 17, 32, .8); }
                .landing-home-explore-card h3 { margin: 0 0 9px; font-family: var(--display-font, Georgia, serif); font-size: 25px; font-weight: 400; }
                .landing-home-explore-card p { margin: 0; color: #7d7386; font-size: 10px; line-height: 1.65; }
                .landing-home-explore-card > span { position: absolute; right: 20px; bottom: 18px; color: #8e709e; }

                .landing-home-cta {
                    margin-top: 10px;
                    margin-bottom: 34px;
                    padding: 38px 40px;
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) auto;
                    align-items: center;
                    gap: 30px;
                    border: 1px solid #2c2239;
                    border-radius: 18px;
                    background: #0d1013;
                }

                .landing-home-cta .landing-home-primary { justify-self: end; white-space: nowrap; }

                .landing-home-footer {
                    padding-top: 25px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                    border-top: 1px solid rgba(139, 113, 171, .14);
                    color: #645b6d;
                    font-size: 10px;
                }

                .landing-home-footer strong { color: #c7bed0; font-family: var(--display-font, Georgia, serif); font-size: 16px; font-weight: 400; }
                .landing-home-footer a:hover { color: #fff; }

                @media (max-width: 900px) {
                    .landing-home { --landing-home-content: min(720px, calc(100vw - 36px)); padding-inline: 18px; }
                    .landing-home-hero { padding: 100px 0 90px; }
                    .landing-home-products { grid-template-columns: 1fr; }
                    .landing-home-explore-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                }

                @media (max-width: 620px) {
                    .landing-home { --landing-home-content: calc(100vw - 28px); padding-inline: 14px; }
                    .landing-home-nav { min-height: 64px; }
                    .landing-home-nav-links { gap: 14px; font-size: 10px; }
                    .landing-home-nav-links > a:not(.landing-home-open) { display: none; }
                    .landing-home-hero { padding: 76px 0 72px; }
                    .landing-home-hero h1 { font-size: clamp(52px, 17vw, 72px); letter-spacing: -3.5px; }
                    .landing-home-hero p { font-size: 13px; }
                    .landing-home-actions { flex-direction: column; }
                    .landing-home-primary, .landing-home-secondary { width: 100%; }
                    .landing-home-section { padding: 64px 0 76px; }
                    .landing-home-section-heading h2, .landing-home-cta h2 { font-size: clamp(34px, 11vw, 45px); letter-spacing: -1.7px; }
                    .landing-home-product { min-height: 190px; padding: 24px 20px; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 12px; }
                    .landing-home-product h3 { font-size: 27px; }
                    .landing-home-explore-grid { grid-template-columns: 1fr; }
                    .landing-home-cta { grid-template-columns: 1fr; padding: 28px 22px; }
                    .landing-home-cta .landing-home-primary { justify-self: stretch; }
                    .landing-home-footer { align-items: flex-start; flex-direction: column; }
                }

                /* Unified Centry / Apple flagship palette. */
                .landing-home {
                    --landing-bg: #080808;
                    --landing-surface: rgba(13,13,13,.94);
                    --landing-card: #0d0d0d;
                    --landing-line: #2a2a2a;
                    --landing-line-soft: #2a2a2a;
                    --landing-text: #ffffff;
                    --landing-muted: rgba(255,255,255,.78);
                    --landing-muted-2: rgba(255,255,255,.60);
                    --landing-accent: #0071e3;
                    color: var(--landing-text);
                    background: var(--landing-bg);
                }

                .landing-home::before,
                .landing-home::after {
                    display: none !important;
                }

                .landing-home-nav {
                    border-color: rgba(210,210,215,.82) !important;
                    background: rgba(8,8,8,.94) !important;
                    color: var(--landing-text) !important;
                    backdrop-filter: blur(20px) saturate(150%);
                    -webkit-backdrop-filter: blur(20px) saturate(150%);
                }

                .landing-home-nav a,
                .landing-home-nav span {
                    color: var(--landing-muted) !important;
                }

                .landing-home-nav .landing-home-open,
                .landing-home-primary {
                    border-color: var(--landing-accent) !important;
                    background: var(--landing-accent) !important;
                    color: #fff !important;
                }

                .landing-home-primary:hover {
                    background: #0066cc !important;
                }

                .landing-home-secondary,
                .landing-home-product,
                .landing-home-explore-card {
                    border-color: var(--landing-line) !important;
                    background: var(--landing-card) !important;
                    color: var(--landing-text) !important;
                    box-shadow: 0 2px 10px rgba(0,0,0,.025);
                }

                .landing-home-secondary:hover,
                .landing-home-product:hover,
                .landing-home-explore-card:hover {
                    border-color: rgba(255,255,255,.38) !important;
                    background: #0d0d0d !important;
                    transform: none !important;
                }

                .landing-home-hero h1,
                .landing-home-section-heading h2,
                .landing-home-cta h2,
                .landing-home-product h3,
                .landing-home-explore-card h3 {
                    color: var(--landing-text) !important;
                }

                .landing-home-hero p,
                .landing-home-section-heading p,
                .landing-home-product p,
                .landing-home-explore-card p {
                    color: var(--landing-muted) !important;
                }

                .landing-home-product-number,
                .landing-home-arrow,
                .landing-home-explore-card > span {
                    color: var(--landing-accent) !important;
                }

                .landing-home-cta {
                    border-color: var(--landing-line) !important;
                    background: #0d0d0d !important;
                }

                .landing-home-footer {
                    border-top-color: var(--landing-line) !important;
                    color: var(--landing-muted-2) !important;
                }

                .landing-home-footer strong {
                    color: var(--landing-text) !important;
                }

                .landing-home-footer a:hover {
                    color: var(--landing-text) !important;
                }

                @media (prefers-reduced-motion: reduce) {
                    .landing-home *,
                    .landing-home *::before,
                    .landing-home *::after {
                        transition-duration: .001ms !important;
                        animation-duration: .001ms !important;
                        animation-iteration-count: 1 !important;
                    }
                }
            `}</style>
        </main>
    );
}
