import { getAddress } from "ethers";
import { verifyOwnerAuthorization } from "../../../../../../lib/agentOwnerAuth";
import { getAgentById } from "../../../../../../lib/agentStore";
import { getAgentActivity } from "../../../../../../lib/agentActivity";

export async function POST(request, { params }) {
  const { agentId } = await params;
  const agent = await getAgentById(agentId);
  if (!agent) return Response.json({ error: "agent_not_found" }, { status: 404 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }

  try {
    await verifyOwnerAuthorization({
      rpcUrl: process.env.CENTRY_AGENT_RPC_URL,
      challengeToken: body.challengeToken,
      signature: body.signature,
      owner: getAddress(agent.owner),
      account: getAddress(agent.account),
      action: "agent-analytics",
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
