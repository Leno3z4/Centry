import { getAddress, parseUnits } from "ethers";
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

    const assetDecimals = { USDC: 18, EURC: 6, CIRBTC: 8, CENT: 18 };
    const maxUint128 = (2n ** 128n) - 1n;
    for (const [asset, value] of Object.entries(maxAmountByAsset)) {
      try {
        const raw = parseUnits(String(value), assetDecimals[asset] ?? 18);
        if (raw <= 0n || raw > maxUint128) throw new Error("invalid_cap");
      } catch {
        return Response.json({ error: `invalid_agent_max_amount_${asset}` }, { status: 400 });
      }
    }

    const financialActions = new Set(["supply", "withdraw", "borrow", "repay", "transfer"]);
    const requiredCapAssets = new Set(
      allowedActions.some((action) => financialActions.has(action))
        ? allowedAssets
        : [],
    );
    if (allowedActions.includes("swap")) requiredCapAssets.add("CENT");
    for (const asset of requiredCapAssets) {
      if (!maxAmountByAsset[asset]) {
        return Response.json({ error: `onchain_financial_cap_required_${asset}` }, { status: 400 });
      }
    }

    const requestedA2A = body?.a2a && typeof body.a2a === "object" ? body.a2a : {};
    const existingA2A = existing?.a2a && typeof existing.a2a === "object" ? existing.a2a : {};
    const requestedAllowedAgentIds = requestedA2A.allowedAgentIds === undefined
      ? existingA2A.allowedAgentIds
      : requestedA2A.allowedAgentIds;
    const a2aAllowedAgentIds = Array.isArray(requestedAllowedAgentIds)
      ? [...new Set(requestedAllowedAgentIds.map((value) => String(value).trim()).filter(Boolean))].slice(0, 100)
      : [];
    if (a2aAllowedAgentIds.some((value) => value.length > 128)) {
      return Response.json({ error: "a2a_agent_id_too_long" }, { status: 400 });
    }
    const config = {
      ...existing,
      a2a: {
        receiveEnabled: requestedA2A.receiveEnabled === undefined
          ? existingA2A.receiveEnabled === true
          : requestedA2A.receiveEnabled === true,
        allowedAgentIds: a2aAllowedAgentIds,
      },
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
