import { getAddress } from "ethers";
import { Contract, JsonRpcProvider } from "ethers";
import { getAgentById } from "../../../../../lib/agentStore";

const ACCOUNT_ABI = [
  "function owner() view returns (address)",
  "function active() view returns (bool)",
];

export async function GET(_request, { params }) {
  const { agentId } = await params;
  const agent = await getAgentById(agentId).catch(() => null);
  if (!agent) return Response.json({ error: "agent_not_found" }, { status: 404 });

  try {
    const contract = new Contract(getAddress(agent.account), ACCOUNT_ABI, new JsonRpcProvider(process.env.CENTRY_AGENT_RPC_URL));
    const active = await contract.active();
    return Response.json({
      id: agent.id,
      owner: getAddress(agent.owner),
      account: getAddress(agent.account),
      type: agent.type,
      templateId: agent.template_id,
      name: agent.name,
      description: agent.description,
      metadataURI: agent.metadata_uri,
      active: Boolean(active),
      priceUsdCents: Number(agent.price_usd_cents || 0),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "agent_account_read_failed" }, { status: 503 });
  }
}
