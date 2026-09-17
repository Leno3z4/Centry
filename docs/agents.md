# Centry agent protocol

Centry's agent layer is split into three pieces:

1. **Onchain account** — `CentryOnchainAgentAccount` is owned by the user and can delegate narrowly scoped calls to agent operators. Permissions are bound to operator, target, function selector, expiry, and native-value limits.
2. **Skill connection** — the user authorizes a short-lived external-agent connection and Centry returns a unique HTTPS URL. The URL resolves to a personalized `SKILL.md`-style bootstrap response containing the user's connection/session instructions.
3. **Agent transport** — ordinary HTTPS is the primary off-platform transport. MCP and later A2A can be exposed as additional transports after the same identity/session layer is in place.

The transport layer is not the authority. The smart account remains the final execution boundary.

## User connection flow

The intended product flow is:

```text
user opens Centry agent connection surface
  -> selects an external agent
  -> Centry requests a wallet signature for the selected account
  -> POST /api/v1/agent-connections/challenge
  -> wallet signs the returned human-readable challenge
  -> POST /api/v1/agent-connections
  -> Centry verifies the signature and the smart-account owner onchain
  -> Centry returns a unique short-lived connection URL + copyable prompt

external agent
  -> fetches the connection URL
  -> receives personalized SKILL.md-style connection instructions
  -> exchanges bootstrap authorization for a short-lived session
  -> GET /api/v1/agent-connections/session
  -> uses only the capabilities returned for that connection
```

The copyable prompt is intentionally simple:

```text
Connect my Centry account to this agent.

Read the Centry skill at the following URL and follow its instructions to establish the connection.
https://api.centry.example/api/v1/agent-connections/<short-lived-token>

After connecting, use only the capabilities returned by Centry for this connection.
```

The connection URL itself is the bootstrap credential. It is short-lived and should be treated as sensitive. It should never be pasted into logs, analytics, chat transcripts, or third-party services.

## Wallet authorization

`POST /api/v1/agent-connections/challenge`

Request:

```json
{
  "owner": "0x...",
  "account": "0x..."
}
```

The response contains a signed challenge token plus the exact human-readable message to sign.

`POST /api/v1/agent-connections`

Request:

```json
{
  "challengeToken": "<signed-centry-challenge>",
  "signature": "0x...",
  "scopes": ["read", "borrow", "repay", "swap"]
}
```

Centry checks:

- the challenge is valid and unexpired;
- the wallet signature resolves to the challenge owner;
- the configured RPC can read the supplied smart account;
- `CentryOnchainAgentAccount.owner()` matches the signer;
- requested scopes are from Centry's explicit capability set.

The server never accepts the account owner or operator as authority merely because they appear in JSON.

## Skill bootstrap

`GET /api/v1/agent-connections/:token`

This returns Markdown containing:

- the authenticated Centry API base;
- a short-lived session bearer token;
- the connected account and owner;
- the selected scopes;
- instructions to call the capability/session endpoint.

The reusable external-agent skill lives at:

`skills/centry-connect/SKILL.md`

That skill tells an external agent to fetch the user-specific connection URL, keep the credential private, establish the session, and follow only the capabilities returned by Centry.

## Session discovery

`GET /api/v1/agent-connections/session`

Use:

```http
Authorization: Bearer <session-token>
```

The response exposes the current user/account binding and capability flags. A capability being present does not bypass the user's current onchain smart-account permissions.

## Scopes

The current connection scope vocabulary is:

- `read`
- `lend`
- `borrow`
- `repay`
- `swap`
- `governance`
- `agent-management`

Mutation endpoints should require both the session scope and a matching onchain account permission. Do not add arbitrary-calldata endpoints to the HTTP layer.

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
CENTRY_AGENT_OPERATOR=0x...
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

`CENTRY_AGENT_CONNECTION_SECRET`, `CENTRY_AGENT_RPC_URL`, and `CENTRY_AGENT_OPERATOR` must never be exposed through `NEXT_PUBLIC_*` variables.

## Cloudflare transport

`agent-gateway/` is an optional Cloudflare transport layer. It uses the current stateless MCP handler and exposes read-only discovery/permission tools. It can consume the same HTTPS session model rather than introducing a second user identity system.

The Worker must not hold a user's private key and must not become an alternative custody authority. It may authenticate, rate-limit, queue, schedule, or proxy requests, while the user's onchain account remains the execution boundary.

## Security follow-up

The current connection bootstrap is stateless and short-lived. Before production, add durable replay protection/rate limiting for challenge consumption and connection issuance, preferably at the deployment layer (for example a Cloudflare Durable Object/KV-backed connection store). The connection URL should also remain short-lived because it carries bootstrap authority.
