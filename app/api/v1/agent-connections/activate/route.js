import { Contract, JsonRpcProvider, getAddress, isAddress, verifyMessage } from "ethers";
import { issueAgentSession, verifyAgentChallenge } from "../../../../lib/agentConnectionTokens";

const ACCOUNT_ABI = [
  "function owner() view returns (address)",
  "function active() view returns (bool)",
  "function agentOperators(address) view returns (bool)",
];

function messageFor(challenge) {
  return [
    "Centry agent activation",
    "",
    `Account: ${challenge.account}`,
    `Owner: ${challenge.owner}`,
    `Operator: ${challenge.operator}`,
    `Scopes: ${challenge.scopes.join(", ")}`,
    `Nonce: ${challenge.nonce}`,
    `Expires: ${challenge.exp}`,
    "",
    "I authorize this external agent connection for this Centry account.",
  ].join("\n");
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }

  const { challengeToken, signature, operator } = body || {};
  if (!challengeToken || !signature || !isAddress(operator || "")) return Response.json({ error: "challenge_signature_and_operator_required" }, { status: 400 });

  const challenge = await verifyAgentChallenge(challengeToken).catch(() => null);
  if (!challenge) return Response.json({ error: "invalid_or_expired_challenge" }, { status: 401 });
  challenge.operator = getAddress(operator);

  let signer;
  try { signer = getAddress(verifyMessage(messageFor(challenge), signature)); }
  catch { return Response.json({ error: "invalid_signature" }, { status: 401 }); }

  if (signer.toLowerCase() !== challenge.owner.toLowerCase()) return Response.json({ error: "signature_owner_mismatch" }, { status: 403 });

  try {
    const contract = new Contract(getAddress(challenge.account), ACCOUNT_ABI, new JsonRpcProvider(process.env.CENTRY_AGENT_RPC_URL));
    const [onchainOwner, active, authorized] = await Promise.all([
      contract.owner(),
      contract.active(),
      contract.agentOperators(challenge.operator),
    ]);
    if (getAddress(onchainOwner).toLowerCase() !== signer.toLowerCase()) return Response.json({ error: "account_owner_mismatch" }, { status: 403 });
    if (!active) return Response.json({ error: "agent_inactive" }, { status: 403 });
    if (!authorized) return Response.json({ error: "operator_not_authorized" }, { status: 403 });

    const session = await issueAgentSession({
      connectionId: crypto.randomUUID(),
      owner: challenge.owner,
      account: challenge.account,
      operator: challenge.operator,
      scopes: challenge.scopes,
    });
    return Response.json({ activated: true, sessionToken: session, account: challenge.account, operator: challenge.operator, scopes: challenge.scopes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "activation_failed" }, { status: 503 });
  }
}
