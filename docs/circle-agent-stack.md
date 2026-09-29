# Circle Agent Stack integration

This branch adds the first Centry integration with Circle's agent-economy stack without changing the existing user-owned smart-account execution boundary.

## What is being added

Centry exposes a machine-readable, pay-per-call service:

`GET /api/v1/agent-services/market-data?market=USDC`

The service returns current public Centry lending-market data from the configured analytics RPC.

The endpoint uses Circle Gateway-backed x402 settlement:

- x402 v2 payment negotiation
- Arc Mainnet (`eip155:5042`)
- Arc-native USDC
- GatewayWalletBatched payment domain
- Circle's `@circle-fin/x402-batching` facilitator
- payment settlement only after the service handler returns a successful response

Machine-readable discovery is exposed at:

`GET /.well-known/x402`

The discovery document describes the endpoint, price, input schema, output shape, tags, accepted payment rail, and example agent prompts.

## Safety boundary

The x402 seller service is read-only public protocol data. It does not expose a user's portfolio, smart-account authority, operator key, or transaction execution.

The existing Centry execution architecture remains separate:

`user-owned smart account -> authorized operator -> Centry permissions -> simulation -> execution`

Circle payment infrastructure is only being added as a machine-to-machine service-payment rail.

## Configuration

The feature is disabled by default:

`CENTRY_AGENT_X402_ENABLED=false`

To enable the seller surface:

`CENTRY_AGENT_X402_ENABLED=true`

Optional receive address:

`CENTRY_AGENT_SERVICE_SELLER_ADDRESS=0x...`

When omitted, Centry falls back to the configured protocol treasury address.

The public service base URL can be set with:

`CENTRY_AGENT_SERVICE_BASE_URL=https://centry.ink`

Use:

`CENTRY_ANALYTICS_RPC_URL1`

for the dedicated analytics RPC. Do not use a rate-limited public RPC for production service traffic.

## Current service

Price: `0.001 USDC` per call.

Accepted network:

`eip155:5042` (Arc Mainnet)

Asset:

`0x3600000000000000000000000000000000000000`

The service currently supports:

- USDC
- EURC
- cirBTC

## Buyer-side roadmap

This branch intentionally starts with the seller side.

The next integration layer is a separate agent-service client that can discover external x402 resources through Circle discovery, inspect payment requirements, and pay for approved services using a dedicated service-payment wallet/budget.

That buyer wallet should remain distinct from the user's Centry DeFi capital and from the operator authorization used to execute Centry smart-account actions.
