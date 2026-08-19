import React, { useState } from 'react';
import { useVeGovernance } from '../hooks/useVeGovernance';

export function GovernanceCard() {
  const { veBalance, approveStakingToken, createLock, voteForGauge, isPending, isConfirming } = useVeGovernance();
  const [lockAmount, setLockAmount] = useState('');
  const [lockWeeks, setLockWeeks] = useState('52');
  const [gaugeAddress, setGaugeAddress] = useState('');
  const [voteWeight, setVoteWeight] = useState('100');

  const handleLock = async () => {
    if (!lockAmount) return;
    await approveStakingToken(lockAmount);
    const unlockTime = Math.floor(Date.now() / 1000) + (parseInt(lockWeeks) * 7 * 24 * 3600);
    await createLock(lockAmount, unlockTime);
    setLockAmount('');
  };

  const handleVote = async () => {
    if (!gaugeAddress || !voteWeight) return;
    await voteForGauge(gaugeAddress, voteWeight);
  };

  return (
    <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', color: '#fff' }}>
      <h2>veGovernance & Gauge Voting</h2>
      <p style={{ color: '#94a3b8', fontSize: '14px' }}>Lock tokens for veNFT voting power and direct liquidity emissions.</p>

      <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', margin: '16px 0' }}>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>Your veNFT Positions</span>
        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#a855f7' }}>{veBalance} NFTs</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Create Lock */}
        <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px' }}>
          <h4>Lock Tokens</h4>
          <input 
            type="number" 
            placeholder="Amount" 
            value={lockAmount} 
            onChange={(e) => setLockAmount(e.target.value)}
            style={{ width: '100%', padding: '10px', marginTop: '8px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff' }}
          />
          <select 
            value={lockWeeks} 
            onChange={(e) => setLockWeeks(e.target.value)}
            style={{ width: '100%', padding: '10px', marginTop: '8px', marginBottom: '12px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff' }}
          >
            <option value="12">3 Months</option>
            <option value="26">6 Months</option>
            <option value="52">1 Year</option>
            <option value="104">2 Years</option>
          </select>
          <button 
            onClick={handleLock} 
            disabled={isPending || isConfirming}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#a855f7', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Lock & Mint veNFT
          </button>
        </div>

        {/* Gauge Vote */}
        <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px' }}>
          <h4>Cast Gauge Vote</h4>
          <input 
            type="text" 
            placeholder="Gauge Contract Address (0x...)" 
            value={gaugeAddress} 
            onChange={(e) => setGaugeAddress(e.target.value)}
            style={{ width: '100%', padding: '10px', marginTop: '8px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff' }}
          />
          <input 
            type="number" 
            placeholder="Weight (e.g. 100)" 
            value={voteWeight} 
            onChange={(e) => setVoteWeight(e.target.value)}
            style={{ width: '100%', padding: '10px', marginTop: '8px', marginBottom: '12px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff' }}
          />
          <button 
            onClick={handleVote} 
            disabled={isPending || isConfirming}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#0ea5e9', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Vote Gauge Weight
          </button>
        </div>
      </div>
    </div>
  );
}
