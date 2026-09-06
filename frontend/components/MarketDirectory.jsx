'use client';

import Link from 'next/link';
import { ACTIVE_MARKETS } from '../constants/markets';
import styles from './market-directory.module.css';

export default function MarketDirectory() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>CENTRY · MARKETS</span>
          <h1>Markets</h1>
          <p>Explore available Centry lending markets and open a dedicated market workspace.</p>
        </div>
      </header>

      <section className={styles.marketGrid} aria-label="Centry lending markets">
        {ACTIVE_MARKETS.map((market) => (
          <Link key={market.id} href={`/app/markets/${market.id}`} className={styles.marketCard}>
            <div className={styles.cardTop}>
              <span className={`${styles.tokenIcon} ${styles[`tokenIcon_${market.id}`]}`}>
                {market.symbol === 'cirBTC' ? '₿' : market.symbol === 'EURC' ? '€' : '$'}
              </span>
              <span className={styles.status}><i /> Active</span>
            </div>
            <div className={styles.assetName}>{market.symbol}</div>
            <div className={styles.assetFullName}>{market.name}</div>
            <p>{market.description}</p>
            <span className={styles.openMarket}>Open market <b>→</b></span>
          </Link>
        ))}
      </section>
    </div>
  );
}
