# Centry agent protocol

Centry's agent layer has two complementary pieces:

1. **Agent Skill connection** — the primary off-platform connection path. A user clicks **Connect agent**, Centry creates a user-specific short-lived connection URL, and the user copies a small prompt containing that URL into the external agent. The agent fetches the URL, receives the Centry skill instructions plus a short-lived session, and then discovers the capabilities available to that user.
2. **Onchain account** — `CentryOnchainAgentAccount` is owned by the user and can delegate narrowly scoped calls to agent operators. Permissions are bound to operator, target, function selector, expiry, and native-value limits.

The Skill/HTTP layer is the transport and user-session layer. The smart account remains the final onchain execution boundary.

## Connection UX

The intended user flow is:

```text
Centry account / agent settings
        |
        +--> Connect external agent
                |
                +--> create user-scoped connection
                +--> show copyable prompt
                       |
                       +--> "Read this Centry skill URL: https://api.../agent-connections/<token>"
                |
                v
             external agent
                |
                +--> GET connection URL
                +--> Centry verifies signed bootstrap credential
                +--> Centry returns SKILL.md-style instructions + short-lived session
                +--> agent calls /api/v1/agent-connections/session
                +--> agent receives user/account + capability snapshot
                +--> agent uses only the returned capabilities
```

The reusable skill source is `skills/centry-connect/SKILL.md`. The connection endpoint serves a personalized, credential-bearing copy of that skill so the same external agent can connect to a different Centry user without installing a user-specific static skill.

### Why the connection URL is the credential

The prompt should contain one opaque connection URL instead of asking the user to paste a second secret into the agent. The URL is short-lived and signed by `CENTRY_AGENT_CONNECTION_SECRET`.

After the first fetch, the server returns a shorter-lived session token. Subsequent API requests use:

```http
Authorization: Bearer <session-token>
```

The bootstrap URL should not be used for ordinary API requests, and the session token should never be placed in query strings.

### Runtime configuration

Required for the connection protocol:

```text
CENTRY_AGENT_CONNECTION_SECRET=<long-random-server-secret>
CENTRY_AGENT_BASE_URL=https://api.centry.example
```

`CENTRY_AGENT_CONNECTION_SECRET` must stay server-side. It is used to sign and verify bootstrap and session credentials.

## Connection endpoints

`GET /api/v1/agent-connections/:token`

Verifies the user-scoped bootstrap connection and returns the personalized Skill instructions plus a short-lived session credential.

`GET /api/v1/agent-connections/:token/prompt`

Returns the copy-paste prompt containing the unique connection URL and instructions telling the external agent to establish the connection.

`GET /api/v1/agent-connections/session`

Accepts the short-lived session credential and returns the current account, delegated operator and capability snapshot.

The token issuance helper is `lib/agentConnectionTokens.js`. The authenticated Centry account/agent UI will call `issueAgentConnection(...)` after the user has authenticated and selected the desired connection scopes.

## Capabilities and authority

Connection scopes are intentionally separate from actual onchain authorization. A session may say that `borrow` or `swap` is available, but the requested action must still pass Centry's onchain smart-account permissions before a transaction can execute.

The API must never treat a database row, Cloudflare Worker, skill URL, API key or session token as sufficient authority to move user funds. Those systems authenticate and route requests; the smart account remains the final execution boundary.

## ERC-8004 identity

`GET /api/v1/agents/:agentId` remains the ERC-8004 registration-file endpoint. It verifies that the registry owner is a Centry agent account and that the account's stored registry/agent ID match the requested identity.

ERC-8004 therefore provides public agent identity/discovery, while the Skill connection URL provides private user-specific authorization to operate a particular Centry account.

## Read-only permission check

`POST /api/v1/agents/:agentId/authorize` is a read-only policy check. It resolves the ERC-8004 identity, verifies the account binding, and asks the account's onchain `canExecute()` policy whether the supplied operator may call the supplied target, selector, calldata, and native value.

## MCP

`agent-gateway/` contains the Cloudflare transport layer. MCP remains a transport/discovery surface that can be exposed by the Skill after the user connection is established. It is not the primary user connection mechanism.

Before privileged mutation tools are exposed through MCP, authentication must map the MCP caller to the same Centry user/session and onchain policy used by the Skill HTTP API.
