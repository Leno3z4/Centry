'use client';

import Link from 'next/link';
import { useEffect } from 'react';

const ACCOUNT_FLOW = [
  { number: '01', title: 'Own', text: 'Your smart account stays under your control.' },
  { number: '02', title: 'Define', text: 'Choose the action, the contract, and how long the permission lasts.' },
  { number: '03', title: 'Execute', text: 'Actions outside those rules are rejected.' },
];

const CAPABILITIES = [
  {
    number: '01',
    title: 'Lending',
    text: 'Supply supported assets, borrow against a position, repay debt, or withdraw available liquidity.',
  },
  {
    number: '02',
    title: 'Swaps',
    text: 'Swap USDC through the configured UnitFlow route, with a minimum output set before signing.',
  },
  {
    number: '03',
    title: 'Account',
    text: 'Keep positions and transaction authority under a wallet-owned smart account with explicit rules.',
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
          <h1>Lend. Swap. Yield. Automate.</h1>
          <p className="landing-home-hero-text">
            Centry gives you one place to manage USDC lending and execution on Arc. Supply or borrow USDC, repay when you need to, withdraw available liquidity, or use the configured swap route. Your smart account stays under your control.
          </p>
          <Link href="/app" className="landing-home-primary">Open app</Link>
        </div>

        <div className="landing-home-hero-visual" aria-hidden="true">
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

      <section className="landing-home-section landing-home-overview" data-reveal>
        <div className="landing-home-section-main">
          <h2>Manage your positions with USDC and other collateralized assets.</h2>
          <p className="landing-home-section-lede">
            Supply USDC and see the position build. Borrow against it when you need liquidity. Repay the debt, then withdraw what is available. Use the configured execution route without leaving the account.
          </p>
        </div>
        <div className="landing-home-overview-note">
          <span>ARC</span>
          <p>
            The account owner keeps control. Permissions can be used when another signer needs to act.
          </p>
        </div>
      </section>

      <section className="landing-home-section landing-home-capabilities" data-reveal>
        <h2>Everything starts with your account.</h2>
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
          <h2>The rules live with the account.</h2>
          <p className="landing-home-section-lede">
            The account owner can set who may act, which contract they may call, which function they may use, how long the permission lasts, and how much native value it can move. A call outside those rules is rejected.
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
        <h2>Open Centry.</h2>
        <p>Connect a wallet, choose an account, and start working with your positions on Arc.</p>
        <Link href="/app" className="landing-home-primary">Open app</Link>
      </section>

    </main>
  );
}
