import { Contract, JsonRpcProvider, getAddress, isAddress, verifyMessage } from "ethers";
import {
  issueAgentConnection,
  verifyAgentChallenge,
  verifyAgentConnection,
} from "../../../../../lib/agentConnectionTokens";

const ACCOUNT_ABI = [
  "function owner() view returns (address)",
  "function agentOperators(address) view returns (bool)",
];
const ALLOWED_SCOPES = new Set([
  "read",
  "lend",
  "borrow",
  "repay",
  "swap",
  "governance",
  "agent-management",
]);

function noStore(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function connectionOrigin(request) {
  return (process.env.CENTRY_AGENT_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
}

function buildChallengeMessage({ origin, account, owner, nonce, exp, scopes }) {
  return [
    "Centry agent connection",
    "",
    `Origin: ${origin}`,
    `Account: ${account}`,
    `Owner: ${owner}`,
    `Scopes: ${scopes.join(", ")}`,
    `Nonce: ${nonce}`,
    `Expires: ${exp}`,
    "",
    "I authorize Centry to create an external-agent connection for this account with exactly the scopes listed above.",
  ].join("\n");
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) return ["read"];
  const unique = [...new Set(scopes.filter((scope) => typeof scope === "string"))];
  if (unique.length === 0) return ["read"];
  if (unique.some((scope) => !ALLOWED_SCOPES.has(scope))) return null;
  return unique.sort();
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return noStore({ error: "invalid_json" }, 400);
  }

  const challengeToken = typeof body?.challengeToken === "string" ? body.challengeToken : "";
  const signature = typeof body?.signature === "string" ? body.signature : "";
  const operator = typeof body?.operator === "string" && isAddress(body.operator)
    ? getAddress(body.operator)
    : null;
  const scopes = normalizeScopes(body?.scopes);

  if (!challengeToken || !signature || !operator || !scopes) {
    return noStore({ error: "invalid_connection_request" }, 400);
  }

  const challenge = await verifyAgentChallenge(challengeToken).catch(() => null);
  if (!challenge) return noStore({ error: "invalid_or_expired_challenge" }, 401);

  const origin = connectionOrigin(request);
  if (challenge.origin !== origin) {
    return noStore({ error: "challenge_origin_mismatch" }, 403);
  }

  const challengeScopes = normalizeScopes(challenge.scopes);
  if (!challengeScopes || challengeScopes.length !== scopes.length || challengeScopes.some((scope, index) => scope !== scopes[index])) {
    return noStore({ error: "challenge_scope_mismatch" }, 403);
  }

  const message = buildChallengeMessage({
    origin: challenge.origin,
    account: challenge.account,
    owner: challenge.owner,
    nonce: challenge.nonce,
    exp: challenge.exp,
    scopes: challengeScopes,
  });

  let signer;
  try {
    signer = getAddress(verifyMessage(message, signature));
  } catch {
    return noStore({ error: "invalid_signature" }, 401);
  }

  if (signer.toLowerCase() !== challenge.owner.toLowerCase()) {
    return noStore({ error: "signature_owner_mismatch" }, 403);
  }

  const rpcUrl = process.env.CENTRY_AGENT_RPC_URL || process.env.CENTRY_ERC8004_RPC_URL;
  if (!rpcUrl) return noStore({ error: "agent_rpc_not_configured" }, 503);

  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const account = getAddress(challenge.account);
    const contract = new Contract(account, ACCOUNT_ABI, provider);
    const [onchainOwner, operatorAuthorized] = await Promise.all([
      contract.owner(),
      contract.agentOperators(operator),
    ]);

    if (getAddress(onchainOwner).toLowerCase() !== signer.toLowerCase()) {
      return noStore({ error: "account_owner_mismatch" }, 403);
    }

    if (!operatorAuthorized) {
      return noStore({ error: "operator_not_authorized" }, 403);
    }
  } catch {
    return noStore({ error: "account_owner_verification_failed" }, 503);
  }

  try {
    const connectionToken = await issueAgentConnection({
      owner: challenge.owner,
      account: challenge.account,
      operator,
      scopes: challengeScopes,
    });
    const issuedConnection = await verifyAgentConnection(connectionToken);

    const baseUrl = connectionOrigin(request);
    const connectionUrl = `${baseUrl}/api/v1/agent-connections/${encodeURIComponent(connectionToken)}`;
    const prompt = [
      "Connect my Centry account to this agent.",
      "",
      "Read the Centry skill at the following URL and follow its instructions to establish the connection.",
      connectionUrl,
      "",
      `Your authorized operator address is ${operator}. When fetching the connection URL, include this exact address as the operator query parameter.`,
      "",
      "After connecting, use only the capabilities returned by Centry for this connection.",
    ].join("\n");

    return noStore({
      connected: true,
      connectionId: issuedConnection?.connectionId || null,
      account: challenge.account,
      owner: challenge.owner,
      operator,
      scopes: challengeScopes,
      connectionUrl,
      prompt,
      expiresIn: 600,
    });
  } catch {
    return noStore({ error: "agent_connection_secret_not_configured" }, 503);
  }
}

export async function OPTIONS() {
  return noStore({ ok: true });
}
