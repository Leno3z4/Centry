import crypto from "node:crypto";
import { verifyOwnerSession } from "../../../../../../lib/agentOwnerAuth";
import { verifyAgentGenesisPair } from "../../../../../../lib/agentGenesis";
import { getAgentById, listAllAgents, enqueueAgentTask } from "../../../../../../lib/agentStore";

const MAX_PEERS = 8;
const MAX_MESSAGE = 1200;

function noStore(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function ownedAgent(request, agentId) {
  const agent = await getAgentById(String(agentId || "").trim());
  if (!agent) throw new Error("agent_not_found");

  await verifyOwnerSession({
    request,
    rpcUrl: process.env.CENTRY_AGENT_RPC_URL,
    account: agent.account,
  });

  return agent;
}

export async function GET(request, { params }) {
  try {
    const { agentId } = await params;
    const agent = await ownedAgent(request, agentId);
    const all = await listAllAgents();

    const peers = all
      .filter((item) => String(item.id) !== String(agent.id))
      .filter((item) => item.account && item.name)
      .slice(0, MAX_PEERS)
      .map((item) => ({
        id: String(item.id),
        name: String(item.name),
        description: String(item.description || ""),
        account: String(item.account),
      }));

    return noStore({
      sourceAgent: { id: agent.id, name: agent.name, account: agent.account },
      boundary: "canonical-genesis-factory",
      peers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "agent_network_failed";
    const status = message === "agent_not_found" ? 404 : 403;
    return noStore({ error: message }, status);
  }
}

export async function POST(request, { params }) {
  try {
    const { agentId } = await params;
    const agent = await ownedAgent(request, agentId);

    let body;
    try {
      body = await request.json();
    } catch {
      return noStore({ error: "invalid_json" }, 400);
    }

    const toAgentId = String(body?.toAgentId || "").trim();
    const task = String(body?.message || "").trim().slice(0, MAX_MESSAGE);
    if (!toAgentId || !task) return noStore({ error: "target_and_message_required" }, 400);
    if (toAgentId === String(agent.id)) return noStore({ error: "self_message_not_allowed" }, 400);

    const target = await getAgentById(toAgentId);
    if (!target) return noStore({ error: "target_agent_not_found" }, 404);

    try {
      await verifyAgentGenesisPair(
        agent.account,
        target.account,
        { rpcUrl: process.env.CENTRY_AGENT_RPC_URL },
      );
    } catch (error) {
      return noStore({
        error: error instanceof Error ? error.message : "external_genesis_agent_prohibited",
      }, 403);
    }

    const taskId = crypto.randomUUID();
    const queued = await enqueueAgentTask({
      id: taskId,
      fromAgentId: agent.id,
      toAgentId: target.id,
      task,
    });

    return noStore({
      accepted: true,
      taskId,
      status: queued?.status || "pending",
      genesisBoundary: "canonical-genesis-factory",
      toAgent: { id: target.id, name: target.name, account: target.account },
    }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : "agent_network_send_failed";
    return noStore({ error: message }, /not_found/i.test(message) ? 404 : 403);
  }
}
