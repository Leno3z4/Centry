import crypto from "node:crypto";
import { Contract, JsonRpcProvider, getAddress } from "ethers";
import { verifyOwnerSession } from "../../../../../../lib/agentOwnerAuth";
import { getAgentById, addAgentChatMessage, listProviderConfigs, getProviderConfig, listAgentChatMessages } from "../../../../../../lib/agentStore";
import { CONTRACT_ADDRESSES } from "../../../../../../constants/contracts";
import { decryptSecret } from "../../../../../../lib/agentSecrets";

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


function ownerChatHasExplicitStateChangeIntent(message) {
  const text = String(message || "").trim();
  if (!text) return false;

  const mutationVerb = /\b(?:supply|deposit|withdraw|borrow|repay|swap|exchange|trade|approve|vote|transfer|send|fund)\b/i;
  const informationalPhrase = /\b(?:what is|what's|how much|how many|show me|tell me|explain|what happens|what if|how does|why|status|balance|balances|portfolio|position|activity|history|did you|have you)\b/i;

  const directImperative = /^(?:please\s+|can\s+you\s+|could\s+you\s+|would\s+you\s+|go\s+ahead\s+and\s+|just\s+|do\s+|execute\s+|make\s+)?(?:supply|deposit|withdraw|borrow|repay|swap|exchange|trade|approve|vote|transfer|send|fund)\b/i.test(text);
  if (directImperative) return true;

  const explicitOwnerCommand =
    /\b(?:i\s+want\s+you\s+to|i\s+need\s+you\s+to|i['’]d\s+like\s+you\s+to|go\s+ahead\s+and|please)\b[\s\S]{0,96}\b(?:supply|deposit|withdraw|borrow|repay|swap|exchange|trade|approve|vote|transfer|send|fund)\b/i.test(text);

  const explicitFollowUpCommand =
    /\b(?:then|and\s+then|and|check\s+and)\b[\s\S]{0,80}\b(?:supply|deposit|withdraw|borrow|repay|swap|exchange|trade|approve|vote|transfer|send|fund)\b[\s\S]{0,64}\b(?:\d+(?:\.\d+)?|all|everything|half|some|idle|it|that|this|my|the)\b/i.test(text);

  const commandVerbWithObject =
    /\b(?:supply|deposit|withdraw|borrow|repay|swap|exchange|trade|approve|vote|transfer|send|fund)\b[\s\S]{0,72}\b(?:\d+(?:\.\d+)?|all|everything|half|some|idle|it|that|this|my|the|to\s+my\s+wallet)\b/i.test(text);

  const requestMarker =
    /\b(?:please|can\s+you|could\s+you|would\s+you|i\s+want\s+you\s+to|i\s+need\s+you\s+to|i['’]d\s+like\s+you\s+to|go\s+ahead|do\s+it|execute)\b/i.test(text);

  if (!explicitOwnerCommand && !explicitFollowUpCommand && !(requestMarker && commandVerbWithObject)) return false;
  if (informationalPhrase.test(text) && !explicitOwnerCommand && !explicitFollowUpCommand && !requestMarker) return false;
  return mutationVerb.test(text);
}

async function conversationalReply(agent, message) {
  let config = {};
  try { config = JSON.parse(agent?.config_json || "{}"); } catch {}

  const requestedProvider = String(config?.autonomy?.provider || "").trim().toLowerCase();
  const providers = await listProviderConfigs(agent.id);
  const providerMeta = requestedProvider
    ? providers.find((item) => String(item.provider || "").toLowerCase() === requestedProvider)
    : providers[0];

  if (!providerMeta?.provider) throw new Error("agent_provider_not_configured");

  const provider = await getProviderConfig(agent.id, providerMeta.provider);
  if (!provider?.encrypted_api_key) throw new Error("agent_provider_not_configured");

  const apiKey = decryptSecret(provider.encrypted_api_key);
  const model = String(provider.model || providerMeta.model || "").trim();
  if (!model) throw new Error("agent_model_not_configured");

  const historyRows = await listAgentChatMessages(agent.id, 12);
  const history = (historyRows || [])
    .slice(0, -1)
    .filter((row) => row?.content)
    .map((row) => ({
      role: String(row.role || "user") === "assistant" ? "assistant" : "user",
      content: String(row.content),
    }));

  const system = [
    "You are " + String(agent.name || "Centry Agent") + ", a conversational Centry agent.",
    "Talk naturally with the authenticated smart-account owner.",
    "Answer ordinary questions, explain what you can do, explain Centry features, and discuss the agent's configured strategy or concepts.",
    "Do not invent balances, transactions, permissions, or other live onchain facts.",
    "Explicit transaction requests are handled by the controlled execution runtime; this conversational path never authorizes, signs, submits, or claims transactions.",
    "When asked about your capabilities, explain that you can answer questions, explain the owner's configured strategy, help with supported account information, and prepare or execute permitted onchain actions when explicitly requested.",
    "Keep the answer useful and conversational. Do not return JSON.",
  ].join("\n\n");

  const providerName = String(provider.provider || "").toLowerCase();
  let answer = "";

  if (providerName === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        system,
        messages: [...history, { role: "user", content: message }],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "anthropic_request_failed");
    answer = data?.content?.map((part) => part?.text || "").join("").trim();
  } else if (providerName === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [{ role: "system", content: system }, ...history, { role: "user", content: message }],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "openai_request_failed");
    answer = String(data?.choices?.[0]?.message?.content || "").trim();
  } else {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(model) +
        ":generateContent?key=" +
        encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [
            ...history.map((row) => ({
              role: row.role === "assistant" ? "model" : "user",
              parts: [{ text: row.content }],
            })),
            { role: "user", parts: [{ text: message }] },
          ],
          generationConfig: { maxOutputTokens: 1200, temperature: 0.2 },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "gemini_request_failed");
    answer = data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("").trim();
  }

  if (!answer) throw new Error("agent_empty_provider_response");
  return answer;
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


    if (!ownerChatHasExplicitStateChangeIntent(message)) {
      const answer = await conversationalReply(agent, message);
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

    const executorUrl = String(process.env.CENTRY_AGENT_EXECUTOR_URL || "").replace(/\/$/, "");
    const executorSecret = String(process.env.CENTRY_AGENT_EXECUTOR_HTTP_SECRET || "");
    if (!executorUrl || !executorSecret) {
      throw new Error("agent_executor_not_configured");
    }

    const execution = await fetch(executorUrl + "/execute", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + executorSecret,
      },
      body: JSON.stringify({ agentId: agent.id, message }),
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    });

    let executionBody = null;
    try { executionBody = await execution.json(); } catch {}
    if (!execution.ok) {
      throw new Error(executionBody?.error || "agent_execution_failed");
    }

    const answer = executionBody?.result?.answer || "The request was processed.";
    await addAgentChatMessage({
      id: crypto.randomUUID(),
      agentId: agent.id,
      role: "assistant",
      content: answer,
    });

    return Response.json({
      mode: "executed",
      status: executionBody?.status || "processed",
      result: executionBody?.result || { answer, txHash: null, error: null },
    }, { headers: { "Cache-C
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "agent_chat_failed" }, { status: 400 });
  }
}
