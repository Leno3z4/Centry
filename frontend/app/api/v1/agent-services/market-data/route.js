'use strict';

import { getAgentMarkets } from '../../../../../../lib/agentReadRuntime';
import { requireCircleGatewayPayment } from '../../../../../../lib/circleAgentX402';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESOURCE_PATH = '/api/v1/agent-services/market-data';
const PRICE = '$0.001';

function noStore(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  const market = String(url.searchParams.get('market') || 'USDC').trim().toUpperCase();

  if (!['USDC', 'EURC', 'cirBTC'.toUpperCase()].includes(market)) {
    return noStore({
      error: 'unsupported_market',
      message: 'Supported markets are USDC, EURC, and cirBTC.',
    }, 400);
  }

  return requireCircleGatewayPayment(request, {
    price: PRICE,
    description: 'Live Centry lending-market data for agents.',
    resourceUrl: url.origin + RESOURCE_PATH + '?market=' + encodeURIComponent(market),
    handler: async () => {
      const rpcUrl = process.env.CENTRY_ANALYTICS_RPC_URL1 || process.env.CENTRY_AGENT_RPC_URL;
      if (!rpcUrl) {
        return noStore({ error: 'agent_market_rpc_not_configured' }, 503);
      }

      try {
        const markets = await getAgentMarkets({ rpcUrl });
        const selected = markets.find(
          (item) => String(item.symbol || '').toUpperCase() === market,
        );

        if (!selected) {
          return noStore({
            error: 'market_not_found',
            message: 'The requested market is not active on the configured Centry lending pool.',
          }, 404);
        }

        return noStore({
          market: selected.symbol,
          network: {
            name: 'Arc',
            chainId: 5042,
            nativeGasAsset: 'USDC',
          },
          data: selected,
        });
      } catch (error) {
        return noStore({
          error: 'market_data_unavailable',
          message: error instanceof Error ? error.message : 'Unable to read current market data.',
        }, 503);
      }
    },
  });
}
