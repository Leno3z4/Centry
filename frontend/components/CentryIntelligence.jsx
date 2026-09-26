'use client';

import { useMemo, useRef, useState } from 'react';
import { buildCentryPositionContext, getLiquidationRisk } from '../lib/agentContext';
import { useCentryPositionEvents } from '../hooks/useCentryPositionEvents';
import CentryExecutionPanel from './CentryExecutionPanel';
import CentryTransactionPreview from './CentryTransactionPreview';
import styles from './CentryIntelligence.module.css';

const SUGGESTED = ['What is Centry?', 'Show my position', 'What can you do for me?', 'Explain Centry security'];
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

  useCentryPositionEvents(() => { void lending?.refetchAll?.(); });

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
      requestAnimationFrame(() => { if (inputRef.current) inputRef.current.style.height = '30px'; });
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

  return <section className={`${styles.card} ${compactMode ? styles.compactCard : ''}`} aria-label="Cask assistant">
    {!compactMode ? <div className={styles.header}><div><span className={styles.eyebrow}>Cask</span><h2>Ask anything about Centry</h2><p>Get answers from Centry data, or ask Cask to prepare a supported transaction.</p></div>{liquidation.atRisk ? <div className={`${styles.status} ${styles.status_danger}`}><span>Liquidation risk</span><strong>HF {lending.healthFactor}</strong></div> : null}</div> : null}
    {account?.ready && !compactMode ? <div className={styles.snapshot}><div><span>Collateral</span><strong>${money(account.totalCollateralValueUsd)}</strong></div><div><span>Debt</span><strong>${money(account.totalDebtValueUsd)}</strong></div><div><span>Remaining capacity</span><strong>${money(account.remainingBorrowCapacityUsd)}</strong></div><div><span>Markets</span><strong>{markets.length}</strong></div></div> : null}
    {compactMode && liquidation.atRisk ? <div className={styles.compactContext}><span>Liquidation risk</span><strong>HF {lending.healthFactor}</strong></div> : null}

    <div className={styles.conversation}>
      <div className={styles.chips}>{SUGGESTED.map((item) => <button key={item} type="button" onClick={() => ask(item)} disabled={loading}>{item}</button>)}</div>
      {answer ? <div className={styles.answer} aria-live="polite"><span>Centrion</span><p>{answer}</p></div> : null}
      {plan ? <CentryTransactionPreview plan={plan} context={context} /> : null}
      {plan ? (
        <CentryExecutionPanel
          plan={plan}
          onDone={() => {
            setPlan(null);
            void lending?.refetchAll?.();
            void gateway?.refresh?.();
          }}
        />
      ) : null}
    </div>

    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
      <textarea ref={inputRef} value={question} onChange={(event) => { setQuestion(event.target.value); resizeInput(); }} onKeyDown={onComposerKeyDown} placeholder="Ask Centrion or tell it what to do…" aria-label="Ask Centrion" maxLength={500} disabled={loading} rows={1} />
      <button type="submit" disabled={loading || !question.trim()} aria-label="Send">{loading ? '…' : '➤'}</button>
    </form>
  </section>;
}
