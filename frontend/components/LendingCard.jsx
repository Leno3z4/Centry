import React, { useState } from 'react';
import { useLendingPool } from '../hooks/useLendingPool';

export function LendingCard() {
  const { configured, reserveData, usdcBalance, usdcAllowance, supplyBalance, borrowBalance, healthFactor, approveUSDC, supply, withdraw, borrow, repay, isPending, isConfirming, error } = useLendingPool();
  const [amount, setAmount] = useState('');
  const [action, setAction] = useState('supply');
  const busy = isPending || isConfirming;
  const needsApproval = ['supply', 'repay'].includes(action) && Number(amount || 0) > Number(usdcAllowance || 0);

  const submit = async () => {
    if (!amount || Number(amount) <= 0) return;
    if (needsApproval) return approveUSDC(amount);
    if (action === 'supply') await supply(amount);
    if (action === 'withdraw') await withdraw(amount);
    if (action === 'borrow') await borrow(amount);
    if (action === 'repay') await repay(amount);
    setAmount('');
  };

  if (!configured) return <div className="panel"><span className="section-kicker">LENDING</span><h2>USDC Market</h2><p>Contract addresses are not configured yet. Set the NEXT_PUBLIC_CENTRY_* values before using the market.</p></div>;

  return <div className="panel market-panel">
    <div className="panel-head"><div><span className="section-kicker">MARKET</span><h2>Arc USDC Money Market</h2></div><span className="live-badge"><i /> Testnet</span></div>
    <div className="stats-grid compact">
      <Metric label="Liquidity" value={`${Number(reserveData.totalLiquidity).toLocaleString()} USDC`} />
      <Metric label="Borrowed" value={`${Number(reserveData.totalBorrows).toLocaleString()} USDC`} />
      <Metric label="Utilization" value={`${Number(reserveData.utilization).toFixed(2)}%`} />
      <Metric label="Wallet" value={`${Number(usdcBalance).toLocaleString()} USDC`} />
    </div>
    <div className="rate-strip"><span>Your supply</span><strong>{Number(supplyBalance).toLocaleString()} USDC</strong><span>Your debt</span><strong>{Number(borrowBalance).toLocaleString()} USDC</strong><span>Health</span><strong>{healthFactor}</strong></div>
    <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
      {['supply','withdraw','borrow','repay'].map((item) => <button key={item} className={action === item ? 'primary-btn' : 'secondary-btn'} onClick={() => setAction(item)}>{item}</button>)}
    </div>
    <input aria-label="USDC amount" type="number" min="0" step="0.01" placeholder="USDC amount" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width:'100%', boxSizing:'border-box', padding:12, marginTop:12, borderRadius:8 }} />
    <button className="primary-btn" onClick={submit} disabled={busy || !amount} style={{ marginTop: 10, width: '100%' }}>{busy ? 'Confirming…' : needsApproval ? 'Approve USDC' : `${action[0].toUpperCase()}${action.slice(1)} USDC`}</button>
    {error && <p style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>Transaction failed or was rejected. Check the wallet and contract configuration.</p>}
  </div>;
}
function Metric({ label, value }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }
