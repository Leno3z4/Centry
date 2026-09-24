'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './agents.module.css';

const assetSymbol = {
  native: '$',
  cent: 'C',
  eurc: '€',
  cirbtc: '₿',
};

export default function WalletAssetDropdown({ value, assets, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  const selected = assets.find((item) => item.key === value) || assets[0];

  function toggle() {
    if (disabled) return;
    setOpen((current) => {
      const next = !current;
      if (next) {
        const rect = triggerRef.current?.getBoundingClientRect();
        const estimatedMenuHeight = Math.min(assets.length * 52 + 12, 280);
        setOpenUp(Boolean(rect && window.innerHeight - rect.bottom < estimatedMenuHeight + 16));
      }
      return next;
    });
  }

  useEffect(() => {
    if (!open) return undefined;

    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className={styles.walletAssetPicker} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.walletAssetTrigger} ${open ? styles.walletAssetTriggerOpen : ''}`}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className={styles.walletAssetSelected}>
          <span className={`${styles.walletAssetIcon} ${styles[`walletAssetIcon_${selected?.key || 'native'}`]}`}>
            {assetSymbol[selected?.key] || '$'}
          </span>
          <span className={styles.walletAssetSelectedCopy}>
            <strong>{selected?.key === 'native' ? 'USDC (native)' : selected?.label || 'Asset'}</strong>
            <small>{selected?.key === 'native' ? 'Arc native USDC' : 'Centry supported asset'}</small>
          </span>
        </span>

        <span className={styles.walletAssetChevron} aria-hidden="true" />
      </button>

      {open ? (
        <div className={`${styles.walletAssetMenu} ${openUp ? styles.walletAssetMenuUp : ''}`} role="listbox">
          {assets.map((item) => {
            const active = item.key === value;
            return (
              <button
                key={item.key}
                type="button"
                role="option"
                aria-selected={active}
                className={`${styles.walletAssetOption} ${active ? styles.walletAssetOptionActive : ''}`}
                onClick={() => {
                  onChange(item.key);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <span className={`${styles.walletAssetIcon} ${styles[`walletAssetIcon_${item.key}`]}`}>
                  {assetSymbol[item.key] || '$'}
                </span>
                <span className={styles.walletAssetOptionCopy}>
                  <strong>{item.key === 'native' ? 'USDC (native)' : item.label}</strong>
                  <small>{item.key === 'native' ? 'Arc native USDC' : 'Centry supported asset'}</small>
                </span>
                {active ? <span className={styles.walletAssetCheck} aria-hidden="true">✓</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
