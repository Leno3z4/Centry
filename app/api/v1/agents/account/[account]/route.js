import { getAddress, isAddress } from "ethers";
import { getAgentByAccount } from "../../../../../lib/agentStore";

export async function GET(_request, { params }) {
  const { account } = await params;
  if (!isAddress(account)) return Response.json({ error: "invalid_account" }, { status: 400 });
  const agent = await getAgentByAccount(getAddress(account)).catch(() => null);
  if (!agent) return Response.json({ error: "agent_not_found" }, { status: 404 });
  return Response.json({
    id: agent.id,
    owner: getAddress(agent.owner),
    account: getAddress(agent.account),
    type: agent.type,
    templateId: agent.template_id,
    name: agent.name,
    description: agent.description,

    active: Boolean(agent.active),
    priceUsdCents: Number(agent.price_usd_cents || 0),
  }, { headers: { "Cache-Control": "no-store" } });
}
