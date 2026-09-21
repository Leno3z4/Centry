import crypto from "node:crypto";
import { getAddress } from "ethers";
import { verifyOwnerAuthorization } from "../../../../../../lib/agentOwnerAuth";
import { getAgentById, getProviderConfig, listAgentChatMessages, addAgentChatMessage } from "../../../../../../lib/agentStore";
import { decryptSecret } from "../../../../../../lib/agentSecrets";
import { getAgentActivity } from "../../../../../../lib/agentActivity";

async function callProvider(provider, model, apiKey, messages, agentContext) {
  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: "system", content: agentContext }, ...messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))], temperature: 0.2 }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "openai_request_failed");
    return data?.choices?.[0]?.message?.content || "";
  }

  if (provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 700, system: agentContext, messages: messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "anthropic_request_failed");
    return data?.content?.map((part) => part?.text || "").join("") || "";
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: agentContext }] }, contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: 700 } }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "gemini_request_failed");
  return data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("") || "";
}

export async function POST(request, { params }) {
  const { agentId } = await params;
  const agent = await getAgentById(agentId);
  if (!agent) return Response.json({ error: "agent_not_found" }, { status: 404 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const message = String(body?.message || "").trim().slice(0, 4000);
  const provider = String(body?.provider || "gemini").toLowerCase();
  if (!message) return Response.json({ error: "message_required" }, { status: 400 });

  try {
    await verifyOwnerAuthorization({
      rpcUrl: process.env.CENTRY_AGENT_RPC_URL,
      challengeToken: body.challengeToken,
      signature: body.signature,
      owner: getAddress(agent.owner),
      account: getAddress(agent.account),
      action: "agent-chat",
    });

    const config = await getProviderConfig(agentId, provider);
    if (!config) return Response.json({ error: "provider_not_configured" }, { status: 400 });

    const history = await listAgentChatMessages(agentId, 24);
    const activity = await getAgentActivity(agent.account, process.env.CENTRY_AGENT_RPC_URL);
    const agentContext = [
      `You are ${agent.name}, a user-owned Centry agent.`,
      `Account: ${agent.account}`,
      `Status: ${agent.active ? "on" : "off"}`,
      "Never claim an action happened unless it appears in the supplied activity.",
      "Explain what you did, why, and what is pending using only verified activity and the user's conversation.",
      `Recent verified activity: ${JSON.stringify(activity.slice(0, 25))}`,
    ].join("\n");

    const answer = await callProvider(config.provider, config.model, decryptSecret(config.encrypted_api_key), [...history, { role: "user", content: message }], agentContext);
    await addAgentChatMessage({ id: crypto.randomUUID(), agentId, role: "user", content: message });
    await addAgentChatMessage({ id: crypto.randomUUID(), agentId, role: "assistant", content: answer });

    return Response.json({ answer, provider: config.provider, model: config.model }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "agent_chat_failed" }, { status: 400 });
  }
}
