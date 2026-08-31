'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useAccount,
  useReadContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { MARKETS } from '../../../constants/markets';
import { ERC20_ABI } from '../../../constants/abis';
import styles from './swap.module.css';

const LIVE_MARKETS = MARKETS.filter(
  (market) => market.status === 'live' && market.address,
);
const ARC_CHAIN_ID = 5042002;

function formatTokenAmount(raw, decimals, symbol) {
  if (raw == null || decimals == null) return '—';

  try {
    const value = formatUnits(BigInt(String(raw)), Number(decimals));
    return `${value} ${symbol}`;
  } catch {
    return '—';
  }
}

function formatPriceImpact(value) {
  if (value == null || value === '') return '—';

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';

  // Tower's Arc testnet response currently exposes this field as bps.
  return `${(parsed / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

function getErrorMessage(error) {
  return error?.shortMessage || error?.message || 'The transaction could not be completed.';
}

function TokenDropdown({ value, markets, onChange, label }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = markets.find((market) => market.id === value) || markets[0];

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  return (
    <div className={styles.tokenPicker} ref={rootRef}>
      <button
        type="button"
        className={`${styles.tokenTrigger} ${open ? styles.tokenTriggerOpen : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        <span className={`${styles.tokenIcon} ${styles[`tokenIcon_${selected?.id || 'usdc'}`]}`}>
          {selected?.symbol === 'cirBTC' ? '₿' : selected?.symbol === 'EURC' ? '€' : '$'}
        </span>
        <span className={styles.tokenTriggerText}>
          <strong>{selected?.symbol || '—'}</strong>
          <small>{selected?.name || ''}</small>
        </span>
        <span className={`${styles.tokenChevron} ${open ? styles.tokenChevronOpen : ''}`}>⌄</span>
      </button>

      {open && (
        <div className={styles.tokenMenu} role="listbox" aria-label={label}>
          {markets.map((market) => (
            <button
              key={market.id}
              type="button"
              role="option"
              aria-selected={market.id === value}
              className={`${styles.tokenOption} ${market.id === value ? styles.tokenOptionActive : ''}`}
              onClick={() => {
                onChange(market.id);
                setOpen(false);
              }}
            >
              <span className={`${styles.tokenIcon} ${styles[`tokenIcon_${market.id}`]}`}>
                {market.symbol === 'cirBTC' ? '₿' : market.symbol === 'EURC' ? '€' : '$'}
              </span>
              <span className={styles.tokenOptionText}>
                <strong>{market.symbol}</strong>
                <small>{market.name}</small>
              </span>
              {market.id === value ? <span className={styles.tokenCheck}>✓</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  const requestIdRef = useRef(0);

  const fromMarket = LIVE_MARKETS.find((market) => market.id === fromId) || LIVE_MARKETS[0];
  const toMarket = LIVE_MARKETS.find((market) => market.id === toId) || LIVE_MARKETS[1] || LIVE_MARKETS[0];

  const { data: inputDecimals } = useReadContract({
    address: fromMarket?.address,
    abi: ERC20_ABI,
    functionName: 'decimals',
    query: { enabled: Boolean(fromMarket?.address) },
  });

  const { data: outputDecimals } = useReadContract({
    address: toMarket?.address,
    abi: ERC20_ABI,
    functionName: 'decimals',
    query: { enabled: Boolean(toMarket?.address) },
  });

  const fromTokenDecimals = Number(inputDecimals ?? fromMarket?.decimals ?? 6);
  const toTokenDecimals = Number(outputDecimals ?? toMarket?.decimals ?? 6);

  const slippageBps = useMemo(() => {
    const parsed = Number(slippage);
    if (!Number.isFinite(parsed) || parsed < 0) return 50;
    return Math.min(5000, Math.round(parsed * 100));
  }, [slippage]);

  const amountRaw = useMemo(() => {
    if (!amount) return '';

    try {
      return parseUnits(amount, fromTokenDecimals).toString();
    } catch {
      return '';
    }
  }, [amount, fromTokenDecimals]);

  const invalidateQuote = () => {
    requestIdRef.current += 1;
    setQuote(null);
    setSwapTx(null);
    setNotice('');
    setError('');
    setStage('idle');
  };

  useEffect(() => {
    const requestId = ++requestIdRef.current;

    if (!amountRaw || !fromMarket?.address || !toMarket?.address) {
      setQuote(null);
      setError('');
      setStage('idle');
      return undefined;
    }

    setQuote(null);
    setError('');
    setNotice('');
    setStage('quoting');

    const timer = window.setTimeout(async () => {
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
        if (requestId !== requestIdRef.current) return;

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Tower could not find a route.');
        }

        if (!result.data?.outputAmount || !result.data?.minOut) {
          throw new Error('Tower returned an incomplete quote.');
        }

        setQuote(result.data);
        setStage('quoted');
      } catch (caughtError) {
        if (requestId !== requestIdRef.current) return;
        setQuote(null);
        setError(getErrorMessage(caughtError));
        setStage('idle');
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [amountRaw, fromMarket?.address, toMarket?.address, slippageBps]);

  const swapTokens = () => {
    const currentFrom = fromId;
    setFromId(toId);
    setToId(currentFrom);
    invalidateQuote();
  };

  const changeFrom = (next) => {
    setFromId(next);
    if (next === toId) {
      const replacement = LIVE_MARKETS.find((market) => market.id !== next);
      if (replacement) setToId(replacement.id);
    }
    invalidateQuote();
  };

  const changeTo = (next) => {
    setToId(next);
    invalidateQuote();
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
      setError(getErrorMessage(caughtError));
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
    ? formatTokenAmount(quote.outputAmount, toTokenDecimals, toMarket.symbol)
    : '—';
  const minOutput = quote
    ? formatTokenAmount(quote.minOut, toTokenDecimals, toMarket.symbol)
    : '—';
  const quoteReady = Boolean(
    quote?.outputAmount &&
      quote?.minOut &&
      BigInt(String(quote.minOut)) > 0n &&
      BigInt(String(quote.outputAmount)) >= BigInt(String(quote.minOut)),
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>CENTRY · SWAP</span>
          <h1>Swap assets</h1>
          <p>Find a routed Arc swap without leaving Centry.</p>
        </div>
        <span className={styles.routePill}>
          <i className={styles.routeDot} />
          Tower routing
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
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={amount}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === '' || /^\d*(\.\d*)?$/.test(value)) {
                      setAmount(value);
                    }
                  }}
                />
                <TokenDropdown
                  value={fromId}
                  markets={LIVE_MARKETS}
                  onChange={changeFrom}
                  label="Input token"
                />
              </div>
            </div>

            <button
              type="button"
              className={styles.switchButton}
              onClick={swapTokens}
              disabled={isBusy}
              aria-label="Switch tokens"
            >
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
                  placeholder={stage === 'quoting' ? 'Finding route…' : 'Quote appears here'}
                  value={quote ? outputAmount : ''}
                />
                <TokenDropdown
                  value={toId}
                  markets={LIVE_MARKETS.filter((market) => market.id !== fromId)}
                  onChange={changeTo}
                  label="Output token"
                />
              </div>
            </div>
          </div>

          <div className={styles.metaRow}>
            <span>Slippage</span>
            <input
              className={styles.slippageInput}
              value={slippage}
              onChange={(event) => {
                const value = event.target.value;
                if (value === '' || /^\d*(\.\d*)?$/.test(value)) {
                  setSlippage(value);
                }
              }}
              aria-label="Slippage percentage"
              inputMode="decimal"
            />
            <span>%</span>
          </div>

          {quote && (
            <div className={styles.quoteCard}>
              <div className={styles.quoteRow}>
                <span>Expected output</span>
                <strong className={styles.quoteOutput}>{outputAmount}</strong>
              </div>
              <div className={styles.quoteRow}>
                <span>Minimum received</span>
                <strong>{minOutput}</strong>
              </div>
              <div className={styles.quoteRow}>
                <span>Price impact</span>
                <strong>{formatPriceImpact(quote.priceImpact)}</strong>
              </div>
              <div className={styles.quoteRow}>
                <span>Fee</span>
                <strong>{quote.feeBps != null ? `${quote.feeBps} bps` : '—'}</strong>
              </div>
              <div className={styles.quoteRow}>
                <span>Route</span>
                <strong>{quote.dexName || quote.dexId || 'Tower'}</strong>
              </div>
            </div>
          )}

          {error && <div className={`${styles.notice} ${styles.noticeError}`}>{error}</div>}

          {quoteReady ? (
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!isConnected || isBusy || swapReceipt.isLoading}
              onClick={buildAndSwap}
            >
              {!isConnected
                ? 'Connect wallet to swap'
                : stage === 'approval'
                  ? 'Approve in wallet…'
                  : stage === 'swapping'
                    ? 'Confirm swap…'
                    : stage === 'building'
                      ? 'Preparing swap…'
                      : stage === 'submitted' && !swapReceipt.isSuccess
                        ? 'Swap submitted'
                        : 'Swap'}
            </button>
          ) : (
            <div className={styles.quoteStatus}>
              {stage === 'quoting'
                ? 'Finding the best route…'
                : amountRaw
                  ? 'Waiting for a quote…'
                  : 'Enter an amount to get a quote.'}
            </div>
          )}

          {!isConnected && (
            <div className={styles.notice}>
              Connect your wallet to execute the swap. Quotes can still be requested.
            </div>
          )}
          {notice && <div className={`${styles.notice} ${styles.noticeSuccess}`}>{notice}</div>}
          {swapReceipt.isSuccess && (
            <div className={`${styles.notice} ${styles.noticeSuccess}`}>Swap confirmed on Arc.</div>
          )}
        </section>

        <section className={`${styles.panel} ${styles.bridgeCard}`}>
          <div className={styles.panelHead}>
            <div>
              <span className={styles.kicker}>BRING FUNDS TO ARC</span>
              <h2>Cross-chain USDC</h2>
            </div>
          </div>

          <p className={styles.bridgeDescription}>
            USDC bridging will use Tower&apos;s cross-chain endpoint and Circle&apos;s transfer flow. It stays separate from normal swaps.
          </p>

          <div className={styles.quoteCard}>
            <div className={styles.bridgeRow}>
              <span>Asset</span>
              <strong>USDC</strong>
            </div>
            <div className={styles.bridgeRow}>
              <span>Destination</span>
              <strong>Arc Testnet</strong>
            </div>
            <div className={styles.bridgeRow}>
              <span>Status</span>
              <strong>Bridge integration next</strong>
            </div>
          </div>

          <button type="button" className={styles.secondaryButton} disabled>
            Detect supported USDC balances
          </button>
        </section>
      </div>
    </div>
  );
}
