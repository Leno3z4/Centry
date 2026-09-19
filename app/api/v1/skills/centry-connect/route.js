const SKILL = `---
name: centry-connect
description: Connect an external AI agent to a user's Centry account through a user-specific connection URL or Centry API credential.
---

# Centry Connect

Centry uses this Skill + HTTPS API flow for external agents. Do not assume MCP is required.

## Connect with a user connection URL

The user will provide a Centry connection URL.

1. Determine the Ethereum address of the wallet this agent will use as its Centry operator.
2. Fetch the connection URL once with \`?operator=<operator-address>\`.
3. Read the returned personalized activation instructions.
4. Use the returned Centry API base and short-lived session credential.
5. Confirm the connected Centry account, operator, scopes, and capabilities before doing anything.
6. Never reveal the connection credential or session credential.

The URL is only a bootstrap. Centry verifies the user signature, account owner, operator authorization, active state, scopes, and the live onchain permission policy.

## Connect with a persistent Centry credential

The user may instead provide a \`ck_live_...\` credential.

Use:

\`\`\`http
Authorization: Bearer ck_live_...
\`\`\`

The credential is bound to one Centry agent account, one operator address, and explicit scopes. It can be revoked by the owner.

## Onchain execution

Centry does not give the external agent the user's owner private key.

Before a state-changing operation:

1. Read the current Centry session/capability information.
2. Check that the requested action and scope are enabled.
3. Call the documented transaction-preparation endpoint.
4. Verify the transaction request matches the requested action.
5. Sign and broadcast with the authorized operator wallet.
6. Report the transaction hash.

Centry only exposes bounded known actions. Never invent arbitrary calldata or contracts.

## Always-on agents

An agent may run continuously outside the Centry UI. The runtime should keep its own operator signing key secure and poll/listen for its strategy conditions. Every requested action still passes through Centry's live onchain account state and permissions.

Switching the user's agent OFF or revoking the operator must immediately stop execution.

## Privacy

Treat Centry connection credentials, API keys, wallet addresses, balances, positions, and transaction payloads as private. Never echo credentials into chat, logs, URLs, or third-party services.
`;

export async function GET() {
  return new Response(SKILL, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
