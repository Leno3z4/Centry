import crypto from "node:crypto";
import { getAddress } from "ethers";
import { verifyOwnerSession } from "../../../../../../lib/agentOwnerAuth";
import { getAgentById, enqueueAgentTask, addAgentChatMessage } from "../../../../../../lib/agentStore";
import { getAgentPortfolio } from "../../../../../../lib/agentReadRuntime";
import { getAgentActivity } from "../../../../../../lib/agentActivity";

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

    const rpcUrl = process.env.CENTRY_AGENT_RPC_URL || "https://rpc.mainnet.arc.io";
    const portfolio = await getAgentPortfolio({ rpcUrl, account: getAddress(agent.account) }).catch(() => null);
    let activity = [];
    try {
      activity = await getAgentActivity(agent.account, rpcUrl);
    } catch (activityError) {
      console.warn("[agent-chat] activity lookup unavailable", activityError);
    }

    const taskId = crypto.randomUUID();
    const assistantMessageId = crypto.randomUUID();
    const envelope = JSON.stringify({
      kind: "owner_chat",
      message,
      assistantMessageId,
      context: {
        portfolio,
        activity: activity.slice(0, 25),
      },
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

    return Response.json({
      mode: "queued",
      taskId,
      status: queued?.status || "pending",
      acknowledgement: "Thinking…",
    }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "agent_chat_failed" }, { status: 400 });
  }
}