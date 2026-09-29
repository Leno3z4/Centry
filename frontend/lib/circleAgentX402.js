import { getAddress } from 'viem';
import { BatchFacilitatorClient } from '@circle-fin/x402-batching/server';
import { CONTRACT_ADDRESSES } from '../constants/contracts';

export const CIRCLE_X402_NETWORK = 'eip155:5042';
export const CIRCLE_X402_ASSET = CONTRACT_ADDRESSES.USDC;
export const CIRCLE_X402_SELLER =
  process.env.CENTRY_AGENT_SERVICE_SELLER_ADDRESS ||
  CONTRACT_ADDRESSES.treasury;

const CIRCLE_GATEWAY_WALLET = '0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE';
const FACILITATOR = new BatchFacilitatorClient();
const USDC_DECIMALS = 6;

function serviceEnabled() {
  return String(process.env.CENTRY_AGENT_X402_ENABLED || '').toLowerCase() === 'true';
}

function assertSellerAddress() {
  if (!/^0x[a-fA-F0-9]{40}$/.test(CIRCLE_X402_SELLER)) {
    throw new Error('agent_service_seller_address_not_configured');
  }
  return getAddress(CIRCLE_X402_SELLER);
}

function decimalToUsdcUnits(price) {
  const value = String(price).replace(/^\$/, '').trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(value) || Number(value) <= 0) {
    throw new Error('invalid_agent_service_price');
  }
  const [whole, fraction = ''] = value.split('.');
  const padded = fraction.padEnd(USDC_DECIMALS, '0');
  return (BigInt(whole) * 1_000_000n + BigInt(padded)).toString();
}

function paymentHeader(request) {
  return request.headers.get('payment-signature') || request.headers.get('x-payment');
}

function encodePaymentRequired(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function encodePaymentResponse(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function withPaymentHeaders(response, settlement) {
  response.headers.set('PAYMENT-RESPONSE', encodePaymentResponse({
    success: true,
    transaction: settlement.transaction,
    network: settlement.network,
    payer: settlement.payer || undefined,
  }));
  response.headers.set('Access-Control-Expose-Headers', 'PAYMENT-RESPONSE, PAYMENT-REQUIRED');
  return response;
}

export async function requireCircleGatewayPayment(request, {
  price,
  description,
  resourceUrl,
  handler,
}) {
  if (!serviceEnabled()) {
    return Response.json(
      { error: 'agent_service_disabled' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const payTo = assertSellerAddress();
  const requirements = {
    scheme: 'exact',
    network: CIRCLE_X402_NETWORK,
    asset: CIRCLE_X402_ASSET,
    amount: decimalToUsdcUnits(price),
    payTo,
    maxTimeoutSeconds: 120,
    extra: {
      name: 'GatewayWalletBatched',
      version: '1',
      verifyingContract: CIRCLE_GATEWAY_WALLET,
    },
  };

  const absoluteResourceUrl = String(resourceUrl || request.url);
  const required = {
    x402Version: 2,
    resource: {
      url: absoluteResourceUrl,
      description: description || ('Centry agent service (' + price + ' USDC)'),
      mimeType: 'application/json',
    },
    accepts: [requirements],
  };

  const encoded = paymentHeader(request);

  if (!encoded) {
    return new Response(JSON.stringify({}), {
      status: 402,
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-REQUIRED': encodePaymentRequired(required),
        'Access-Control-Expose-Headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE',
        'Cache-Control': 'no-store',
      },
    });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    return Response.json(
      { error: 'invalid_payment_signature' },
      { status: 402, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const verification = await FACILITATOR.verify(payload, requirements);
    if (!verification.isValid) {
      return Response.json(
        { error: 'payment_verification_failed', reason: verification.invalidReason || 'invalid_payment' },
        { status: 402, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const result = await handler();
    if (!result || result.status >= 400) {
      return result || Response.json(
        { error: 'agent_service_failed' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const settlement = await FACILITATOR.settle(payload, requirements);
    if (!settlement.success) {
      return Response.json(
        { error: 'payment_settlement_failed', reason: settlement.errorReason || 'settlement_failed' },
        { status: 402, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return withPaymentHeaders(result, settlement);
  } catch (error) {
    return Response.json(
      {
        error: 'agent_service_payment_failed',
        reason: error instanceof Error ? error.message : 'unknown_error',
      },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export function circleX402Discovery({ baseUrl }) {
  const origin = String(baseUrl || '').replace(/\/$/, '');
  const resource = origin + '/api/v1/agent-services/market-data';

  return {
    version: 2,
    protocol: 'x402',
    provider: {
      name: 'Centry',
      url: 'https://centry.ink',
      description: 'Arc-native onchain capital infrastructure with machine-readable agent services.',
    },
    resources: [
      {
        resource,
        name: 'Centry live market data',
        description: 'Current Centry lending-market configuration and utilization data on Arc.',
        method: 'GET',
        mimeType: 'application/json',
        tags: ['defi', 'lending', 'market-data', 'arc', 'usdc', 'eurc', 'cirbtc'],
        accepts: [{
          scheme: 'exact',
          network: CIRCLE_X402_NETWORK,
          asset: CIRCLE_X402_ASSET,
          payTo: assertSellerAddress(),
          amount: decimalToUsdcUnits('0.001'),
          maxTimeoutSeconds: 120,
          extra: {
            name: 'GatewayWalletBatched',
            version: '1',
            verifyingContract: CIRCLE_GATEWAY_WALLET,
          },
        }],
        inputSchema: {
          type: 'object',
          properties: {
            market: {
              type: 'string',
              enum: ['USDC', 'EURC', 'cirBTC'],
              description: 'Supported Centry lending market symbol.',
            },
          },
          required: ['market'],
          additionalProperties: false,
        },
        outputSchema: {
          type: 'object',
          required: ['market', 'network', 'data'],
        },
        examples: [
          { prompt: 'What is the current USDC lending market utilization on Centry?', params: { market: 'USDC' } },
          { prompt: 'Show the current EURC lending market configuration.', params: { market: 'EURC' } },
        ],
      },
    ],
  };
}

export function circleX402Enabled() {
  return serviceEnabled();
}
