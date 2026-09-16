'use client';

import { useMemo } from 'react';
import { buildCentrionPreview } from '../lib/centrionPreview';
import styles from './CentryTransactionPreview.module.css';

export default function CentryTransactionPreview({ plan, context }) {
  const preview = useMemo(() => buildCentrionPreview(plan, context), [plan, context]);
  if (!plan || !preview.steps.length) return null;

  return (
    <section className={styles.card} aria-label="Transaction preview">
      <div className={styles.header}>
        <span>TRANSACTION PREVIEW</span>
        <strong>{preview.steps.filter((step) => step.kind !== 'metric').length} steps</strong>
      </div>
      <div className={styles.steps}>
        {preview.steps.map((step, index) => (
          <div className={`${styles.step} ${styles[`step_${step.kind}`]}`} key={`${step.kind}-${index}`}>
            <span>{step.kind === 'approval' ? 'Approve' : step.kind === 'metric' ? 'Risk' : 'Action'}</span>
            <strong>{step.text}</strong>
          </div>
        ))}
      </div>
      {preview.warnings.length ? (
        <div className={styles.warning}>
          {preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      ) : null}
    </section>
  );
}
