'use client';

import React from 'react';
import MultiMarketLending from '../../../components/MultiMarketLending';
import styles from './markets.module.css';

export default function MarketsPage() {
  return (
    <main className={styles.page}>
      <MultiMarketLending />
    </main>
  );
}
