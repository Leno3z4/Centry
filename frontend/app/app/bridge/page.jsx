'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import styles from './bridge.module.css';

const ARC_CHAIN_ID = 5042002;

const BRIDGE_CHAINS = [
  {
    id: 'arc-testnet',
    chainId: ARC_CHAIN_ID,
    name: 'Arc Testnet',
    short: 'Arc',
    badge: 'A',
  },
  {
    id: 'base-sepolia',
    chainId: 84532,
    name: 'Base Sepolia',
    short: 'Base',
    badge: 'B',
  },
  {
    id: 'arbitrum-sepolia',
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    short: 'Arbitrum',
    badge: 'A',
  },
  {
    id: 'ethereum-sepolia',
    chainId: 11155111,
    name: 'Ethereum Sepolia',
    short: 'Ethereum',
    badge: 'E',
  },
];

const EXTERNAL_CHAINS = BRIDGE_CHAINS.filter((chain) => chain.chainId !== ARC_CHAIN_ID);

function ChainPicker({ value, chains, onChange, label }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = chains.find((chain) => chain.id === value) || chains[0];

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
        aria-label={label}
      >
        <span className={styles.chainBadge}>{selected.badge}</span>
        <span className={styles.chainText}>
          <strong>{selected.name}</strong>
          <small>USDC</small>
        </span>
        <span className={styles.chevron}>{open ? '⌃' : '⌄'}</span>
      </button>

      {open && (
        <div className={styles.chainMenu} role="listbox" aria-label={label}>
          {chains.map((chain) => (
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
  const [fromId, setFromId] = useState('base-sepolia');
  const [toId, setToId] = useState('arc-testnet');
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState(null);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const fromArc = fromId === 'arc-testnet';
  const toArc = toId === 'arc-testnet';

  const sourceChains = useMemo(
    () => (toArc ? EXTERNAL_CHAINS : [BRIDGE_CHAINS.find((chain) => chain.id === 'arc-testnet')]),
    [toArc],
  );

  const destinationChains = useMemo(
    () => (fromArc ? EXTERNAL_CHAINS : [BRIDGE_CHAINS.find((chain) => chain.id === 'arc-testnet')]),
    [fromArc],
  );

  const source = BRIDGE_CHAINS.find((chain) => chain.id === fromId) || BRIDGE_CHAINS[1];
  const destination = BRIDGE_CHAINS.find((chain) => chain.id === toId) || BRIDGE_CHAINS[0];

  const validAmount = Number.isFinite(Number(amount)) && Number(amount) > 0;

  const detectBalance = async () => {
    if (!address || !source) return;
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
    setAmount('');
    if (address) detectBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, source.id]);

  const switchDirection = () => {
    const currentFrom = fromId;
    const currentTo = toId;
    setFromId(currentTo);
    setToId(currentFrom);
    setBalance(null);
    setAmount('');
    setResult(null);
    setError('');
  };

  const changeFrom = (next) => {
    setFromId(next);
    if (next === toId) {
      setToId(next === 'arc-testnet' ? EXTERNAL_CHAINS[0].id : 'arc-testnet');
    }
    setBalance(null);
    setAmount('');
    setResult(null);
    setError('');
  };

  const changeTo = (next) => {
    setToId(next);
    if (next === fromId) {
      setFromId(next === 'arc-testnet' ? EXTERNAL_CHAINS[0].id : 'arc-testnet');
    }
    setBalance(null);
    setAmount('');
    setResult(null);
    setError('');
  };

  const setMax = () => {
    if (balance && Number(balance) > 0) setAmount(balance);
  };

  const bridge = async () => {
    if (!address || !validAmount || fromId === toId) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/tower/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromChainId: source.chainId,
          toChainId: destination.chainId,
          amount: amount.trim(),
          token: 'USDC',
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
          <h1>Move USDC across chains</h1>
          <p>Bridge testnet USDC into or out of Arc using Circle CCTP via Tower.</p>
        </div>
        <span className={styles.destinationPill}><i /> Circle CCTP · USDC</span>
      </header>

      <section className={styles.card}>
        <div className={styles.fieldBlock}>
          <label>From</label>
          <ChainPicker value={fromId} chains={sourceChains} onChange={changeFrom} label="Source chain" />
        </div>

        <button
          type="button"
          className={styles.arrowButton}
          onClick={switchDirection}
          disabled={loading}
          aria-label="Switch bridge direction"
          title="Switch bridge direction"
        >
          ⇅
        </button>

        <div className={styles.fieldBlock}>
          <label>To</label>
          <ChainPicker value={toId} chains={destinationChains} onChange={changeTo} label="Destination chain" />
        </div>

        <div className={styles.amountBlock}>
          <div className={styles.amountHeader}>
            <label>Amount</label>
            <button
              type="button"
              className={styles.balanceButton}
              onClick={setMax}
              disabled={!balance || Number(balance) <= 0}
            >
              Max {balance ? `${balance} USDC` : ''}
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
          <div><span>From</span><strong>{source.name}</strong></div>
          <div><span>To</span><strong>{destination.name}</strong></div>
          <div><span>Route</span><strong>Circle CCTP via Tower</strong></div>
          <div><span>Transfer type</span><strong>1:1 USDC</strong></div>
          <div><span>Recipient</span><strong>{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Connect wallet'}</strong></div>
        </div>

        <button
          type="button"
          className={styles.primaryButton}
          disabled={!isConnected || !validAmount || fromId === toId || loading}
          onClick={bridge}
        >
          {!isConnected
            ? 'Connect wallet'
            : loading
              ? 'Starting bridge…'
              : `Bridge USDC to ${destination.short}`}
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

      <p className={styles.disclaimer}>Bridge support is currently limited to USDC and the supported testnet networks shown above.</p>
    </div>
  );
}
