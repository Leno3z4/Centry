import React, { useState } from 'react';
import { useSelfRepayingVault } from '../hooks/useSelfRepayingVault';

export function VaultCard() {
  const { 
    vaultData, 
    usycBalance, 
    usycAllowance, 
    rawUsycAllowance, 
    approveUSYC, 
    depositCollateral, 
    withdrawCollateral, 
    borrow, 
    repay, 
    refetchAll, 
    isPending, 
    isConfirming, 
    isConfirmed 
  } = useSelfRepayingVault();

  const [depositAmount, setDepositAmount] = useState('');
  const [borrowAmount, setBorrowAmount] = useState('');
  const [repayAmount, setRepayAmount] = useState('');

  const needsApproval = parseFloat(depositAmount || '0') > parseFloat(usycAllowance || '0');

  const handleDeposit = async () => {
    if (!depositAmount) return;
    if (needsApproval) {
      await approveUSYC(depositAmount);
    } else {
      await depositCollateral(depositAmount);
      setDepositAmount('');
    }
  };

  const handleBorrow = async () => {
    if (!borrowAmount) return;
    await borrow(borrowAmount);
    setBorrowAmount('');
  };

  const handleRepay = async () => {
    if (!repayAmount) return;
    await repay(repayAmount);
    setRepayAmount('');
  };

  return (
    <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', color: '#fff' }}>
      <h2>Self-Repaying Vault (USYC Collateral)</h2>
      <p style={{ color: '#94a3b8', fontSize: '14px' }}>
        Deposit USYC collateral to borrow USDC credit. Yield automatically repays your debt over time.
      </p>

      {/* Vault Statistics Display */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', margin: '20px 0', background: '#0f172a', padding: '16px', borderRadius: '8px' }}>
        <div>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>Collateral (USYC)</span>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#38bdf8' }}>{vaultData?.collateral || '0.00'}</div>
        </div>
        <div>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>Current Debt (USDC)</span>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#f43f5e' }}>{vaultData?.debt || '0.00'}</div>
        </div>
        <div>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>Max Borrow Capacity</span>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#34d399' }}>{vaultData?.maxBorrow || '0.00'}</div>
        </div>
      </div>

      {/* Actions Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Deposit Collateral */}
        <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px' }}>
          <h4>Deposit USYC</h4>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>Wallet Balance: {usycBalance} USYC</span>
          <input 
            type="number" 
            placeholder="0.0" 
            value={depositAmount} 
            onChange={(e) => setDepositAmount(e.target.value)}
            style={{ width: '100%', padding: '10px', marginTop: '8px', marginBottom: '12px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff' }}
          />
          <button 
            onClick={handleDeposit} 
            disabled={isPending || isConfirming}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: needsApproval ? '#eab308' : '#2563eb', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
          >
            {isPending ? 'Confirming in Wallet...' : isConfirming ? 'Processing Transaction...' : needsApproval ? 'Approve USYC' : 'Deposit Collateral'}
          </button>
        </div>

        {/* Borrow USDC */}
        <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px' }}>
          <h4>Borrow USDC</h4>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>Available: {vaultData?.maxBorrow || '0.00'} USDC</span>
          <input 
            type="number" 
            placeholder="0.0" 
            value={borrowAmount} 
            onChange={(e) => setBorrowAmount(e.target.value)}
            style={{ width: '100%', padding: '10px', marginTop: '8px', marginBottom: '12px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff' }}
          />
          <button 
            onClick={handleBorrow} 
            disabled={isPending || isConfirming}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#10b981', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
          >
            {isPending ? 'Confirming in Wallet...' : isConfirming ? 'Processing...' : 'Borrow USDC'}
          </button>
        </div>
      </div>
    </div>
  );
}
