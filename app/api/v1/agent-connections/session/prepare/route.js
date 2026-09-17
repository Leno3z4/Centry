import { verifyAgentSession } from "../../../../../../lib/agentConnectionTokens";
import {
  ACCOUNT_INTERFACE,
  actionCatalog,
  buildAction,
  checkActionPermissions,
  assertLiveOperator,
  ARC_TESTNET_CHAIN_ID,
} from "../../../../../../lib/agentExecutionRuntime";

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function sessionFromRequest(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function parseActionBody(body) {
  if (!body || typeof body !== "object") throw new Error("invalid_action_body");
  const action = typeof body.action === "string" ? body.action : "";
  if (!action) throw new Error("missing_action");
  return {
    action,
    asset: body.asset,
    amount: body.amount,
    toAsset: body.toAsset,
    minOut: body.minOut,
    proposalId: body.proposalId,
    support: body.support,
  };
}

export async function POST(request) {
  const token = sessionFromRequest(request);
  if (!token) return json({ error: "invalid_session" }, 401);

  const session = await verifyAgentSession(token);
  if (!session || !session.operator) return json({ error: "invalid_session" }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  let requestAction;
  try {
    requestAction = parseActionBody(body);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "invalid_action", actions: actionCatalog() }, 400);
  }

  const rpcUrl = process.env.CENTRY_AGENT_RPC_URL || process.env.CENTRY_ERC8004_RPC_URL;
  if (!rpcUrl) return json({ error: "agent_rpc_not_configured" }, 503);

  let prepared;
  try {
    prepared = buildAction({ account: session.account, ...requestAction });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "invalid_action",
        actions: actionCatalog(),
      },
      400,
    );
  }

  const sessionScopes = Array.isArray(session.scopes) ? session.scopes : [];
  if (!sessionScopes.includes(prepared.scope)) {
    return json({ error: "scope_denied", requiredScope: prepared.scope }, 403);
  }

  try {
    const policy = await checkActionPermissions({
      rpcUrl,
      account: session.account,
      operator: session.operator,
      calls: prepared.calls,
    });

    if (!policy.permitted) {
      return json(
        {
          error: "onchain_permission_denied",
          operator: session.operator,
          target: policy.denied.target,
          selector: policy.denied.selector,
        },
        403,
      );
    }

    const targets = prepared.calls.map((current) => current.target);
    const values = prepared.calls.map((current) => current.value);
    const data = prepared.calls.map((current) => current.data);
    const batched = prepared.calls.length > 1;
    const accountCallData = batched
      ? ACCOUNT_INTERFACE.encodeFunctionData("executeBatch", [targets, values, data])
      : ACCOUNT_INTERFACE.encodeFunctionData("execute", [targets[0], values[0], data[0]]);

    return json({
      ready: true,
      action: requestAction.action,
      description: prepared.description,
      chainId: ARC_TESTNET_CHAIN_ID,
      from: session.operator,
      account: session.account,
      transaction: {
        to: session.account,
        value: "0",
        data: accountCallData,
      },
      underlyingCalls: prepared.calls.map((current) => ({
        target: current.target,
        selector: current.selector,
        value: current.value.toString(),
        data: current.data,
      })),
      execution: "Sign and broadcast the returned transaction from the authorized operator wallet.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "operator_not_authorized") {
      return json({ error: "operator_not_authorized" }, 403);
    }
    return json({ error: "agent_policy_check_failed" }, 503);
  }
}

export async function GET(request) {
  const token = sessionFromRequest(request);
  if (!token) return json({ error: "invalid_session" }, 401);

  const session = await verifyAgentSession(token);
  if (!session || !session.operator) return json({ error: "invalid_session" }, 401);

  const rpcUrl = process.env.CENTRY_AGENT_RPC_URL || process.env.CENTRY_ERC8004_RPC_URL;
  if (!rpcUrl) return json({ error: "agent_rpc_not_configured" }, 503);

  try {
    await assertLiveOperator({ rpcUrl, account: session.account, operator: session.operator });
    return json({
      chainId: ARC_TESTNET_CHAIN_ID,
      account: session.account,
      operator: session.operator,
      scopes: session.scopes || [],
      actions: actionCatalog().filter((action) => (session.scopes || []).includes(action.scope)),
      operatorAuthorized: true,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "operator_not_authorized") return json({ error: "operator_not_authorized" }, 403);
    return json({ error: "agent_policy_check_failed" }, 503);
  }
}
