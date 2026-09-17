import { getAddress, isAddress } from "ethers";
import { issueAgentChallenge } from "../../../../../lib/agentConnectionTokens";

function noStore(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function connectionOrigin(request) {
  return (process.env.CENTRY_AGENT_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return noStore({ error: "invalid_json" }, 400);
  }

  const owner = typeof body?.owner === "string" && isAddress(body.owner) ? getAddress(body.owner) : null;
  const account = typeof body?.account === "string" && isAddress(body.account) ? getAddress(body.account) : null;

  if (!owner || !account) {
    return noStore({ error: "invalid_owner_or_account" }, 400);
  }

  try {
    const origin = connectionOrigin(request);
    const challenge = await issueAgentChallenge({ owner, account, origin });
    const message = [
      "Centry agent connection",
      "",
      `Origin: ${challenge.origin}`,
      `Account: ${challenge.account}`,
      `Owner: ${challenge.owner}`,
      `Nonce: ${challenge.nonce}`,
      `Expires: ${challenge.exp}`,
      "",
      "I authorize Centry to create an external-agent connection for this account.",
    ].join("\n");

    return noStore({
      challengeToken: challenge.token,
      nonce: challenge.nonce,
      expiresAt: challenge.exp,
      owner: challenge.owner,
      account: challenge.account,
      message,
    });
  } catch {
    return noStore({ error: "agent_connection_secret_not_configured" }, 503);
  }
}
