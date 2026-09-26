import crypto from "node:crypto";
import { verifyOwnerSession } from "../../../../../../lib/agentOwnerAuth";
import { verifyAgentGenesisPair, verifyGenesisAccount } from "../../../../../../lib/agentGenesis";
import { getAgentById, listAllAgents, enqueueAgentTask } from "../../../../../../lib/agentStore";

const MAX_PEERS = 6;
const MAX_CANDIDATES = 12;
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

async function canonicalPeers(sourceAgent) {
  const rpcUrl = process.env.CENTRY_AGENT_RPC_URL;
  const source = await verifyGenesisAccount(sourceAgent.account, {
    rpcUrl,
    role: "source",
  });

  const all = await listAllAgents();
  const peers = [];

  for (const candidate of all.slice(0, MAX_CANDIDATES)) {
    if (String(candidate.id) === String(sourceAgent.id)) continue;
    if (!candidate.account || !candidate.name) continue;

    try {
      await verifyGenesisAccount(candidate.account, {
        rpcUrl,
        expectedFactory: source.factory,
      });
      peers.push({
        id: String(candidate.id),
        name: String(candidate.name),
        description: String(candidate.description || ""),
        account: String(candidate.account),
      });
    } catch {
      // Non-canonical or unregistered agents stay outside the network view.
    }

    if (peers.length >= MAX_PEERS) break;
  }

  return { factory: source.factory, peers };
}

export async function GET(request, { params }) {
  try {
    const { agentId } = await params;
    const agent = await ownedAgent(request, agentId);
    const network = await canonicalPeers(agent);

    return noStore({
      sourceAgent: { id: agent.id, name: agent.name, account: agent.account },
      boundary: "canonical-genesis-factory",
      peers: network.peers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "agent_network_failed";
    const status = /agent_not_found/.test(message) ? 404 : 403;
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

    if (!toAgentId || !task) {
      return noStore({ error: "target_and_message_required" }, 400);
    }
    if (toAgentId === String(agent.id)) {
      return noStore({ error: "self_message_not_allowed" }, 400);
    }

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
        error: error instanceof Error
          ? error.message
          : "external_genesis_agent_prohibited",
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
      toAgent: {
        id: target.id,
        name: target.name,
        account: target.account,
      },
      executionBoundary: "recipient-agent-account",
    }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : "agent_network_send_failed";
    return noStore(
      { error: message },
      /not_found/.test(message) ? 404 : 403,
    );
  }
}
