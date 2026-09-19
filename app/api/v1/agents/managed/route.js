import { getAddress, isAddress } from "ethers";
import { verifyOwnerAuthorization } from "../../../../lib/agentOwnerAuth";
import { listAgents } from "../../../../lib/agentStore";

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  if (!isAddress(body?.owner || "") || !isAddress(body?.account || "")) return Response.json({ error: "invalid_owner_or_account" }, { status: 400 });
  const rpcUrl = process.env.CENTRY_AGENT_RPC_URL;
  try {
    await verifyOwnerAuthorization({ rpcUrl, challengeToken: body.challengeToken, signature: body.signature, owner: getAddress(body.owner), account: getAddress(body.account), action: "list-agents" });
    const agents = await listAgents(getAddress(body.owner));
    return Response.json({ agents: agents.map((agent) => ({ ...agent, config: JSON.parse(agent.config_json || "{}"), active: Boolean(agent.active) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "agent_list_failed" }, { status: 403 });
  }
}
