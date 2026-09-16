'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { ACTIVE_MARKETS } from '../constants/markets';
import { useMultiMarketLending } from '../hooks/useMultiMarketLending';
import { useGatewayFunding } from '../hooks/useGatewayFunding';
import BalanceSourceSelector from './BalanceSourceSelector';
import styles from '../app/app/markets/markets.module.css';
import CentryIntelligence from './CentryIntelligence';

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

export default function MultiMarketLending() {
  const { isConnected } = useAccount();
  const supportedMarkets = useMemo(() => ACTIVE_MARKETS, []);
  const [marketId, setMarketId] = useState(supportedMarkets[0]?.id || 'usdc');
  const [action, setAction] = useState('supply');
  const [amount, setAmount] = useState('');
  const [fundingSource, setFundingSource] = useState('wallet');
  const [notice, setNotice] = useState('');
  const [refreshingPosition, setRefreshingPosition] = useState(false);
  const refreshTimerRef = useRef(null);
  const market = supportedMarkets.find((item) => item.id === marketId) || supportedMarkets[0];
  const lending = useMultiMarketLending(market?.address, market?.decimals);
  const gateway = useGatewayFunding();
  const busy = lending.isPending || lending.isConfirming || gateway.loading;
  const numericAmount = Number(amount || 0);
  const debt = Number(lending.borrowBalance || 0);
  const allowance = Number(lending.allowance || 0);
  const maxBorrow = lending.maxBorrowAmount || '0';
  const maxBorrowNumber = Number(maxBorrow);
  const liquidity = Number(lending.reserveData?.totalLiquidity || 0);
  const gatewayEnabled = market?.symbol === 'USDC';
  const needsGatewayFunding = gatewayEnabled && action === 'supply' && fundingSource === 'gateway';
  const arcWalletBalanceNumber = Number(lending.walletBalance || 0);
  const gatewayBalanceNumber = Number(gateway.total || 0);
  const gatewayShortfall = Math.max(numericAmount - arcWalletBalanceNumber, 0);
  const gatewayAmountUnavailable = needsGatewayFunding && numericAmount > 0 && gatewayShortfall > gatewayBalanceNumber;
  const needsApproval = isConnected && ['supply', 'repay'].includes(action) && numericAmount > allowance;

  useEffect(() => () => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
  }, []);

  useEffect(() => {
    if (!gatewayEnabled) setFundingSource('wallet');
  }, [gatewayEnabled]);

  const refreshPosition = async (attempt = 0) => {
    try {
      await lending.refetchAll();
    } catch {
      // Keep polling; the underlying RPC may be temporarily busy while the position updates.
    }

    if (attempt >= 15) {
      setRefreshingPosition(false);
      return;
    }

    refreshTimerRef.current = window.setTimeout(() => refreshPosition(attempt + 1), 3000);
  };

  const setMax = () => {
    if (action === 'withdraw') setAmount(lending.supplyBalance || '0');
    else if (action === 'repay') setAmount(lending.borrowBalance || '0');
    else if (action === 'borrow') setAmount(maxBorrow);
    else setAmount(fundingSource === 'gateway' && gatewayEnabled ? String(arcWalletBalanceNumber + gatewayBalanceNumber) : lending.walletBalance || '0');
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

  const changeAction = (next) => {
    setAction(next);
    setAmount('');
    setNotice('');
    if (next !== 'supply') setFundingSource('wallet');
  };

  const changeMarket = (next) => {
    setMarketId(next);
    setAction('supply');
    setFundingSource('wallet');
    setAmount('');
    setNotice('');
    setRefreshingPosition(false);
  };

  const run = async () => {
    if (!isConnected || !market?.address || lending.reserveActive !== true || !amount || numericAmount <= 0 || busy || refreshingPosition) return;
    try {
      setNotice('');

      if (needsGatewayFunding) {
        if (gatewayAmountUnavailable) {
          throw new Error(`Your Arc wallet plus finalized Gateway USDC cannot cover ${amount} USDC.`);
        }
        setNotice('Checking unified USDC liquidity…');
        const funding = await gateway.ensureArcUsdc(amount, { arcBalance: lending.walletBalance });
        if (funding.usedGateway) {
          setNotice(`Funding the ${num(Number(funding.requiredGatewayAmount), 6)} USDC shortfall through Gateway…`);
          await lending.refetchAll();
        } else {
          setNotice('Using USDC already available on Arc. No Gateway transfer needed.');
        }
      }

      if (needsApproval) {
        await lending.approveAsset(amount);
        setNotice(`Approved ${amount} ${market.symbol}.`);
        return;
      }

      if (action === 'supply') {
        if (numericAmount > Number(lending.walletBalance || 0)) {
          throw new Error(`You have ${num(lending.walletBalance)} ${market.symbol} in your Arc wallet, which is not enough to supply ${amount}.`);
        }
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
      setNotice(error?.shortMessage || error?.message || 'Transaction failed. Check your wallet, network, allowance, and reserve state.');
    }
  };

  if (!market) return <div className={styles.page}><div className="connect-prompt">No configured lending markets are available yet.</div></div>;

  const noLiquidity = action === 'borrow' && liquidity <= 0;
  const noRoom = action === 'borrow' && maxBorrowNumber <= 0 && !noLiquidity;
  const displayedFundingBalance = fundingSource === 'gateway' && gatewayEnabled ? gateway.total : lending.walletBalance;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div><h1>Borrow & lend</h1><p>Supply, borrow and manage your position across Centry markets.</p></div>
      </div>

      {isConnected ? <CentryIntelligence market={market} lending={lending} /> : null}

      <div className={styles.marketTabs} role="tablist" aria-label="Lending markets">
        {supportedMarkets.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={market.id === item.id}
            className={market.id === item.id ? styles.marketTabActive : styles.marketTab}
            onClick={() => changeMarket(item.id)}>
            <strong>{item.symbol}</strong><span>{item.name}</span>
          </button>
        ))}
      </div>

      <section className={styles.summary}>
        <div className="metric"><span>Wallet</span><strong>{isConnected ? `${num(lending.walletBalance)} ${market.symbol}` : '—'}</strong><small>Available on Arc</small></div>
        <div className="metric"><span>Supplied</span><strong>{isConnected ? `${num(lending.supplyBalance)} ${market.symbol}` : '—'}</strong><small>Your supplied balance</small></div>
        <div className="metric"><span>Borrowed</span><strong>{isConnected ? `${num(lending.borrowBalance)} ${market.symbol}` : '—'}</strong><small>Your debt in this market</small></div>
        <div className="metric"><span>Borrow limit</span><strong>{isConnected ? `$${num(lending.borrowLimit)}` : '—'}</strong><small>Remaining borrowing room</small></div>
      </section>

      <section className={styles.grid}>
        <div className="panel">
          <div className="panel-head"><div><h2>{action[0].toUpperCase() + action.slice(1)} {market.symbol}</h2></div></div>
          <div className={styles.actions}>
            {['supply','withdraw','borrow','repay'].map((item) => (
              <button key={item} type="button" className={action === item ? styles.actionActive : styles.actionButton} onClick={() => changeAction(item)}>
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>

          {gatewayEnabled && action === 'supply' && isConnected ? (
            <BalanceSourceSelector
              value={fundingSource}
              onChange={setFundingSource}
              walletBalance={lending.walletBalance}
              gatewayBalances={gateway.balances}
              disabled={busy || refreshingPosition}
            />
          ) : null}

          <label className="field-label" htmlFor="multi-market-amount">Amount</label>
          <div className="amount-input-wrap">
            <input id="multi-market-amount" type="number" min="0"
              max={action === 'repay' ? lending.borrowBalance : action === 'borrow' ? lending.maxBorrowAmount : undefined}
              step={market.decimals >= 8 ? '0.00000001' : '0.000001'} placeholder="0.00" value={amount} onChange={onAmount} />
            <span>{market.symbol}</span>
          </div>

          <div className={styles.formMeta}>
            <span>{action === 'repay'
              ? `Owed: ${isConnected ? `${num(lending.borrowBalance, Math.min(market.decimals, 8))} ${market.symbol}` : 'Connect wallet'}`
              : action === 'borrow'
                ? `Max: ${isConnected ? `${num(maxBorrow, Math.min(market.decimals, 8))} ${market.symbol}` : 'Connect wallet'}`
                : `${fundingSource === 'gateway' && gatewayEnabled ? 'Unified USDC:' : 'Wallet:'} ${isConnected ? `${num(displayedFundingBalance)} ${market.symbol}` : 'Connect wallet'}`}</span>
            {isConnected && <button type="button" onClick={setMax} disabled={refreshingPosition}>Max</button>}
          </div>

          {!isConnected ? <div className="connect-prompt">Connect your wallet to interact with this market.</div>
            : lending.reserveLoading ? <div className="connect-prompt">Checking {market.symbol} reserve…</div>
            : refreshingPosition ? <div className="connect-prompt" aria-live="polite" aria-busy="true">Updating your borrowing capacity… We’re refreshing the lending position.</div>
            : lending.reserveActive !== true ? <div className="connect-prompt">{market.symbol} is not enabled in the connected Centry LendingPool.</div>
            : noLiquidity ? <div className="connect-prompt">There is no {market.symbol} liquidity available to borrow right now.</div>
            : noRoom ? <div className="connect-prompt">You have no remaining borrowing room.</div>
            : needsGatewayFunding && gatewayAmountUnavailable ? <div className="connect-prompt">Enter an amount covered by your Arc wallet plus finalized Gateway USDC.</div>
            : <button type="button" className="primary-btn full-btn large-btn"
                disabled={busy || refreshingPosition || !amount || numericAmount <= 0 || (action === 'repay' && debt <= 0) || (action === 'borrow' && numericAmount > maxBorrowNumber) || (needsGatewayFunding && gatewayAmountUnavailable)}
                onClick={run}>
                {busy ? 'Waiting for confirmation…' : refreshingPosition ? 'Updating borrow capacity…' : needsGatewayFunding ? `Supply ${market.symbol}` : needsApproval ? `Approve ${market.symbol}` : `${action[0].toUpperCase()}${action.slice(1)} ${market.symbol}`}
              </button>}
          {notice && <div className="notice" aria-live="polite">{notice}</div>}
        </div>

        <div className="panel">
          <div className="panel-head"><div><h2>Position health</h2></div></div>
          <HealthMeter value={lending.healthFactorPercent} />
          <div className={styles.riskList}>
            <div className={styles.riskRow}><span>Market</span><strong>{market.symbol}</strong></div>
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
