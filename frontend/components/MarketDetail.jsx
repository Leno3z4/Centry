'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { ACTIVE_MARKETS } from '../constants/markets';
import { useMultiMarketLending } from '../hooks/useMultiMarketLending';
import { useDeFiRisk } from '../hooks/useDeFiRisk';
import { useGatewayFunding } from '../hooks/useGatewayFunding';
import BalanceSourceSelector from './BalanceSourceSelector';
import styles from './market-directory.module.css';

function num(value, digits = 2) {
  const n = Number(value || 0);
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : '0.00';
}

function formatPct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) + '%' : '—';
}

function TokenMark({ symbol }) {
  const isBitcoin = symbol === 'cirBTC';
  const isEuro = symbol === 'EURC';

  return (
    <span
      className={styles.detailTokenMark}
      data-token={isBitcoin ? 'btc' : isEuro ? 'eurc' : 'usdc'}
      aria-hidden="true"
    >
      {isBitcoin ? '₿' : isEuro ? '€' : '$'}
    </span>
  );
}

export default function MarketDetail({ marketId }) {
  const { isConnected } = useAccount();
  const market = useMemo(
    () => ACTIVE_MARKETS.find((item) => item.id === marketId),
    [marketId],
  );
  const { markets: riskMarkets } = useDeFiRisk();
  const [action, setAction] = useState('supply');
  const [amount, setAmount] = useState('');
  const [notice, setNotice] = useState('');
  const [fundingSource, setFundingSource] = useState('wallet');
  const lending = useMultiMarketLending(market?.address, market?.decimals);
  const gateway = useGatewayFunding({ enabled: market?.symbol === 'USDC' });
  const busy = lending.isPending || lending.isConfirming;
  const numericAmount = Number(amount || 0);
  const debt = Number(lending.borrowBalance || 0);
  const allowance = Number(lending.allowance || 0);
  const maxBorrow = lending.maxBorrowAmount || '0';
  const maxBorrowNumber = Number(maxBorrow);
  const liquidity = Number(lending.reserveData?.totalLiquidity || 0);
  const gatewayEnabled =
    market?.symbol === 'USDC' && ['supply', 'repay'].includes(action);
  const needsApproval =
    isConnected &&
    ['supply', 'repay'].includes(action) &&
    numericAmount > allowance;

  const riskMarket = riskMarkets.find((item) => item.id === market?.id);
  const borrowLimitRemaining = Number(
    lending.accountPosition?.remainingBorrowCapacityUsd || 0,
  );


  const setAmountFromMax = () => {
    if (action === 'withdraw') setAmount(String(lending.supplyBalance || '0'));
    else if (action === 'repay') setAmount(String(lending.borrowBalance || '0'));
    else if (action === 'borrow') setAmount(String(maxBorrow));
    else if (fundingSource === 'gateway' && gatewayEnabled) setAmount(String(gateway.total || '0'));
    else setAmount(String(lending.walletBalance || '0'));
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
    if (
      !isConnected ||
      !market?.address ||
      lending.reserveActive !== true ||
      !amount ||
      numericAmount <= 0 ||
      busy
    ) {
      return;
    }

    try {
      setNotice('');
      if (gatewayEnabled && fundingSource === 'gateway') {
        setNotice('Finding your finalized Gateway balance…');
        await gateway.ensureArcUsdc(amount);
        setNotice('Gateway USDC is ready on Arc. Continue with the Centry transaction.');
      }
      if (needsApproval) {
        await lending.approveAsset(amount);
        setNotice('Approved ' + amount + ' ' + market.symbol + '. Tap ' + action + ' again to continue.');
        return;
      }
      if (action === 'supply') {
        await lending.supply(amount);
        setAmount('');
        setNotice('Supply confirmed onchain.');
        void lending.refetchAll();
        return;
      }
      if (action === 'withdraw') await lending.withdraw(amount);
      if (action === 'borrow') await lending.borrow(amount);
      if (action === 'repay') await lending.repay(amount);
      setAmount('');
      setNotice(action[0].toUpperCase() + action.slice(1) + ' confirmed onchain.');
      void lending.refetchAll();
    } catch (error) {
      setNotice(
        error?.shortMessage ||
          error?.message ||
          'Transaction failed. Check your wallet, network, amount, allowance, and reserve state.',
      );
    }
  };

  if (!market) {
    return (
      <div className={styles.page}>
        <div className="connect-prompt">
          This market is not available.
          <Link href="/app/markets">Back to Markets</Link>
        </div>
      </div>
    );
  }

  const noLiquidity = action === 'borrow' && liquidity <= 0;
  const noRoom = action === 'borrow' && maxBorrowNumber <= 0 && !noLiquidity;
  const actionLabel = action[0].toUpperCase() + action.slice(1);
  const balanceLabel =
    action === 'withdraw'
      ? 'Supplied: ' + (isConnected ? num(lending.supplyBalance) : '—') + ' ' + market.symbol
      : action === 'repay'
        ? 'Owed: ' + (isConnected ? num(lending.borrowBalance, Math.min(market.decimals, 8)) : '—') + ' ' + market.symbol
        : action === 'borrow'
          ? 'Available: ' + (isConnected ? '$' + num(borrowLimitRemaining) : '—')
          : fundingSource === 'gateway' && gatewayEnabled
            ? 'Gateway: ' + num(gateway.total, 6) + ' USDC'
            : 'Wallet: ' + (isConnected ? num(lending.walletBalance) : '—') + ' ' + market.symbol;

  return (
    <div className={styles.page}>
      <div className={styles.detailTop}>
        <Link href="/app/markets" className={styles.backLink}>
          ← All markets
        </Link>

        <div className={styles.detailHeader}>
          <div className={styles.detailIdentity}>
            <TokenMark symbol={market.symbol} />
            <div>
              <div className={styles.detailTitleRow}>
                <h1>{market.symbol}</h1>
                <span className={styles.detailStatus}><i aria-hidden="true" />Active</span>
              </div>
              <p>{market.name}</p>
            </div>
          </div>
        </div>

        <p className={styles.detailDescription}>{market.description}</p>
      </div>

      <section className={styles.marketSummaryCard}>
        <div className={styles.marketSummaryRates} aria-label="Market rates">
          <div>
            <span>Supply APY</span>
            <strong>{riskMarket ? formatPct(riskMarket.supplyApy) : '—'}</strong>
          </div>
          <div>
            <span>Borrow APY</span>
            <strong>{riskMarket ? formatPct(riskMarket.borrowApy) : '—'}</strong>
          </div>
        </div>

        <div className={styles.simplePositionGrid}>
          <div>
            <span>Wallet</span>
            <strong>{isConnected ? num(lending.walletBalance) + ' ' + market.symbol : '—'}</strong>
          </div>
          <div>
            <span>Supplied</span>
            <strong>{isConnected ? num(lending.supplyBalance) + ' ' + market.symbol : '—'}</strong>
          </div>
          <div>
            <span>Borrowed</span>
            <strong>{isConnected ? num(lending.borrowBalance) + ' ' + market.symbol : '—'}</strong>
          </div>
        </div>

        {isConnected && action === 'borrow' ? (
          <div className={styles.contextHint}>
            You can borrow up to <strong>${num(borrowLimitRemaining)}</strong> with your current position.
          </div>
        ) : null}
        {isConnected && action === 'supply' ? (
          <div className={styles.contextHint}>
            Supply assets to earn <strong>{riskMarket ? formatPct(riskMarket.supplyApy) : '—'} APY</strong>.
          </div>
        ) : null}
      </section>

      <section className={styles.marketActionWrap}>
        <aside className={styles.simpleActionCard}>
          <div className={styles.simpleCardHead}>
            <div>
              <h2>{actionLabel} {market.symbol}</h2>
            </div>
          </div>

          <div className={styles.actions}>
            {['supply', 'withdraw', 'borrow', 'repay'].map((item) => (
              <button
                key={item}
                type="button"
                className={action === item ? styles.actionActive : styles.actionButton}
                onClick={() => {
                  setAction(item);
                  setAmount('');
                  setNotice('');
                }}
              >
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>

          <label className={styles.simpleAmountLabel} htmlFor="market-amount">Amount</label>
          <div className="amount-input-wrap">
            <input
              id="market-amount"
              type="number"
              min="0"
              max={action === 'repay' ? lending.borrowBalance : action === 'borrow' ? lending.maxBorrowAmount : undefined}
              step={market.decimals >= 8 ? '0.00000001' : '0.000001'}
              placeholder="0.00"
              value={amount}
              onChange={onAmount}
            />
            <span>{market.symbol}</span>
          </div>

          <div className={styles.simpleActionMeta}>
            <span>{balanceLabel}</span>
            {isConnected ? (
              <button type="button" onClick={setAmountFromMax} disabled={busy}>
                Max
              </button>
            ) : null}
          </div>

          {gatewayEnabled ? (
            <div className={styles.gatewaySource}>
              <BalanceSourceSelector
                value={fundingSource}
                onChange={setFundingSource}
                walletBalance={lending.walletBalance}
                gatewayBalances={gateway.balances}
                disabled={busy}
              />
            </div>
          ) : null}

          {!isConnected ? (
            <div className="connect-prompt">Connect your wallet to interact with this market.</div>
          ) : lending.reserveLoading ? (
            <div className="connect-prompt">Checking {market.symbol} market…</div>
          ) : lending.reserveActive !== true ? (
            <div className="connect-prompt">{market.symbol} is not available in the lending market.</div>
          ) : noLiquidity ? (
            <div className="connect-prompt">There is no {market.symbol} liquidity available to borrow right now.</div>
          ) : noRoom ? (
            <div className="connect-prompt">You have no remaining borrowing room.</div>
          ) : fundingSource === 'gateway' && gatewayEnabled && Number(gateway.total || 0) < numericAmount ? (
            <div className="connect-prompt">Gateway does not currently have enough finalized USDC for this amount.</div>
          ) : (
            <button
              type="button"
              className="primary-btn full-btn large-btn"
              disabled={
                busy ||
                !amount ||
                numericAmount <= 0 ||
                (action === 'repay' && debt <= 0) ||
                (action === 'borrow' && numericAmount > maxBorrowNumber)
              }
              onClick={run}
            >
              {busy
                ? 'Waiting for confirmation…'
                : needsApproval
                  ? 'Approve ' + market.symbol
                  : actionLabel + ' ' + market.symbol}
            </button>
          )}

          {notice ? <div className="notice" aria-live="polite">{notice}</div> : null}
        </aside>
      </section>
    </div>
  );
}