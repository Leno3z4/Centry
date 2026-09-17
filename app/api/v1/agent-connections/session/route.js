import { verifyAgentSession } from "../../../../../lib/agentConnectionTokens";

function unauthorized() {
  return Response.json(
    { error: "invalid_session" },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return unauthorized();

  const session = await verifyAgentSession(match[1]);
  if (!session) return unauthorized();

  return Response.json(
    {
      connected: true,
      connectionId: session.connectionId,
      owner: session.owner,
      account: session.account,
      operator: session.operator,
      scopes: session.scopes || [],
      capabilities: {
        read: (session.scopes || []).includes("read"),
        lend: (session.scopes || []).includes("lend"),
        borrow: (session.scopes || []).includes("borrow"),
        repay: (session.scopes || []).includes("repay"),
        swap: (session.scopes || []).includes("swap"),
        governance: (session.scopes || []).includes("governance"),
        agentManagement: (session.scopes || []).includes("agent-management"),
      },
      authorization: {
        model: "user-scoped-session-plus-onchain-policy",
        note: "A capability being present does not bypass the user's current onchain smart-account permissions.",
      },
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
