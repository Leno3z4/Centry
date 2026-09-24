import { Contract, JsonRpcProvider, getAddress } from "ethers";
import { verifyOwnerSession } from "../../../../../../lib/agentOwnerAuth";
import { getAgentById, getProviderConfig, listAgentRuns } from "../../../../../../lib/agentStore";

const ACCOUNT_ABI = [
  "function active() view returns (bool)",
  "function agentOperators(address operator) view returns (bool)",
];

export async function GET(request, { params }) {
  const { agentId } = await params;
  const agent = await getAgentById(agentId);
  if (!agent) return Response.json({ error: "agent_not_found" }, { status: 404 });

  try {
    const rpcUrl = process.env.CENTRY_AGENT_RPC_URL || "https://rpc.mainnet.arc.io";
    const session = await verifyOwnerSession({
      request,
      rpcUrl,
      account: getAddress(agent.account),
    });
    const runnerAddress = String(
      process.env.CENTRY_AGENT_RUNNER_ADDRESS
      || process.env.NEXT_PUBLIC_CENTRY_AGENT_RUNNER_ADDRESS
      || agent.operator
      || ""
    ).trim();

    let operatorAuthorized = null;
    if (runnerAddress) {
      const contract = new Contract(getAddress(agent.account), ACCOUNT_ABI, new JsonRpcProvider(rpcUrl));
      operatorAuthorized = Boolean(await contract.agentOperators(getAddress(runnerAddress)));
    }

    const config = JSON.parse(agent.config_json || "{}");
    const autonomy = config?.autonomy && typeof config.autonomy === "object" ? config.autonomy : {};
    const providerName = String(autonomy.provider || "").toLowerCase();
    const provider = providerName ? await getProviderConfig(agentId, providerName) : null;
    const runs = await listAgentRuns(agentId, 10).catch(() => []);

    return Response.json({
      agentId: agent.id,
      account: getAddress(agent.account),
      active: Boolean(session.active),
      runnerConfigured: Boolean(runnerAddress),
      runnerAddress: runnerAddress || null,
      operatorAuthorized,
      autonomyEnabled: autonomy.enabled !== false,
      instructionsConfigured: Boolean(String(autonomy.instructions || "").trim()),
      providerConfigured: Boolean(provider),
      recentRuns: runs,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "agent_runtime_status_failed" }, { status: 403 });
  }
}
