# Centry agent protocol

Centry's agent layer is split into three pieces:

1. **Onchain account** — `CentryOnchainAgentAccount` is owned by the user and can delegate narrowly scoped calls to agent operators. Permissions are bound to operator, target, function selector, expiry, and native-value limits.
2. **Skill connection** — the user authorizes a short-lived external-agent connection and Centry returns a unique HTTPS URL. The URL resolves to a personalized `SKILL.md`-style bootstrap response containing the user's connection/session instructions.
3. **Agent transport** — ordinary HTTPS is the primary off-platform transport. MCP and A2A use the same user-scoped identity boundary.

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
  "account": "0x...",
  "scopes": ["read", "borrow", "repay"]
}
```

The response contains a short-lived challenge token plus the exact human-readable message to sign. The selected scopes are part of the signed message, so they cannot be broadened after signing.

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
- the requested scopes exactly match the signed challenge scopes;
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

## Session and revocation

`GET /api/v1/agent-connections/session`

Use:

```http
Authorization: Bearer <session-token>
```

Every authenticated agent request re-checks `agentOperators(operator)` onchain. Therefore disabling the operator on the Centry agent account immediately prevents further authenticated use of the session without waiting for the bearer token to expire.

## Read API

All read endpoints require the `read` scope and the same bearer session:

```text
GET /api/v1/agent-connections/session/portfolio
GET /api/v1/agent-connections/session/positions
GET /api/v1/agent-connections/session/markets
```

`portfolio` returns token balances, lending positions, health factor, and borrow power for the connected Centry agent account.

`positions` returns bounded reserve-by-reserve supply/borrow positions plus reserve risk parameters and oracle timestamps.

`markets` returns active reserves, caps, utilization, current supply/borrow, and oracle prices. Reserve discovery is bounded by the lending pool's configured reserve limit rather than unbounded user iteration.

For the agent account itself:

```text
GET /api/v1/agent-connections/session/agent
```

This requires `agent-management` and returns the account metadata, ERC-8004 binding, and current operator authorization state. User-owned administrative writes remain on the Centry UI; the external agent does not receive owner authority.

## Agent execution

The mutation surface is deliberately **transaction preparation**, not arbitrary server-side execution:

`POST /api/v1/agent-connections/session/prepare`

Every prepared action is resolved through a fixed catalog, checked against the connection scope, then checked against the live `agentOperators()` and `canExecute()` policy for every underlying call. The response is a transaction for the authorized operator wallet to sign and broadcast.

### Lending

```json
{
  "action": "borrow",
  "asset": "USDC",
  "amount": "5000000"
}
```

Supported lending actions:

- `approve`
- `supply`
- `withdraw`
- `borrow`
- `repay`

### Swap

The agent swap path is intentionally bounded to Centry's configured CENT/USDC UnitFlow route:

```text
POST /api/v1/agent-connections/session/swap/quote
```

Example request:

```json
{
  "inputToken": "CENT",
  "outputToken": "USDC",
  "inputAmount": "1000000000000000000",
  "slippageBps": 50
}
```

The returned `minOut` is expressed in the output token's base units and can be supplied to `prepare`:

```json
{
  "action": "swap",
  "asset": "CENT",
  "toAsset": "USDC",
  "amount": "1000000000000000000",
  "minOut": "990000"
}
```

CENT -> native USDC uses the configured UnitFlow V3 route. The builder creates a bounded two-call batch (`approve` + UnitFlow V3 `exactInputSingle`), and the live onchain permission policy checks every call.

### Governance

```text
GET /api/v1/agent-connections/session/governance/proposal?proposalId=<id>
```

The endpoint returns proposal state, snapshot/deadline, quorum, proposal vote totals, and the connected account's historical voting power at the snapshot.

To vote:

```json
{
  "action": "castVote",
  "proposalId": "123",
  "support": "1"
}
```

`support` follows the Governor convention: `0 = Against`, `1 = For`, `2 = Abstain`. Proposal creation and arbitrary governance calldata are intentionally not exposed to external agents.

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
CENTRY_LENDING_POOL=0x...
CENTRY_ORACLE=0x...
CENTRY_USDC=0x...
CENTRY_EURC=0x...
CENTRY_CIRBTC=0x...
CENTRY_TOKEN=0x...
CENTRY_UNITFLOW_V3_ROUTER=0x...
CENTRY_UNITFLOW_V3_QUOTER=0x...
CENTRY_GOVERNOR=0x...
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

## Cloudflare transport and always-on agents

`agent-gateway/` is an optional Cloudflare transport layer. It can consume the same HTTPS session model rather than introducing a second user identity system.

An external agent can run 24/7 independently of Centry's web UI:

```text
external agent runtime
  -> stores its own operator private key securely
  -> keeps the short-lived Centry session token private
  -> reads portfolio/markets/positions
  -> requests bounded transactions
  -> signs with the operator wallet
  -> broadcasts to Arc
