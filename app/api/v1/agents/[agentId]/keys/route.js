import crypto from "node:crypto";
import { getAddress, isAddress } from "ethers";
import { verifyOwnerAuthorization } from "../../../../../lib/agentOwnerAuth";
import { createAgentKey, listAgentKeys, getAgentById } from "../../../../../lib/agentStore";
import { generateApiKey, hashApiKey } from "../../../../../lib/agentSecrets";

export async function POST(request, { params }) {
  const { agentId } = await params;
  const agent = await getAgentById(agentId);
  if (!agent) return Response.json({ error: "agent_not_found" }, { status: 404 });
  let body; try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  if (!isAddress(body?.owner || "")) return Response.json({ error: "invalid_owner" }, { status: 400 });
  if (getAddress(body.owner).toLowerCase() !== getAddress(agent.owner).toLowerCase()) return Response.json({ error: "owner_mismatch" }, { status: 403 });
  const rpcUrl = process.env.CENTRY_AGENT_RPC_URL;
  try {
    await verifyOwnerAuthorization({ rpcUrl, challengeToken: body.challengeToken, signature: body.signature, owner: getAddress(agent.owner), account: getAddress(agent.account), action: "create-api-key" });
    const id = crypto.randomUUID();
    const raw = generateApiKey(id);
    const scopes = Array.isArray(body.scopes) && body.scopes.length ? [...new Set(body.scopes)] : ["read","lend","borrow","repay","swap"];
    const operator = body.operator && isAddress(body.operator) ? getAddress(body.operator) : null;
    if (!operator) return Response.json({ error: "operator_required" }, { status: 400 });
    await createAgentKey({ id, agentId, owner: agent.owner, operator, label: body.label || "External agent", keyHash: hashApiKey(raw), scopes });
    return Response.json({ key: raw, keyId: id, operator, scopes, warning: "Copy this key now. Centry does not display the secret again." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "api_key_creation_failed" }, { status: 403 });
  }
}

export async function GET(request, { params }) {
  const { agentId } = await params;
  const agent = await getAgentById(agentId);
  if (!agent) return Response.json({ error: "agent_not_found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  if (!isAddress(body?.owner || "")) return Response.json({ error: "invalid_owner" }, { status: 400 });
  try {
    await verifyOwnerAuthorization({ rpcUrl: process.env.CENTRY_AGENT_RPC_URL, challengeToken: body.challengeToken, signature: body.signature, owner: getAddress(agent.owner), account: getAddress(agent.account), action: "list-api-keys" });
    return Response.json({ keys: await listAgentKeys(agentId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "api_key_list_failed" }, { status: 403 });
  }
}
