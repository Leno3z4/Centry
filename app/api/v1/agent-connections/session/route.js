import { authenticateAgent, jsonResponse } from "../../../../../lib/agentApi";
import { actionCatalog, ARC_MAINNET_CHAIN_ID } from "../../../../../lib/agentExecutionRuntime";

export async function GET(request) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;

  const session = auth.session;
  const scopes = Array.isArray(session.scopes) ? session.scopes : [];

  return jsonResponse({
    connected: true,
    connectionId: session.connectionId,
    owner: session.owner,
    account: session.account,
    operator: session.operator,
    chainId: ARC_MAINNET_CHAIN_ID,
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
      model: "user-scoped-session-plus-live-onchain-policy",
      note: "Every authenticated request re-checks the operator onchain, so revoking the operator immediately blocks the session from further use.",
      transactionModel: "Centry prepares a bounded smart-account call; the authorized operator wallet signs and broadcasts it.",
    },
  });
}
