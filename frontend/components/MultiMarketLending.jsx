'use client';

import React, { useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { MARKETS } from '../constants/markets';
import { useMultiMarketLending } from '../hooks/useMultiMarketLending';

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
    <div className="mm-health-meter">
      <div className="mm-health-head">
        <span>Position health</span>
        <strong>{safe}%</strong>
      </div>
      <div
        className="mm-health-track"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={safe}
        aria-label="Position health"
      >
        <div className="mm-health-fill" style={{ width: `${safe}%` }} />
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

    if (action !== 'repay') {
      setAmount(value);
      return;
    }

    if (value === '') {
      setAmount('');
      return;
    }

    const next = Number(value);
    if (!Number.isFinite(next)) return;

    setAmount(next > currentDebt ? lending.borrowBalance : value);
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

    setAmount(lending.walletBalance || '0');
  };

  const run = async () => {
    if (!isConnected || !market?.address || !lending.reserveActive) return;
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

  const healthLabel = lending.healthFactor === '∞' ? '∞' : lending.healthFactor || '—';

  if (!market) {
    return (
      <div className="mm-page">
        <div className="connect-prompt">No configured lending markets are available yet.</div>
      </div>
    );
  }

  return (
    <div className="mm-page">
      <div className="mm-header">
        <div>
          <span className="section-kicker">CENTRY · MARKETS</span>
          <h1>Borrow & lend</h1>
          <p>One interface for every Centry lending market enabled on Arc Testnet.</p>
        </div>
        <div className="test-badge">ARC TESTNET</div>
      </div>

      <div className="mm-market-tabs" role="tablist" aria-label="Lending markets">
        {supportedMarkets.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={market.id === item.id}
            className={market.id === item.id ? 'active' : ''}
            onClick={() => changeMarket(item.id)}
          >
            <strong>{item.symbol}</strong>
            <span>{item.name}</span>
          </button>
        ))}
      </div>

      <section className="mm-summary">
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

      <section className="mm-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <span className="section-kicker">{market.symbol}</span>
              <h2>{action[0].toUpperCase() + action.slice(1)} {market.symbol}</h2>
            </div>
            <span className={lending.reserveActive ? 'live-badge' : 'test-badge'}>
              {lending.reserveActive ? 'Reserve live' : 'Reserve not enabled'}
            </span>
          </div>

          <div className="mm-action-tabs">
            {['supply', 'withdraw', 'borrow', 'repay'].map((item) => (
              <button
                key={item}
                type="button"
                className={action === item ? 'active' : ''}
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
              max={action === 'repay' ? lending.borrowBalance : undefined}
              step={market.decimals >= 8 ? '0.00000001' : '0.000001'}
              placeholder="0.00"
              value={amount}
              onChange={changeAmount}
            />
            <span>{market.symbol}</span>
          </div>

          <div className="form-meta">
            <span>
              {action === 'repay'
                ? `Owed: ${isConnected ? `${formatNumber(lending.borrowBalance, Math.min(market.decimals, 6))} ${market.symbol}` : 'Connect wallet'}`
                : `Wallet: ${isConnected ? `${formatNumber(lending.walletBalance)} ${market.symbol}` : 'Connect wallet'}`}
            </span>
            {isConnected && <button type="button" onClick={setMax}>Max</button>}
          </div>

          {!isConnected ? (
            <div className="connect-prompt">Connect your wallet to interact with this market.</div>
          ) : !lending.reserveActive ? (
            <div className="connect-prompt">{market.symbol} is registered but its lending reserve is not enabled yet.</div>
          ) : (
            <button
              type="button"
              className="primary-btn full-btn large-btn"
              disabled={busy || !amount || numericAmount <= 0 || (action === 'repay' && currentDebt <= 0)}
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
            <strong className="mm-health-number">{healthLabel}</strong>
          </div>

          <HealthMeter percent={lending.healthFactorPercent} />

          <div className="mm-risk-list">
            <div><span>Market</span><strong>{market.symbol}</strong></div>
            <div><span>Reserve</span><strong>{lending.reserveActive ? 'Active' : 'Not enabled'}</strong></div>
            <div><span>Market liquidity</span><strong>{formatNumber(lending.reserveData?.totalLiquidity)} {market.symbol}</strong></div>
            <div><span>Market borrowed</span><strong>{formatNumber(lending.reserveData?.totalBorrows)} {market.symbol}</strong></div>
            <div><span>Utilization</span><strong>{formatNumber(lending.reserveData?.utilization)}%</strong></div>
          </div>

          <p className="mm-note">
            Health factor is read directly from the deployed Centry lending pool. The bar is only a visual normalization of that onchain value.
          </p>
        </div>
      </section>
    </div>
  );
}
