import { getAddress } from "ethers";
import { verifyOwnerAuthorization } from "../../../../../../../lib/agentOwnerAuth";
import { getAgentById, revokeAgentKey } from "../../../../../../../lib/agentStore";

export async function POST(request, { params }) {
  const { agentId } = await params;
  const agent = await getAgentById(agentId);
  if (!agent) return Response.json({ error: "agent_not_found" }, { status: 404 });
  let body; try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }

  try {
    await verifyOwnerAuthorization({
      rpcUrl: process.env.CENTRY_AGENT_RPC_URL,
      challengeToken: body.challengeToken,
      signature: body.signature,
      owner: getAddress(agent.owner),
      account: getAddress(agent.account),
      action: "revoke-api-key",
      params: { keyId: String(body.keyId || "") },
    });
    const revoked = await revokeAgentKey(
      String(body.keyId || ""),
      String(agentId),
      getAddress(agent.owner),
    );
    if (!revoked?.revoked) throw new Error("agent_key_not_found_or_not_owned");
    return Response.json({ revoked: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "api_key_revoke_failed" }, { status: 403 });
  }
}
