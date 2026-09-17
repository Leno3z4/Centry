import { verifyAgentSession } from "../../../../../lib/agentConnectionTokens";
import { actionCatalog, ARC_TESTNET_CHAIN_ID } from "../../../../../lib/agentExecutionRuntime";

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

  const scopes = session.scopes || [];

  return Response.json(
    {
      connected: true,
      connectionId: session.connectionId,
      owner: session.owner,
      account: session.account,
      operator: session.operator,
      chainId: ARC_TESTNET_CHAIN_ID,
      scopes,
      capabilities: {
        read: scopes.includes("read"),
        lend: scopes.includes("lend"),
        borrow: scopes.includes("borrow"),
        repay: scopes.includes("repay"),
        swap: scopes.includes("swap"),
        governance: scopes.includes("governance"),
        agentManagement: scopes.includes("agent-management"),
      },
      actions: actionCatalog().filter((action) => scopes.includes(action.scope)),
      authorization: {
        model: "user-scoped-session-plus-onchain-policy",
        note: "A capability being present does not bypass the user's current onchain smart-account permissions.",
        transactionModel: "Centry prepares a bounded smart-account call; the authorized operator wallet signs and broadcasts it.",
      },
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
