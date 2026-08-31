'use client';

import { useMemo, useState } from 'react';
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { MARKETS } from '../../../constants/markets';
import styles from './swap.module.css';

const LIVE_MARKETS = MARKETS.filter(
  (market) => market.status === 'live' && market.address,
);
const ARC_CHAIN_ID = 5042002;

function formatQuoteAmount(raw, decimals, symbol) {
  if (raw == null) return '—';
  try {
    return `${Number(formatUnits(BigInt(raw), decimals)).toLocaleString(undefined, {
      maximumFractionDigits: Math.min(decimals, 8),
    })} ${symbol}`;
  } catch {
    return '—';
  }
}

function errorText(error) {
  return error?.shortMessage || error?.message || 'The transaction could not be completed.';
}

export default function Page() {
  return (
    <Providers>
      <AppShell>
        <SwapContent />
      </AppShell>
    </Providers>
  );
}

function SwapContent() {
  const { address, isConnected } = useAccount();
  const { sendTransactionAsync, isPending: walletPending } = useSendTransaction();
  const [fromId, setFromId] = useState('usdc');
  const [toId, setToId] = useState('eurc');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState('0.50');
  const [quote, setQuote] = useState(null);
  const [swapTx, setSwapTx] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [stage, setStage] = useState('idle');

  const fromMarket = LIVE_MARKETS.find((market) => market.id === fromId) || LIVE_MARKETS[0];
  const toMarket = LIVE_MARKETS.find((market) => market.id === toId) || LIVE_MARKETS[1] || LIVE_MARKETS[0];

  const slippageBps = useMemo(() => {
    const parsed = Number(slippage);
    if (!Number.isFinite(parsed) || parsed < 0) return 50;
    return Math.round(parsed * 100);
  }, [slippage]);

  const amountRaw = useMemo(() => {
    if (!amount || !fromMarket) return '';
    try {
      return parseUnits(amount, fromMarket.decimals).toString();
    } catch {
      return '';
    }
  }, [amount, fromMarket]);

  const clearQuote = () => {
    setQuote(null);
    setSwapTx(null);
    setNotice('');
    setError('');
    setStage('idle');
  };

  const switchTokens = () => {
    setFromId(toId);
    setToId(fromId);
    clearQuote();
  };

  const getQuote = async () => {
    if (!amountRaw || !fromMarket?.address || !toMarket?.address) return;

    setNotice('');
    setError('');
    setQuote(null);
    setSwapTx(null);
    setStage('quoting');

    try {
      const response = await fetch('/api/tower/swap/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputToken: fromMarket.address,
          outputToken: toMarket.address,
          inputAmount: amountRaw,
          slippageTolerance: slippageBps,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Tower could not find a route.');
      }

      setQuote(result.data);
      setStage('quoted');
    } catch (caughtError) {
      setError(errorText(caughtError));
      setStage('idle');
    }
  };

  const buildAndSwap = async () => {
    if (!quote || !address || !isConnected) return;

    setNotice('');
    setError('');
    setStage('building');

    try {
      const response = await fetch('/api/tower/swap/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote, userAddress: address }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Tower could not build the swap transaction.');
      }

      const transactions = result.data || {};

      if (!transactions.swap?.to || !transactions.swap?.data) {
        throw new Error('Tower returned an incomplete swap transaction.');
      }

      if (transactions.approval) {
        setNotice(`Approve ${fromMarket.symbol} in your wallet first.`);
        setStage('approval');

        await sendTransactionAsync({
          to: transactions.approval.to,
          data: transactions.approval.data,
          value: BigInt(transactions.approval.value || '0'),
          gas: transactions.approval.gasLimit ? BigInt(transactions.approval.gasLimit) : undefined,
          chainId: ARC_CHAIN_ID,
        });
      }

      setNotice('Approve the swap transaction in your wallet.');
      setStage('swapping');

      const hash = await sendTransactionAsync({
        to: transactions.swap.to,
        data: transactions.swap.data,
        value: BigInt(transactions.swap.value || '0'),
        gas: transactions.swap.gasLimit ? BigInt(transactions.swap.gasLimit) : undefined,
        chainId: ARC_CHAIN_ID,
      });

      setSwapTx(hash);
      setStage('submitted');
      setNotice('Swap transaction submitted.');
    } catch (caughtError) {
      setError(errorText(caughtError));
      setStage('quoted');
    }
  };

  const swapReceipt = useWaitForTransactionReceipt({
    hash: swapTx || undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(swapTx) },
  });

  const isBusy = walletPending || ['quoting', 'building', 'approval', 'swapping'].includes(stage);
  const outputAmount = quote
    ? formatQuoteAmount(quote.outputAmount, toMarket.decimals, toMarket.symbol)
    : '—';
  const minOutput = quote
    ? formatQuoteAmount(quote.minOut, toMarket.decimals, toMarket.symbol)
    : '—';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>CENTRY · SWAP</span>
          <h1>Swap assets</h1>
          <p>Find a routed Arc swap without leaving Centry.</p>
        </div>
        <span className={styles.routePill}>
          <i className={styles.routeDot} /> Tower routing
        </span>
      </header>

      <div className={styles.panelGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <span className={styles.kicker}>ARC SWAP</span>
              <h2>Exchange</h2>
            </div>
          </div>

          <div className={styles.swapStack}>
            <div className={styles.assetField}>
              <label htmlFor="swap-amount">You pay</label>
              <div className={styles.assetRow}>
                <input
                  id="swap-amount"
                  className={styles.amountInput}
                  type="number"
                  min="0"
                  step={fromMarket.decimals >= 8 ? '0.00000001' : '0.000001'}
                  placeholder="0.00"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    clearQuote();
                  }}
                />
                <select
                  className={styles.tokenSelect}
                  value={fromId}
                  onChange={(event) => {
                    const next = event.target.value;
                    setFromId(next);
                    if (next === toId) {
                      setToId(fromId);
                    }
                    clearQuote();
                  }}
                  aria-label="Input token"
                >
                  {LIVE_MARKETS.map((market) => (
                    <option key={market.id} value={market.id}>{market.symbol}</option>
                  ))}
                </select>
              </div>
            </div>

            <button type="button" className={styles.switchButton} onClick={switchTokens} disabled={isBusy} aria-label="Switch tokens">
              ↓
            </button>

            <div className={styles.assetField}>
              <label htmlFor="swap-output">You receive</label>
              <div className={styles.assetRow}>
                <input
                  id="swap-output"
                  className={styles.amountInput}
                  type="text"
                  readOnly
                  placeholder="Quote appears here"
                  value={quote ? outputAmount : ''}
                />
                <select
                  className={styles.tokenSelect}
                  value={toId}
                  onChange={(event) => {
                    setToId(event.target.value);
                    clearQuote();
                  }}
                  aria-label="Output token"
                >
                  {LIVE_MARKETS.filter((market) => market.id !== fromId).map((market) => (
                    <option key={market.id} value={market.id}>{market.symbol}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className={styles.metaRow}>
            <span>Slippage</span>
            <input
              value={slippage}
              onChange={(event) => {
                setSlippage(event.target.value);
                clearQuote();
              }}
              aria-label="Slippage percentage"
              inputMode="decimal"
              style={{ width: 72, textAlign: 'right', background: 'transparent', border: 0, color: 'inherit' }}
            />
            <span>%</span>
          </div>

          {quote && (
            <div className={styles.quoteCard}>
              <div className={styles.quoteRow}><span>Expected output</span><strong className={styles.quoteOutput}>{outputAmount}</strong></div>
              <div className={styles.quoteRow}><span>Minimum received</span><strong>{minOutput}</strong></div>
              <div className={styles.quoteRow}><span>Price impact</span><strong>{quote.priceImpact ?? '—'}%</strong></div>
              <div className={styles.quoteRow}><span>Fee</span><strong>{quote.feeBps != null ? `${quote.feeBps} bps` : '—'}</strong></div>
              <div className={styles.quoteRow}><span>Route</span><strong>{quote.dexName || quote.dexId || 'Tower'}</strong></div>
            </div>
          )}

          {!quote ? (
            <button type="button" className={styles.primaryButton} disabled={!amountRaw || isBusy} onClick={getQuote}>
              {stage === 'quoting' ? 'Finding best route…' : 'Get quote'}
            </button>
          ) : (
            <button type="button" className={styles.primaryButton} disabled={!isConnected || isBusy || swapReceipt.isLoading} onClick={buildAndSwap}>
              {!isConnected ? 'Connect wallet to swap' : stage === 'approval' ? 'Approve in wallet…' : stage === 'swapping' ? 'Confirm swap…' : stage === 'submitted' && !swapReceipt.isSuccess ? 'Swap submitted' : 'Swap'}
            </button>
          )}

          {!isConnected && <div className={styles.notice}>Connect your wallet to execute the swap. Quotes can still be requested.</div>}
          {notice && <div className={`${styles.notice} ${styles.noticeSuccess}`}>{notice}</div>}
          {error && <div className={`${styles.notice} ${styles.noticeError}`}>{error}</div>}
          {swapReceipt.isSuccess && <div className={`${styles.notice} ${styles.noticeSuccess}`}>Swap confirmed on Arc.</div>}
        </section>

        <section className={`${styles.panel} ${styles.bridgeCard}`}>
          <div className={styles.panelHead}>
            <div>
              <span className={styles.kicker}>BRING FUNDS TO ARC</span>
              <h2>Cross-chain USDC</h2>
            </div>
          </div>
          <p className={styles.bridgeDescription}>
            USDC bridging will use Tower's cross-chain endpoint and Circle's transfer flow. It will be added here separately from normal swaps.
          </p>
          <div className={styles.quoteCard}>
            <div className={styles.bridgeRow}><span>Asset</span><strong>USDC</strong></div>
            <div className={styles.bridgeRow}><span>Destination</span><strong>Arc Testnet</strong></div>
            <div className={styles.bridgeRow}><span>Status</span><strong>Bridge integration next</strong></div>
          </div>
          <button type="button" className={styles.secondaryButton} disabled>Detect supported USDC balances</button>
        </section>
      </div>
    </div>
  );
}
