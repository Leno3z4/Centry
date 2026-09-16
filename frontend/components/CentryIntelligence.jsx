'use client';

import { useMemo, useState } from 'react';
import { buildCentryPositionContext, getPositionRisk } from '../lib/agentContext';
import styles from './CentryIntelligence.module.css';

const SUGGESTED = [
  'Can I safely borrow more?',
  'How healthy is my position?',
  'How much liquidity is available?',
];

function compact(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
}

export default function CentryIntelligence({ market, lending }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);

  const context = useMemo(() => buildCentryPositionContext({
    marketSymbol: market?.symbol,
    walletBalance: lending?.walletBalance,
    supplied: lending?.supplyBalance,
    borrowed: lending?.borrowBalance,
    borrowLimit: lending?.borrowLimit,
    healthFactor: lending?.healthFactor,
    marketLiquidity: lending?.reserveData?.totalLiquidity,
    marketBorrowed: lending?.reserveData?.totalBorrows,
    utilization: lending?.reserveData?.utilization,
    accountPosition: lending?.accountPosition,
  }), [lending, market]);

  const risk = getPositionRisk(lending?.healthFactor);
  const account = lending?.accountPosition;
  const markets = Array.isArray(account?.markets) ? account.markets : [];

  const ask = async (value) => {
    const nextQuestion = String(value || '').trim();
    if (!nextQuestion || loading) return;
    setQuestion(nextQuestion);
    setAnswer('');
    setLoading(true);
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: nextQuestion, context }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to analyze the position.');
      setAnswer(result.answer || 'No analysis was returned.');
    } catch (error) {
      setAnswer(error?.message || 'Unable to analyze the position right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={styles.card} aria-label="Centry Intelligence">
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Centry Intelligence</span>
          <h2>Understand your position</h2>
          <p>Ask about risk, borrowing capacity, or market liquidity using your current onchain data.</p>
        </div>
        <div className={`${styles.status} ${styles[`status_${risk.level}`]}`}>
          <span>{risk.label}</span>
          {Number.isFinite(compact(lending?.healthFactor)) ? <strong>{lending.healthFactor}</strong> : null}
        </div>
      </div>

      {account?.ready ? (
        <div className={styles.snapshot} aria-label="Account snapshot">
          <div><span>Collateral</span><strong>${money(account.totalCollateralValueUsd)}</strong></div>
          <div><span>Debt</span><strong>${money(account.totalDebtValueUsd)}</strong></div>
          <div><span>Remaining capacity</span><strong>${money(account.remainingBorrowCapacityUsd)}</strong></div>
          <div><span>Markets</span><strong>{markets.length}</strong></div>
        </div>
      ) : null}

      <div className={styles.chips}>
        {SUGGESTED.map((item) => (
          <button key={item} type="button" onClick={() => ask(item)} disabled={loading}>{item}</button>
        ))}
      </div>

      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask Centry about your position…"
          aria-label="Ask Centry Intelligence"
          maxLength={500}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !question.trim()}>{loading ? 'Analyzing…' : 'Ask'}</button>
      </form>

      {answer ? <div className={styles.answer} aria-live="polite"><span>Analysis</span><p>{answer}</p></div> : null}
    </section>
  );
}
