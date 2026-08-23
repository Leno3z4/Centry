import React, { useState } from 'react';
import { parseUnits } from 'viem';
import { useVeGovernance } from '../hooks/useVeGovernance';

export function GovernanceCard() {
  const {
    veBalance,
    nextTokenId,
    cntryBalance,
    cntryAllowance,
    rawCntryAllowance,
    approveCNTRY,
    createLock,
    voteForGauge,
    isPending,
    isConfirming,
    isConfirmed,
  } = useVeGovernance();

  const [lockAmount, setLockAmount]   = useState('');
  const [lockWeeks, setLockWeeks]     = useState('52');
  const [tokenId, setTokenId]         = useState('1');
  const [gaugeAddress, setGaugeAddress] = useState('');
  const [voteWeight, setVoteWeight]   = useState('100');

  const busy = isPending || isConfirming;

  // FIX: approve and lock are SEPARATE steps — can't do in one click
  // Step 1: approve CNTRY to VeNFT
  // Step 2: createLock (only after approval confirmed)
  const needsApproval = parseFloat(lockAmount || '0') > parseFloat(cntryAllowance || '0');

  const handleApprove = async () => {
    if (!lockAmount) return;
    await approveCNTRY(lockAmount);
  };

  // FIX: pass durationWeeks (number of weeks) — hook converts to seconds
  const handleLock = async () => {
    if (!lockAmount) return;
    await createLock(lockAmount, parseInt(lockWeeks));
    setLockAmount('');
  };

  // FIX: vote requires tokenId
  const handleVote = async () => {
    if (!gaugeAddress || !voteWeight || !tokenId) return;
    await voteForGauge(tokenId, gaugeAddress, voteWeight);
  };

  return (
    <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', color: '#fff' }}>
      <h2>veGovernance & Gauge Voting</h2>
      <p style={{ color: '#94a3b8', fontSize: '14px' }}>
        Lock CNTRY tokens for veNFT voting power and direct liquidity emissions.
      </p>

      <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', margin: '16px 0', display: 'flex', gap: '24px' }}>
        <div>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>Your veNFTs</span>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#a855f7' }}>{veBalance} NFTs</div>
        </div>
        <div>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>CNTRY Balance</span>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#a855f7' }}>{parseFloat(cntryBalance).toFixed(2)}</div>
        </div>
        <div>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>Next Token ID</span>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#a855f7' }}>#{nextTokenId}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Lock CNTRY */}
        <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px' }}>
          <h4 style={{ marginBottom: '8px' }}>Lock CNTRY → veNFT</h4>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>Balance: {parseFloat(cntryBalance).toFixed(2)} CNTRY</span>
          <input
            type="number"
            placeholder="Amount"
            value={lockAmount}
            onChange={(e) => setLockAmount(e.target.value)}
            style={{ width: '100%', padding: '10px', marginTop: '8px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff', boxSizing: 'border-box' }}
          />
          <select
            value={lockWeeks}
            onChange={(e) => setLockWeeks(e.target.value)}
            style={{ width: '100%', padding: '10px', marginTop: '8px', marginBottom: '12px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff' }}
          >
            <option value="4">1 Month</option>
            <option value="12">3 Months</option>
            <option value="26">6 Months</option>
            <option value="52">1 Year</option>
            <option value="104">2 Years</option>
            <option value="208">4 Years (max power)</option>
          </select>

          {/* FIX: Two separate buttons — approve first, then lock */}
          {needsApproval ? (
            <button
              onClick={handleApprove}
              disabled={busy || !lockAmount}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#eab308', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer', marginBottom: '8px' }}
            >
              {busy ? 'Waiting...' : '1. Approve CNTRY'}
            </button>
          ) : (
            <button
              onClick={handleLock}
              disabled={busy || !lockAmount}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#a855f7', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer', marginBottom: '8px' }}
            >
              {busy ? 'Waiting...' : '2. Lock & Mint veNFT'}
            </button>
          )}

          {isConfirmed && (
            <p style={{ color: '#34d399', fontSize: '12px', marginTop: '4px' }}>
              ✓ Done! Your veNFT token ID is #{nextTokenId - 1}
            </p>
          )}
        </div>

        {/* Vote */}
        <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px' }}>
          <h4 style={{ marginBottom: '8px' }}>Cast Gauge Vote</h4>

          {/* FIX: tokenId input — user needs to specify WHICH NFT is voting */}
          <label style={{ fontSize: '12px', color: '#94a3b8' }}>Your Token ID</label>
          <input
            type="number"
            placeholder="1"
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value)}
            style={{ width: '100%', padding: '10px', marginTop: '4px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff', boxSizing: 'border-box' }}
          />

          <label style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px', display: 'block' }}>Gauge Address</label>
          <input
            type="text"
            placeholder="0x..."
            value={gaugeAddress}
            onChange={(e) => setGaugeAddress(e.target.value)}
            style={{ width: '100%', padding: '10px', marginTop: '4px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff', boxSizing: 'border-box' }}
          />

          <label style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px', display: 'block' }}>Weight (0–100)</label>
          <input
            type="number"
            placeholder="100"
            value={voteWeight}
            onChange={(e) => setVoteWeight(e.target.value)}
            style={{ width: '100%', padding: '10px', marginTop: '4px', marginBottom: '12px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff', boxSizing: 'border-box' }}
          />

          <button
            onClick={handleVote}
            disabled={busy || !gaugeAddress || !tokenId}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#0ea5e9', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
          >
            {busy ? 'Waiting...' : 'Vote Gauge Weight'}
          </button>

          <p style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
            Use POOL address for lending pool gauge or VAULT address for vault gauge.
          </p>
        </div>
      </div>
    </div>
  );
}
