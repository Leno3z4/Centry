'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './BalanceSourceSelector.module.css';

function formatBalance(value) {
  const number = Number(value || 0);
  return Number.isFinite(number)
    ? number.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
    : '0.00';
}

export default function BalanceSourceSelector({ value, onChange, walletBalance = '0', gatewayBalances = [], disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const gatewayTotal = gatewayBalances.reduce((sum, item) => sum + Number(item?.balance || 0), 0);
  const selectedGateway = gatewayBalances
    .filter((item) => Number(item?.balance || 0) > 0)
    .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0))[0];

  useEffect(() => {
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const label = value === 'gateway'
    ? selectedGateway ? `Gateway · ${selectedGateway.short}` : 'Gateway unified'
    : 'Arc wallet';
  const balance = value === 'gateway' ? gatewayTotal : Number(walletBalance || 0);

  return (
    <div className={styles.root} ref={rootRef}>
      <button type="button" className={`${styles.trigger} ${open ? styles.open : ''}`} onClick={() => setOpen((current) => !current)} disabled={disabled} aria-haspopup="listbox" aria-expanded={open}>
        <span className={styles.icon}>{value === 'gateway' ? '◎' : '◉'}</span>
        <span className={styles.copy}><small>Balance source</small><strong>{label}</strong></span>
        <span className={styles.amount}>{formatBalance(balance)} <em>USDC</em></span>
        <span className={styles.chevron}>⌄</span>
      </button>

      {open ? (
        <div className={styles.menu} role="listbox" aria-label="Balance source">
          <button type="button" className={`${styles.option} ${value === 'wallet' ? styles.active : ''}`} role="option" aria-selected={value === 'wallet'} onClick={() => { onChange('wallet'); setOpen(false); }}>
            <span className={styles.optionIcon}>◉</span>
            <span className={styles.optionCopy}><strong>Arc wallet</strong><small>USDC currently in your wallet</small></span>
            <span className={styles.optionAmount}>{formatBalance(walletBalance)}<small>USDC</small></span>
          </button>
          <button type="button" className={`${styles.option} ${value === 'gateway' ? styles.active : ''}`} role="option" aria-selected={value === 'gateway'} onClick={() => { onChange('gateway'); setOpen(false); }}>
            <span className={styles.optionIcon}>◎</span>
            <span className={styles.optionCopy}><strong>Gateway unified</strong><small>Finalized USDC across supported chains</small></span>
            <span className={styles.optionAmount}>{formatBalance(gatewayTotal)}<small>USDC</small></span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
