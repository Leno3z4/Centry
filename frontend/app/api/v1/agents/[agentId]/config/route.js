import { getAddress } from "ethers";
import { verifyOwnerSession } from "../../../../../../lib/agentOwnerAuth";
import { getAgentById, updateAgentConfig } from "../../../../../../lib/agentStore";

export async function POST(request, { params }) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const { agentId: rawAgentId } = await params;
  const agentId = String(rawAgentId || "").trim();
  if (!agentId) return Response.json({ error: "agent_id_required" }, { status: 400 });

  try {
    const agent = await getAgentById(agentId);
    if (!agent) return Response.json({ error: "agent_not_found" }, { status: 404 });

    await verifyOwnerSession({
      request,
      rpcUrl: process.env.CENTRY_AGENT_RPC_URL,
      account: getAddress(agent.account),
    });

    const existing = JSON.parse(agent.config_json || "{}");
    const requested = body?.autonomy && typeof body.autonomy === "object" ? body.autonomy : {};
    const requestedPolicy = body?.policy && typeof body.policy === "object" ? body.policy : {};
    const actionUniverse = ["supply", "withdraw", "borrow", "repay", "swap", "castVote", "transfer"];
    const assetUniverse = ["USDC", "EURC", "CIRBTC", "CENT"];
    const allowedActions = Array.isArray(requestedPolicy.allowedActions)
      ? requestedPolicy.allowedActions.filter((item) => actionUniverse.includes(String(item)))
      : (Array.isArray(existing?.policy?.allowedActions) ? existing.policy.allowedActions : actionUniverse);
    const allowedAssets = Array.isArray(requestedPolicy.allowedAssets)
      ? requestedPolicy.allowedAssets.map((item) => String(item).toUpperCase()).filter((item) => assetUniverse.includes(item))
      : (Array.isArray(existing?.policy?.allowedAssets) ? existing.policy.allowedAssets : assetUniverse);
    const maxAmountByAssetInput = requestedPolicy.maxAmountByAsset && typeof requestedPolicy.maxAmountByAsset === "object"
      ? requestedPolicy.maxAmountByAsset
      : (existing?.policy?.maxAmountByAsset || {});
    const maxAmountByAsset = Object.fromEntries(
      assetUniverse
        .filter((asset) => maxAmountByAssetInput[asset] !== undefined && maxAmountByAssetInput[asset] !== null && String(maxAmountByAssetInput[asset]).trim() !== "")
        .map((asset) => [asset, String(maxAmountByAssetInput[asset]).trim().slice(0, 80)])
    );
    const config = {
      ...existing,
      autonomy: {
        ...existing.autonomy,
        enabled: requested.enabled === undefined ? existing.autonomy?.enabled !== false : Boolean(requested.enabled),
        provider: requested.provider === undefined
          ? String(existing.autonomy?.provider || "")
          : String(requested.provider || ""),
        instructions: requested.instructions === undefined
          ? String(existing.autonomy?.instructions || "")
          : String(requested.instructions || ""),
        maxActions: requested.maxActions === undefined
          ? Math.max(1, Math.min(4, Number(existing.autonomy?.maxActions) || 4))
          : Math.max(1, Math.min(4, Number(requested.maxActions) || 4)),
        slippageBps: requested.slippageBps === undefined
          ? Math.max(0, Math.min(5000, Number(existing.autonomy?.slippageBps) || 50))
          : Math.max(0, Math.min(5000, Number(requested.slippageBps) || 50)),
      },
      policy: {
        ...(existing.policy || {}),
        allowedActions,
        allowedAssets,
        maxAmountByAsset,
      },
    };

    const updated = await updateAgentConfig(agentId, config);
    return Response.json({ agentId, config: updated.config }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "agent_config_update_failed" }, { status: 403 });
  }
}