```

Centry never receives the operator private key. The Worker/API can authenticate, rate-limit, queue, schedule, or proxy requests, while the user's onchain account remains the execution boundary.

## Production security

The smart account is the hard execution boundary and operator revocation is enforced live onchain. The HTTP connection/session credentials are still deliberately short-lived and sensitive. For production, deploy rate limiting and durable bootstrap/challenge replay tracking at the edge (for example with Cloudflare Durable Objects/KV) before exposing the service broadly.


## Agent lifecycle

Every user-owned onchain agent starts **OFF**. The owner must sign an onchain activation transaction with `setActive(true)`. The owner can switch it off at any time with `setActive(false)`; all external sessions and API-key requests then fail the live policy check.

Custom/BYO agents are first-class. A user can supply their own operator wallet, metadata URI and configuration fingerprint. The operator never receives the user's owner authority.

## Agent purchase

The standard Centry agent is $2.50 USDC on Arc Mainnet. The purchase flow is atomic inside `CentryOnchainAgentFactory.purchaseAndCreateAgentAccount()`: the factory transfers exactly 2.5 USDC to the Centry treasury and creates the user-owned agent account in the same transaction.

## Persistent external API keys

Users may generate `ck_live_...` credentials per agent. Each key is bound to the user's agent account, one operator address and explicit scopes. The raw key is returned once. The database stores only its hash and revocation state. Switching the onchain agent OFF or revoking its operator immediately blocks API-key use.

Cloudflare D1 stores persistent agent metadata, purchases, provider configuration, API-key metadata and agent chat history. The Next.js/API runtime talks to a dedicated authenticated Cloudflare Worker (`agent-db/`), and that Worker is the only component with the D1 binding. Provider API keys are encrypted server-side with AES-256-GCM.

## Cloudflare D1 persistence

The persistent agent store is intentionally separated from the Next.js runtime:

```text
Centry Next.js API
  -> POST /internal/store with a private shared secret
  -> Cloudflare Worker: agent-db/
  -> D1 binding: env.DB
```

The Worker exposes only a fixed allowlist of agent-storage operations; it does not expose arbitrary SQL. The D1 schema is versioned in `agent-db/migrations/`.

The Next.js runtime needs:

```text
CENTRY_AGENT_DB_URL=https://<your-agent-db-worker>/internal/store
CENTRY_AGENT_DB_SECRET=<long-random-secret>
```

The Cloudflare Worker needs the same `CENTRY_AGENT_DB_SECRET` as a Worker secret, plus a D1 database bound as `DB`.

## AI provider configuration

AI providers are configured per agent, not globally. Supported provider adapters are Gemini, OpenAI and Anthropic; the model identifier is user-selected. Provider credentials are never returned to the browser after they are stored.

## Agent analytics and chat

Onchain agent analytics are reconstructed from `AgentExecuted`, `AgentBatchExecuted`, operator/permission and activation events emitted by the agent account. Each agent also has a chat surface that is grounded in its verified activity.

## Agent-to-agent

Centry exposes a lightweight A2A message endpoint and an agent card. Agent-to-agent communication is message-level only. Receiving a message does not grant execution authority; any action still passes through the recipient agent's owner-defined operator and permission policy.
