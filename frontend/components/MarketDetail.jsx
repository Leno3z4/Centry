'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { ACTIVE_MARKETS } from '../constants/markets';
import { useMultiMarketLending } from '../hooks/useMultiMarketLending';
import { useDeFiRisk } from '../hooks/useDeFiRisk';
import { useGatewayFunding } from '../hooks/useGatewayFunding';
import BalanceSourceSelector from './BalanceSourceSelector';
import styles from '../app/app/markets/markets.module.css';

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

function HealthMeter({ value }) {
  const safe = Math.min(Math.max(Number(value || 0), 0), 100);
  const tone = safe < 35 ? 'danger' : safe < 70 ? 'warning' : 'safe';

  return (
    <div className={styles.healthMeter}>
      <div className={styles.healthHeader}>
        <div>
          <span>Position health</span>
          <strong>{safe}%</strong>
        </div>
        <span className={styles.healthBadge + ' ' + styles['healthBadge_' + tone]}>
          {tone === 'safe' ? 'Healthy' : tone === 'warning' ? 'Watch' : 'At risk'}
        </span>
      </div>
      <div
        className={styles.healthTrack}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safe}
        aria-label="Position health"
      >
        <div
          className={styles.healthFill}
          data-tone={tone}
          style={{ width: safe + '%' }}
        />
      </div>
      <div className={styles.healthMeta}>
        <span>Higher is safer</span>
        <strong>{safe}%</strong>
      </div>
    </div>
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
  const [refreshingPosition, setRefreshingPosition] = useState(false);
  const [fundingSource, setFundingSource] = useState('wallet');
  const refreshTimerRef = useRef(null);
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
  const ltv = Number(riskMarket?.ltvBps || 0) / 100;
  const borrowLimitTotal = Number(lending.accountPosition?.totalBorrowPowerUsd || 0);
  const borrowLimitRemaining = Number(
    lending.accountPosition?.remainingBorrowCapacityUsd || 0,
  );
  const borrowLimitUsedPct =
    borrowLimitTotal > 0
      ? Math.min(
          Math.max(
            ((borrowLimitTotal - borrowLimitRemaining) / borrowLimitTotal) * 100,
            0,
          ),
          100,
        )
      : 0;

  useEffect(
    () => () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    },
    [],
  );

  const refreshPosition = async (attempt = 0) => {
    try {
      await lending.refetchAll();
    } catch {
      // Keep polling through temporary RPC pressure.
    }
    if (attempt >= 15) {
      setRefreshingPosition(false);
      return;
    }
    refreshTimerRef.current = window.setTimeout(
      () => refreshPosition(attempt + 1),
      3000,
    );
  };

  const setAmountFromPercent = (percent) => {
    let base = 0;
    if (action === 'withdraw') base = Number(lending.supplyBalance || 0);
    else if (action === 'repay') base = debt;
    else if (action === 'borrow') base = maxBorrowNumber;
    else {
      base =
        fundingSource === 'gateway' && gatewayEnabled
          ? Number(gateway.total || 0)
          : Number(lending.walletBalance || 0);
    }

    if (!Number.isFinite(base) || base <= 0) {
      setAmount('0');
      return;
    }

    if (percent === 100) {
      setAmount(
        action === 'borrow'
          ? String(maxBorrow)
          : action === 'repay'
            ? String(lending.borrowBalance || '0')
            : action === 'withdraw'
              ? String(lending.supplyBalance || '0')
              : fundingSource === 'gateway' && gatewayEnabled
                ? String(gateway.total || '0')
                : String(lending.walletBalance || '0'),
      );
      return;
    }

    const scaled = base * (percent / 100);
    const precision = market?.decimals >= 8 ? 8 : 6;
    setAmount(scaled.toFixed(precision).replace(/\.?(0+)$/, ''));
  };

  const setMax = () => setAmountFromPercent(100);

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
      busy ||
      refreshingPosition
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
        setNotice(`Approved ${amount} ${market.symbol}.`);
        return;
      }
      if (action === 'supply') {
        await lending.supply(amount);
        setAmount('');
        setRefreshingPosition(true);
        setNotice('Supply confirmed. Updating your borrowing capacity…');
        if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
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
      setNotice(
        error?.shortMessage ||
          error?.message ||
          'Transaction failed. Check your wallet, network, allowance, Gateway balance, and reserve state.',
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
              <span className={styles.sectionKicker}>LENDING MARKET</span>
              <div className={styles.detailTitleRow}>
                <h1>{market.symbol}</h1>
                <span className={styles.detailStatus}>
                  <i aria-hidden="true" />
                  Active
                </span>
              </div>
              <p>{market.name}</p>
            </div>
          </div>

          <div className={styles.rateBar} aria-label="Market rates">
            <div>
              <span>Supply APY</span>
              <strong>{riskMarket ? formatPct(riskMarket.supplyApy) : '—'}</strong>
            </div>
            <div>
              <span>Borrow APY</span>
              <strong>{riskMarket ? formatPct(riskMarket.borrowApy) : '—'}</strong>
            </div>
            <div>
              <span>LTV</span>
              <strong>{riskMarket ? formatPct(ltv) : '—'}</strong>
            </div>
          </div>
        </div>

        <p className={styles.detailDescription}>{market.description}</p>
      </div>

      <section className={styles.detailGrid}>
        <div className={styles.detailMain}>
          <section className={styles.detailCard}>
            <div className={styles.detailCardHead}>
              <div>
                <span className={styles.sectionKicker}>YOUR ACCOUNT</span>
                <h2>Position overview</h2>
              </div>
              {isConnected ? <span className={styles.connectedPill}>Wallet connected</span> : null}
            </div>

            <div className={styles.accountMetricGrid}>
              <div><span>Wallet balance</span><strong>{isConnected ? num(lending.walletBalance) + ' ' + market.symbol : '—'}</strong></div>
              <div><span>Supplied</span><strong>{isConnected ? num(lending.supplyBalance) + ' ' + market.symbol : '—'}</strong></div>
              <div><span>Borrowed</span><strong>{isConnected ? num(lending.borrowBalance) + ' ' + market.symbol : '—'}</strong></div>
              <div><span>Remaining borrow limit</span><strong>{isConnected ? '$' + num(lending.borrowLimit) : '—'}</strong></div>
            </div>

            <div className={styles.accountHealthRow}>
              <HealthMeter value={lending.healthFactorPercent} />
              <div className={styles.borrowLimitMeter}>
                <div>
                  <span>Borrow limit used</span>
                  <strong>{isConnected ? formatPct(borrowLimitUsedPct) : '—'}</strong>
                </div>
                <div className={styles.borrowLimitTrack} aria-hidden="true">
                  <span style={{ width: borrowLimitUsedPct + '%' }} />
                </div>
                <small>
                  {isConnected
                    ? '$' + num(Math.max(borrowLimitTotal - borrowLimitRemaining, 0)) + ' used of $' + num(borrowLimitTotal)
                    : 'Connect wallet to view borrowing capacity'}
                </small>
              </div>
            </div>
          </section>

          <section className={styles.detailCard}>
            <div className={styles.detailCardHead}>
              <div>
                <span className={styles.sectionKicker}>MARKET STATS</span>
                <h2>Liquidity & utilization</h2>
              </div>
              <span className={styles.reserveBadge}>
                <i aria-hidden="true" />
                {lending.reserveActive ? 'Reserve active' : lending.reserveLoading ? 'Checking' : 'Not enabled'}
              </span>
            </div>

            <div className={styles.marketStatGrid}>
              <div><span>Total liquidity</span><strong>{num(lending.reserveData?.totalLiquidity)} {market.symbol}</strong></div>
              <div><span>Total supplied</span><strong>{num(lending.reserveData?.totalSupply)} {market.symbol}</strong></div>
              <div><span>Total borrowed</span><strong>{num(lending.reserveData?.totalBorrows)} {market.symbol}</strong></div>
              <div><span>Utilization</span><strong>{formatPct(lending.reserveData?.utilization)}</strong></div>
            </div>

            <div className={styles.utilizationPanel}>
              <div>
                <span>Market utilization</span>
                <strong>{formatPct(lending.reserveData?.utilization)}</strong>
              </div>
              <div className={styles.utilizationTrack} aria-hidden="true">
                <span style={{ width: Math.min(Math.max(Number(lending.reserveData?.utilization || 0), 0), 100) + '%' }} />
              </div>
            </div>
          </section>

          <section className={styles.detailCard}>
            <div className={styles.detailCardHead}>
              <div>
                <span className={styles.sectionKicker}>RISK PARAMETERS</span>
                <h2>Collateral rules</h2>
              </div>
            </div>
            <div className={styles.riskParameterGrid}>
              <div><span>Loan-to-value</span><strong>{riskMarket ? formatPct(ltv) : '—'}</strong></div>
              <div><span>Liquidation threshold</span><strong>{riskMarket ? formatPct(Number(riskMarket.liquidationThresholdBps || 0) / 100) : '—'}</strong></div>
              <div><span>Supply cap usage</span><strong>{riskMarket ? formatPct(riskMarket.supplyCapUtilizationPct) : '—'}</strong></div>
              <div><span>Borrow cap usage</span><strong>{riskMarket ? formatPct(riskMarket.borrowCapUtilizationPct) : '—'}</strong></div>
            </div>
          </section>
        </div>

        <aside className={styles.actionPanel}>
          <div className={styles.actionPanelInner}>
            <div className={styles.detailCardHead}>
              <div>
                <span className={styles.sectionKicker}>ACTION</span>
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

            <label className="field-label" htmlFor="market-amount">Amount</label>
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

            <div className={styles.quickSelects} aria-label="Quick amount selection">
              {[25, 50, 75, 100].map((percent) => (
                <button
                  key={percent}
                  type="button"
                  onClick={() => setAmountFromPercent(percent)}
                  disabled={!isConnected || busy || refreshingPosition}
                >
                  {percent === 100 ? 'MAX' : percent + '%'}
                </button>
              ))}
            </div>

            {gatewayEnabled ? (
              <div className={styles.gatewaySource}>
                <BalanceSourceSelector
                  value={fundingSource}
                  onChange={setFundingSource}
                  walletBalance={lending.walletBalance}
                  gatewayBalances={gateway.balances}
                  disabled={busy || refreshingPosition}
                />
              </div>
            ) : null}

            <div className={styles.formMeta}>
              <span>
                {action === 'repay'
                  ? 'Owed: ' + (isConnected ? num(lending.borrowBalance, Math.min(market.decimals, 8)) + ' ' + market.symbol : 'Connect wallet')
                  : action === 'borrow'
                    ? 'Max: ' + (isConnected ? num(maxBorrow, Math.min(market.decimals, 8)) + ' ' + market.symbol : 'Connect wallet')
                    : fundingSource === 'gateway' && gatewayEnabled
                      ? 'Gateway: ' + num(gateway.total, 6) + ' USDC'
                      : 'Wallet: ' + (isConnected ? num(lending.walletBalance) + ' ' + market.symbol : 'Connect wallet')}
              </span>
              {isConnected ? (
                <button type="button" onClick={setMax} disabled={refreshingPosition}>
                  Max
                </button>
              ) : null}
            </div>

            <div className={styles.transactionPreview}>
              <div>
                <span>Estimated gas</span>
                <strong>Wallet estimate</strong>
              </div>
              <div>
                <span>Health factor after</span>
                <strong>{amount ? 'Simulate in wallet' : '—'}</strong>
              </div>
              <div>
                <span>Supply APY</span>
                <strong>{riskMarket ? formatPct(riskMarket.supplyApy) : '—'}</strong>
              </div>
              <div>
                <span>Borrow APY</span>
                <strong>{riskMarket ? formatPct(riskMarket.borrowApy) : '—'}</strong>
              </div>
            </div>

            {!isConnected ? (
              <div className="connect-prompt">Connect your wallet to interact with this market.</div>
            ) : lending.reserveLoading ? (
              <div className="connect-prompt">Checking {market.symbol} reserve…</div>
            ) : refreshingPosition ? (
              <div className="connect-prompt" aria-live="polite" aria-busy="true">
                Updating your borrowing capacity… We’re refreshing the lending position.
              </div>
            ) : lending.reserveActive !== true ? (
              <div className="connect-prompt">{market.symbol} is not enabled in the connected Centry LendingPool.</div>
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
                disabled={busy || refreshingPosition || !amount || numericAmount <= 0 || (action === 'repay' && debt <= 0) || (action === 'borrow' && numericAmount > maxBorrowNumber)}
                onClick={run}
              >
                {busy
                  ? 'Waiting for confirmation…'
                  : refreshingPosition
                    ? 'Updating borrow capacity…'
                    : needsApproval
                      ? 'Approve ' + market.symbol
                      : actionLabel + ' ' + market.symbol}
              </button>
            )}
            {notice ? <div className="notice" aria-live="polite">{notice}</div> : null}
          </div>
        </aside>
      </section>
    </div>
  );
}
