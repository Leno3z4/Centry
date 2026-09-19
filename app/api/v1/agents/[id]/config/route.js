import { getAddress, isAddress } from "ethers";
import { verifyOwnerAuthorization } from "../../../../../../lib/agentOwnerAuth";
import { getAgentById, updateAgentConfig } from "../../../../../../lib/agentStore";

export async function POST(request, { params }) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const id = String(params?.id || "").trim();
  if (!id) return Response.json({ error: "agent_id_required" }, { status: 400 });

  try {
    const agent = await getAgentById(id);
    if (!agent) return Response.json({ error: "agent_not_found" }, { status: 404 });
    if (!isAddress(body?.owner || "")) return Response.json({ error: "invalid_owner" }, { status: 400 });

    await verifyOwnerAuthorization({
      rpcUrl: process.env.CENTRY_AGENT_RPC_URL,
      challengeToken: body.challengeToken,
      signature: body.signature,
      owner: getAddress(body.owner),
      account: getAddress(agent.account),
      action: "configure-agent",
    });

    const existing = JSON.parse(agent.config_json || "{}");
    const requested = body?.autonomy && typeof body.autonomy === "object" ? body.autonomy : {};
    const config = {
      ...existing,
      autonomy: {
        ...existing.autonomy,
        enabled: requested.enabled !== false,
        provider: String(requested.provider || existing.autonomy?.provider || ""),
        instructions: String(requested.instructions || ""),
        maxActions: Math.max(1, Math.min(4, Number(requested.maxActions) || 4)),
        slippageBps: Math.max(0, Math.min(5000, Number(requested.slippageBps) || 50)),
      },
    };

    const updated = await updateAgentConfig(id, config);
    return Response.json({ agentId: id, config: updated.config }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "agent_config_update_failed" }, { status: 403 });
  }
}
