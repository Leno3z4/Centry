const SITE_URL = 'https://centry.ink';

export const CENTRY_ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const CENTRY_WEBSITE_ID = `${SITE_URL}/#website`;
export const CENTRY_WEBAPP_ID = `${SITE_URL}/#webapplication`;

export const CENTRY_SITE_STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': CENTRY_ORGANIZATION_ID,
      name: 'Centry',
      url: SITE_URL,
      description: 'Onchain capital infrastructure for lending, borrowing, swaps, yield, and owner-controlled agents on Arc.',
    },
    {
      '@type': 'WebSite',
      '@id': CENTRY_WEBSITE_ID,
      url: SITE_URL,
      name: 'Centry',
      description: 'Arc-native lending, borrowing, swaps, and yield infrastructure.',
      publisher: { '@id': CENTRY_ORGANIZATION_ID },
      inLanguage: 'en',
    },
    {
      '@type': 'WebApplication',
      '@id': CENTRY_WEBAPP_ID,
      url: `${SITE_URL}/app`,
      name: 'Centry',
      description: 'A web application for owner-controlled onchain capital, including lending, borrowing, swaps, yield, portfolio tracking, analytics, and agent automation on Arc.',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      featureList: [
        'USDC lending',
        'Borrowing against supported collateral',
        'Asset swaps',
        'Portfolio and account health tracking',
        'Protocol analytics',
        'Owner-controlled onchain agents',
      ],
      provider: { '@id': CENTRY_ORGANIZATION_ID },
    },
  ],
};

export function webPageStructuredData({ url, name, description, about } = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name,
    description,
    isPartOf: { '@id': CENTRY_WEBSITE_ID },
    about: about || { '@id': CENTRY_WEBAPP_ID },
    inLanguage: 'en',
  };
}

export function breadcrumbStructuredData(items = []) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@id': item.url,
        name: item.name,
      },
    })),
  };
}

export function marketsItemListStructuredData() {
  const markets = [
    ['usdc', 'USDC', 'USD Coin', 'USDC lending market rates, liquidity, and risk parameters on Centry.'],
    ['eurc', 'EURC', 'Euro Coin', 'EURC lending market rates, liquidity, and risk parameters on Centry.'],
    ['cirbtc', 'cirBTC', 'Circle Wrapped Bitcoin', 'cirBTC lending market rates, liquidity, and risk parameters on Centry.'],
  ];

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${SITE_URL}/app/markets#market-list`,
    name: 'Centry lending markets',
    description: 'Supported live Centry lending markets on Arc.',
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    numberOfItems: markets.length,
    itemListElement: markets.map(([id, symbol, name, description], index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'WebPage',
        '@id': `${SITE_URL}/app/markets/${id}#webpage`,
        url: `${SITE_URL}/app/markets/${id}`,
        name: `${symbol} market`,
        description,
      },
    })),
  };
}

export default function StructuredData({ data }) {
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
