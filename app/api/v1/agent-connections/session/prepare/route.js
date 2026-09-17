import { verifyAgentSession } from "../../../../../../lib/agentConnectionTokens";
import {
  ACCOUNT_INTERFACE,
  actionCatalog,
  buildAction,
  createAccountContract,
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

  const action = typeof body?.action === "string" ? body.action : "";
  const asset = body?.asset;
  const amount = body?.amount;

  if (!action || asset === undefined || amount === undefined) {
    return json({ error: "missing_action_asset_or_amount", actions: actionCatalog() }, 400);
  }

  let prepared;
  try {
    prepared = buildAction({ action, asset, amount });
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

  const rpcUrl = process.env.CENTRY_AGENT_RPC_URL || process.env.CENTRY_ERC8004_RPC_URL;
  if (!rpcUrl) return json({ error: "agent_rpc_not_configured" }, 503);

  const accountContract = createAccountContract(rpcUrl, session.account);

  try {
    const operatorAuthorized = await accountContract.agentOperators(session.operator);
    if (!operatorAuthorized) {
      return json({ error: "operator_not_authorized" }, 403);
    }

    const permitted = await accountContract.canExecute(
      session.operator,
      prepared.target,
      prepared.selector,
      prepared.value,
    );

    if (!permitted) {
      return json(
        {
          error: "onchain_permission_denied",
          operator: session.operator,
          target: prepared.target,
          selector: prepared.selector,
        },
        403,
      );
    }

    const accountCallData = ACCOUNT_INTERFACE.encodeFunctionData("execute", [
      prepared.target,
      prepared.value,
      prepared.data,
    ]);

    return json({
      ready: true,
      action,
      description: prepared.description,
      chainId: ARC_TESTNET_CHAIN_ID,
      from: session.operator,
      account: session.account,
      transaction: {
        to: session.account,
        value: prepared.value.toString(),
        data: accountCallData,
      },
      underlyingCall: {
        target: prepared.target,
        selector: prepared.selector,
        value: prepared.value.toString(),
        data: prepared.data,
      },
      execution: "Sign and broadcast the returned transaction from the authorized operator wallet.",
    });
  } catch {
    return json({ error: "agent_policy_check_failed" }, 503);
  }
}

export async function GET(request) {
  const token = sessionFromRequest(request);
  if (!token) return json({ error: "invalid_session" }, 401);

  const session = await verifyAgentSession(token);
  if (!session) return json({ error: "invalid_session" }, 401);

  return json({
    chainId: ARC_TESTNET_CHAIN_ID,
    account: session.account,
    operator: session.operator,
    scopes: session.scopes || [],
    actions: actionCatalog(),
  });
}
