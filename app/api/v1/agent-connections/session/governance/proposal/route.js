import { authenticateAgent, jsonResponse, requireScope } from "../../../../../../../lib/agentApi";
import { getGovernanceProposal } from "../../../../../../../lib/agentGovernanceRuntime";

export async function GET(request) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;
  if (!requireScope(auth.session, "governance")) return jsonResponse({ error: "scope_denied", requiredScope: "governance" }, 403);

  const proposalId = new URL(request.url).searchParams.get("proposalId");
  if (!proposalId) return jsonResponse({ error: "missing_proposal_id" }, 400);

  const rpcUrl = process.env.CENTRY_AGENT_RPC_URL || process.env.CENTRY_ERC8004_RPC_URL;
  try {
    return jsonResponse(await getGovernanceProposal({ rpcUrl, account: auth.session.account, proposalId }));
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "governance_read_failed" }, 400);
  }
}
