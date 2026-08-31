'use client';

import { useAccount } from 'wagmi';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { ACTIVE_MARKETS } from '../../../constants/markets';
import { useMultiMarketLending } from '../../../hooks/useMultiMarketLending';

function formatNumber(value, digits = 2) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0.00';
  return number.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
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

  return (
    <div className="page-stack">
      <div className="section-header">
        <div>
          <span className="section-kicker">PORTFOLIO</span>
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

      <div className="panel">
        <div className="panel-head">
          <div>
            <span className="section-kicker">RISK</span>
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
    </div>
  );
}
