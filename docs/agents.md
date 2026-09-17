# Centry agent protocol

Centry's agent layer is split into two parts:

1. **Onchain account** — `CentryOnchainAgentAccount` is owned by the user and can delegate narrowly scoped calls to agent operators. Permissions are bound to operator, target, function selector, expiry, and native-value limits.
2. **Agent transport** — HTTP, MCP, and later A2A endpoints resolve an ERC-8004 agent identity to that onchain account before any privileged operation is attempted.

The transport layer is not the authority. The smart account remains the final execution boundary.

## ERC-8004 registration endpoint

`GET /api/v1/agents/:agentId`

The route returns an ERC-8004 registration file and verifies that:

- `ownerOf(agentId)` on the configured identity registry resolves to a Centry agent account;
- the account's `erc8004IdentityRegistry()` matches the configured registry;
- the account's `erc8004AgentId()` matches the URL agent ID.

The endpoint is therefore suitable as the `agentURI` published by the ERC-8004 identity registry.

### Runtime configuration

Set these environment variables on the API runtime:

```text
CENTRY_ERC8004_RPC_URL=https://...
CENTRY_ERC8004_CHAIN_ID=...
CENTRY_ERC8004_IDENTITY_REGISTRY=0x...
CENTRY_ERC8004_CHAIN_NAME=...
CENTRY_AGENT_BASE_URL=https://api.centry.example
CENTRY_AGENT_NAME=Centry Agent
CENTRY_AGENT_DESCRIPTION=...
CENTRY_AGENT_IMAGE_URL=https://api.centry.example/icon.png
CENTRY_AGENT_WEB_URL=https://app.centry.example/agents
CENTRY_MCP_URL=https://mcp.centry.example/mcp
CENTRY_MCP_VERSION=2026-07-28
CENTRY_A2A_URL=https://api.centry.example/.well-known/agent-card.json
CENTRY_A2A_VERSION=0.3.0
CENTRY_AGENT_X402_SUPPORT=false
CENTRY_AGENT_ACTIVE=true
```

Only the first three variables are required for the registry/account binding check. Service endpoints are optional.

## Read-only permission check

`POST /api/v1/agents/:agentId/authorize`

This endpoint does not execute a transaction. It resolves the ERC-8004 identity, verifies the account binding, and asks the account's onchain `canExecute()` policy whether the supplied operator may call the supplied target, selector, calldata, and native value.

Example request:

```json
{
  "operator": "0x...",
  "target": "0x...",
  "value": "0",
  "data": "0x12345678..."
}
```

A `200` response means the current onchain permission policy allows the call. A `403` means the permission policy denies it. The endpoint is deliberately read-only so the HTTP/API layer cannot become an alternative custody authority.

## Cloudflare MCP gateway

`agent-gateway/` contains the first Cloudflare transport layer. It uses the current stateless `createMcpHandler` path and exposes only read-only tools for the first cut:

- `get_agent` — resolves an ERC-8004 agent registration;
- `check_agent_call_permission` — checks the live onchain permission policy.

The Worker forwards those requests to the Centry HTTP API configured with `CENTRY_API_ORIGIN`. It does not hold a user private key and it does not execute arbitrary transactions.

The MCP endpoint is intended to be published as the `MCP` service in the ERC-8004 registration file once the Worker is deployed. Authentication will be added at the gateway layer before any privileged mutation tools are introduced.

## Request authorization model

The next transport layer will use the ERC-8004 agent ID as the discovery handle and the Centry account as the authorization anchor:

```text
agent request
  -> resolve ERC-8004 agentId
  -> resolve CentryOnchainAgentAccount
  -> authenticate delegated operator
  -> apply API action policy
  -> execute through the smart account
```

The API must never treat a database row, Cloudflare Worker, or API key as sufficient authority to move user funds. Those systems may authenticate, rate-limit, queue, or schedule work, but the account contract's permissions remain the execution boundary.

## Cloudflare deployment

The transport layer can run behind Cloudflare Workers/Agents. Current Cloudflare tooling uses stateless Streamable HTTP for new remote MCP servers, and supports OAuth authorization plus x402/MPP agentic payments. We will add OAuth before exposing mutation tools and can add paid API/MCP reads later.

For privileged user actions, keep authentication and policy state in a durable, replay-resistant store and submit only authorized calls to the onchain account.
