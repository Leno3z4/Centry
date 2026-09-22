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


            <style jsx global>{`
                .landing-home {
                    --landing-home-content: min(1180px, calc(100vw - 48px));
                    position: relative;
                    min-height: 100vh;
                    overflow: hidden;
                    padding: 0 24px 36px;
                    background:
                        radial-gradient(circle at 50% -12%, rgba(255,255,255,.065), transparent 31%),
                        linear-gradient(180deg, #0b0b0b 0%, #080808 28%, #080808 100%);
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
                @media (max-width: 900px) {
                    .landing-home { --landing-home-content: min(720px, calc(100vw - 36px)); padding-inline: 18px; }
                    .landing-home-hero { padding: 100px 0 90px; }
                    .landing-home-products { grid-template-columns: 1fr; }
                    .landing-home-explore-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                }

                @media (max-width: 620px) {
                    .landing-home { --landing-home-content: calc(100vw - 28px); padding-inline: 14px; }
                    .landing-home-nav { padding-inline: 12px; }
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
                    background: linear-gradient(180deg, rgba(255,255,255,.025), rgba(13,13,13,.98) 46%) !important;
                    color: var(--landing-text) !important;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,.035), 0 18px 46px rgba(0,0,0,.22);
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
                    background: linear-gradient(180deg, rgba(255,255,255,.035), rgba(13,13,13,.98) 55%) !important;
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
