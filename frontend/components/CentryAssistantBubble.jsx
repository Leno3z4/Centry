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
    const onKeyDown = (event) => { if (event.key === 'Escape') setOpen(false); };
    const onPointerDown = (event) => { if (panelRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return; setOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('pointerdown', onPointerDown); };
  }, [open]);

  useEffect(() => { if (open) panelRef.current?.querySelector('textarea')?.focus(); }, [open]);

  return (
    <>
      <button ref={buttonRef} type="button" className={`${styles.bubble} ${open ? styles.bubbleOpen : ''}`} onClick={() => setOpen((value) => !value)} aria-label={open ? 'Close Centrion' : 'Ask Centrion'} aria-expanded={open} aria-controls="centrion-panel">
        <span className={styles.bubbleMark} aria-hidden="true">C</span><span className={styles.bubbleLabel}>Ask</span>
      </button>

      <aside id="centrion-panel" ref={panelRef} className={`${styles.panel} ${open ? styles.panelOpen : ''}`} aria-hidden={!open} aria-label="Centrion assistant">
        <div className={styles.panelHeader}>
          <div className={styles.toolbarLeft}><span className={styles.grip} aria-hidden="true">⠿</span><button type="button" aria-label="New chat">✎</button><button type="button" aria-label="Chat history">◷</button></div>
          <div className={styles.brand}><span className={styles.brandMark}>C</span><span>Centrion</span></div>
          <div className={styles.toolbarRight}><button type="button" aria-label="Expand">⛶</button><button type="button" aria-label="More">⌄</button><button type="button" onClick={() => setOpen(false)} aria-label="Close Centrion">×</button></div>
        </div>
        <div className={styles.aiNotice}><span>Centrion uses AI.</span> Review transaction details before signing.</div>
        <div className={styles.panelBody}><CentryIntelligence market={market} lending={lending} compact /></div>
      </aside>
    </>
  );
}
