---
name: centry-connect
description: Connect an external AI agent to a user's Centry account through a user-specific connection URL, establish a short-lived authenticated session, discover the user's permitted Centry capabilities, and use only the actions exposed by that connection. Trigger whenever the user asks the agent to connect to Centry or operate a Centry account.
---

# Centry Connect

You are connecting an external agent to a specific user's Centry account.

## Connection

The user will provide a Centry connection URL. Treat that URL as a short-lived bootstrap credential.

1. Determine the Ethereum address of the wallet the agent will use as its Centry operator.
2. Fetch the connection URL exactly once with that address as the `operator` query parameter:

```text
https://<centry-host>/api/v1/agent-connections/<bootstrap-token>?operator=0xYourOperatorAddress
```

3. Read the returned connection instructions and session credential.
4. Never print, quote, log, or expose the bootstrap credential or session credential to the user.
5. Use the returned Centry API base URL and session credential for subsequent requests.
6. Confirm the returned Centry account, operator, scopes, and capabilities before performing any action.

The operator address must already be authorized by the user's Centry smart account. If Centry returns `operator_not_authorized`, ask the user to authorize that operator address in Centry rather than attempting to bypass the check.

## Authority

The connection identifies a user, one authorized agent operator, and the selected Centry permissions. It does not bypass the user's actual onchain permissions.

Only use capabilities and actions explicitly returned by Centry. Never invent unsupported endpoints, contracts, function selectors, assets, borrowing limits, or transaction parameters.

For onchain operations, Centry's smart-account permission policy remains the final authority. A successful API response is not permission to bypass an onchain rejection.

## Session

Send the returned session credential as:

```http
Authorization: Bearer <session-token>
```

Prefer HTTPS and do not place the session token in query strings after the bootstrap step.

Centry checks the operator's current onchain authorization on every authenticated request. If the user revokes the operator, stop using the session immediately.

## Read actions

When the `read` capability is present, use only these endpoints:

```text
GET /api/v1/agent-connections/session/portfolio
GET /api/v1/agent-connections/session/positions
GET /api/v1/agent-connections/session/markets
```

Portfolio contains balances, lending positions, health factor, and borrow power. Positions are bounded reserve-by-reserve. Markets contains reserve configuration, caps, utilization, current supply/borrow, and oracle information.

When `agent-management` is present:

```text
GET /api/v1/agent-connections/session/agent
```

This is a read-only view of the smart-account metadata, ERC-8004 binding, and current operator authorization.

## State-changing actions

Before a state-changing action:

1. Call `GET /api/v1/agent-connections/session` to read the current action catalog.
2. Confirm the requested action is present and the required scope is enabled.
3. Call `POST /api/v1/agent-connections/session/prepare` with the documented action parameters.
4. Verify the returned transaction targets the Centry agent account and matches the requested action.
5. Sign and broadcast the returned transaction using the authorized operator wallet.
6. Report the resulting transaction hash and status.

Centry does **not** accept arbitrary calldata from the HTTP agent interface. The API prepares only bounded, known Centry actions and checks `canExecute()` onchain before returning a transaction request.

### Lending

Supported lending actions:

- `approve` — approve the Centry lending pool for a supported asset.
- `supply` — supply a supported asset.
- `withdraw` — withdraw a supported supplied asset.
- `borrow` — borrow a supported asset.
- `repay` — repay debt for the connected account.

Example:

```http
POST /api/v1/agent-connections/session/prepare
Authorization: Bearer <session-token>
Content-Type: application/json

{"action":"borrow","asset":"USDC","amount":"5000000"}
```

### Swap

Swap support is deliberately bounded to the Centry CENT/USDC UnitFlow path.

Get a quote first:

```http
POST /api/v1/agent-connections/session/swap/quote
Authorization: Bearer <session-token>
Content-Type: application/json

{"inputToken":"CENT","outputToken":"USDC","inputAmount":"1000000000000000000","slippageBps":50}
```

Then prepare the swap using the returned `minOut` in output-token base units:

```json
{
  "action": "swap",
  "asset": "CENT",
  "toAsset": "USDC",
  "amount": "1000000000000000000",
  "minOut": "990000"
}
```

CENT -> USDC may return a bounded smart-account batch containing the token approval and swap. USDC -> CENT uses the configured native-USDC UnitFlow route and the smart-account native-value limit is enforced by `canExecute()`.

### Governance

Read an existing proposal before voting:

```http
GET /api/v1/agent-connections/session/governance/proposal?proposalId=123
Authorization: Bearer <session-token>
```

The response includes state, snapshot/deadline, quorum, vote totals, and the connected account's voting power at the snapshot.

To cast a vote:

```json
{
  "action": "castVote",
  "proposalId": "123",
  "support": "1"
}
```

`support` is `0 = Against`, `1 = For`, `2 = Abstain`. Proposal creation and arbitrary governance calldata are not exposed.

The response contains the smart-account transaction for the authorized operator to sign. Never modify the returned target, calldata, account, or value to perform an unrelated action.

## Failure handling

- `400`: malformed or unsupported action; follow the returned action catalog.
- `401`: connection/session authentication failed; do not retry with guessed credentials.
- `403`: the user, operator, scope, or onchain account policy denied the action; stop that action.
- `409`: identity/account binding mismatch; stop and report the connection problem.
- `429`: respect the server's retry guidance.
- `5xx`: retry only when the response indicates a transient failure.

## Privacy

Treat all connection credentials, wallet addresses, balances, positions, transaction payloads, and API responses as private user data. Do not echo credentials into chat history, tool arguments, URLs, logs, or third-party services unless required by the Centry endpoint itself.
