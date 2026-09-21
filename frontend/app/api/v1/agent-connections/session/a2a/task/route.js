import { authenticateAgent, jsonResponse, requireScope } from "../../../../../../../lib/agentApi";
import { getAgentByAccount, getAgentTask } from "../../../../../../../lib/agentStore";

export async function GET(request) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;

  if (!requireScope(auth.session, "read")) {
    return jsonResponse({ error: "scope_read_required" }, 403);
  }

  const taskId = new URL(request.url).searchParams.get("taskId");
  if (!taskId) return jsonResponse({ error: "taskId_required" }, 400);

  const agent = await getAgentByAccount(auth.session.account).catch(() => null);
  if (!agent) return jsonResponse({ error: "agent_not_found" }, 404);

  const task = await getAgentTask(taskId).catch(() => null);
  if (!task) return jsonResponse({ error: "task_not_found" }, 404);

  if (String(task.from_agent_id || "") !== String(agent.id)) {
    return jsonResponse({ error: "task_not_owned_by_session" }, 403);
  }

  return jsonResponse({
    taskId: task.id,
    fromAgentId: task.from_agent_id,
    toAgentId: task.to_agent_id,
    task: task.task,
    status: task.status,
    result: task.result || null,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    completedAt: task.completed_at,
  });
}
