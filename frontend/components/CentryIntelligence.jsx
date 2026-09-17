'use client';

import { useMemo, useRef, useState } from 'react';
import { buildCentryPositionContext, getLiquidationRisk } from '../lib/agentContext';
import { useCentryPositionEvents } from '../hooks/useCentryPositionEvents';
import CentryExecutionPanel from './CentryExecutionPanel';
import CentryTransactionPreview from './CentryTransactionPreview';
import styles from './CentryIntelligence.module.css';

const SUGGESTED = ['What can I do with my position?', 'Show my borrow capacity', 'What is my market liquidity?'];
function compact(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function money(value) { const n = Number(value); return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'; }

export default function CentryIntelligence({ market, lending, gateway, compact: compactMode = false }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
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
    gatewayAvailableUsdc: gateway?.total,
    gatewayPendingUsdc: gateway?.pendingTotal,
  }), [gateway?.pendingTotal, gateway?.total, lending, market]);
  const liquidation = getLiquidationRisk(lending?.healthFactor);
  const account = lending?.accountPosition;
  const markets = Array.isArray(account?.markets) ? account.markets : [];

  useCentryPositionEvents(() => {
    void lending?.refetchAll?.();
  });

  const resizeInput = () => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
  };

  const ask = async (value) => {
    const next = String(value || '').trim();
    if (!next || loading) return;
    setQuestion(next);
    setAnswer('');
    setPlan(null);
    setLoading(true);
    try {
      await gateway?.refresh?.();
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: next, context }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to analyze the request.');
      setAnswer(result.answer || '');
      setPlan(result.plan || null);
      setQuestion('');
      await lending?.refetchAll?.();
      requestAnimationFrame(() => {
        if (inputRef.current) inputRef.current.style.height = '30px';
      });
    } catch (error) {
      setAnswer(error?.message || 'Unable to analyze the request right now.');
    } finally {
      setLoading(false);
    }
  };

  const onComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!loading && question.trim()) void ask(question);
    }
  };

  return <section className={`${styles.card} ${compactMode ? styles.compactCard : ''}`} aria-label="Centrion assistant">
    {!compactMode ? <div className={styles.header}><div><span className={styles.eyebrow}>Centrion</span><h2>Understand your position</h2><p>Ask about your position or tell Centrion what you want done inside Centry.</p></div>{liquidation.atRisk ? <div className={`${styles.status} ${styles.status_danger}`}><span>Liquidation risk</span><strong>HF {lending.healthFactor}</strong></div> : null}</div> : null}
    {account?.ready && !compactMode ? <div className={styles.snapshot}><div><span>Collateral</span><strong>${money(account.totalCollateralValueUsd)}</strong></div><div><span>Debt</span><strong>${money(account.totalDebtValueUsd)}</strong></div><div><span>Remaining capacity</span><strong>${money(account.remainingBorrowCapacityUsd)}</strong></div><div><span>Markets</span><strong>{markets.length}</strong></div></div> : null}
    {compactMode && liquidation.atRisk ? <div className={styles.compactContext}><span>Liquidation risk</span><strong>HF {lending.healthFactor}</strong></div> : null}
    <div className={styles.chips}>{SUGGESTED.map((item) => <button key={item} type="button" onClick={() => ask(item)} disabled={loading}>{item}</button>)}</div>
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
      <textarea ref={inputRef} value={question} onChange={(event) => { setQuestion(event.target.value); resizeInput(); }} onKeyDown={onComposerKeyDown} placeholder="Ask Centrion or tell it what to do…" aria-label="Ask Centrion" maxLength={500} disabled={loading} rows={1} />
      <button type="submit" disabled={loading || !question.trim()} aria-label="Send">{loading ? '…' : '➤'}</button>
    </form>
    {answer ? <div className={styles.answer} aria-live="polite"><span>Centrion</span><p>{answer}</p></div> : null}
    {plan ? <CentryTransactionPreview plan={plan} context={context} /> : null}
    {plan ? <CentryExecutionPanel plan={plan} onDone={() => setPlan(null)} /> : null}
  </section>;
}
