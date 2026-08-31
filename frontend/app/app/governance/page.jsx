'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { useVeGovernance } from '../../../hooks/useVeGovernance';

export default function Page() {
  return <Providers><AppShell><GovernanceContent /></AppShell></Providers>;
}

function GovernanceContent() {
  const { isConnected } = useAccount();
  const governance = useVeGovernance();
  const [amount, setAmount] = useState('');
  const [weeks, setWeeks] = useState('52');
  const [notice, setNotice] = useState('');
  const busy = governance.isPending || governance.isConfirming;
  const needsApproval = isConnected && Number(amount || 0) > Number(governance.centAllowance || 0);

  const submit = async () => {
    if (!isConnected || !amount || Number(amount) <= 0 || busy) return;
    try {
      setNotice('');
      if (needsApproval) {
        await governance.approveCENT(amount);
        setNotice(`Approved ${amount} CENT.`);
        return;
      }
      await governance.createLock(amount, weeks);
      await governance.refetchAll();
      setAmount('');
      setNotice('CENT lock confirmed onchain.');
    } catch (error) {
      setNotice(error?.shortMessage || error?.message || 'Transaction failed.');
    }
  };

  return (
    <div className="page-stack">
      <div className="section-header"><div><span className="section-kicker">GOVERNANCE</span><h1>veCENT</h1><p>Lock CENT to create your governance position.</p></div></div>
      <section className="governance-hero-grid">
        <div className="panel governance-hero-card">
          <span className="section-kicker">CURRENT POSITION</span>
          <div className="big-number">{isConnected ? Number(governance.votingPower).toLocaleString(undefined,{maximumFractionDigits:2}) : '—'}</div>
          <span className="muted-label">Voting power</span>
          <div className="governance-stat-line"><span>CENT balance</span><strong>{isConnected ? Number(governance.centBalance).toLocaleString(undefined,{maximumFractionDigits:2}) : '—'}</strong></div>
          <div className="governance-stat-line"><span>Locked CENT</span><strong>{isConnected ? Number(governance.lockedAmount).toLocaleString(undefined,{maximumFractionDigits:2}) : '—'}</strong></div>
          <div className="governance-stat-line"><span>veNFTs</span><strong>{isConnected ? governance.veBalance : '—'}</strong></div>
          <div className="governance-stat-line"><span>Lock end</span><strong>{isConnected && governance.lockEnd ? governance.lockEnd.toLocaleDateString() : '—'}</strong></div>
        </div>
        <div className="panel">
          <span className="section-kicker">CREATE LOCK</span><h2>Lock CENT</h2>
          <p className="panel-copy">Longer locks create more voting power. Your lock is represented by a veCENT position.</p>
          <label className="field-label" htmlFor="cent-amount">CENT amount</label>
          <div className="amount-input-wrap"><input id="cent-amount" type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} /><span>CENT</span></div>
          <label className="field-label" htmlFor="lock-weeks">Lock duration</label>
          <select id="lock-weeks" value={weeks} onChange={(event) => setWeeks(event.target.value)}><option value="4">4 weeks</option><option value="13">13 weeks</option><option value="26">26 weeks</option><option value="52">52 weeks</option></select>
          {!isConnected ? <div className="connect-prompt">Connect your wallet to manage veCENT.</div> : <button type="button" className="primary-btn full-btn large-btn" disabled={busy || !amount} onClick={submit}>{busy ? 'Waiting for confirmation…' : needsApproval ? 'Approve CENT' : `Lock CENT for ${weeks} weeks`}</button>}
          {notice && <div className="notice">{notice}</div>}
        </div>
      </section>
    </div>
  );
}
