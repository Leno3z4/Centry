'use client';

import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import styles from './pools.module.css';

export default function Page() {
  return (
    <Providers>
      <AppShell>
        <div className={styles.page}>
          <div className={styles.hero}>
            <div>
              <div className={styles.eyebrow}>CENTRY × UNITFLOW</div>
              <h1>Liquidity, <em>without the detour.</em></h1>
              <p>Arc Mainnet is live, but this legacy V2.5 pool browser is not connected to the deployed UnitFlow V3 pool infrastructure.</p>
            </div>
            <div className={styles.heroOrbit}><span>UNITFLOW</span><b>V3</b></div>
          </div>

          <section className={styles.emptyState}>
            <div className={styles.emptyGlyph}>◎</div>
            <h2>Legacy pool tools are disabled</h2>
            <p>
              This surface previously pointed at Arc Testnet V2.5 pool contracts. Those addresses are not being reused on mainnet,
              so Centry will not let the page submit transactions to them.
            </p>
            <a className={styles.createButton} href="/app/swap">Open Mainnet Swap</a>
          </section>
        </div>
      </AppShell>
    </Providers>
  );
}
