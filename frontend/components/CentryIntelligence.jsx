'use client';
import { useMemo, useState } from 'react';
import { buildCentryPositionContext, getPositionRisk } from '../lib/agentContext';
import CentryExecutionPanel from './CentryExecutionPanel';
import styles from './CentryIntelligence.module.css';
const SUGGESTED=['Can I safely borrow more?','How healthy is my position?','How much liquidity is available?'];
function compact(value){const n=Number(value);return Number.isFinite(n)?n:0;} function money(value){const n=Number(value);return Number.isFinite(n)?n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):'—';}
export default function CentryIntelligence({market,lending,compact:compactMode=false}){
 const [question,setQuestion]=useState('');const [answer,setAnswer]=useState('');const [plan,setPlan]=useState(null);const [loading,setLoading]=useState(false);
 const context=useMemo(()=>buildCentryPositionContext({marketSymbol:market?.symbol,walletBalance:lending?.walletBalance,supplied:lending?.supplyBalance,borrowed:lending?.borrowBalance,borrowLimit:lending?.borrowLimit,healthFactor:lending?.healthFactor,marketLiquidity:lending?.reserveData?.totalLiquidity,marketBorrowed:lending?.reserveData?.totalBorrows,utilization:lending?.reserveData?.utilization,accountPosition:lending?.accountPosition}),[lending,market]);
 const risk=getPositionRisk(lending?.healthFactor);const account=lending?.accountPosition;const markets=Array.isArray(account?.markets)?account.markets:[];
 const ask=async(value)=>{const next=String(value||'').trim();if(!next||loading)return;setQuestion(next);setAnswer('');setPlan(null);setLoading(true);try{const response=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:next,context})});const result=await response.json().catch(()=>({}));if(!response.ok||!result.success)throw new Error(result.error||'Unable to analyze the request.');setAnswer(result.answer||'No analysis was returned.');setPlan(result.plan||null);}catch(error){setAnswer(error?.message||'Unable to analyze the request right now.');}finally{setLoading(false);}};
 return <section className={`${styles.card} ${compactMode?styles.compactCard:''}`} aria-label="Centrion assistant">
 {!compactMode?<div className={styles.header}><div><span className={styles.eyebrow}>Centrion</span><h2>Understand your position</h2><p>Ask about your position or tell Centrion what you want done inside Centry.</p></div><div className={`${styles.status} ${styles[`status_${risk.level}`]}`}><span>{risk.label}</span>{Number.isFinite(compact(lending?.healthFactor))?<strong>{lending.healthFactor}</strong>:null}</div></div>:null}
 {account?.ready&&!compactMode?<div className={styles.snapshot}><div><span>Collateral</span><strong>${money(account.totalCollateralValueUsd)}</strong></div><div><span>Debt</span><strong>${money(account.totalDebtValueUsd)}</strong></div><div><span>Remaining capacity</span><strong>${money(account.remainingBorrowCapacityUsd)}</strong></div><div><span>Markets</span><strong>{markets.length}</strong></div></div>:null}
 {compactMode?<div className={styles.compactContext}><span>{risk.label}</span><strong>{Number.isFinite(compact(lending?.healthFactor))?`HF ${lending.healthFactor}`:'Position data loading'}</strong></div>:null}
 <div className={styles.chips}>{SUGGESTED.map((item)=><button key={item} type="button" onClick={()=>ask(item)} disabled={loading}>{item}</button>)}</div>
 <form className={styles.form} onSubmit={(event)=>{event.preventDefault();void ask(question);}}><input value={question} onChange={(event)=>setQuestion(event.target.value)} placeholder="Ask Centrion or tell it what to do…" aria-label="Ask Centrion" maxLength={500} disabled={loading}/><button type="submit" disabled={loading||!question.trim()}>{loading?'Working…':'Ask'}</button></form>
 {answer?<div className={styles.answer} aria-live="polite"><span>Centrion</span><p>{answer}</p></div>:null}
 {plan?<CentryExecutionPanel plan={plan} onDone={()=>setPlan(null)}/>:null}
 </section>;
}
