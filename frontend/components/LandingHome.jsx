import React, { useEffect } from 'react';
import Link from 'next/link';
import CentryCoin from './CentryCoin';

const SYSTEM_POINTS = [
  { number: '01', title: 'Connect', text: 'Your wallet remains the owner and the source of authorization.' },
  { number: '02', title: 'Set boundaries', text: 'Define what an agent is allowed to do before it can act.' },
  { number: '03', title: 'Let it run', text: 'The runner executes permitted actions without taking ownership of the wallet.' },
];

const PRODUCTS = [
  { title: 'Swap', text: 'A focused trading flow built around quotes, routes, confirmation, and clear transaction state.' },
  { title: 'Markets', text: 'Supply, borrow, and monitor positions from a single market workspace.' },
  { title: 'Automation', text: 'Turn repeatable onchain work into controlled execution through wallet-owned smart accounts.' },
];

const EXPLORE = [
  ['Bridge', 'Move supported assets between networks.'],
  ['Portfolio', 'Keep positions, balances, and activity in view.'],
  ['Analytics', 'Read protocol and market activity without leaving the workspace.'],
];

export default function LandingHome() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll('[data-reveal]'));
    if (!nodes.length) return undefined;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const nav = document.querySelector('.landing-home-nav');
    if (!nav) return undefined;

    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <main className="landing-home">
      <div className="landing-home-noise" aria-hidden="true" />
      <div className="landing-home-light landing-home-light-a" aria-hidden="true" />
      <div className="landing-home-light landing-home-light-b" aria-hidden="true" />

      <nav className="landing-home-nav">
        <Link href="/" className="landing-home-brand" aria-label="Centry home">Centry</Link>
        <Link href="/app" className="landing-home-open">Open app</Link>
      </nav>

      <section className="landing-home-hero">
        <div className="landing-home-hero-copy" data-reveal>
          <p className="landing-home-status">ONCHAIN CAPITAL + CONTROLLED AUTOMATION</p>
          <h1>Your wallet.<br /><span>Your agent.</span><br />Your rules.</h1>
          <p className="landing-home-hero-text">
            Centry gives you a place to move capital, use lending markets, and run
            wallet-owned automation within permissions you define onchain.
          </p>
          <Link href="/app" className="landing-home-primary">
            Open app <span aria-hidden="true">↗</span>
          </Link>
        </div>

        <div className="landing-home-hero-art" aria-hidden="true">
          <div className="landing-home-orbit landing-home-orbit-one" />
          <div className="landing-home-orbit landing-home-orbit-two" />
          <div className="landing-home-orbit landing-home-orbit-three" />
          <div className="landing-home-coin coin-main"><CentryCoin label="USDC" mark="$" /></div>
          <div className="landing-home-coin coin-side coin-side-a"><CentryCoin label="USD" mark="$" /></div>
          <div className="landing-home-coin coin-side coin-side-b"><CentryCoin label="SWAP" mark="↗" /></div>
          <div className="landing-home-hero-glint" />
        </div>
      </section>

      <section className="landing-home-proof" data-reveal>
        <div><strong>Arc Mainnet</strong><span>Live network</span></div>
        <div><strong>Wallet-owned</strong><span>Account ownership</span></div>
        <div><strong>Onchain limits</strong><span>Permission boundaries</span></div>
        <div><strong>Controlled execution</strong><span>Automation layer</span></div>
      </section>

      <section className="landing-home-section landing-home-system">
        <div className="landing-home-section-heading" data-reveal>
          <span className="landing-home-index">01</span>
          <h2>Automation without handing over the keys.</h2>
          <p>
            The important part is the boundary. Your wallet stays yours while the
            execution layer works inside the permissions you set.
          </p>
        </div>

        <div className="landing-home-system-visual" data-reveal>
          <div className="system-node system-node-owner"><span>OWNER</span><strong>Your wallet</strong></div>
          <div className="system-line system-line-left" />
          <div className="system-boundary"><span>PERMISSION BOUNDARY</span><i /></div>
          <div className="system-line system-line-right" />
          <div className="system-node system-node-agent"><span>EXECUTOR</span><strong>Your agent</strong></div>
        </div>

        <div className="landing-home-steps">
          {SYSTEM_POINTS.map((item) => (
            <article className="landing-home-step" key={item.number} data-reveal>
              <span>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-home-section landing-home-products-section">
        <div className="landing-home-section-heading" data-reveal>
          <span className="landing-home-index">02</span>
          <h2>Capital tools that belong in the same workspace.</h2>
        </div>

        <div className="landing-home-products">
          {PRODUCTS.map((product, index) => (
            <article className="landing-home-product" key={product.title} data-reveal>
              <span className="landing-home-product-number">0{index + 1}</span>
              <div className="landing-home-product-art" aria-hidden="true">
                {index === 0 ? <CentryCoin label="SWAP" mark="↔" /> : null}
                {index === 1 ? <div className="landing-home-bars"><i /><i /><i /><i /></div> : null}
                {index === 2 ? <div className="landing-home-agent-ring"><i /><b>RUN</b></div> : null}
              </div>
              <h3>{product.title}</h3>
              <p>{product.text}</p>
              <div className="landing-home-product-rule" />
            </article>
          ))}
        </div>
      </section>

      <section className="landing-home-section landing-home-explore">
        <div className="landing-home-section-heading" data-reveal>
          <span className="landing-home-index">03</span>
          <h2>Everything around the position.</h2>
        </div>
        <div className="landing-home-explore-grid">
          {EXPLORE.map(([title, text], index) => (
            <article className="landing-home-explore-card" key={title} data-reveal>
              <span>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
              <div className="landing-home-card-arrow" aria-hidden="true">↗</div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-home-final" data-reveal>
        <div className="landing-home-final-orbit" aria-hidden="true"><div /><div /><div /></div>
        <div className="landing-home-final-copy">
          <h2>Move capital.<br />Keep control.</h2>
          <p>A single place for markets, transactions, positions, and bounded automation.</p>
          <Link href="/app" className="landing-home-primary">Open app <span aria-hidden="true">↗</span></Link>
        </div>
      </section>

      <footer className="landing-home-footer">
        <span>Centry</span>
        <span>Onchain capital and controlled automation</span>
        <span>Arc Mainnet</span>
      </footer>
    </main>
  );
}
