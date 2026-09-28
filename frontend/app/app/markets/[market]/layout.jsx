import StructuredData, { breadcrumbStructuredData, webPageStructuredData } from '../../../../components/StructuredData';

const MARKET_META = {
  usdc: {
    name: 'USDC',
    description: 'USDC lending market rates, liquidity, and risk parameters on Centry.',
  },
  eurc: {
    name: 'EURC',
    description: 'EURC lending market rates, liquidity, and risk parameters on Centry.',
  },
  cirbtc: {
    name: 'cirBTC',
    description: 'cirBTC lending market rates, liquidity, and risk parameters on Centry.',
  },
  cent: {
    name: 'CENT',
    description: 'CENT lending market rates, liquidity, and risk parameters on Centry.',
  },
};

function marketMeta(marketId) {
  return MARKET_META[marketId] || {
    name: 'Market',
    description: 'Centry lending market rates, liquidity, and risk parameters.',
  };
}

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const marketId = String(resolvedParams?.market || '').toLowerCase();
  const market = marketMeta(marketId);

  return {
    title: `${market.name} market`,
    description: market.description,
    alternates: {
      canonical: `/app/markets/${marketId}`,
    },
  };
}

export default async function MarketLayout({ children, params }) {
  const resolvedParams = await params;
  const marketId = String(resolvedParams?.market || '').toLowerCase();
  const market = marketMeta(marketId);
  const url = `https://centry.ink/app/markets/${marketId}`;

  return (
    <>
      <StructuredData
        data={webPageStructuredData({
          url,
          name: `Centry ${market.name} market`,
          description: market.description,
          about: {
            '@type': 'Thing',
            name: `${market.name} lending market`,
            description: market.description,
          },
        })}
      />
      <StructuredData
        data={breadcrumbStructuredData([
          { name: 'Centry', url: 'https://centry.ink/' },
          { name: 'Markets', url: 'https://centry.ink/app/markets' },
          { name: `${market.name} market`, url },
        ])}
      />
      {children}
    </>
  );
}
