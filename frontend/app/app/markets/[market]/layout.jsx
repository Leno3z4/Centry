const MARKET_META = {
  usdc: {
    name: 'USDC',
    description: 'USDC lending market rates, liquidity, and risk parameters on Centry.',
  },
  eurc: {
    name: 'EURC',
    description: 'EURC lending market rates, liquidity, and risk parameters on Centry.',
  },
  'cirbtc': {
    name: 'cirBTC',
    description: 'cirBTC lending market rates, liquidity, and risk parameters on Centry.',
  },
  cent: {
    name: 'CENT',
    description: 'CENT lending market rates, liquidity, and risk parameters on Centry.',
  },
};

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const marketId = String(resolvedParams?.market || '').toLowerCase();
  const market = MARKET_META[marketId] || {
    name: 'Market',
    description: 'Centry lending market rates, liquidity, and risk parameters.',
  };

  return {
    title: `${market.name} market`,
    description: market.description,
    alternates: {
      canonical: `/app/markets/${marketId}`,
    },
  };
}

export default function MarketLayout({ children }) {
  return children;
}
