'use client';

import React, { useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { MARKETS } from '../constants/markets';
import { useMultiMarketLending } from '../hooks/useMultiMarketLending';
import styles from '../app/app/markets/markets.module.css';

function formatNumber(value, digits = 2) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0.00';
  return number.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function HealthMeter({ percent }) {
  const safe = Math.min(Math.max(Number(percent || 0), 0), 100);

  return (
    <div className={styles.riskMeter}>
      <div className={styles.riskHead}>
        <span>Position health</span>
        <strong>{safe}%</strong>
      </div>
      <div
        className={styles.riskTrack}
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={safe}
        aria-label="Position health"
      >
        <div className={styles.riskFill} style={{ width: `${safe}%` }} />
      </div>
    </div>
  );
}

export default function MultiMarketLending() {
  const { isConnected } = useAccount();
  const supportedMarkets = useMemo(
    () => MARKETS.filter((market) => market.address && market.status === 'live'),
    [],
  );
  const [marketId, setMarketId] = useState('usdc');
  const [action, setAction] = useState('supply');
  const [amount, setAmount] = useState('');
  const [notice, setNotice] = useState('');

  const market =
    supportedMarkets.find((item) => item.id === marketId) ||
    supportedMarkets[0];
  const lending = useMultiMarketLending(market?.address, market?.decimals);
  const busy = lending.isPending || lending.isConfirming;
  const numericAmount = Number(amount || 0);
  const currentDebt = Number(lending.borrowBalance || 0);
  const allowance = Number(lending.allowance || 0);
  const maxBorrow = lending.maxBorrowAmount || '0';
  const maxBorrowNumber = Number(maxBorrow);
  const marketLiquidityNumber = Number(lending.reserveData?.totalLiquidity || 0);
  const noBorrowLiquidity = action === 'borrow' && marketLiquidityNumber <= 0;
  const noBorrowRoom = action === 'borrow' && maxBorrowNumber <= 0 && !noBorrowLiquidity;
  const needsApproval =
    isConnected &&
    ['supply', 'repay'].includes(action) &&
    numericAmount > allowance;

  const changeAction = (nextAction) => {
    setAction(nextAction);
    setAmount('');
    setNotice('');
  };

  const changeMarket = (nextMarketId) => {
    setMarketId(nextMarketId);
    setAction('supply');
    setAmount('');
    setNotice('');
  };

  const changeAmount = (event) => {
    const value = event.target.value;

    if (value === '') {
      setAmount('');
      return;
    }

    const next = Number(value);
    if (!Number.isFinite(next)) return;

    if (action === 'repay' && next > currentDebt) {
      setAmount(lending.borrowBalance);
      return;
    }

    if (action === 'borrow' && next > maxBorrowNumber) {
      setAmount(maxBorrow);
      return;
    }

    setAmount(value);
  };

  const setMax = () => {
    if (action === 'withdraw') {
      setAmount(lending.supplyBalance || '0');
      return;
    }

    if (action === 'repay') {
      setAmount(lending.borrowBalance || '0');
      return;
    }

    if (action === 'borrow') {
      setAmount(maxBorrow);
      return;
    }

    setAmount(lending.walletBalance || '0');
  };

  const run = async () => {
    if (!isConnected || !market?.address || lending.reserveActive !== true) return;
    if (!amount || numericAmount <= 0 || busy) return;

    try {
      setNotice('');

      if (needsApproval) {
        await lending.approveAsset(amount);
        setNotice(`Approved ${amount} ${market.symbol}.`);
        return;
      }

      if (action === 'supply') await lending.supply(amount);
      if (action === 'withdraw') await lending.withdraw(amount);
      if (action === 'borrow') await lending.borrow(amount);
      if (action === 'repay') await lending.repay(amount);

      await lending.refetchAll();
      setAmount('');
      setNotice(`${action[0].toUpperCase()}${action.slice(1)} confirmed onchain.`);
    } catch (error) {
      setNotice(
        error?.shortMessage ||
          error?.message ||
          'Transaction failed. Check your wallet, network, allowance, and reserve state.',
      );
    }
  };

  if (!market) {
    return (
      <div className={styles.page}>
        <div className="connect-prompt">No configured lending markets are available yet.</div>
      </div>
    );
  }

  const reserveStatus = lending.reserveLoading
    ? 'Checking reserve…'
    : lending.reserveActive
      ? 'Reserve live'
      : 'Reserve not enabled';

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className="section-kicker">CENTRY · LENDING</span>
          <h1>Borrow & lend</h1>
          <p>Supply, borrow and manage your position across Centry markets.</p>
        </div>
        <div className="test-badge">ARC TESTNET</div>
      </div>

      <div className={styles.marketTabs} role="tablist" aria-label="Lending markets">
        {supportedMarkets.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={market.id === item.id}
            className={market.id === item.id ? styles.marketTabActive : styles.marketTab}
            onClick={() => changeMarket(item.id)}
          >
            <strong>{item.symbol}</strong>
            <span>{item.name}</span>
          </button>
        ))}
      </div>

      <section className={styles.summary}>
        <div className="metric">
          <span>Wallet</span>
          <strong>{isConnected ? `${formatNumber(lending.walletBalance)} ${market.symbol}` : '—'}</strong>
          <small>Available in wallet</small>
        </div>
        <div className="metric">
          <span>Supplied</span>
          <strong>{isConnected ? `${formatNumber(lending.supplyBalance)} ${market.symbol}` : '—'}</strong>
          <small>Your supplied balance</small>
        </div>
        <div className="metric">
          <span>Borrowed</span>
          <strong>{isConnected ? `${formatNumber(lending.borrowBalance)} ${market.symbol}` : '—'}</strong>
          <small>Your debt in this market</small>
        </div>
        <div className="metric">
          <span>Borrow limit</span>
          <strong>{isConnected ? `$${formatNumber(lending.borrowLimit)}` : '—'}</strong>
          <small>Remaining borrowing room</small>
        </div>
      </section>

      <section className={styles.grid}>
        <div className="panel">
          <div className="panel-head">
            <div>
              <span className="section-kicker">{market.symbol}</span>
              <h2>{action[0].toUpperCase() + action.slice(1)} {market.symbol}</h2>
            </div>
            <span className={lending.reserveActive ? 'live-badge' : 'test-badge'}>
              {reserveStatus}
            </span>
          </div>

          <div className={styles.actions}>
            {['supply', 'withdraw', 'borrow', 'repay'].map((item) => (
              <button
                key={item}
                type="button"
                className={action === item ? styles.actionActive : styles.actionButton}
                onClick={() => changeAction(item)}
              >
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>

          <label className="field-label" htmlFor="multi-market-amount">Amount</label>
          <div className="amount-input-wrap">
            <input
              id="multi-market-amount"
              type="number"
              min="0"
              max={action === 'repay' ? lending.borrowBalance : action === 'borrow' ? lending.maxBorrowAmount : undefined}
              step={market.decimals >= 8 ? '0.00000001' : '0.000001'}
              placeholder="0.00"
              value={amount}
              onChange={changeAmount}
            />
            <span>{market.symbol}</span>
          </div>

          <div className={styles.formMeta}>
            <span>
              {action === 'repay'
                ? `Owed: ${isConnected ? `${formatNumber(lending.borrowBalance, Math.min(market.decimals, 8))} ${market.symbol}` : 'Connect wallet'}`
                : action === 'borrow'
                  ? `Max: ${isConnected ? `${formatNumber(maxBorrow, Math.min(market.decimals, 8))} ${market.symbol}` : 'Connect wallet'}`
                  : `Wallet: ${isConnected ? `${formatNumber(lending.walletBalance)} ${market.symbol}` : 'Connect wallet'}`}
            </span>
            {isConnected && <button type="button" onClick={setMax}>Max</button>}
          </div>

          {!isConnected ? (
            <div className="connect-prompt">Connect your wallet to interact with this market.</div>
          ) : lending.reserveLoading ? (
            <div className="connect-prompt">Checking {market.symbol} reserve…</div>
          ) : lending.reserveActive !== true ? (
            <div className="connect-prompt">{market.symbol} is not enabled in the connected Centry LendingPool.</div>
          ) : noBorrowLiquidity ? (
            <div className="connect-prompt">There is no {market.symbol} liquidity available to borrow right now.</div>
          ) : noBorrowRoom ? (
            <div className="connect-prompt">You have no remaining borrowing room.</div>
          ) : (
            <button
              type="button"
              className="primary-btn full-btn large-btn"
              disabled={
                busy ||
                !amount ||
                numericAmount <= 0 ||
                (action === 'repay' && currentDebt <= 0) ||
                (action === 'borrow' && numericAmount > maxBorrowNumber)
              }
              onClick={run}
            >
              {busy
                ? 'Waiting for confirmation…'
                : needsApproval
                  ? `Approve ${market.symbol}`
                  : `${action[0].toUpperCase()}${action.slice(1)} ${market.symbol}`}
            </button>
          )}

          {notice && <div className="notice">{notice}</div>}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <span className="section-kicker">RISK</span>
              <h2>Position health</h2>
            </div>
          </div>

          <HealthMeter percent={lending.healthFactorPercent} />

          <div className={styles.riskList}>
            <div className={styles.riskRow}><span>Market</span><strong>{market.symbol}</strong></div>
            <div className={styles.riskRow}><span>Reserve</span><strong>{lending.reserveActive ? 'Active' : lending.reserveLoading ? 'Checking…' : 'Not enabled'}</strong></div>
            <div className={styles.riskRow}><span>Market liquidity</span><strong>{formatNumber(lending.reserveData?.totalLiquidity)} {market.symbol}</strong></div>
            <div className={styles.riskRow}><span>Market borrowed</span><strong>{formatNumber(lending.reserveData?.totalBorrows)} {market.symbol}</strong></div>
            <div className={styles.riskRow}><span>Utilization</span><strong>{formatNumber(lending.reserveData?.utilization)}%</strong></div>
          </div>

          <p className={styles.note}>
            Health is account-wide. It includes all collateral and debt across Centry markets.
          </p>
        </div>
      </section>
    </div>
  );
}
