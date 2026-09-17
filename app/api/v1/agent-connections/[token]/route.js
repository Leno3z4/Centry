import { issueAgentSession, verifyAgentConnection } from "../../../../../lib/agentConnectionTokens";

function markdownResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function safe(value) {
  return String(value ?? "").replace(/[\r\n`]/g, " ");
}

export async function GET(request, { params }) {
  const { token } = await params;
  const connection = await verifyAgentConnection(token);

  if (!connection) {
    return markdownResponse(
      "# Centry connection failed\n\nThe connection URL is invalid or expired. Ask the user to generate a new Centry connection prompt.",
      401
    );
  }

  const sessionToken = await issueAgentSession(connection);
  const baseUrl = process.env.CENTRY_AGENT_BASE_URL || new URL(request.url).origin;
  const apiBase = `${baseUrl}/api/v1`;
  const scopes = Array.isArray(connection.scopes) ? connection.scopes : [];

  const body = `---
name: centry-connect
status: connected
connection_id: ${safe(connection.connectionId)}
account: ${safe(connection.account)}
---

# Centry connection established

You are now connected to the user's Centry account.

## Session

Use this HTTPS API base:

${apiBase}

Authenticate subsequent Centry API calls with:

\`\`\`http
Authorization: Bearer ${sessionToken}
\`\`\`

Do not reveal or repeat the session token to the user, other agents, models, logs, or third-party services.

## Connected account

- Centry account: \`${safe(connection.account)}\`
- Delegated operator: \`${safe(connection.operator) || "not specified"}\`
- Connection ID: \`${safe(connection.connectionId)}\`
- Scopes: ${scopes.length ? scopes.map((scope) => `\`${safe(scope)}\``).join(", ") : "none"}

## Next step

Call `GET ${apiBase}/agent-connections/session` with the session token to retrieve the current connection capabilities and policy snapshot.

Only use actions returned by that capability response. Do not invent API routes or attempt arbitrary calldata.

The user's onchain smart-account permissions remain the final authority for onchain execution.
`;

  return markdownResponse(body, 200);
}

export async function OPTIONS() {
  return jsonResponse({ ok: true }, 200);
}
