import { getAddress, isAddress } from "ethers";
import { getAgentByAccount } from "../../../../../../lib/agentStore";

export async function GET(_request, { params }) {
  const { account } = await params;
  if (!isAddress(account)) return Response.json({ error: "invalid_account" }, { status: 400 });
  let agent;
  try {
    agent = await getAgentByAccount(getAddress(account));
  } catch (error) {
    console.error("[agent-account] store lookup failed", error);
    return Response.json({ error: "agent_store_unavailable" }, { status: 503 });
  }
  if (!agent) return Response.json({ error: "agent_not_found" }, { status: 404 });
  const storedName = String(agent.name || "").trim();
  const storedDescription = String(agent.description || "").trim();
  const registeredName = !storedName || /^unregistered agent$/i.test(storedName)
    ? "Centry Agent"
    : storedName;
  const registeredDescription = !storedDescription || /^agent account created onchain; finish registration to configure it\.?$/i.test(storedDescription)
    ? "Configurable Centry onchain agent."
    : storedDescription;

  return Response.json({
    registered: true,
    id: agent.id,
    owner: getAddress(agent.owner),
    account: getAddress(agent.account),
    type: agent.type === "unregistered" ? "standard" : agent.type,
    templateId: agent.template_id,
    name: registeredName,
    description: registeredDescription,
    operator: agent.operator || null,
    config: JSON.parse(agent.config_json || "{}"),
    active: Boolean(agent.active),
    priceUsdCents: Number(agent.price_usd_cents || 0),
  }, { headers: { "Cache-Control": "no-store" } });
}
