import crypto from "node:crypto";
import { getAddress } from "ethers";
import { verifyOwnerSession } from "../../../../../../lib/agentOwnerAuth";
import { getAgentById, enqueueAgentTask, addAgentChatMessage } from "../../../../../../lib/agentStore";

export async function POST(request, { params }) {
  const { agentId } = await params;
  const agent = await getAgentById(agentId);
  if (!agent) return Response.json({ error: "agent_not_found" }, { status: 404 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }

  const message = String(body?.message || "").trim().slice(0, 4000);
  if (!message) return Response.json({ error: "message_required" }, { status: 400 });

  try {
    await verifyOwnerSession({
      request,
      rpcUrl: process.env.CENTRY_AGENT_RPC_URL,
      account: getAddress(agent.account),
    });

    const taskId = crypto.randomUUID();
    const assistantMessageId = crypto.randomUUID();
    const envelope = JSON.stringify({
      kind: "owner_chat",
      message,
      assistantMessageId,
    });

    const queued = await enqueueAgentTask({
      id: taskId,
      fromAgentId: null,
      toAgentId: agent.id,
      task: envelope,
    });

    await addAgentChatMessage({
      id: taskId,
      agentId: agent.id,
      role: "user",
      content: message,
    });

    const runnerUrl = String(process.env.CENTRY_AGENT_RUNNER_URL || "").replace(/\/$/, "");
    const runnerSecret = String(process.env.CENTRY_AGENT_RUNNER_HTTP_SECRET || "");
    if (runnerUrl && runnerSecret) {
      try {
        const wake = await fetch(`${runnerUrl}/chat`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${runnerSecret}`,
          },
          body: JSON.stringify({ agentId: agent.id, taskId }),
          cache: "no-store",
          signal: AbortSignal.timeout(1500),
        });
        if (!wake.ok) {
          console.warn("centry_agent_chat_runner_wake_failed", {
            agentId: agent.id,
            taskId,
            status: wake.status,
          });
        }
      } catch (wakeError) {
        console.warn("centry_agent_chat_runner_wake_unavailable", {
          agentId: agent.id,
          taskId,
          error: wakeError instanceof Error ? wakeError.message : String(wakeError),
        });
      }
    }

    return Response.json({
      mode: runnerUrl && runnerSecret ? "accepted" : "queued",
      taskId,
      status: queued?.status || "pending",
      acknowledgement: "Thinking…",
    }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "agent_chat_failed" }, { status: 400 });
  }
}