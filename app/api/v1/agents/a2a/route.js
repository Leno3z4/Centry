import { getAgentById } from "../../../../../lib/agentStore";

export async function GET(request) {
  const agentId = new URL(request.url).searchParams.get("agentId");
  if (!agentId) return Response.json({ error: "agentId_required" }, { status: 400 });
  const agent = await getAgentById(agentId);
  if (!agent) return Response.json({ error: "agent_not_found" }, { status: 404 });

  const base = process.env.CENTRY_AGENT_BASE_URL || new URL(request.url).origin;
  return Response.json({
    protocolVersion: "0.3.0",
    name: agent.name,
    description: agent.description || "Centry user-owned onchain agent",
    agentId: agent.id,
    account: agent.account,
    capabilities: ["read", "lending", "borrowing", "repayment", "swap", "agent-to-agent"],
    endpoints: {
      skill: `${base}/api/v1/agent-connections/`,
      activity: `${base}/api/v1/agents/${agent.id}/activity`,
      message: `${base}/api/v1/agents/a2a`,
    },
    onchainExecution: "user-owned-agent-account",
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }

  const toAgent = await getAgentById(String(body?.toAgentId || ""));
  if (!toAgent) return Response.json({ error: "target_agent_not_found" }, { status: 404 });

  const task = String(body?.task || "").trim().slice(0, 2000);
  const fromAgentId = String(body?.fromAgentId || "").trim();
  if (!task || !fromAgentId) return Response.json({ error: "fromAgentId_and_task_required" }, { status: 400 });

  return Response.json({
    accepted: true,
    taskId: `a2a-${Date.now()}`,
    fromAgentId,
    toAgent: { id: toAgent.id, name: toAgent.name, account: toAgent.account },
    task,
    executionBoundary: "recipient-agent-account",
    note: "Message routing does not grant execution authority. Any onchain action still requires the recipient owner's live agent policy and an authorized operator.",
  }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
