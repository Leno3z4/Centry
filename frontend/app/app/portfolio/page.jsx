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

function healthTone(percent) {
  const value = Number(percent || 0);
  if (value < 35) return 'danger';
  if (value < 70) return 'warning';
  return 'safe';
}

function StatCard({ label, value, detail }) {
  return (
    <div className="portfolioQuickMetric">
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
            <span className={`risk-state-chip ${healthTone(lending.healthFactorPercent)}`}>{risk.summary.positionStatus}</span>
          </div>
          <div className="health-hero-row">
            <div className="health-hero-value"><span>Health</span><strong>{isConnected ? lending.healthFactorPercent + "%" : "—"}</strong></div>
            <div className="health-hero-meta">
              <div><span>Health factor</span><strong>{isConnected ? lending.healthFactor : "—"}</strong></div>
              <div><span>Distance to liquidation</span><strong>{isConnected ? formatPercent(risk.summary.distanceToLiquidationPct) : "—"}</strong></div>
            </div>
          </div>
          <div className={`health-status-bar ${healthTone(lending.healthFactorPercent)}`}><div style={{ width: ((Math.min(100, Math.max(0, lending.healthFactorPercent || 0))) + "%") }} /></div>
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
      .risk-summary-panel,.collateral-panel,.market-risk-panel{padding:20px;background:#1e1e1e!important;border-color:#343941!important;box-shadow:0 12px 32px rgba(0,0,0,.14)!important}
      .risk-summary-panel .panel-head p,.collateral-panel .panel-head p{margin:6px 0 0;color:rgba(255,255,255,.5);font-size:12px;line-height:1.5}
      .risk-state-chip{display:inline-flex;align-items:center;padding:6px 9px;border:1px solid #343941;border-radius:999px;background:#17191c;color:rgba(255,255,255,.72);font-size:10px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
      .portfolio-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,360px);align-items:end;gap:18px}
      .portfolio-hero>div:first-child{min-width:0}
      .portfolio-primary-metric{padding:18px 20px;border:1px solid #343941;border-radius:16px;background:#1e1e1e;box-shadow:0 14px 36px rgba(0,0,0,.18)}
      .portfolio-primary-metric span,.portfolio-primary-metric small{display:block;color:rgba(255,255,255,.48);font-size:10px;text-transform:uppercase;letter-spacing:.06em}
      .portfolio-primary-metric strong{display:block;margin:7px 0 4px;color:#fff;font-size:34px;line-height:1;letter-spacing:-1px}
      .portfolio-primary-metric small{text-transform:none;letter-spacing:0;font-size:11px}
      .portfolio-quick-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
      .portfolioQuickMetric{min-width:0;padding:15px 16px;border:1px solid #30343a;border-radius:14px;background:#17191c;box-shadow:0 10px 26px rgba(0,0,0,.1)}
      .portfolioQuickMetric>span{color:rgba(255,255,255,.5);font-size:10px;text-transform:uppercase;letter-spacing:.04em}
      .portfolioQuickMetric>strong{display:block;margin-top:6px;color:#fff;font-size:20px;font-variant-numeric:tabular-nums}
      .portfolioQuickMetric>small{display:block;margin-top:4px;color:rgba(255,255,255,.45);font-size:10px;line-height:1.45}
      .risk-state-chip.safe{border-color:rgba(52,199,89,.25);background:rgba(52,199,89,.09);color:#a6e9bb}
      .risk-state-chip.warning{border-color:rgba(255,159,10,.28);background:rgba(255,159,10,.09);color:#ffd58a}
      .risk-state-chip.danger{border-color:rgba(255,69,58,.3);background:rgba(255,69,58,.09);color:#ffaaa3}
      .health-hero-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(190px,.8fr);align-items:end;gap:20px;margin-top:18px}
      .health-hero-value span,.health-hero-meta span{display:block;color:rgba(255,255,255,.45);font-size:10px}
      .health-hero-value strong{display:block;margin-top:5px;color:#fff;font-size:42px;line-height:1;letter-spacing:-1.8px}
      .health-hero-meta{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .health-hero-meta>div{padding:11px;border:1px solid #30343a;border-radius:11px;background:#17191c}
      .health-hero-meta strong{display:block;margin-top:4px;color:#fff;font-size:16px}
      .health-status-bar{height:7px;margin-top:18px;overflow:hidden;border-radius:999px;background:#2a2e33}
      .health-status-bar>div{height:100%;border-radius:inherit;transition:width 220ms ease}
      .health-status-bar.safe>div{background:#34c759}
      .health-status-bar.warning>div{background:#ff9f0a}
      .health-status-bar.danger>div{background:#ff453a}
      .health-foot-row{display:flex;justify-content:space-between;gap:12px;margin-top:11px;color:rgba(255,255,255,.45);font-size:10px}
      .health-foot-row strong{color:rgba(255,255,255,.82)}
      .collateral-list{display:grid;gap:12px;margin-top:14px}
      .collateral-row{display:grid;gap:7px;padding:12px 0;border-bottom:1px solid #2b2f34}
      .collateral-row:last-child{border-bottom:0}
      .collateral-asset{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px}
      .asset-badge{display:grid;width:30px;height:30px;place-items:center;border:1px solid #3a3f46;border-radius:50%;background:#15171a;color:#fff;font-size:12px;font-weight:750}
      .collateral-asset>div{display:grid;gap:2px;min-width:0}
      .collateral-asset>div span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .collateral-share{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:10px;margin-top:7px}
      .collateral-share>strong{font-size:10px;color:rgba(255,255,255,.58)}
      .collateral-share>div{height:4px;border-radius:999px;background:#2b2f34;overflow:hidden}
      .collateral-share>div>span{display:block;height:100%;border-radius:inherit;background:#8fbdf2}
      .risk-empty{display:grid;justify-items:start;gap:7px;padding:17px 0;color:rgba(255,255,255,.5);font-size:12px}
      .empty-state-mark{display:grid;width:28px;height:28px;place-items:center;border:1px solid #384049;border-radius:9px;background:#15181b;color:#8fbdf2;font-size:16px}
      .empty-state-action{display:inline-flex;margin-top:4px;padding:8px 10px;border:1px solid #35414d;border-radius:9px;background:#171c22;color:#ddecff;font-size:11px;font-weight:700;text-decoration:none}
      .empty-state-action:hover{border-color:#0a84ff;background:#1a232c}
      .market-risk-panel{margin-top:14px}
      .market-risk-table{margin-top:15px;border:1px solid #30343a;border-radius:13px;overflow:auto;background:#111317}
      .market-risk-table-head,.market-risk-row{display:grid;grid-template-columns:1.35fr .85fr .85fr .85fr 1.15fr;min-width:720px;gap:12px;align-items:center}
      .market-risk-table-head{padding:10px 12px;background:#17191c;border-bottom:1px solid #30343a;color:rgba(255,255,255,.43);font-size:10px;text-transform:uppercase;letter-spacing:.05em}
      .market-risk-row{padding:13px 12px;border-bottom:1px solid #282d33;background:#111317}
      .market-risk-row:last-child{border-bottom:0}
      .market-asset-cell{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:10px;min-width:0}
      .market-asset-cell>div{min-width:0}
      .market-risk-row strong,.market-risk-row small{display:block}
      .market-risk-row strong{color:#fff;font-size:12px}
      .market-risk-row small{margin-top:3px;color:rgba(255,255,255,.45);font-size:10px}
      .market-asset-cell small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .market-risk-main{min-width:0}
      .market-risk-details{margin-top:6px}
      .market-risk-details summary{cursor:pointer;color:#8fbdf2;font-size:10px;list-style:none}
      .market-risk-details summary::-webkit-details-marker{display:none}
      .market-risk-details summary::before{content:"+ ";color:#8fbdf2}
      .market-risk-details[open] summary::before{content:"− "}
      .market-risk-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px 10px;margin-top:8px;padding:9px;border:1px solid #2c3137;border-radius:9px;background:#17191c}
      .market-risk-detail-grid span{color:rgba(255,255,255,.45);font-size:9px}
      .market-risk-detail-grid strong{display:block;margin-top:2px;color:#fff;font-size:10px}
      .risk-footnote{margin-top:11px;color:rgba(255,255,255,.42);font-size:10px;line-height:1.5}
      @media(max-width:900px){.portfolio-hero{grid-template-columns:1fr}.portfolio-primary-metric{max-width:none}.portfolio-quick-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.risk-overview-grid{grid-template-columns:1fr}}
      @media(max-width:640px){.portfolio-quick-metrics{grid-template-columns:1fr}.health-hero-row{grid-template-columns:1fr}.health-hero-meta{grid-template-columns:1fr 1fr}.health-foot-row{flex-direction:column}.portfolio-primary-metric strong{font-size:30px}}
      @media(prefers-reduced-motion:reduce){.health-status-bar>div{transition:none}}\n
    </div>
  );
}