'use client';

import styles from './PageSkeleton.module.css';

export function SkeletonBlock({ className = '' }) {
  return <span aria-hidden="true" className={styles.shimmer + ' ' + className} />;
}

export default function PageSkeleton({ mode = 'page' }) {
  if (mode === 'app') {
    return (
      <div className={styles.appShell} aria-busy="true" aria-label="Loading">
        <aside className={styles.sidebar}>
          <SkeletonBlock className={styles.brand} />
          <div className={styles.navGroup}>
            <SkeletonBlock className={styles.navItemWide} />
            <SkeletonBlock className={styles.navItemWide} />
            <SkeletonBlock className={styles.navItemWide} />
          </div>
          <div className={styles.navGroup}>
            <SkeletonBlock className={styles.navItem} />
            <SkeletonBlock className={styles.navItem} />
            <SkeletonBlock className={styles.navItem} />
          </div>
          <div className={styles.navGroup}>
            <SkeletonBlock className={styles.navItem} />
            <SkeletonBlock className={styles.navItem} />
          </div>
        </aside>

        <main className={styles.main}>
          <header className={styles.topbar}>
            <SkeletonBlock className={styles.breadcrumb} />
            <SkeletonBlock className={styles.wallet} />
          </header>
          <section className={styles.content}>
            <div className={styles.heroRow}>
              <div className={styles.titleStack}>
                <SkeletonBlock className={styles.title} />
                <SkeletonBlock className={styles.subtitle} />
              </div>
              <SkeletonBlock className={styles.heroMetric} />
            </div>
            <div className={styles.grid}>
              <SkeletonBlock className={styles.card} />
              <SkeletonBlock className={styles.card} />
              <SkeletonBlock className={styles.cardWide} />
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <main className={styles.page} aria-busy="true" aria-label="Loading">
      <div className={styles.pageHeader}>
        <SkeletonBlock className={styles.title} />
        <SkeletonBlock className={styles.subtitle} />
      </div>
      <div className={styles.grid}>
        <SkeletonBlock className={styles.card} />
        <SkeletonBlock className={styles.card} />
        <SkeletonBlock className={styles.cardWide} />
      </div>
    </main>
  );
}
