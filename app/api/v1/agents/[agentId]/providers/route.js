import { getAddress } from "ethers";
import { verifyOwnerSession } from "../../../../../../lib/agentOwnerAuth";
import { getAgentById, listProviderConfigs, setProviderConfig } from "../../../../../../lib/agentStore";
import { encryptSecret } from "../../../../../../lib/agentSecrets";

const PROVIDERS = new Set(["gemini", "openai", "anthropic"]);

export async function POST(request, { params }) {
  const { agentId } = await params;
  const agent = await getAgentById(agentId);
  if (!agent) return Response.json({ error: "agent_not_found" }, { status: 404 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }

  const provider = String(body?.provider || "").toLowerCase();
  const model = String(body?.model || "").trim();
  const apiKey = String(body?.apiKey || "");
  if (!PROVIDERS.has(provider) || !model || !apiKey) return Response.json({ error: "provider_model_and_api_key_required" }, { status: 400 });

  try {
    await verifyOwnerSession({
      request,
      rpcUrl: process.env.CENTRY_AGENT_RPC_URL,
      account: getAddress(agent.account),
    });

    await setProviderConfig({
      agentId,
      provider,
      model,
      encryptedApiKey: encryptSecret(apiKey),
    });

    return Response.json({ configured: true, provider, model }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "provider_configuration_failed" }, { status: 403 });
  }
}

export async function GET(_request, { params }) {
  const { agentId } = await params;
  const agent = await getAgentById(agentId);
  if (!agent) return Response.json({ error: "agent_not_found" }, { status: 404 });
  return Response.json({ providers: await listProviderConfigs(agentId) }, { headers: { "Cache-Control": "no-store" } });
}
