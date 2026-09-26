'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { ACTIVE_MARKETS } from '../constants/markets';
import { useDeFiRisk } from '../hooks/useDeFiRisk';
import styles from './market-directory.module.css';

function formatUsd(value, compact = false) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '—';

  if (compact) {
    return new Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(number);
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(number);
}

function formatPct(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) + '%' : '—';
}

function marketCategory(market) {
  return market.symbol === 'cirBTC' ? 'crypto' : 'stablecoins';
}

function tokenGlyph(symbol) {
  if (symbol === 'cirBTC') return '₿';
  if (symbol === 'EURC') return '€';
  return '$';
}

export default function MarketDirectory() {
  const { isConnected } = useAccount();
  const { markets, loading } = useDeFiRisk();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('apy');

  const marketData = useMemo(
    () =>
      ACTIVE_MARKETS.map((market) => ({
        market,
        data: markets.find((item) => item.id === market.id),
      })),
    [markets],
  );

  const visibleMarkets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return marketData
      .filter(({ market }) => {
        const matchesQuery =
          !normalizedQuery ||
          market.symbol.toLowerCase().includes(normalizedQuery) ||
          market.name.toLowerCase().includes(normalizedQuery);

        const matchesCategory =
          category === 'all' || marketCategory(market) === category;

        return matchesQuery && matchesCategory;
      })
      .sort((left, right) => {
        const leftData = left.data;
        const rightData = right.data;

        if (sort === 'tvl') {
          return Number(rightData?.suppliedUsd || 0) - Number(leftData?.suppliedUsd || 0);
        }

        if (sort === 'borrowed') {
          return Number(rightData?.borrowedUsd || 0) - Number(leftData?.borrowedUsd || 0);
        }

        if (sort === 'utilization') {
          return Number(rightData?.utilizationPct || 0) - Number(leftData?.utilizationPct || 0);
        }

        return Number(rightData?.supplyApy || 0) - Number(leftData?.supplyApy || 0);
      });
  }, [category, marketData, query, sort]);

  const totals = useMemo(
    () =>
      marketData.reduce(
        (acc, { data }) => {
          acc.tvl += Number(data?.suppliedUsd || 0);
          acc.borrowed += Number(data?.borrowedUsd || 0);
          return acc;
        },
        { tvl: 0, borrowed: 0 },
      ),
    [marketData],
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <span className={styles.kicker}>CENTRY · MARKETS</span>
          <h1>Markets</h1>
          <p>Compare the assets available to lend and borrow, then open the market that fits your position.</p>
        </div>

        <div className={styles.headerStats} aria-label="Market overview">
          <div>
            <span>Total supplied</span>
            <strong>{isConnected ? '$' + formatUsd(totals.tvl, true) : '—'}</strong>
          </div>
          <div>
            <span>Total borrowed</span>
            <strong>{isConnected ? '$' + formatUsd(totals.borrowed, true) : '—'}</strong>
          </div>
          <div>
            <span>Markets</span>
            <strong>{ACTIVE_MARKETS.length}</strong>
          </div>
        </div>
      </header>

      <section className={styles.controls} aria-label="Market filters">
        <div className={styles.searchWrap}>
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search markets"
            aria-label="Search markets"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear market search">
              ×
            </button>
          ) : null}
        </div>

        <div className={styles.categoryTabs} role="group" aria-label="Market category">
          {[
            ['all', 'All'],
            ['stablecoins', 'Stablecoins'],
            ['crypto', 'Crypto'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={category === value ? styles.categoryActive : styles.categoryButton}
              onClick={() => setCategory(value)}
              aria-pressed={category === value}
            >
              {label}
            </button>
          ))}
        </div>

        <label className={styles.sortControl}>
          <span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="apy">Supply APY</option>
            <option value="tvl">TVL</option>
            <option value="borrowed">Total borrowed</option>
            <option value="utilization">Utilization</option>
          </select>
        </label>
      </section>

      <section className={styles.marketGrid} aria-label="Centry lending markets">
        {visibleMarkets.map(({ market, data }) => {
          const marketReady = isConnected && !loading && data;
          const tvl = data?.suppliedUsd || 0;
          const borrowed = data?.borrowedUsd || 0;
          const utilization = data?.utilizationPct || 0;
          const supplyApy = data?.supplyApy || 0;
          const borrowApy = data?.borrowApy || 0;

          return (
            <article key={market.id} className={styles.marketCard}>
              <div className={styles.cardTop}>
                <div className={styles.assetIdentity}>
                  <span
                    className={styles.tokenIcon + ' ' + styles['tokenIcon_' + market.id]}
                    aria-hidden="true"
                  >
                    {tokenGlyph(market.symbol)}
                  </span>
                  <div>
                    <strong>{market.symbol}</strong>
                    <span>{market.name}</span>
                  </div>
                </div>
                <span className={styles.status}>
                  <i aria-hidden="true" />
                  Active
                </span>
              </div>

              <p className={styles.description}>{market.description}</p>

              <div className={styles.metricGrid}>
                <div className={styles.metricFeatured}>
                  <span>Supply APY</span>
                  <strong>{marketReady ? formatPct(supplyApy) : '—'}</strong>
                </div>
                <div className={styles.metric}>
                  <span>Borrow APY</span>
                  <strong>{marketReady ? formatPct(borrowApy) : '—'}</strong>
                </div>
                <div className={styles.metric}>
                  <span>Total supplied</span>
                  <strong>{marketReady ? '$' + formatUsd(tvl, true) : '—'}</strong>
                </div>
                <div className={styles.metric}>
                  <span>Total borrowed</span>
                  <strong>{marketReady ? '$' + formatUsd(borrowed, true) : '—'}</strong>
                </div>
              </div>

              <div className={styles.utilization}>
                <div className={styles.utilizationHead}>
                  <span>Utilization</span>
                  <strong>{marketReady ? formatPct(utilization) : '—'}</strong>
                </div>
                <div className={styles.utilizationTrack} aria-hidden="true">
                  <span style={{ width: Math.min(Math.max(utilization, 0), 100) + '%' }} />
                </div>
              </div>

              <Link href={'/app/markets/' + market.id} className={styles.viewMarket}>
                View Market
                <span aria-hidden="true">→</span>
              </Link>
            </article>
          );
        })}
      </section>

      {visibleMarkets.length === 0 ? (
        <div className={styles.emptyState}>
          <strong>No markets match that search.</strong>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setCategory('all');
            }}
          >
            Clear filters
          </button>
        </div>
      ) : null}
    </div>
  );
}
