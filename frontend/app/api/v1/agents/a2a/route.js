import crypto from "node:crypto";
import { Contract, JsonRpcProvider, getAddress, isAddress } from "ethers";
import { authenticateAgent, jsonResponse, requireScope } from "../../../../../lib/agentApi";
import { getAgentByAccount, getAgentById, enqueueAgentTask } from "../../../../../lib/agentStore";

function noStore(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

const ACCOUNT_FACTORY_ABI = ["function factory() view returns (address)"];
const FACTORY_REGISTRY_ABI = ["function isCentryAgentAccount(address account) view returns (bool)"];

function configuredGenesisFactory() {
  const value = String(process.env.CENTRY_AGENT_FACTORY || "").trim();
  if (!isAddress(value)) throw new Error("agent_genesis_factory_not_configured");
  return getAddress(value);
}

async function verifySameGenesisFactory(sourceAccount, targetAccount, rpcUrl) {
  const provider = new JsonRpcProvider(rpcUrl || "https://rpc.mainnet.arc.io");
  const expectedFactory = configuredGenesisFactory();
  const source = new Contract(getAddress(sourceAccount), ACCOUNT_FACTORY_ABI, provider);
  const target = new Contract(getAddress(targetAccount), ACCOUNT_FACTORY_ABI, provider);
  const sourceFactory = getAddress(await source.factory());
  const targetFactory = getAddress(await target.factory());

  if (sourceFactory.toLowerCase() !== expectedFactory.toLowerCase()) {
    throw new Error("source_not_created_by_genesis_factory");
  }
  if (targetFactory.toLowerCase() !== expectedFactory.toLowerCase()) {
    throw new Error("external_genesis_agent_prohibited");
  }

  const factory = new Contract(expectedFactory, FACTORY_REGISTRY_ABI, provider);
  const [sourceRegistered, targetRegistered] = await Promise.all([
    factory.isCentryAgentAccount(getAddress(sourceAccount)),
    factory.isCentryAgentAccount(getAddress(targetAccount)),
  ]);
  if (!sourceRegistered) {
    throw new Error("source_not_registered_by_genesis_factory");
  }
  if (!targetRegistered) {
    throw new Error("target_not_created_by_genesis_factory");
  }

  return expectedFactory;
}

export async function GET(request) {
  const agentId = new URL(request.url).searchParams.get("agentId");
  if (!agentId) return noStore({ error: "agentId_required" }, 400);
  const agent = await getAgentById(agentId).catch(() => null);
  if (!agent) return noStore({ error: "agent_not_found" }, 404);

  const origin = (process.env.CENTRY_AGENT_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
  return noStore({
    protocolVersion: "0.3.0",
    name: agent.name,
    description: agent.description || "Centry user-owned onchain agent",
    agentId: agent.id,
    account: agent.account,
    capabilities: ["read", "lending", "borrowing", "repayment", "swap", "agent-to-agent"],
    endpoints: {
      skill: `${origin}/api/v1/skills/centry-connect`,
      activity: `${origin}/api/v1/agents/${encodeURIComponent(agent.id)}/activity`,
      message: `${origin}/api/v1/agents/a2a`,
      taskStatus: `${origin}/api/v1/agent-connections/session/a2a/task?taskId={taskId}`,
    },
    onchainExecution: "user-owned-agent-account",
    communicationBoundary: "canonical-genesis-factory",
  });
}

export async function POST(request) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;
  if (!requireScope(auth.session, "agent-to-agent")) {
    return jsonResponse({ error: "scope_agent_to_agent_required" }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return noStore({ error: "invalid_json" }, 400);
  }

  const fromAgent = await getAgentByAccount(auth.session.account).catch(() => null);
  if (!fromAgent) return noStore({ error: "source_agent_not_found" }, 404);

  const claimedFromAgentId = String(body?.fromAgentId || fromAgent.id).trim();
  const toAgentId = String(body?.toAgentId || "").trim();
  const task = String(body?.task || "").trim().slice(0, 4000);

  if (claimedFromAgentId !== fromAgent.id || !toAgentId || !task) {
    return noStore({ error: "invalid_agent_task" }, 400);
  }

  const toAgent = await getAgentById(toAgentId).catch(() => null);
  if (!toAgent) return noStore({ error: "target_agent_not_found" }, 404);
  if (toAgent.id === fromAgent.id) return noStore({ error: "self_message_not_allowed" }, 400);
  try {
    await verifySameGenesisFactory(
      fromAgent.account,
      toAgent.account,
      process.env.CENTRY_AGENT_RPC_URL,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return noStore({
      error: /genesis_factory|external_genesis|target_not_created/i.test(message)
        ? "external_agent_interaction_prohibited"
        : "agent_genesis_validation_failed",
    }, 403);
  }

  const taskId = crypto.randomUUID();
  try {
    const queued = await enqueueAgentTask({
      id: taskId,
      fromAgentId: fromAgent.id,
      toAgentId: toAgent.id,
      task,
    });

    return noStore({
      accepted: true,
      taskId,
      status: queued?.status || "pending",
      fromAgent: {
        id: fromAgent.id,
        name: fromAgent.name,
        account: fromAgent.account,
      },
      toAgent: {
        id: toAgent.id,
        name: toAgent.name,
        account: toAgent.account,
      },
      executionBoundary: "recipient-agent-account",
      note: "The message is queued for the next global agent wake. Message routing does not grant execution authority; any onchain action still requires the recipient owner's live agent policy and authorized operator.",
    }, 202);
  } catch (error) {
    return noStore({
      error: error instanceof Error ? error.message : "agent_task_enqueue_failed",
    }, 503);
  }
}
