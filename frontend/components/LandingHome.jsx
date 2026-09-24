'use client';

import Link from 'next/link';
import { useEffect } from 'react';

const SYSTEM_POINTS = [
  { number: '01', title: 'Own', text: 'Your smart account remains under your control.' },
  { number: '02', title: 'Define', text: 'Set what can move, where it can act, and for how long.' },
  { number: '03', title: 'Execute', text: 'Approved actions can run without extending owner authority.' },
];

const CAPABILITIES = [
  { number: '01', title: 'Lending', text: 'Supply, withdraw, borrow and repay against Centry markets with explicit transaction state.' },
  { number: '02', title: 'Swap', text: 'Use the configured CENT / USDC UnitFlow route with minimum-output protection.' },
  { number: '03', title: 'Automation', text: 'Put repeatable onchain actions on defined rails without changing who controls the account.' },
];

export default function LandingHome() {
  useEffect(() => {
    const nodes = [...document.querySelectorAll('[data-reveal]')];
    if (!nodes.length) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <main className="landing-home">
      <nav className="landing-home-nav">
        <Link href="/" className="landing-home-brand" aria-label="Centry home">CENTRY</Link>
        <Link href="/app" className="landing-home-open">Open app <span aria-hidden="true">↗</span></Link>
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
            {Array.from({ length: 28 }, (_, index) => <i key={index} style={{ '--x': `${10 + index * 3.2}%`, '--y': `${12 + ((index * 17) % 72)}%`, '--w': `${70 + (index % 5) * 28}px`, '--r': `${-32 + (index % 7) * 4}deg`, '--d': `${index * -0.18}s`, '--dur': `${5.5 + (index % 5) * 0.65}s` }} />)}
          </div>
        </div>
      </section>

      <section className="landing-home-proof" data-reveal>
        <div><strong>ARC MAINNET</strong><span>Live network</span></div>
        <div><strong>WALLET-OWNED</strong><span>Account ownership</span></div>
        <div><strong>TARGET / FUNCTION</strong><span>Scoped permissions</span></div>
        <div><strong>EXPIRY + LIMITS</strong><span>Bounded execution</span></div>
      </section>

      <section className="landing-home-section" data-reveal>
        <h2>Capital moves. Your account stays yours.</h2>
        <p className="landing-home-section-lede">
          Centry separates ownership from execution. Your smart account remains the final
          authority while defined permissions determine what can happen onchain.
        </p>
        <div className="landing-home-flow">
          {SYSTEM_POINTS.map((item, index) => (
            <div className="landing-home-flow-item" key={item.number}>
              <span>{item.number}</span>
              <strong>{item.title}</strong>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-home-section landing-home-capabilities" data-reveal>
        <h2>Lend. Swap. Put routine actions on rails.</h2>
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
