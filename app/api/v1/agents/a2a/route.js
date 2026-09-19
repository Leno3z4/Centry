import crypto from "node:crypto";
import { getAgentById, enqueueAgentTask } from "../../../../../lib/agentStore";

function noStore(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const taskId = params.get("taskId");
  const agentId = params.get("agentId");
  if (taskId) {
    if (!agentId) return noStore({ error: "agentId_required" }, 400);
    const target = await getAgentById(agentId).catch(() => null);
    if (!target) return noStore({ error: "agent_not_found" }, 404);

    const base = process.env.CENTRY_AGENT_DB_URL || "";
    if (!base) return noStore({ error: "agent_store_not_configured" }, 503);

    return noStore({
      error: "task_status_requires_authenticated_agent_session",
      taskId,
      note: "Use the authenticated agent session API to retrieve private task results.",
    }, 401);
  }

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
    },
    onchainExecution: "user-owned-agent-account",
  });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return noStore({ error: "invalid_json" }, 400);
  }

  const toAgentId = String(body?.toAgentId || "").trim();
  const fromAgentId = String(body?.fromAgentId || "").trim();
  const task = String(body?.task || "").trim().slice(0, 4000);

  if (!toAgentId || !fromAgentId || !task) {
    return noStore({ error: "fromAgentId_toAgentId_and_task_required" }, 400);
  }

  const [toAgent, fromAgent] = await Promise.all([
    getAgentById(toAgentId).catch(() => null),
    getAgentById(fromAgentId).catch(() => null),
  ]);

  if (!toAgent) return noStore({ error: "target_agent_not_found" }, 404);
  if (!fromAgent) return noStore({ error: "source_agent_not_found" }, 404);

  const taskId = crypto.randomUUID();
  try {
    const queued = await enqueueAgentTask({
      id: taskId,
      fromAgentId,
      toAgentId,
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
