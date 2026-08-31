'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import styles from './bridge.module.css';

const ARC_CHAIN_ID = 5042002;

const SOURCE_CHAINS = [
  { id: 'base-sepolia', chainId: 84532, name: 'Base Sepolia', short: 'Base', badge: 'B' },
  { id: 'arbitrum-sepolia', chainId: 421614, name: 'Arbitrum Sepolia', short: 'Arbitrum', badge: 'A' },
  { id: 'ethereum-sepolia', chainId: 11155111, name: 'Ethereum Sepolia', short: 'Ethereum', badge: 'E' },
];

function ChainPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = SOURCE_CHAINS.find((chain) => chain.id === value) || SOURCE_CHAINS[0];

  useEffect(() => {
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  return (
    <div className={styles.chainPicker} ref={rootRef}>
      <button
        type="button"
        className={`${styles.chainTrigger} ${open ? styles.chainTriggerOpen : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={styles.chainBadge}>{selected.badge}</span>
        <span className={styles.chainText}>
          <strong>{selected.name}</strong>
          <small>USDC</small>
        </span>
        <span className={styles.chevron}>{open ? '⌃' : '⌄'}</span>
      </button>

      {open && (
        <div className={styles.chainMenu} role="listbox">
          {SOURCE_CHAINS.map((chain) => (
            <button
              key={chain.id}
              type="button"
              role="option"
              aria-selected={chain.id === selected.id}
              className={`${styles.chainOption} ${chain.id === selected.id ? styles.chainOptionActive : ''}`}
              onClick={() => {
                onChange(chain.id);
                setOpen(false);
              }}
            >
              <span className={styles.chainBadge}>{chain.badge}</span>
              <span className={styles.chainText}>
                <strong>{chain.name}</strong>
                <small>USDC</small>
              </span>
              {chain.id === selected.id && <span className={styles.check}>✓</span>}
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
        <BridgeContent />
      </AppShell>
    </Providers>
  );
}

function BridgeContent() {
  const { address, isConnected } = useAccount();
  const [sourceId, setSourceId] = useState('base-sepolia');
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState(null);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const source = SOURCE_CHAINS.find((chain) => chain.id === sourceId) || SOURCE_CHAINS[0];

  const numericAmount = useMemo(() => Number(amount || 0), [amount]);
  const validAmount = Number.isFinite(numericAmount) && numericAmount > 0;

  const detectBalance = async () => {
    if (!address) return;
    setCheckingBalance(true);
    setError('');
    try {
      const response = await fetch('/api/tower/wallet/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, chainId: source.id }),
      });
      const data = await response.json();
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || 'Could not read the source-chain balance.');
      }
      setBalance(String(data.balance ?? data.data?.balance ?? '0'));
    } catch (caughtError) {
      setError(caughtError?.message || 'Could not read the source-chain balance.');
    } finally {
      setCheckingBalance(false);
    }
  };

  useEffect(() => {
    setBalance(null);
    setResult(null);
    setError('');
    if (address) detectBalance();
  }, [address, sourceId]);

  const bridge = async () => {
    if (!address || !validAmount) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/tower/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromChainId: source.chainId,
          toChainId: ARC_CHAIN_ID,
          amount,
          recipientAddress: address,
          senderAddress: address,
          useForwarder: true,
        }),
      });

      const data = await response.json();
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || 'Tower could not create the bridge transfer.');
      }
      setResult(data);
    } catch (caughtError) {
      setError(caughtError?.message || 'Bridge request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>CENTRY · BRIDGE</span>
          <h1>Bring USDC to Arc</h1>
          <p>Move testnet USDC from a supported source chain into your connected Arc wallet.</p>
        </div>
        <span className={styles.destinationPill}><i /> Arc Testnet</span>
      </header>

      <section className={styles.card}>
        <div className={styles.fieldBlock}>
          <label>From</label>
          <ChainPicker value={sourceId} onChange={setSourceId} />
        </div>

        <div className={styles.arrow}>↓</div>

        <div className={styles.fieldBlock}>
          <label>To</label>
          <div className={styles.destinationBox}>
            <span className={styles.arcBadge}>C</span>
            <span className={styles.chainText}>
              <strong>Arc Testnet</strong>
              <small>USDC</small>
            </span>
            <span className={styles.locked}>Destination</span>
          </div>
        </div>

        <div className={styles.amountBlock}>
          <div className={styles.amountHeader}>
            <label>Amount</label>
            <button
              type="button"
              className={styles.balanceButton}
              onClick={() => setAmount(balance || '')}
              disabled={!balance}
            >
              Balance {balance ? `${balance} USDC` : '—'}
            </button>
          </div>
          <div className={styles.amountField}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => {
                const value = event.target.value;
                if (value === '' || /^\d*(\.\d{0,6})?$/.test(value)) setAmount(value);
              }}
            />
            <span>USDC</span>
          </div>
        </div>

        <div className={styles.summary}>
          <div><span>Route</span><strong>Circle CCTP via Tower</strong></div>
          <div><span>Destination wallet</span><strong>{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Connect wallet'}</strong></div>
          <div><span>Transfer type</span><strong>1:1 USDC</strong></div>
        </div>

        <button
          type="button"
          className={styles.primaryButton}
          disabled={!isConnected || !validAmount || loading}
          onClick={bridge}
        >
          {!isConnected ? 'Connect wallet' : loading ? 'Starting bridge…' : 'Bridge USDC to Arc'}
        </button>

        {isConnected && (
          <button type="button" className={styles.refreshButton} onClick={detectBalance} disabled={checkingBalance}>
            {checkingBalance ? 'Checking balance…' : `Refresh ${source.short} USDC balance`}
          </button>
        )}

        {error && <div className={`${styles.notice} ${styles.noticeError}`}>{error}</div>}

        {result && (
          <div className={`${styles.notice} ${styles.noticeSuccess}`}>
            <strong>Bridge requested.</strong>
            <span>{result.status ? `Status: ${result.status}` : 'Tower accepted the request.'}</span>
            {result.transactionHash && <code>{result.transactionHash}</code>}
            {result.estimatedTime && <span>Estimated settlement: {result.estimatedTime}</span>}
          </div>
        )}
      </section>

      <p className={styles.disclaimer}>Bridge support is currently limited to USDC and supported testnet source chains.</p>
    </div>
  );
}
