'use client';

import { useAccount } from 'wagmi';
import { useMemo } from 'react';
import Link from 'next/link';
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
      <div className="section-header portfolio-hero">
        <div>
          <span className="section-kicker">ACCOUNT PORTFOLIO</span>
          <h1>Your portfolio</h1>
          <p>Account-wide collateral, debt, borrowing room, and health in one view.</p>
        </div>
        <div className="portfolio-primary-metric">
          <span>Total Portfolio Value</span>
          <strong>{isConnected && lending.accountPosition.ready ? formatUsd(lending.accountPosition.totalCollateralValueUsd) : "—"}</strong>
          <small>Total collateral value at current oracle prices</small>
        </div>
      </div>
      {!isConnected && (
        <div className="connect-prompt large-prompt">
          Connect your wallet to load your onchain portfolio.
        </div>
      )}

      <section className="portfolio-quick-metrics">
        <StatCard label="Total collateral" value={isConnected ? formatUsd(lending.accountPosition.totalCollateralValueUsd) : "—"} detail="Current supplied collateral value" />
        <StatCard label="Total debt" value={isConnected ? formatUsd(lending.accountPosition.totalDebtValueUsd) : "—"} detail="Across active lending markets" />
        <StatCard label="Borrowing room" value={isConnected ? formatUsd(lending.accountPosition.remainingBorrowCapacityUsd) : "—"} detail="Remaining account capacity" />
      </section>
      <section className="risk-overview-grid">
        <div className="panel risk-summary-panel">
          <div className="panel-head">
            <div><h2>Account health</h2><p>A single view of your liquidation buffer, health factor, and current debt exposure.</p></div>
            <span className="risk-state-chip">{risk.summary.positionStatus}</span>
          </div>
          <div className="health-hero-row">
            <div className="health-hero-value"><span>Health</span><strong>{isConnected ? lending.healthFactorPercent + "%" : "—"}</strong></div>
            <div className="health-hero-meta">
              <div><span>Health factor</span><strong>{isConnected ? lending.healthFactor : "—"}</strong></div>
              <div><span>Distance to liquidation</span><strong>{isConnected ? formatPercent(risk.summary.distanceToLiquidationPct) : "—"}</strong></div>
            </div>
          </div>
          <div className="health-status-bar"><div style={{ width: ((Math.min(100, Math.max(0, lending.healthFactorPercent || 0))) + "%") }} /></div>
          <div className="health-foot-row"><span>Liquidation threshold <strong>1.00 HF</strong></span><span>Total debt <strong>{isConnected ? formatUsd(risk.summary.totalDebtUsd) : "—"}</strong></span></div>
        </div>
        <div className="panel collateral-panel">
          <div className="panel-head"><div><h2>Collateral composition</h2><p>Share of your supplied collateral by current oracle value.</p></div></div>
          <div className="collateral-list">
            {collateralRows.length ? collateralRows.map((market) => (
              <div className="collateral-row" key={market.id}>
                <div className="collateral-asset"><span className="asset-badge" aria-hidden="true">{market.symbol === "cirBTC" ? "₿" : market.symbol === "USDC" ? "$" : "€"}</span><div><strong>{market.symbol}</strong><span>{market.name}</span></div><strong>{formatUsd(market.suppliedUsd)}</strong></div>
                <div className="collateral-share"><strong>{formatPercent(market.collateralSharePct)}</strong><div><span style={{ width: ((Math.min(100, Math.max(0, market.collateralSharePct))) + "%") }} /></div></div>
              </div>
            )) : (
              <div className="risk-empty"><span className="empty-state-mark">+</span><strong>No collateral supplied yet</strong><p>Deposit USDC or another supported collateral asset to start building your position.</p><Link href="/app/markets" className="empty-state-action">Deposit Collateral to Start →</Link></div>
            )}
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
            <span>Market</span><span>Utilization</span><span>Supply APY</span><span>Borrow APY</span><span>Risk</span>
          </div>
          {risk.markets.map((market) => (
            <div className="market-risk-row" key={market.id}>
              <div className="market-asset-cell"><span className="asset-badge" aria-hidden="true">{market.symbol === "cirBTC" ? "₿" : market.symbol === "USDC" ? "$" : "€"}</span><div><strong>{market.symbol}</strong><small>{market.name} · Oracle {formatUsd(market.priceUsd)}</small></div></div>
              <div><strong>{formatPercent(market.utilizationPct)}</strong></div>
              <div><strong>{formatApy(market.supplyApy)}</strong></div>
              <div><strong>{formatApy(market.borrowApy)}</strong></div>
              <div className="market-risk-main"><strong>{market.liquidationPriceStatus === "price" ? formatUsd(market.liquidationPriceUsd) : market.liquidationPriceStatus === "already-breached" ? "Below HF 1.00" : market.liquidationPriceStatus === "other-collateral-sufficient" ? "Protected" : "—"}</strong><small>{market.liquidationPriceStatus === "price" ? formatPercent(market.distanceToLiquidationPct) + " price distance" : "Liquidation price estimate"}</small>
                <details className="market-risk-details"><summary>View risk details</summary><div className="market-risk-detail-grid"><span>LTV <strong>{formatPercent(market.ltvBps / 100)}</strong></span><span>LT <strong>{formatPercent(market.liquidationThresholdBps / 100)}</strong></span><span>Liquidity <strong>{formatUsd(market.cashUsd)}</strong></span><span>Reserve factor <strong>{formatPercent(market.reserveFactorBps / 100)}</strong></span></div></details>
              </div>
            </div>          ))}
        </div>

        <div className="risk-footnote">
          Liquidation price is an isolated collateral estimate: it holds other collateral values and debt prices constant and solves for the price of that collateral at HF = 1.00.
        </div>
      </section>

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