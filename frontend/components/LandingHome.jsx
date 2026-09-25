'use client';

import Link from 'next/link';
import { useEffect } from 'react';

const ACCOUNT_FLOW = [
  { number: '01', title: 'Own', text: 'Your smart account remains controlled by your wallet.' },
  { number: '02', title: 'Configure', text: 'Name the agent, choose its actions, and set the limits.' },
  { number: '03', title: 'Execute', text: 'The configured runner can act only inside those permissions.' },
];

const CAPABILITIES = [
  {
    number: '01',
    title: 'Lending',
    text: 'Supply, borrow, repay and withdraw supported assets from one wallet-owned account.',
  },
  {
    number: '02',
    title: 'Swaps',
    text: 'Move supported assets through Centry’s configured routes with transaction limits in place.',
  },
  {
    number: '03',
    title: 'Agents',
    text: 'Give a named agent its own smart-account wallet, strategy, permissions and execution path.',
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
          <div className="landing-home-status">ARC MAINNET · FINANCIAL WORKSPACE</div>
          <h1>DeFi, with your rules.</h1>
          <p className="landing-home-hero-text">
            Centry brings lending, swaps, smart accounts and autonomous execution into one Arc-native workspace. Your wallet stays in control while every action stays inside the rules you define.
          </p>
          <Link href="/app" className="landing-home-primary">Open app</Link>
        </div>

        <div className="landing-home-hero-visual" aria-hidden="true">
          <div className="landing-home-hero-console">
            <div className="landing-home-hero-console-top">
              <span>CENTRY ACCOUNT</span>
              <strong>ARC · 5042</strong>
            </div>
            <h3>One account. Multiple paths.</h3>
            <p>Positions, swaps and autonomous actions share the same wallet-owned execution boundary.</p>
            <div className="landing-home-hero-console-row"><span>Assets</span><strong>Lending + swaps</strong></div>
            <div className="landing-home-hero-console-row"><span>Control</span><strong>Wallet-owned</strong></div>
            <div className="landing-home-hero-console-row"><span>Automation</span><strong>Policy bounded</strong></div>
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

      <section className="landing-home-section landing-home-overview" data-reveal>
        <div className="landing-home-section-main">
          <h2>One account for the work that matters.</h2>
          <p className="landing-home-section-lede">
            Manage lending positions, move supported assets, and hand repetitive execution to named agents without giving up control of the account.
          </p>
        </div>
        <div className="landing-home-overview-note">
          <span>ARC</span>
          <p>
            Your connected wallet remains the owner. Automation never replaces the account’s permission boundary.
          </p>
        </div>
      </section>

      <section className="landing-home-section landing-home-capabilities" data-reveal>
        <h2>Built around the account, not around a dashboard.</h2>
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
          <h2>Give an agent a job, then bound it.</h2>
          <p className="landing-home-section-lede">
            Name the agent, define its strategy, choose the actions and assets it can use, and set the amount limits that apply to each run. The hosted runner can execute the strategy without receiving your owner private key.
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
        <h2>Your account. Your rules.</h2>
        <p>Connect a wallet, manage your positions, and create an agent when you want automation to do the repetitive work.</p>
        <Link href="/app" className="landing-home-primary">Open app</Link>
      </section>

    </main>
  );
}
