'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { ACTIVE_MARKETS } from '../constants/markets';
import { useMultiMarketLending } from '../hooks/useMultiMarketLending';
import { useGatewayFunding } from '../hooks/useGatewayFunding';
import BalanceSourceSelector from './BalanceSourceSelector';
import styles from '../app/app/markets/markets.module.css';

function num(value, digits = 2) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '0.00';
}

function HealthMeter({ value }) {
  const safe = Math.min(Math.max(Number(value || 0), 0), 100);
  return (
    <div className={styles.riskMeter}>
      <div className={styles.riskHead}><span>Position health</span><strong>{safe}%</strong></div>
      <div className={styles.riskTrack} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={safe}>
        <div className={styles.riskFill} style={{ width: `${safe}%` }} />
      </div>
    </div>
  );
}

export default function MarketDetail({ marketId }) {
  const { isConnected } = useAccount();
  const market = useMemo(() => ACTIVE_MARKETS.find((item) => item.id === marketId), [marketId]);
  const [action, setAction] = useState('supply');
  const [amount, setAmount] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshingPosition, setRefreshingPosition] = useState(false);
  const [fundingSource, setFundingSource] = useState('wallet');
  const refreshTimerRef = useRef(null);
  const lending = useMultiMarketLending(market?.address, market?.decimals);
  const gateway = useGatewayFunding();
  const busy = lending.isPending || lending.isConfirming;
  const numericAmount = Number(amount || 0);
  const debt = Number(lending.borrowBalance || 0);
  const allowance = Number(lending.allowance || 0);
  const maxBorrow = lending.maxBorrowAmount || '0';
  const maxBorrowNumber = Number(maxBorrow);
  const liquidity = Number(lending.reserveData?.totalLiquidity || 0);
  const gatewayEnabled = market?.symbol === 'USDC' && ['supply', 'repay'].includes(action);
  const needsApproval = isConnected && ['supply', 'repay'].includes(action) && numericAmount > allowance;

  useEffect(() => () => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
  }, []);

  const refreshPosition = async (attempt = 0) => {
    try { await lending.refetchAll(); } catch { /* Keep polling through temporary RPC pressure. */ }
    if (attempt >= 15) { setRefreshingPosition(false); return; }
    refreshTimerRef.current = window.setTimeout(() => refreshPosition(attempt + 1), 3000);
  };

  const setMax = () => {
    if (action === 'withdraw') setAmount(lending.supplyBalance || '0');
    else if (action === 'repay') setAmount(lending.borrowBalance || '0');
    else if (action === 'borrow') setAmount(maxBorrow);
    else setAmount(fundingSource === 'gateway' && gatewayEnabled ? gateway.total : lending.walletBalance || '0');
  };

  const onAmount = (event) => {
    const value = event.target.value;
    if (value === '') return setAmount('');
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    if (action === 'repay' && n > debt) return setAmount(lending.borrowBalance);
    if (action === 'borrow' && n > maxBorrowNumber) return setAmount(maxBorrow);
    setAmount(value);
  };

  useEffect(() => {
    if (!gatewayEnabled) setFundingSource('wallet');
  }, [gatewayEnabled]);

  const run = async () => {
    if (!isConnected || !market?.address || lending.reserveActive !== true || !amount || numericAmount <= 0 || busy || refreshingPosition) return;
    try {
      setNotice('');
      if (gatewayEnabled && fundingSource === 'gateway') {
        setNotice('Finding your finalized Gateway balance…');
        await gateway.ensureArcUsdc(amount);
        setNotice('Gateway USDC is on Arc. Continue with the Centry transaction.');
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
      if (needsApproval) {
        await lending.approveAsset(amount);
        setNotice(`Approved ${amount} ${market.symbol}.`);
        return;
      }
      if (action === 'supply') {
        await lending.supply(amount);
        setAmount('');
        setRefreshingPosition(true);
        setNotice('Supply confirmed. Updating your borrowing capacity…');
        refreshTimerRef.current && window.clearTimeout(refreshTimerRef.current);
        void refreshPosition();
        return;
      }
      if (action === 'withdraw') await lending.withdraw(amount);
      if (action === 'borrow') await lending.borrow(amount);
      if (action === 'repay') await lending.repay(amount);
      await lending.refetchAll();
      setAmount('');
      setNotice(`${action[0].toUpperCase()}${action.slice(1)} confirmed onchain.`);
    } catch (error) {
      setRefreshingPosition(false);
      setNotice(error?.shortMessage || error?.message || 'Transaction failed. Check your wallet, network, allowance, Gateway balance, and reserve state.');
    }
  };

  if (!market) {
    return (
      <div className={styles.page}>
        <div className="connect-prompt">This market is not available.<Link href="/app/markets">Back to Markets</Link></div>
      </div>
    );
  }

  const noLiquidity = action === 'borrow' && liquidity <= 0;
  const noRoom = action === 'borrow' && maxBorrowNumber <= 0 && !noLiquidity;

  return (
    <div className={styles.page}>
      <div className={styles.detailTop}>
        <Link href="/app/markets" className={styles.backLink}>← All markets</Link>
        <div className={styles.header}><div><h1>{market.symbol}</h1><p>{market.description}</p></div></div>
      </div>

      <section className={styles.summary}>
        <div className="metric"><span>Wallet</span><strong>{isConnected ? `${num(lending.walletBalance)} ${market.symbol}` : '—'}</strong><small>Available in wallet</small></div>
        <div className="metric"><span>Supplied</span><strong>{isConnected ? `${num(lending.supplyBalance)} ${market.symbol}` : '—'}</strong><small>Your supplied balance</small></div>
        <div className="metric"><span>Borrowed</span><strong>{isConnected ? `${num(lending.borrowBalance)} ${market.symbol}` : '—'}</strong><small>Your debt in this market</small></div>
        <div className="metric"><span>Borrow limit</span><strong>{isConnected ? `$${num(lending.borrowLimit)}` : '—'}</strong><small>Remaining borrowing room</small></div>
      </section>

      <section className={styles.grid}>
        <div className="panel">
          <div className="panel-head"><div><span className="section-kicker">MARKET</span><h2>{action[0].toUpperCase() + action.slice(1)} {market.symbol}</h2></div></div>
          <div className={styles.actions}>
            {['supply', 'withdraw', 'borrow', 'repay'].map((item) => (
              <button key={item} type="button" className={action === item ? styles.actionActive : styles.actionButton} onClick={() => { setAction(item); setAmount(''); setNotice(''); }}>
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>

          <label className="field-label" htmlFor="market-amount">Amount</label>
          <div className="amount-input-wrap">
            <input id="market-amount" type="number" min="0" max={action === 'repay' ? lending.borrowBalance : action === 'borrow' ? lending.maxBorrowAmount : undefined} step={market.decimals >= 8 ? '0.00000001' : '0.000001'} placeholder="0.00" value={amount} onChange={onAmount} />
            <span>{market.symbol}</span>
          </div>

          {gatewayEnabled ? (
            <div style={{ marginTop: 12 }}>
              <BalanceSourceSelector value={fundingSource} onChange={setFundingSource} walletBalance={lending.walletBalance} gatewayBalances={gateway.balances} disabled={busy || refreshingPosition} />
            </div>
          ) : null}

          <div className={styles.formMeta}>
            <span>{action === 'repay' ? `Owed: ${isConnected ? `${num(lending.borrowBalance, Math.min(market.decimals, 8))} ${market.symbol}` : 'Connect wallet'}` : action === 'borrow' ? `Max: ${isConnected ? `${num(maxBorrow, Math.min(market.decimals, 8))} ${market.symbol}` : 'Connect wallet'}` : fundingSource === 'gateway' && gatewayEnabled ? `Gateway: ${num(gateway.total, 6)} USDC` : `Wallet: ${isConnected ? `${num(lending.walletBalance)} ${market.symbol}` : 'Connect wallet'}`}</span>
            {isConnected && <button type="button" onClick={setMax} disabled={refreshingPosition}>Max</button>}
          </div>

          {!isConnected ? <div className="connect-prompt">Connect your wallet to interact with this market.</div>
            : lending.reserveLoading ? <div className="connect-prompt">Checking {market.symbol} reserve…</div>
            : refreshingPosition ? <div className="connect-prompt" aria-live="polite" aria-busy="true">Updating your borrowing capacity… We’re refreshing the lending position.</div>
            : lending.reserveActive !== true ? <div className="connect-prompt">{market.symbol} is not enabled in the connected Centry LendingPool.</div>
            : noLiquidity ? <div className="connect-prompt">There is no {market.symbol} liquidity available to borrow right now.</div>
            : noRoom ? <div className="connect-prompt">You have no remaining borrowing room.</div>
            : fundingSource === 'gateway' && gatewayEnabled && Number(gateway.total || 0) < numericAmount ? <div className="connect-prompt">Gateway does not currently have enough finalized USDC for this amount.</div>
            : <button type="button" className="primary-btn full-btn large-btn" disabled={busy || refreshingPosition || !amount || numericAmount <= 0 || (action === 'repay' && debt <= 0) || (action === 'borrow' && numericAmount > maxBorrowNumber)} onClick={run}>
                {busy ? 'Waiting for confirmation…' : refreshingPosition ? 'Updating borrow capacity…' : fundingSource === 'gateway' && gatewayEnabled ? 'Use Gateway USDC' : needsApproval ? `Approve ${market.symbol}` : `${action[0].toUpperCase()}${action.slice(1)} ${market.symbol}`}
              </button>}
          {notice && <div className="notice" aria-live="polite">{notice}</div>}
        </div>

        <div className="panel">
          <div className="panel-head"><div><span className="section-kicker">POSITION</span><h2>Your position</h2></div></div>
          <HealthMeter value={lending.healthFactorPercent} />
          <div className={styles.riskList}>
            <div className={styles.riskRow}><span>Reserve</span><strong>{lending.reserveActive ? 'Active' : lending.reserveLoading ? 'Checking…' : 'Not enabled'}</strong></div>
            <div className={styles.riskRow}><span>Market liquidity</span><strong>{num(lending.reserveData?.totalLiquidity)} {market.symbol}</strong></div>
            <div className={styles.riskRow}><span>Market borrowed</span><strong>{num(lending.reserveData?.totalBorrows)} {market.symbol}</strong></div>
            <div className={styles.riskRow}><span>Utilization</span><strong>{num(lending.reserveData?.utilization)}%</strong></div>
          </div>
          <p className={styles.note}>Health is account-wide. It includes all collateral and debt across Centry markets.</p>
        </div>
      </section>
    </div>
  );
}
