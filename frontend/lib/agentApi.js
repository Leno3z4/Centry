import { verifyAgentSession } from "./agentConnectionTokens";
import { assertLiveOperator } from "./agentExecutionRuntime";
import { getActiveAgentKey, getAgentById } from "./agentStore";
import { hashApiKey } from "./agentSecrets";

export function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function bearerToken(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function authenticateAgent(request, { requireOperator = true } = {}) {
  const token = bearerToken(request);
  if (!token) return { error: jsonResponse({ error: "invalid_session" }, 401) };
  if (token.startsWith("ck_live_")) return authenticateAgentApiKey(request);

  const session = await verifyAgentSession(token);
  if (!session) return { error: jsonResponse({ error: "invalid_session" }, 401) };
  if (!session.account || (requireOperator && !session.operator)) {
    return { error: jsonResponse({ error: "invalid_session" }, 401) };
  }

  if (requireOperator) {
    const rpcUrl = process.env.CENTRY_AGENT_RPC_URL || process.env.CENTRY_ERC8004_RPC_URL;
    if (!rpcUrl) return { error: jsonResponse({ error: "agent_rpc_not_configured" }, 503) };
    try {
      await assertLiveOperator({ rpcUrl, account: session.account, operator: session.operator });
    } catch (error) {
      if (error instanceof Error && error.message === "operator_not_authorized") {
        return { error: jsonResponse({ error: "operator_not_authorized" }, 403) };
      }
      return { error: jsonResponse({ error: "agent_policy_check_failed" }, 503) };
    }
  }

  return { session };
}

export function requireScope(session, scope) {
  const scopes = Array.isArray(session?.scopes) ? session.scopes : [];
  return scopes.includes(scope);
}

export async function authenticateAgentApiKey(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\\s+(ck_live_[^\\s]+)$/i);
  if (!match) return { error: jsonResponse({ error: "invalid_api_key" }, 401) };

  const key = match[1];
  const parts = key.split("_");
  const keyId = parts.length >= 4 ? parts[2] : "";
  if (!keyId) return { error: jsonResponse({ error: "invalid_api_key" }, 401) };

  const row = await getActiveAgentKey(keyId).catch(() => null);
  if (!row || hashApiKey(key) !== row.key_hash) return { error: jsonResponse({ error: "invalid_api_key" }, 401) };

  const agent = await getAgentById(row.agent_id);
  if (!agent) return { error: jsonResponse({ error: "agent_not_found" }, 404) };

  const scopes = JSON.parse(row.scopes_json || "[\"read\"]");
  try {
    const rpcUrl = process.env.CENTRY_AGENT_RPC_URL || process.env.CENTRY_ERC8004_RPC_URL;
    await assertLiveOperator({ rpcUrl, account: agent.account, operator: row.operator });
  } catch (error) {
    if (error instanceof Error && error.message === "operator_not_authorized") {
      return { error: jsonResponse({ error: "operator_not_authorized" }, 403) };
    }
    if (error instanceof Error && error.message === "agent_inactive") {
      return { error: jsonResponse({ error: "agent_inactive" }, 403) };
    }
    return { error: jsonResponse({ error: "agent_policy_check_failed" }, 503) };
  }

  return {
    session: {
      connectionId: `api-key:${row.id}`,
      owner: agent.owner,
      account: agent.account,
      operator: row.operator,
      scopes,
      agentId: agent.id,
    },
  };
}
