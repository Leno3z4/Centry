import crypto from "node:crypto";
import { Contract, JsonRpcProvider, getAddress } from "ethers";
import { verifyOwnerSession } from "../../../../../../lib/agentOwnerAuth";
import { getAgentById, enqueueAgentTask, addAgentChatMessage } from "../../../../../../lib/agentStore";
import { CONTRACT_ADDRESSES } from "../../../../../../constants/contracts";

const BALANCE_ABI = ["function balanceOf(address account) view returns (uint256)"];

const DIRECT_BALANCE_ASSETS = Object.freeze({
  USDC: { address: CONTRACT_ADDRESSES.USDC, decimals: 6 },
  EURC: { address: CONTRACT_ADDRESSES.EURC, decimals: 6 },
  CIRBTC: { address: CONTRACT_ADDRESSES.CIRBTC, decimals: 8 },
});

function requestedBalanceAsset(message) {
  const text = String(message || "").toUpperCase();
  for (const symbol of Object.keys(DIRECT_BALANCE_ASSETS)) {
    if (new RegExp("\\b" + symbol + "\\b").test(text)) return symbol;
  }
  return null;
}
function isSimpleBalanceRequest(message) {
  const text = String(message || "").trim();
  if (!text) return false;
  if (!/\b(?:balance|balances|how much|how many|what(?:'s| is)?)\b/i.test(text)) return false;
  if (/\b(?:supply|deposit|withdraw|borrow|repay|swap|trade|approve|vote|transfer|send|fund)\b/i.test(text)) return false;
  return Boolean(requestedBalanceAsset(text));
}

function formatTokenBalance(raw, decimals) {
  try {
    const value = BigInt(raw || 0n);
    const base = 10n ** BigInt(decimals);
    const whole = value / base;
    const fraction = (value % base).toString().padStart(decimals, "0").slice(0, Math.min(8, decimals)).replace(/0+$/, "");
    return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
  } catch {
    return "0";
  }
}

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

    await addAgentChatMessage({
      id: crypto.randomUUID(),
      agentId: agent.id,
      role: "user",
      content: message,
    });

    if (isSimpleBalanceRequest(message)) {
      const symbol = requestedBalanceAsset(message);
      const asset = DIRECT_BALANCE_ASSETS[symbol];
      const provider = new JsonRpcProvider(process.env.CENTRY_AGENT_RPC_URL || "https://rpc.mainnet.arc.io");
      const contract = new Contract(getAddress(asset.address), BALANCE_ABI, provider);
      const rawBalance = await contract.balanceOf(getAddress(agent.account));
      const answer = `Your Centry agent has ${formatTokenBalance(rawBalance, asset.decimals)} ${symbol}.`;
      await addAgentChatMessage({
        id: crypto.randomUUID(),
        agentId: agent.id,
        role: "assistant",
        content: answer,
      });
      return Response.json({
        mode: "direct",
        status: "completed",
        result: { answer, txHash: null, error: null },
      }, { headers: { "Cache-Control": "no-store" } });
    }

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
      runnerConfigured: Boolean(runnerUrl && runnerSecret),
      acknowledgement: runnerUrl && runnerSecret
        ? "Queued with the agent runtime."
        : "Queued. The agent runtime is not configured for an immediate wake.",
    }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "agent_chat_failed" }, { status: 400 });
  }
}