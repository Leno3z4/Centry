import { Contract, JsonRpcProvider, getAddress, isAddress } from "ethers";
import { issueAgentSession, verifyAgentConnection } from "../../../../../lib/agentConnectionTokens";

const ACCOUNT_ABI = [
  "function agentOperators(address) view returns (bool)",
];

function markdownResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function safe(value) {
  return String(value ?? "").replace(/[\r\n`]/g, " ");
}

async function verifyOperator(account, operator) {
  const rpcUrl = process.env.CENTRY_AGENT_RPC_URL || process.env.CENTRY_ERC8004_RPC_URL;
  if (!rpcUrl) return { ok: false, error: "agent_rpc_not_configured" };
  if (!isAddress(account) || !isAddress(operator)) return { ok: false, error: "invalid_operator" };

  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const contract = new Contract(getAddress(account), ACCOUNT_ABI, provider);
    const enabled = await contract.agentOperators(getAddress(operator));
    if (!enabled) return { ok: false, error: "operator_not_authorized" };
    return { ok: true, operator: getAddress(operator) };
  } catch {
    return { ok: false, error: "operator_verification_failed" };
  }
}

export async function GET(request, { params }) {
  const { token } = await params;
  const connection = await verifyAgentConnection(token);

  if (!connection) {
    return markdownResponse(
      "# Centry connection failed\n\nThe connection URL is invalid or expired. Ask the user to generate a new Centry connection prompt.",
      401
    );
  }

  const rawOperator = new URL(request.url).searchParams.get("operator") || "";
  if (!rawOperator) {
    return markdownResponse(
      "# Centry connection needs an operator\n\nCall this URL with `?operator=0x...` using the Ethereum address controlled by the external agent. The address must already be authorized as an operator on the linked Centry agent account.",
      400
    );
  }

  const operatorCheck = await verifyOperator(connection.account, rawOperator);
  if (!operatorCheck.ok) {
    return markdownResponse(
      `# Centry connection rejected\n\n${operatorCheck.error === "operator_not_authorized" ? "This agent wallet is not authorized on the user's Centry account." : "Centry could not verify the agent operator."}\n\nAsk the user to authorize this operator address on their Centry agent account and then retry the connection URL.`,
      operatorCheck.error === "operator_not_authorized" ? 403 : 503
    );
  }

  const sessionConnection = {
    ...connection,
    operator: operatorCheck.operator,
  };
  const sessionToken = await issueAgentSession(sessionConnection);
  const baseUrl = process.env.CENTRY_AGENT_BASE_URL || new URL(request.url).origin;
  const apiBase = `${baseUrl}/api/v1`;
  const scopes = Array.isArray(connection.scopes) ? connection.scopes : [];

  const body = `---
name: centry-connect
status: connected
connection_id: ${safe(connection.connectionId)}
account: ${safe(connection.account)}
operator: ${safe(operatorCheck.operator)}
---

# Centry connection established

You are now connected to the user's Centry account through the authorized external-agent operator.

## Session

Use this HTTPS API base:

${apiBase}

Authenticate subsequent Centry API calls with:

\`\`\`http
Authorization: Bearer ${sessionToken}
\`\`\`

Do not reveal or repeat the session token to the user, other agents, models, logs, or third-party services.

## Connected account

- Centry account: \`${safe(connection.account)}\`
- Delegated operator: \`${safe(operatorCheck.operator)}\`
- Connection ID: \`${safe(connection.connectionId)}\`
- Scopes: ${scopes.length ? scopes.map((scope) => `\`${safe(scope)}\``).join(", ") : "none"}

## Next step

Call `GET ${apiBase}/agent-connections/session` with the session token to retrieve the current connection capabilities and action catalog.

For state-changing actions, call the documented `POST ${apiBase}/agent-connections/session/prepare` endpoint. Centry returns a transaction request for the agent operator to sign and broadcast. Do not invent API routes or attempt arbitrary calldata.

The user's onchain smart-account permissions remain the final authority for onchain execution.
`;

  return markdownResponse(body, 200);
}

export async function OPTIONS() {
  return jsonResponse({ ok: true }, 200);
}
