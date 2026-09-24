'use client';

import { useAccount } from 'wagmi';
import { useMemo } from 'react';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import TransactionHistory from '../../../components/TransactionHistory';
import { ACTIVE_MARKETS } from '../../../constants/markets';
import { useMultiMarketLending } from '../../../hooks/useMultiMarketLending';
import { useDeFiRisk } from '../../../hooks/useDeFiRisk';

function formatNumber(value, digits = 2) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0.00';
  return number.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatUsd(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) + '%' : '—';
}

function formatApy(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) + '%' : '—';
}

function StatCard({ label, value, detail }) {
  return (
    <div className="metric" key={label}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export default function Page() {
  return (
    <Providers>
      <AppShell>
        <PortfolioContent />
      </AppShell>
    </Providers>
  );
}

function PortfolioContent() {
  const { isConnected } = useAccount();
  const primaryMarket = ACTIVE_MARKETS[0];
  const lending = useMultiMarketLending(primaryMarket?.address, primaryMarket?.decimals);
  const risk = useDeFiRisk();

  const collateralRows = useMemo(
    () => risk.markets.filter((market) => market.suppliedUsd > 0),
    [risk.markets],
  );

  return (
    <div className="page-stack">
      <div className="section-header">
        <div>
          <h1>Your position</h1>
          <p>Account-wide collateral, debt, borrowing capacity, and health.</p>
        </div>
      </div>

      {!isConnected && (
        <div className="connect-prompt large-prompt">
          Connect your wallet to load your onchain portfolio.
        </div>
      )}

      <section className="portfolio-grid">
        <StatCard
          label="Borrow limit"
          value={isConnected ? `$${formatNumber(lending.borrowLimit)}` : '—'}
          detail="Remaining account borrowing room"
        />
        <StatCard
          label="Total debt"
          value={isConnected ? `$${formatNumber(lending.totalDebtValue)}` : '—'}
          detail="Across all lending markets"
        />
        <StatCard
          label="Health"
          value={isConnected ? `${lending.healthFactorPercent}%` : '—'}
          detail="Account-wide safety"
        />
        <StatCard
          label="Health factor"
          value={isConnected ? lending.healthFactor : '—'}
          detail="Direct from the lending pool"
        />
      </section>

      <section className="risk-overview-grid">
        <div className="panel risk-summary-panel">
          <div className="panel-head">
            <div>
              <h2>Risk overview</h2>
              <p>Derived from current collateral, debt, oracle prices, and reserve liquidation thresholds.</p>
            </div>
            <span className="risk-state-chip">{risk.summary.positionStatus}</span>
          </div>

          <div className="risk-summary-metrics">
            <div><span>Distance to liquidation</span><strong>{isConnected ? formatPercent(risk.summary.distanceToLiquidationPct) : '—'}</strong><small>Based on current health factor</small></div>
            <div><span>Weighted collateral</span><strong>{isConnected ? formatUsd(risk.summary.weightedCollateralUsd) : '—'}</strong><small>Collateral × liquidation threshold</small></div>
            <div><span>Debt</span><strong>{isConnected ? formatUsd(risk.summary.totalDebtUsd) : '—'}</strong><small>Across active markets</small></div>
            <div><span>Liquidation threshold</span><strong>1.00 HF</strong><small>Current deployed pool rule</small></div>
          </div>

          <div className="risk-distance-track" aria-label="Distance to liquidation">
            <div style={{ width: ((Math.min(100, Math.max(0, risk.summary.distanceToLiquidationPct || 0))) + '%') }} />
          </div>
        </div>

        <div className="panel collateral-panel">
          <div className="panel-head">
            <div>
              <h2>Collateral composition</h2>
              <p>Share of your supplied collateral by current oracle value.</p>
            </div>
          </div>
          <div className="collateral-list">
            {collateralRows.length ? collateralRows.map((market) => (
              <div className="collateral-row" key={market.id}>
                <div>
                  <strong>{market.symbol}</strong>
                  <span>{formatUsd(market.suppliedUsd)}</span>
                </div>
                <div className="collateral-share">
                  <strong>{formatPercent(market.collateralSharePct)}</strong>
                  <div><span style={{ width: ((Math.min(100, Math.max(0, market.collateralSharePct))) + '%') }} /></div>
                </div>
              </div>
            )) : <div className="risk-empty">No supplied collateral in the current snapshot.</div>}
          </div>
        </div>
      </section>

      <section className="panel market-risk-panel">
        <div className="panel-head">
          <div>
            <h2>Market risk & rates</h2>
            <p>Live liquidity, utilization, APY, and collateral liquidation-price estimates for each active market.</p>
          </div>
        </div>

        <div className="market-risk-table">
          <div className="market-risk-table-head">
            <span>Market</span><span>Utilization</span><span>Supply APY</span><span>Borrow APY</span><span>LTV / LT</span><span>Liquidity</span><span>Liquidation price</span>
          </div>
          {risk.markets.map((market) => (
            <div className="market-risk-row" key={market.id}>
              <div><strong>{market.symbol}</strong><small>{market.name}</small></div>
              <div><strong>{formatPercent(market.utilizationPct)}</strong></div>
              <div><strong>{formatApy(market.supplyApy)}</strong></div>
              <div><strong>{formatApy(market.borrowApy)}</strong></div>
              <div><strong>{formatPercent(market.ltvBps / 100)}</strong><small>LT {formatPercent(market.liquidationThresholdBps / 100)}</small></div>
              <div><strong>{formatUsd(market.cashUsd)}</strong></div>
              <div>
                <strong>{market.suppliedUsd > 0 && market.liquidationPriceUsd != null ? formatUsd(market.liquidationPriceUsd) : '—'}</strong>
                <small>{market.suppliedUsd > 0 && market.distanceToLiquidationPct != null ? formatPercent(market.distanceToLiquidationPct) + ' price distance' : 'No active collateral'}</small>
              </div>
            </div>
          ))}
        </div>

        <div className="risk-footnote">
          Liquidation price is an isolated collateral estimate: it holds other collateral values and debt prices constant and solves for the price of that collateral at HF = 1.00.
        </div>
      </section>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Position health</h2>
          </div>
        </div>

        <div className="health-meter">
          <div className="health-meter-head">
            <span>Position health</span>
            <strong>{isConnected ? `${lending.healthFactorPercent}%` : '—'}</strong>
          </div>
          <div className="health-factor-label">
            Health factor {isConnected ? lending.healthFactor : '—'}
          </div>
          <div
            className="health-track"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={isConnected ? lending.healthFactorPercent : 0}
          >
            <div
              className="health-fill"
              style={{ width: `${isConnected ? lending.healthFactorPercent : 0}%` }}
            />
          </div>
          <p>
            Health is account-wide and uses the deployed Centry lending pool. A debt-free account is shown as 100%.
          </p>
        </div>
      </div>

      <TransactionHistory />
    <style jsx global>{`
      .risk-overview-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:14px}
      .risk-summary-panel,.collateral-panel,.market-risk-panel{padding:20px}
      .risk-summary-panel .panel-head p,.collateral-panel .panel-head p{margin:6px 0 0;color:rgba(255,255,255,.56);font-size:12px;line-height:1.5}
      .risk-state-chip{display:inline-flex;align-items:center;padding:6px 9px;border:1px solid #2a2a2a;border-radius:999px;background:#111;color:rgba(255,255,255,.72);font-size:10px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
      .risk-summary-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:16px}
      .risk-summary-metrics>div{padding:13px;border:1px solid #202020;border-radius:12px;background:#0d0d0d}
      .risk-summary-metrics span,.risk-summary-metrics small{display:block;color:rgba(255,255,255,.5);font-size:10px}
      .risk-summary-metrics strong{display:block;margin:6px 0 4px;color:#fff;font-size:17px}
      .risk-distance-track{height:6px;margin-top:15px;overflow:hidden;border-radius:999px;background:#202020}
      .risk-distance-track>div{height:100%;border-radius:inherit;background:#0a84ff}
      .collateral-list{display:grid;gap:12px;margin-top:16px}
      .collateral-row{display:grid;gap:7px;padding:11px 0;border-bottom:1px solid #202020}
      .collateral-row:last-child{border-bottom:0}
      .collateral-row>div:first-child{display:flex;justify-content:space-between;gap:12px}
      .collateral-row strong{color:#fff;font-size:12px}
      .collateral-row span{color:rgba(255,255,255,.52);font-size:11px}
      .collateral-share{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:10px}
      .collateral-share>div{height:4px;border-radius:999px;background:#202020;overflow:hidden}
      .collateral-share>div>span{display:block;height:100%;border-radius:inherit;background:#0a84ff}
      .market-risk-panel{margin-top:14px}
      .market-risk-table{margin-top:15px;border:1px solid #202020;border-radius:13px;overflow:auto}
      .market-risk-table-head,.market-risk-row{display:grid;grid-template-columns:1.15fr .8fr .8fr .8fr .95fr 1fr 1.25fr;min-width:860px;gap:12px;align-items:center}
      .market-risk-table-head{padding:10px 12px;background:#111;border-bottom:1px solid #202020;color:rgba(255,255,255,.43);font-size:10px;text-transform:uppercase;letter-spacing:.05em}
      .market-risk-row{padding:13px 12px;border-bottom:1px solid #202020;background:#0d0d0d}
      .market-risk-row:last-child{border-bottom:0}
      .market-risk-row strong,.market-risk-row small{display:block}
      .market-risk-row strong{color:#fff;font-size:12px}
      .market-risk-row small{margin-top:3px;color:rgba(255,255,255,.45);font-size:10px}
      .risk-footnote{margin-top:11px;color:rgba(255,255,255,.42);font-size:10px;line-height:1.5}
      .risk-empty{padding:18px 0;color:rgba(255,255,255,.5);font-size:12px}
      @media (max-width:900px){.risk-overview-grid{grid-template-columns:1fr}}
      @media (max-width:640px){.risk-summary-metrics{grid-template-columns:1fr}}
    `}</style>
    </div>
  );
}