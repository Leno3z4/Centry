import React, { useState } from 'react';
import { useLendingPool } from '../hooks/useLendingPool';

export function LendingCard() {
  const { reserveData, usdcBalance, usdcAllowance, approveUSDC, depositLiquidity, withdrawLiquidity, isPending, isConfirming } = useLendingPool();
  const [amount, setAmount] = useState('');

  const needsApproval = parseFloat(amount || '0') > parseFloat(usdcAllowance || '0');

  const handleSupply = async () => {
    if (!amount) return;
    if (needsApproval) {
      await approveUSDC(amount);
    } else {
      await depositLiquidity(amount);
      setAmount('');
    }
  };

  const handleWithdraw = async () => {
    if (!amount) return;
    await withdrawLiquidity(amount);
    setAmount('');
  };

  return (
    <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', color: '#fff' }}>
      <h2>Lending Pool (USDC)</h2>
      <p style={{ color: '#94a3b8', fontSize: '14px' }}>Supply USDC liquidity to earn interest from vault borrowers.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', margin: '20px 0', background: '#0f172a', padding: '16px', borderRadius: '8px' }}>
        <div>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>Total Pool Liquidity</span>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#38bdf8' }}>{reserveData?.totalLiquidity || '0.00'} USDC</div>
        </div>
        <div>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>Total Borrows</span>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#f43f5e' }}>{reserveData?.totalBorrows || '0.00'} USDC</div>
        </div>
      </div>

      <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px' }}>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>Wallet Balance: {usdcBalance} USDC</span>
        <input 
          type="number" 
          placeholder="0.0" 
          value={amount} 
          onChange={(e) => setAmount(e.target.value)}
          style={{ width: '100%', padding: '10px', marginTop: '8px', marginBottom: '12px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff' }}
        />
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={handleSupply} 
            disabled={isPending || isConfirming}
            style={{ flex: 1, padding: '10px', borderRadius: '6px', backgroundColor: needsApproval ? '#eab308' : '#2563eb', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
          >
            {needsApproval ? 'Approve USDC' : 'Supply Liquidity'}
          </button>
          <button 
            onClick={handleWithdraw} 
            disabled={isPending || isConfirming}
            style={{ flex: 1, padding: '10px', borderRadius: '6px', backgroundColor: '#475569', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Withdraw
          </button>
        </div>
      </div>
    </div>
  );
}
