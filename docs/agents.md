# Centry agent protocol

Centry's agent layer is split into three pieces:

1. **Onchain account** — `CentryOnchainAgentAccount` is owned by the user and can delegate narrowly scoped calls to agent operators. Permissions are bound to operator, target, function selector, expiry, and native-value limits.
2. **Skill connection** — the user authorizes a short-lived external-agent connection and Centry returns a unique HTTPS URL. The URL resolves to a personalized `SKILL.md`-style bootstrap response containing the user's connection/session instructions.
3. **Agent transport** — ordinary HTTPS is the primary off-platform transport. MCP and later A2A can be exposed as additional transports after the same identity/session layer is in place.

The transport layer is not the authority. The smart account remains the final execution boundary.

## User connection flow

```text
user opens Centry agent connection surface
  -> selects/creates a Centry agent account
  -> enters the external agent's operator wallet address
  -> authorizes that operator on the smart account
  -> selects scopes
  -> POST /api/v1/agent-connections/challenge
  -> wallet signs the returned human-readable challenge
  -> POST /api/v1/agent-connections
  -> Centry verifies the signature, smart-account owner, and onchain operator authorization
  -> Centry returns a unique short-lived connection URL + copyable prompt

external agent
  -> reads its own operator address
  -> fetches the connection URL with ?operator=<operator-address>
  -> receives personalized SKILL.md-style connection instructions
  -> receives a short-lived session bound to the same operator
  -> GET /api/v1/agent-connections/session
  -> uses only the capabilities/actions returned for that connection
```

The connection URL is bound to the operator that the user authorized. Another operator address cannot reuse the same bootstrap token.

## Wallet authorization

`POST /api/v1/agent-connections/challenge`

Request:

```json
{
  "owner": "0x...",
  "account": "0x..."
}
```

The response contains a short-lived challenge token plus the exact human-readable message to sign.

`POST /api/v1/agent-connections`

Request:

```json
{
  "challengeToken": "<signed-centry-challenge>",
  "signature": "0x...",
  "operator": "0x...",
  "scopes": ["read", "borrow", "repay"]
}
```

Centry checks:

- the challenge is valid, unexpired, and origin-bound;
- the wallet signature resolves to the challenge owner;
- the configured RPC can read the supplied smart account;
- `CentryOnchainAgentAccount.owner()` matches the signer;
- `CentryOnchainAgentAccount.agentOperators(operator)` is true;
- requested scopes are from Centry's explicit capability set.

The server never accepts the account owner or operator as authority merely because they appear in JSON.

## Skill bootstrap

`GET /api/v1/agent-connections/:token?operator=0x...`

The external agent must use the same operator address that was bound when the connection was issued. The route re-checks the operator against the live onchain account before issuing the session.

The returned Markdown contains:

- the authenticated Centry API base;
- a short-lived session bearer token;
- the connected account and operator;
- the selected scopes;
- instructions to call the capability/session endpoint;
- instructions for the bounded transaction-preparation endpoint.

The reusable external-agent skill lives at:

`skills/centry-connect/SKILL.md`

## Session discovery

`GET /api/v1/agent-connections/session`

Use:

```http
Authorization: Bearer <session-token>
```

The response exposes the current user/account/operator binding, capability flags, chain ID, and the currently supported action catalog.

## Agent execution

The first mutation surface is deliberately **transaction preparation**, not arbitrary server-side execution:

`POST /api/v1/agent-connections/session/prepare`

Example:

```json
{
  "action": "borrow",
  "asset": "USDC",
  "amount": "5000000"
}
```

Centry resolves the action through its bounded catalog, checks the connection scope, checks the live `agentOperators()` and `canExecute()` policy on the smart account, and returns a transaction for the authorized operator wallet to sign and broadcast.

The first supported actions are:

- `approve`
- `supply`
- `withdraw`
- `borrow`
- `repay`

The API does **not** expose arbitrary calldata execution. Every mutation must map to a known Centry action and pass the current onchain policy.

## Scopes

The current connection scope vocabulary is:

- `read`
- `lend`
- `borrow`
- `repay`
- `swap`
- `governance`
- `agent-management`

Scopes are an API-level capability boundary; they never replace the smart-account policy.

## ERC-8004 registration endpoint

`GET /api/v1/agents/:agentId`

The route returns an ERC-8004 registration file and verifies that:

- `ownerOf(agentId)` on the configured identity registry resolves to a Centry agent account;
- the account's `erc8004IdentityRegistry()` matches the configured registry;
- the account's `erc8004AgentId()` matches the URL agent ID.

The endpoint is therefore suitable as the `agentURI` published by the ERC-8004 identity registry.

## Runtime configuration

The API runtime needs these server-side values:

```text
CENTRY_AGENT_CONNECTION_SECRET=<long-random-secret>
CENTRY_AGENT_RPC_URL=https://...
CENTRY_AGENT_BASE_URL=https://api.centry.example
CENTRY_ERC8004_RPC_URL=https://...
CENTRY_ERC8004_CHAIN_ID=...
CENTRY_ERC8004_IDENTITY_REGISTRY=0x...
CENTRY_ERC8004_CHAIN_NAME=...
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

There is intentionally no global `CENTRY_AGENT_OPERATOR`: operator identity belongs to each user connection and must be authorized on that user's smart account.

## Cloudflare transport

`agent-gateway/` is an optional Cloudflare transport layer. It can consume the same HTTPS session model rather than introducing a second user identity system.

The Worker must not hold a user's private key and must not become an alternative custody authority. It may authenticate, rate-limit, queue, schedule, or proxy requests, while the user's onchain account remains the execution boundary.

## Production security follow-up

The onchain account foundation is now the execution boundary, but production launch still requires independent contract audit and broader protocol tests. The HTTP connection layer is intentionally stateless and short-lived; before production, add durable replay protection/rate limiting for challenge consumption and connection issuance, preferably at the deployment layer (for example a Cloudflare Durable Object/KV-backed connection store).
