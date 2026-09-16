'use client';

import { useEffect, useRef, useState } from 'react';
import { ACTIVE_MARKETS } from '../constants/markets';
import { useMultiMarketLending } from '../hooks/useMultiMarketLending';
import CentryIntelligence from './CentryIntelligence';
import styles from './CentryAssistantBubble.module.css';

export default function CentryAssistantBubble() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const market = ACTIVE_MARKETS[0];
  const lending = useMultiMarketLending(market?.address, market?.decimals);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    const onPointerDown = (event) => {
      const target = event.target;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector('input')?.focus();
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.bubble} ${open ? styles.bubbleOpen : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Close Centry Intelligence' : 'Open Centry Intelligence'}
        aria-expanded={open}
        aria-controls="centry-intelligence-panel"
      >
        <span className={styles.bubbleMark} aria-hidden="true">C</span>
        <span className={styles.bubbleLabel}>Ask</span>
      </button>

      <aside
        id="centry-intelligence-panel"
        ref={panelRef}
        className={`${styles.panel} ${open ? styles.panelOpen : ''}`}
        aria-hidden={!open}
        aria-label="Centry Intelligence"
      >
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>Centry Intelligence</span>
            <h2>Ask Centry</h2>
          </div>
          <button type="button" onClick={() => setOpen(false)} className={styles.close} aria-label="Close assistant">×</button>
        </div>
        <div className={styles.panelBody}>
          <CentryIntelligence market={market} lending={lending} compact />
        </div>
      </aside>
    </>
  );
}
