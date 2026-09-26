import crypto from "node:crypto";
import { Contract, JsonRpcProvider, getAddress, isAddress } from "ethers";
import { verifyOwnerSession } from "../../../../../lib/agentOwnerAuth";
import { upsertAgent } from "../../../../../lib/agentStore";

const ACCOUNT_ABI = [
  "function owner() view returns (address)",
  "function factory() view returns (address)",
  "function active() view returns (bool)",
  "function templateId() view returns (bytes32)",
  "function configHash() view returns (bytes32)",
  "function metadataURI() view returns (string)",
];

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const owner = body?.owner;
  const account = body?.account;
  if (!isAddress(owner || "") || !isAddress(account || "")) {
    return Response.json({ error: "invalid_owner_or_account" }, { status: 400 });
  }

  const rpcUrl = process.env.CENTRY_AGENT_RPC_URL;
  const genesisFactory = process.env.CENTRY_AGENT_FACTORY;
  if (!genesisFactory || !isAddress(genesisFactory)) {
    return Response.json({ error: "agent_genesis_factory_not_configured" }, { status: 503 });
  }

  try {
    await verifyOwnerSession({
      request,
      rpcUrl,
      account: getAddress(account),
    });

    const provider = new JsonRpcProvider(rpcUrl);
    const contract = new Contract(getAddress(account), ACCOUNT_ABI, provider);
    const factoryContract = new Contract(
      getAddress(genesisFactory),
      ["function isCentryAgentAccount(address account) view returns (bool)"],
      provider,
    );
    const [onchainOwner, active, templateId, configHash, metadataURI, accountFactory, registeredByGenesis] = await Promise.all([
      contract.owner(),
      contract.active(),
      contract.templateId(),
      contract.configHash(),
      contract.metadataURI(),
      contract.factory(),
      factoryContract.isCentryAgentAccount(getAddress(account)),
    ]);

    if (getAddress(onchainOwner).toLowerCase() !== getAddress(owner).toLowerCase()) {
      throw new Error("account_owner_mismatch");
    }
    if (getAddress(accountFactory).toLowerCase() !== getAddress(genesisFactory).toLowerCase()) {
      throw new Error("agent_not_created_by_genesis_factory");
    }
    if (!registeredByGenesis) {
      throw new Error("agent_not_registered_by_genesis_factory");
    }

    const agent = await upsertAgent({
      id: typeof body.agentId === "string" && body.agentId ? body.agentId : crypto.randomUUID(),
      owner: getAddress(owner),
      account: getAddress(account),
      type: ["custom", "standard", "purchased"].includes(body.type) ? body.type : "purchased",
      templateId: body.templateId || templateId,
      name: !body.name || /^unregistered agent$/i.test(String(body.name).trim())
        ? "Centry Agent"
        : String(body.name).trim(),
      description: !body.description || /^agent account created onchain; finish registration to configure it\.?$/i.test(String(body.description).trim())
        ? "Configurable Centry onchain agent."
        : String(body.description).trim(),
      operator: body.operator && isAddress(body.operator) ? getAddress(body.operator) : null,
      metadataURI: body.metadataURI || metadataURI || "",
      config: body.config && typeof body.config === "object" ? body.config : {},
      priceUsdCents: Number(body.priceUsdCents || 0),
      active,
    });

    return Response.json({
      agent: {
        id: agent.id,
        owner: agent.owner,
        account: agent.account,
        type: agent.type,
        templateId: agent.template_id,
        name: agent.name,
        description: agent.description,
        operator: agent.operator,
        metadataURI: agent.metadata_uri,
        config: JSON.parse(agent.config_json || "{}"),
        active: Boolean(active),
        priceUsdCents: Number(agent.price_usd_cents || 0),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "agent_registration_failed" }, { status: 403 });
  }
}
