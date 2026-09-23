import { getAddress } from "ethers";
import { verifyOwnerSession } from "../../../../../../lib/agentOwnerAuth";
import { getAgentById } from "../../../../../../lib/agentStore";
import { getAgentActivity } from "../../../../../../lib/agentActivity";

export async function POST(request, { params }) {
  const { agentId } = await params;
  const agent = await getAgentById(agentId);
  if (!agent) return Response.json({ error: "agent_not_found" }, { status: 404 });

  try {
    await verifyOwnerSession({
      request,
      rpcUrl: process.env.CENTRY_AGENT_RPC_URL,
      account: getAddress(agent.account),
    });

    return Response.json({
      agentId,
      account: getAddress(agent.account),
      activity: await getAgentActivity(agent.account, process.env.CENTRY_AGENT_RPC_URL),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "activity_read_failed" }, { status: 403 });
  }
}
