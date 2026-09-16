'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import styles from './TransactionHistory.module.css';

function shortHash(value) {
  return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : '—';
}

function labelForMethod(method) {
  const value = String(method || 'Transaction').replaceAll('_', ' ');
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TransactionHistory() {
  const { address, isConnected } = useAccount();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isConnected || !address) {
      setItems([]);
      setError('');
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    fetch(`/api/transactions?address=${encodeURIComponent(address)}`)
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load transactions.');
        if (!cancelled) setItems(Array.isArray(result.items) ? result.items : []);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason?.message || 'Unable to load transactions.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [address, isConnected]);

  return (
    <section className={styles.panel} aria-label="Transaction history">
      <div className={styles.head}>
        <div>
          <h2>Transactions</h2>
          <p>Recent transactions sent from your connected wallet.</p>
        </div>
        {address ? <a href={`https://testnet.arcscan.app/address/${address}?tab=txs`} target="_blank" rel="noreferrer">Open explorer ↗</a> : null}
      </div>

      {!isConnected ? <div className={styles.empty}>Connect your wallet to view your transaction history.</div> : null}
      {loading ? <div className={styles.empty}>Loading transactions…</div> : null}
      {!loading && error ? <div className={styles.empty}>{error}</div> : null}
      {!loading && !error && isConnected && items.length === 0 ? <div className={styles.empty}>No wallet transactions found yet.</div> : null}

      {!loading && !error && items.length > 0 ? (
        <div className={styles.list}>
          {items.map((tx) => (
            <a key={tx.hash} className={styles.item} href={`https://testnet.arcscan.app/tx/${tx.hash}`} target="_blank" rel="noreferrer">
              <div className={styles.icon}>{tx.status === 'ok' ? '✓' : '·'}</div>
              <div className={styles.main}>
                <strong>{labelForMethod(tx.method)}</strong>
                <span>{shortHash(tx.hash)} · {formatDate(tx.timestamp)}</span>
              </div>
              <span className={styles.arrow}>↗</span>
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}
