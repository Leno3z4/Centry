import React, { useState } from 'react';
import { useVeGovernance } from '../hooks/useVeGovernance';

export function GovernanceCard() {
  const { configured, veBalance, tokenId, votingPower, lockedAmount, lockEnd, centryBalance, centryAllowance, approveCENT, createLock, increaseLock, extendLock, isPending, isConfirming, error } = useVeGovernance();
  const [amount, setAmount] = useState('');
  const [weeks, setWeeks] = useState('52');
  const busy = isPending || isConfirming;
  const needsApproval = Number(amount || 0) > Number(centryAllowance || 0);

  const lock = async () => {
    if (!amount) return;
    if (needsApproval) return approveCENT(amount);
    await createLock(amount, weeks);
    setAmount('');
  };
  if (!configured) return <div className="panel"><span className="section-kicker">GOVERNANCE</span><h2>veCENT</h2><p>Deploy the CENT token and vote-escrow contract, then add their addresses to the frontend environment.</p></div>;
  return <div className="panel feature-panel purple" id="governance">
    <span className="section-kicker">GOVERNANCE</span><h2>veCENT</h2>
    <p>Lock CENT for time-decaying voting power. The MVP uses one non-transferable veCENT position per wallet.</p>
    <div className="rate-strip"><span>CENT balance</span><strong>{Number(centryBalance).toLocaleString()}</strong><span>Locked</span><strong>{Number(lockedAmount).toLocaleString()}</strong><span>Power</span><strong>{Number(votingPower).toLocaleString()}</strong></div>
    <div style={{ marginTop: 16 }}><input type="number" min="0" step="1" placeholder="CENT amount" value={amount} onChange={e => setAmount(e.target.value)} style={{ width:'100%', boxSizing:'border-box', padding:12, borderRadius:8 }} />
    <select value={weeks} onChange={e => setWeeks(e.target.value)} style={{ width:'100%', padding:12, marginTop:8, borderRadius:8 }}><option value="1">1 week</option><option value="26">26 weeks</option><option value="52">52 weeks</option><option value="104">104 weeks</option></select>
    <button className="primary-btn" onClick={lock} disabled={busy || !amount} style={{ marginTop:10, width:'100%' }}>{busy ? 'Confirming…' : needsApproval ? 'Approve CENT' : 'Lock CENT'}</button></div>
    {tokenId > 0 && <p style={{ fontSize:12, color:'#94a3b8' }}>veCENT #{tokenId} · unlocks {lockEnd?.toLocaleDateString() || '—'}</p>}
    {error && <p style={{ color:'#f87171', fontSize:12 }}>Transaction failed or was rejected.</p>}
  </div>;
}
