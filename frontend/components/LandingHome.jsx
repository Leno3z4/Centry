'use client';

import React from 'react';
import Link from 'next/link';

const PRODUCTS = [
    {
        number: '01',
        title: 'Swap',
        text: 'Trade supported assets through Centry with a clear route and execution flow.',
        href: '/app/swap',
    },
    {
        number: '02',
        title: 'Markets',
        text: 'Supply liquidity, borrow against supported collateral, and manage your position.',
        href: '/app/markets',
    },
    {
        number: '03',
        title: 'Rewards',
        text: 'Track incentives and the rewards connected to your participation in the protocol.',
        href: '/app/rewards',
    },
    {
        number: '04',
        title: 'Governance',
        text: 'Lock CENT into veCENT, build voting power, and participate in protocol decisions.',
        href: '/app/governance',
    },
];

const EXPLORE = [
    ['Pools', 'Discover liquidity across the ecosystem.', '/app/pools'],
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
                <div className="landing-home-kicker">DECENTRALIZED FINANCE, IN ONE PLACE</div>
                <h1>Your DeFi hub.</h1>
                <p>
                    Swap, lend, earn rewards, and help govern Centry.
                </p>
                <div className="landing-home-actions">
                    <Link href="/app" className="landing-home-primary">Enter Centry</Link>
                    <a href="#products" className="landing-home-secondary">Explore</a>
                </div>
            </section>

            <section id="products" className="landing-home-section">
                <div className="landing-home-section-heading">
                    <h2>Swap · Markets · Rewards · Governance</h2>
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
                    <p>Pools · Bridge · Portfolio · Analytics</p>
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
                    <p>Centry keeps the primary DeFi actions close and the rest of the ecosystem within reach.</p>
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
                    background: #090711;
                    color: var(--text);
                    isolation: isolate;
                }

                .landing-home-glow {
                    position: absolute;
                    top: -180px;
                    left: 50%;
                    width: 720px;
                    height: 520px;
                    transform: translateX(-50%);
                    background: radial-gradient(circle, rgba(168, 85, 247, .12), transparent 68%);
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
                    border: 1px solid rgba(161, 128, 193, .32);
                    border-radius: 999px;
                    color: #eee7f3 !important;
                    background: rgba(109, 71, 145, .16);
                }

                .landing-home-hero {
                    padding: 130px 0 120px;
                    text-align: center;
                }

                .landing-home-kicker,
                .landing-home-section-heading > span,
                .landing-home-cta > div > span {
                    color: #806d91;
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
                }

                .landing-home-hero p {
                    max-width: 610px;
                    margin: 0 auto;
                    color: #aaa0b1;
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
                    border: 1px solid rgba(192, 155, 223, .45);
                    background: #b06ce9;
                    color: #130b1a;
                    font-weight: 600;
                }

                .landing-home-primary:hover { filter: brightness(1.08); }

                .landing-home-secondary {
                    border: 1px solid #33283e;
                    background: rgba(20, 14, 27, .72);
                    color: #d1c7d8;
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
                    min-height: 235px;
                    position: relative;
                    display: grid;
                    grid-template-columns: 42px minmax(0, 1fr) auto;
                    gap: 20px;
                    padding: 30px;
                    border-right: 1px solid rgba(139, 113, 171, .18);
                    border-bottom: 1px solid rgba(139, 113, 171, .18);
                    background: rgba(16, 11, 23, .5);
                    transition: background .18s ease, border-color .18s ease, transform .18s ease;
                }

                .landing-home-product:hover {
                    background: rgba(28, 18, 39, .72);
                    border-color: rgba(168, 85, 247, .3);
                }

                .landing-home-product-number { color: #6f5b82; font: 10px 'DM Mono', monospace; }
                .landing-home-product h3 { margin: -5px 0 10px; font-family: var(--display-font, Georgia, serif); font-size: 32px; font-weight: 400; letter-spacing: -1px; }
                .landing-home-product p { max-width: 330px; margin: 0; color: #81778b; font-size: 11px; line-height: 1.7; }
                .landing-home-arrow { color: #a27ab8; font-size: 18px; }

                .landing-home-explore { padding-top: 70px; }

                .landing-home-explore-grid {
                    display: grid;
                    grid-template-columns: repeat(4, minmax(0, 1fr));
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
                    background: linear-gradient(135deg, rgba(23, 16, 33, .96), rgba(13, 9, 21, .96));
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
            `}</style>
        </main>
    );
}
