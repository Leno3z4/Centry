import { authenticateAgent, jsonResponse, requireScope } from "../../../../../../lib/agentApi";
import { getAgentPortfolio } from "../../../../../../lib/agentReadRuntime";

export async function GET(request) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;
  if (!requireScope(auth.session, "read")) return jsonResponse({ error: "scope_denied", requiredScope: "read" }, 403);

  const rpcUrl = process.env.CENTRY_AGENT_RPC_URL || process.env.CENTRY_ERC8004_RPC_URL;
  try {
    return jsonResponse(await getAgentPortfolio({ rpcUrl, account: auth.session.account }));
  } catch {
    return jsonResponse({ error: "portfolio_read_failed" }, 503);
  }
}
