import { getAddress, isAddress } from "ethers";
import {
  clearOwnerSessionCookie,
  issueOwnerSession,
  ownerSessionCookie,
  readOwnerSession,
  verifyOwnerAuthorization,
} from "../../../../../lib/agentOwnerAuth";

export async function GET(request) {
  const session = readOwnerSession(request);
  if (!session) {
    return Response.json(
      { authenticated: false },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { authenticated: true, owner: session.owner, expiresAt: session.exp },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const owner = typeof body?.owner === "string" && isAddress(body.owner) ? getAddress(body.owner) : null;
  const account = typeof body?.account === "string" && isAddress(body.account) ? getAddress(body.account) : null;
  if (!owner || !account || !body?.challengeToken || !body?.signature) {
    return Response.json({ error: "owner_account_challenge_and_signature_required" }, { status: 400 });
  }

  try {
    await verifyOwnerAuthorization({
      rpcUrl: process.env.CENTRY_AGENT_RPC_URL,
      challengeToken: body.challengeToken,
      signature: body.signature,
      owner,
      account,
      action: "agent-session",
      params: {},
    });

    const session = issueOwnerSession({ owner });
    return Response.json(
      { authenticated: true, owner: session.owner, expiresAt: session.exp },
      {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": ownerSessionCookie(session.token),
        },
      },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "owner_session_failed" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function DELETE() {
  return Response.json(
    { authenticated: false },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": clearOwnerSessionCookie(),
      },
    },
  );
}
