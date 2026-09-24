import { getAddress } from "ethers";
import { verifyOwnerSession } from "../../../../../../lib/agentOwnerAuth";
import { getAgentById, getAgentTask } from "../../../../../../lib/agentStore";

export async function GET(request, { params }) {
  const { taskId } = await params;
  const task = await getAgentTask(String(taskId || "").trim());
  if (!task) return Response.json({ error: "task_not_found" }, { status: 404 });

  const agent = await getAgentById(task.to_agent_id);
  if (!agent) return Response.json({ error: "agent_not_found" }, { status: 404 });

  try {
    await verifyOwnerSession({
      request,
      rpcUrl: process.env.CENTRY_AGENT_RPC_URL,
      account: getAddress(agent.account),
    });

    let result = null;
    try {
      result = task.result ? JSON.parse(task.result) : null;
    } catch {
      result = task.result || null;
    }

    return Response.json({
      taskId: task.id,
      agentId: task.to_agent_id,
      status: task.status,
      result,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      completedAt: task.completed_at,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "task_status_failed" }, { status: 403 });
  }
}
