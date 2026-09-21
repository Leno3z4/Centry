import { getAddress, isAddress } from "ethers";
import { issueOwnerChallenge } from "../../../../../lib/agentOwnerAuth";

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const owner = typeof body?.owner === "string" && isAddress(body.owner) ? getAddress(body.owner) : null;
  const account = typeof body?.account === "string" && isAddress(body.account) ? getAddress(body.account) : null;
  const action = typeof body?.action === "string" ? body.action.trim() : "";
  if (!owner || !account || !action) return Response.json({ error: "invalid_owner_account_or_action" }, { status: 400 });
  try {
    const challenge = issueOwnerChallenge({ owner, account, action });
    return Response.json(challenge, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "challenge_failed" }, { status: 503 });
  }
}
