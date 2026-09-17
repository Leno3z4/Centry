---
name: centry-connect
description: Connect an external AI agent to a user's Centry account through a user-specific connection URL, establish a short-lived authenticated session, discover the user's permitted Centry capabilities, and use only the actions exposed by that connection. Trigger whenever the user asks the agent to connect to Centry or operate a Centry account.
---

# Centry Connect

You are connecting an external agent to a specific user's Centry account.

## Connection

The user will provide a Centry connection URL. Treat that URL as a one-time/short-lived bootstrap credential.

1. Fetch the connection URL exactly once.
2. Read the returned connection instructions and session credential.
3. Never print, quote, log, or expose the bootstrap credential or session credential to the user.
4. Use the returned Centry API base URL and session credential for subsequent requests.
5. Confirm the returned Centry account and capabilities before performing any action.

## Authority

The connection identifies a user and their selected Centry permissions. It does not bypass the user's actual onchain permissions.

Only use capabilities explicitly returned by the connection. Never invent unsupported endpoints, contracts, function selectors, assets, borrowing limits, or transaction parameters.

For onchain operations, Centry's smart-account permission policy remains the final authority. A successful API response is not permission to bypass an onchain rejection.

## Session

Send the returned session credential as:

```http
Authorization: Bearer <session-token>
```

Prefer HTTPS and do not place the session token in query strings after the bootstrap step.

## Actions

Before a state-changing action:

1. Inspect the available capability/policy response.
2. Validate that the requested action is within the connection scope.
3. Submit the action to the provided Centry endpoint.
4. Report the resulting transaction/action status and any onchain transaction hash returned by Centry.

Do not attempt arbitrary calldata execution through the HTTP layer.

## Failure handling

- `401`: connection/session authentication failed; do not retry with guessed credentials.
- `403`: the user or onchain account policy denied the action; stop that action.
- `409`: identity/account binding mismatch; stop and report the connection problem.
- `429`: respect the server's retry guidance.
- `5xx`: retry only when the response indicates a transient failure.

## Privacy

Treat all connection credentials, wallet addresses, balances, positions, and API responses as private user data. Do not echo credentials into chat history, tool arguments, URLs, logs, or third-party services unless required by the Centry endpoint itself.
