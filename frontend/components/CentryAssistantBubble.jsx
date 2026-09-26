'use client';

import { Component, useEffect, useRef, useState } from 'react';
import { ACTIVE_MARKETS } from '../constants/markets';
import { useMultiMarketLending } from '../hooks/useMultiMarketLending';
import { useGatewayFunding } from '../hooks/useGatewayFunding';
import CentryIntelligence from './CentryIntelligence';
import styles from './CentryAssistantBubble.module.css';

class AssistantErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.errorState} role="alert">
          <strong>Assistant unavailable</strong>
          <span>We could not load the assistant on this network.</span>
          <button type="button" onClick={this.props.onClose}>Close</button>
        </div>
      );
    }

    return this.props.children;
  }
}

function AssistantPanelContent() {
  const market = ACTIVE_MARKETS[0];
  const lending = useMultiMarketLending(market?.address, market?.decimals);
  const gateway = useGatewayFunding();

  return (
    <CentryIntelligence
      market={market}
      lending={lending}
      gateway={gateway}
      compact
    />
  );
}

export default function CentryAssistantBubble() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event) => {
      if (panelRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
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
    if (open) panelRef.current?.querySelector('textarea')?.focus();
  }, [open]);

  const closePanel = () => setOpen(false);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={styles.bubble + (open ? ' ' + styles.bubbleOpenState : '')}
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Close Cask' : 'Ask Cask'}
        aria-expanded={open}
        aria-controls="cask-panel"
      >
        <span className={styles.bubbleMark} aria-hidden="true">C</span>
        <span className={styles.bubbleLabel}>{open ? 'Close' : 'Ask'}</span>
      </button>

      {open ? (
        <aside
          id="cask-panel"
          ref={panelRef}
          className={styles.panel + ' ' + styles.panelOpen}
          aria-label="Cask assistant"
        >
          <div className={styles.panelHeader}>
            <div className={styles.brand}>
              <span className={styles.brandMark}>C</span>
              <span>Cask</span>
            </div>
            <button
              type="button"
              onClick={closePanel}
              className={styles.close}
              aria-label="Close Cask"
            >
              ×
            </button>
          </div>
          <div className={styles.aiNotice}>Review transaction details before signing.</div>
          <div className={styles.panelBody}>
            <AssistantErrorBoundary onClose={closePanel}>
              <AssistantPanelContent />
            </AssistantErrorBoundary>
          </div>
        </aside>
      ) : null}
    </>
  );
}
