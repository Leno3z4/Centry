'use client';

import Link from 'next/link';
import { useEffect } from 'react';

const SYSTEM_POINTS = [
  { number: '01', title: 'Owner', text: 'Your smart account remains the authority. Ownership never moves to the agent.' },
  { number: '02', title: 'Policy', text: 'Permissions are scoped by target, function, expiry, and native-value limits.' },
  { number: '03', title: 'Executor', text: 'An authorized operator can prepare bounded actions without receiving the keys.' },
];

const CAPABILITIES = [
  { number: '01', title: 'Lending', text: 'Supply, withdraw, borrow and repay against Centry markets with explicit transaction state.' },
  { number: '02', title: 'Swap', text: 'Use the configured CENT / USDC UnitFlow route with minimum-output protection.' },
  { number: '03', title: 'Agents', text: 'Connect an external agent to one Centry account while the smart-account policy stays final.' },
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
          <p className="landing-home-kicker">ONCHAIN CAPITAL / CONTROLLED EXECUTION</p>
          <h1>Your wallet.<br />Your agent.<br /><em>Your rules.</em></h1>
          <p className="landing-home-hero-text">
            Centry is a wallet-owned execution layer on Arc Mainnet. Smart accounts keep
            ownership with you while scoped operators handle only the actions you authorize.
          </p>
          <Link href="/app" className="landing-home-primary">Open app <span aria-hidden="true">↗</span></Link>
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
            {Array.from({ length: 28 }, (_, index) => <i key={index} style={{ '--i': index }} />)}
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
        <p className="landing-home-index">01 / THE BOUNDARY</p>
        <h2>The agent never becomes the owner.</h2>
        <p className="landing-home-section-lede">
          Centry separates ownership from execution: your smart account stays yours;
          an operator receives only the policy you deliberately put onchain.
        </p>
        <div className="landing-home-flow">
          {SYSTEM_POINTS.map((item, index) => (
            <div className="landing-home-flow-item" key={item.number}>
              <span>{item.number}</span>
              <strong>{item.title}</strong>
              <p>{item.text}</p>
              {index < SYSTEM_POINTS.length - 1 ? <i aria-hidden="true" /> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="landing-home-section landing-home-capabilities" data-reveal>
        <p className="landing-home-index">02 / WHAT IT DOES</p>
        <h2>Capital tools, without the product soup.</h2>
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
        <p className="landing-home-index">03 / START AT THE CONTROL SURFACE</p>
        <h2>Move capital.<br /><em>Keep control.</em></h2>
        <p>Connect a wallet, define the execution boundary, and enter the application.</p>
        <Link href="/app" className="landing-home-primary">Open app <span aria-hidden="true">↗</span></Link>
      </section>

      <footer className="landing-home-footer">
        <span>CENTRY</span>
        <span>Onchain capital / controlled execution</span>
        <span>Arc Mainnet</span>
      </footer>
  );
}
