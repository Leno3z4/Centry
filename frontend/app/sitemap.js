const BASE_URL = 'https://centry.ink';

export default function sitemap() {
  const routes = [
    '/',
    '/app/swap',
    '/app/markets',
    '/app/markets/usdc',
    '/app/markets/eurc',
    '/app/markets/cirbtc',
    '/app/rewards',
    '/app/governance',
    '/app/pools',
    '/app/bridge',
    '/app/gateway',
    '/app/portfolio',
    '/app/analytics',
    '/app/docs',
  ];

  return routes.map((path) => ({
    url: `${BASE_URL}${path}`,
  }));
}
