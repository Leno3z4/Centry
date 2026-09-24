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

      <style jsx global>{`
        .landing-home {
          --lh-bg: #050505;
          --lh-surface: rgba(15,15,15,.72);
          --lh-line: rgba(255,255,255,.12);
          --lh-muted: rgba(255,255,255,.64);
          --lh-dim: rgba(255,255,255,.38);
          --lh-blue: #0a84ff;
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          color: #fff;
          background:
            radial-gradient(circle at 73% 19%, rgba(255,255,255,.075), transparent 23%),
            radial-gradient(circle at 50% 58%, rgba(255,255,255,.025), transparent 38%),
            #050505;
          font-family: Inter, system-ui, sans-serif;
        }
        .landing-home::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(115deg, transparent 0 46%, rgba(255,255,255,.018) 49%, transparent 52% 100%);
          opacity: .65;
        }
        .landing-home-nav {
          position: sticky;
          top: 0;
          z-index: 8;
          width: min(1296px, calc(100% - 48px));
          height: 78px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255,255,255,.1);
          background: linear-gradient(180deg, rgba(5,5,5,.88), rgba(5,5,5,.62));
          backdrop-filter: blur(22px) saturate(130%);
        }
        .landing-home-brand {
          font-size: 18px;
          font-weight: 700;
          letter-spacing: .16em;
        }
        .landing-home-open,
        .landing-home-primary {
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 650;
          transition: transform .2s ease, filter .2s ease, background .2s ease;
        }
        .landing-home-open {
          padding: 0 17px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.055);
        }
        .landing-home-primary {
          padding: 0 22px;
          width: fit-content;
          background: #0a84ff;
          color: #fff;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.25), 0 16px 34px rgba(0,0,0,.25);
        }
        .landing-home-open:hover,
        .landing-home-primary:hover { transform: translateY(-2px); }
        .landing-home-open:hover { background: rgba(255,255,255,.09); }
        .landing-home-primary:hover { filter: brightness(1.08); }

        .landing-home-hero {
          position: relative;
          width: min(1296px, calc(100% - 48px));
          min-height: 680px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(0, .92fr) minmax(420px, 1.08fr);
          align-items: center;
          gap: 20px;
        }
        .landing-home-hero-copy { position: relative; z-index: 3; max-width: 650px; }
        .landing-home-kicker,
        .landing-home-index {
          margin: 0;
          color: var(--lh-dim);
          font: 600 11px/1.3 "DM Mono", monospace;
          letter-spacing: .1em;
        }
        .landing-home-hero h1 {
          max-width: 760px;
          margin: 20px 0 26px;
          font-size: clamp(62px, 7.4vw, 108px);
          line-height: .9;
          letter-spacing: -.065em;
          font-weight: 650;
        }
        .landing-home-hero h1 em,
        .landing-home-final h2 em { color: rgba(255,255,255,.48); font-style: normal; }
        .landing-home-hero-text {
          max-width: 600px;
          margin: 0 0 30px;
          color: var(--lh-muted);
          font-size: 17px;
          line-height: 1.65;
        }

        .landing-home-hero-visual {
          position: relative;
          min-height: 580px;
          display: grid;
          place-items: center;
          isolation: isolate;
        }
        .landing-home-visual-core {
          position: relative;
          z-index: 2;
          width: min(410px, 70vw);
          aspect-ratio: 1;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: radial-gradient(circle at 34% 27%, #f5f5f5 0 1%, #aeb1b4 7%, #37393b 26%, #111 54%, #050505 73%);
          box-shadow:
            inset -34px -38px 70px rgba(0,0,0,.85),
            inset 20px 16px 35px rgba(255,255,255,.2),
            0 0 80px rgba(255,255,255,.08);
          animation: centry-core-float 7s ease-in-out infinite;
        }
        .landing-home-core-ring {
          position: absolute;
          inset: -8%;
          border: 1px solid rgba(255,255,255,.16);
          border-radius: 50%;
          transform: rotateX(68deg) rotateZ(-22deg);
        }
        .ring-b { inset: -18%; transform: rotateX(66deg) rotateZ(52deg); border-color: rgba(255,255,255,.1); }
        .ring-c { inset: -28%; transform: rotateX(70deg) rotateZ(116deg); border-color: rgba(255,255,255,.06); }
        .landing-home-core-light {
          position: absolute;
          inset: 18%;
          border-radius: 50%;
          background: radial-gradient(circle at 32% 28%, rgba(255,255,255,.26), transparent 22%);
          filter: blur(2px);
        }
        .landing-home-core-mark {
          position: relative;
          z-index: 3;
          font-size: clamp(90px, 10vw, 150px);
          font-weight: 650;
          letter-spacing: -.08em;
          color: rgba(255,255,255,.88);
          text-shadow: 0 2px 25px rgba(0,0,0,.8);
        }
        .landing-home-shard-fallback {
          position: absolute;
          inset: 3% -3%;
          z-index: 1;
          opacity: .78;
          filter: blur(.15px);
        }
        .landing-home-shard-fallback i {
          position: absolute;
          left: calc(10% + (var(--i) * 3.2%));
          top: calc(12% + ((var(--i) * 17) % 72) * 1%);
          width: calc(70px + (var(--i) % 5) * 28px);
          height: 2px;
          border-radius: 99px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.55), rgba(255,255,255,.08), transparent);
          transform: rotate(calc(-32deg + (var(--i) % 7) * 4deg));
          animation: centry-shard-drift calc(5.5s + (var(--i) % 5) * .65s) ease-in-out infinite alternate;
          animation-delay: calc(var(--i) * -0.18s);
        }

        .landing-home-proof {
          width: min(1296px, calc(100% - 48px));
          margin: 0 auto;
          padding: 25px 0 27px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          border-top: 1px solid var(--lh-line);
          border-bottom: 1px solid var(--lh-line);
        }
        .landing-home-proof div { padding: 0 25px; border-left: 1px solid var(--lh-line); }
        .landing-home-proof div:first-child { border-left: 0; padding-left: 0; }
        .landing-home-proof strong { display: block; font-size: 12px; letter-spacing: .08em; }
        .landing-home-proof span { display: block; margin-top: 6px; color: var(--lh-dim); font-size: 11px; }

        .landing-home-section,
        .landing-home-final {
          width: min(1152px, calc(100% - 48px));
          margin: 0 auto;
          padding: 140px 0;
        }
        .landing-home-section h2,
        .landing-home-final h2 {
          max-width: 920px;
          margin: 18px 0 18px;
          font-size: clamp(42px, 5vw, 68px);
          line-height: .98;
          letter-spacing: -.055em;
          font-weight: 650;
        }
        .landing-home-section-lede {
          max-width: 760px;
          color: var(--lh-muted);
          font-size: 16px;
          line-height: 1.7;
        }
        .landing-home-flow {
          margin-top: 62px;
          display: grid;
          grid-template-columns: 1fr 70px 1fr 70px 1fr;
          align-items: center;
        }
        .landing-home-flow-item {
          min-height: 176px;
          padding: 25px;
          border: 1px solid var(--lh-line);
          border-radius: 16px;
          background: linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.012));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 20px 60px rgba(0,0,0,.25);
        }
        .landing-home-flow-item > span,
        .landing-home-capability > span { color: var(--lh-dim); font: 11px "DM Mono", monospace; }
        .landing-home-flow-item strong { display: block; margin-top: 26px; font-size: 20px; }
        .landing-home-flow-item p,
        .landing-home-capability p { margin: 10px 0 0; color: var(--lh-muted); font-size: 13px; line-height: 1.65; }
        .landing-home-flow-item > i {
          position: absolute;
          width: 70px;
          height: 1px;
          margin-left: 25px;
          background: linear-gradient(90deg, rgba(255,255,255,.16), transparent);
        }

        .landing-home-capabilities { border-top: 1px solid var(--lh-line); }
        .landing-home-capability-list { margin-top: 48px; border-top: 1px solid var(--lh-line); }
        .landing-home-capability {
          display: grid;
          grid-template-columns: 80px 240px 1fr;
          gap: 25px;
          align-items: start;
          padding: 28px 0;
          border-bottom: 1px solid var(--lh-line);
        }
        .landing-home-capability h3 { margin: 0; font-size: 25px; letter-spacing: -.03em; }
        .landing-home-capability p { margin: 0; max-width: 640px; }

        .landing-home-final {
          position: relative;
          min-height: 470px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          border-top: 1px solid var(--lh-line);
          border-bottom: 1px solid var(--lh-line);
        }
        .landing-home-final::before {
          content: "";
          position: absolute;
          width: 600px;
          height: 260px;
          background: radial-gradient(ellipse, rgba(255,255,255,.08), transparent 70%);
          filter: blur(24px);
          pointer-events: none;
        }
        .landing-home-final > * { position: relative; }
        .landing-home-final h2 { margin: 17px 0 20px; text-align: center; }
        .landing-home-final > p:not(.landing-home-index) { max-width: 580px; margin: 0 0 26px; color: var(--lh-muted); line-height: 1.6; }

        .landing-home-footer {
          width: min(1296px, calc(100% - 48px));
          margin: 0 auto;
          padding: 28px 0 34px;
          display: flex;
          justify-content: space-between;
          gap: 20px;
          color: var(--lh-dim);
          font: 10px "DM Mono", monospace;
          letter-spacing: .06em;
        }

        [data-reveal] { opacity: 0; transform: translateY(24px); transition: opacity .7s ease, transform .7s cubic-bezier(.22,1,.36,1); }
        [data-reveal].is-visible { opacity: 1; transform: translateY(0); }
        @keyframes centry-core-float { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-10px) rotate(1deg); } }
        @keyframes centry-shard-drift { from { opacity: .18; transform: translate3d(-8px,0,0) rotate(-32deg); } to { opacity: .72; transform: translate3d(18px,-8px,0) rotate(-28deg); } }
        @media (prefers-reduced-motion: reduce) {
          .landing-home-visual-core, .landing-home-shard-fallback, .landing-home-shard-fallback i { animation: none !important; }
          [data-reveal] { opacity: 1; transform: none; transition: none; }
        }
        @media (max-width: 900px) {
          .landing-home-hero { grid-template-columns: 1fr; padding: 82px 0 50px; }
          .landing-home-hero-visual { min-height: 480px; margin-top: -30px; }
          .landing-home-hero h1 { font-size: clamp(56px, 13vw, 86px); }
          .landing-home-proof { grid-template-columns: repeat(2,1fr); gap: 20px 0; }
          .landing-home-proof div:nth-child(3) { border-left: 0; }
          .landing-home-flow { grid-template-columns: 1fr; gap: 12px; }
          .landing-home-flow-item > i { display: none; }
          .landing-home-capability { grid-template-columns: 58px 1fr; }
          .landing-home-capability p { grid-column: 2; }
        }
        @media (max-width: 560px) {
          .landing-home-nav, .landing-home-hero, .landing-home-proof, .landing-home-section, .landing-home-final, .landing-home-footer { width: min(100% - 28px, 1296px); }
          .landing-home-nav { height: 68px; }
          .landing-home-hero { min-height: 0; padding-top: 76px; }
          .landing-home-hero-visual { min-height: 360px; }
          .landing-home-visual-core { width: 280px; }
          .landing-home-section, .landing-home-final { padding: 92px 0; }
          .landing-home-footer { flex-direction: column; }
          .landing-home-proof { padding: 20px 0; }
          .landing-home-proof div { padding: 0 14px; }
        }
      `}
    </style>
  );
}
