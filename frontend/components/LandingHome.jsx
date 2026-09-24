'use client';

import Link from 'next/link';
import { useEffect } from 'react';

const ACCOUNT_FLOW = [
  { number: '01', title: 'Own', text: 'Your smart account remains under your control.' },
  { number: '02', title: 'Define', text: 'Choose what can move, where it can act, and how long access lasts.' },
  { number: '03', title: 'Execute', text: 'Approved actions can run within those boundaries.' },
];

const CAPABILITIES = [
  {
    number: '01',
    title: 'Lending',
    text: 'Supply assets into supported markets, borrow against positions, repay debt, and withdraw when liquidity becomes available.',
  },
  {
    number: '02',
    title: 'Swaps',
    text: 'Move between CENT and USDC through the configured UnitFlow route with a defined minimum output.',
  },
  {
    number: '03',
    title: 'Accounts',
    text: 'Use a smart account where ownership, permissions, and transaction authority are explicit instead of implied.',
  },
  {
    number: '04',
    title: 'Automation',
    text: 'Put repeatable actions on defined rails while the account keeps the final say over what can execute.',
  },
];

export default function LandingHome() {
  useEffect(() => {
    const root = document.querySelector('.landing-home');
    const nodes = [...document.querySelectorAll('[data-reveal]')];
    if (!root || !nodes.length) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let rafId = 0;

    const updateScrollState = () => {
      rafId = 0;
      const viewport = window.innerHeight || 1;
      const pageHeight = Math.max(document.documentElement.scrollHeight - viewport, 1);
      const scrollProgress = Math.min(1, Math.max(0, window.scrollY / pageHeight));
      root.style.setProperty('--landing-scroll', scrollProgress.toFixed(4));

      nodes.forEach((node) => {
        const rect = node.getBoundingClientRect();
        const center = viewport * 0.64;
        const distance = (center - rect.top) / Math.max(rect.height, 1);
        const progress = Math.min(1, Math.max(0, distance));
        node.style.setProperty('--section-progress', progress.toFixed(3));
        if (progress > 0.16 || rect.top < viewport * 0.94) node.classList.add('is-visible');
      });
    };

    const requestUpdate = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(updateScrollState);
    };

    if (reducedMotion.matches) {
      nodes.forEach((node) => {
        node.classList.add('is-visible');
        node.style.setProperty('--section-progress', '1');
      });
      root.style.setProperty('--landing-scroll', '0');
      return undefined;
    }

    requestUpdate();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate, { passive: true });

    return () => {
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <main className="landing-home">
      <div className="landing-home-scroll-line" aria-hidden="true">
        <span />
      </div>

      <nav className="landing-home-nav">
        <Link href="/" className="landing-home-brand" aria-label="Centry home">CENTRY</Link>
        <Link href="/app" className="landing-home-open">Open app</Link>
      </nav>

      <section className="landing-home-hero">
        <div className="landing-home-hero-copy" data-reveal>
          <h1>Onchain capital.<br />Without the noise.</h1>
          <p className="landing-home-hero-text">
            Centry brings lending, swaps, and programmable account permissions into one
            focused interface on Arc Mainnet.
          </p>
          <Link href="/app" className="landing-home-primary">Open app</Link>
        </div>

        <div className="landing-home-hero-visual" aria-hidden="true">
          <div className="landing-home-visual-core">
            <div className="landing-home-core-ring ring-a" />
            <div className="landing-home-core-ring ring-b" />
            <div className="landing-home-core-ring ring-c" />
            <div className="landing-home-core-light" />
            <div className="landing-home-core-mark">C</div>
          </div>
          <div className="landing-home-shard-fallback">
            {Array.from({ length: 28 }, (_, index) => (
              <i
                key={index}
                style={{
                  '--x': `${10 + index * 3.2}%`,
                  '--y': `${12 + ((index * 17) % 72)}%`,
                  '--w': `${70 + (index % 5) * 28}px`,
                  '--r': `${-32 + (index % 7) * 4}deg`,
                  '--d': `${index * -0.18}s`,
                  '--dur': `${5.5 + (index % 5) * 0.65}s`,
                }}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="landing-home-proof" data-reveal>
        <div><strong>ARC MAINNET</strong><span>Live network</span></div>
        <div><strong>WALLET-OWNED</strong><span>Account ownership</span></div>
        <div><strong>LENDING + SWAPS</strong><span>Core capital flows</span></div>
        <div><strong>DEFINED PERMISSIONS</strong><span>Bounded execution</span></div>
      </section>

      <section className="landing-home-section landing-home-overview" data-reveal>
        <div className="landing-home-section-main">
          <h2>A focused place to lend, borrow, swap, and manage an account onchain.</h2>
          <p className="landing-home-section-lede">
            Centry puts the actions that matter into one interface: market positions,
            borrowing and repayment, token swaps, and account-level permissions.
          </p>
        </div>
        <div className="landing-home-overview-note">
          <span>ARC</span>
          <p>
            The product runs around a wallet-owned account. That account remains the authority
            while permissions determine which actions may be carried out.
          </p>
        </div>
      </section>

      <section className="landing-home-section landing-home-capabilities" data-reveal>
        <h2>The pieces fit together.</h2>
        <div className="landing-home-capability-list">
          {CAPABILITIES.map((item) => (
            <article key={item.number} className="landing-home-capability">
              <span>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-home-section landing-home-account" data-reveal>
        <div className="landing-home-section-main">
          <h2>Ownership first. Everything else follows.</h2>
          <p className="landing-home-section-lede">
            Centry separates who owns the account from who is allowed to act through it.
            Rules can be scoped to the operator, target, function, expiry, and native-value limit.
          </p>
        </div>
        <div className="landing-home-flow">
          {ACCOUNT_FLOW.map((item) => (
            <div className="landing-home-flow-item" key={item.number}>
              <span>{item.number}</span>
              <strong>{item.title}</strong>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-home-final" data-reveal>
        <h2>Put your capital to work.</h2>
        <p>Connect a wallet, configure the account, and open Centry.</p>
        <Link href="/app" className="landing-home-primary">Open app</Link>
      </section>

      <footer className="landing-home-footer">
        <span>CENTRY</span>
        <span>Onchain capital / controlled execution</span>
        <span>Arc Mainnet</span>
      </footer>
    </main>
  );
}
