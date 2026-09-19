import crypto from "node:crypto";
import { Interface, JsonRpcProvider, getAddress, isAddress } from "ethers";
import { getAgentTemplate } from "../../../../../lib/agentCatalog";
import { createPurchase } from "../../../../../lib/agentStore";

const FACTORY = getAddress(process.env.CENTRY_AGENT_FACTORY || "0x0000000000000000000000000000000000000000");
const PRICE_RAW = 2500000n;

const FACTORY_INTERFACE = new Interface([
  "event AgentAccountPurchased(address indexed owner,address indexed agentAccount,bytes32 indexed templateId,uint256 priceUsdc)",
]);

export async function GET() {
  return Response.json({
    chainId: 5042,
    currency: "USDC",
    priceUsdCents: 250,
    priceUsdcRaw: PRICE_RAW.toString(),
    paymentMode: "factory-atomic-purchase",
    factory: FACTORY,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }

  const owner = body?.owner;
  const templateId = String(body?.templateId || "");
  const agentId = String(body?.agentId || "");
  const account = body?.account;
  const purchaseTxHash = String(body?.purchaseTxHash || "");
  const template = getAgentTemplate(templateId);

  if (!isAddress(owner) || !isAddress(account) || !template || !agentId || !purchaseTxHash) {
    return Response.json({ error: "owner_template_agent_id_account_and_purchase_tx_required" }, { status: 400 });
  }

  if (FACTORY === "0x0000000000000000000000000000000000000000") {
    return Response.json({ error: "agent_factory_not_configured" }, { status: 503 });
  }

  try {
    const provider = new JsonRpcProvider(process.env.CENTRY_AGENT_RPC_URL);
    const receipt = await provider.getTransactionReceipt(purchaseTxHash);
    const tx = await provider.getTransaction(purchaseTxHash);
    if (!receipt || receipt.status !== 1 || !tx) return Response.json({ error: "purchase_transaction_not_confirmed" }, { status: 400 });
    if (!tx.to || getAddress(tx.to) !== FACTORY) return Response.json({ error: "purchase_must_use_centry_agent_factory" }, { status: 400 });
    if (getAddress(tx.from) !== getAddress(owner)) return Response.json({ error: "purchase_sender_mismatch" }, { status: 403 });

    let purchased = false;
    for (const log of receipt.logs) {
      if (getAddress(log.address) !== FACTORY) continue;
      try {
        const parsed = FACTORY_INTERFACE.parseLog(log);
        if (
          parsed?.name === "AgentAccountPurchased" &&
          getAddress(parsed.args.owner) === getAddress(owner) &&
          getAddress(parsed.args.agentAccount) === getAddress(account) &&
          parsed.args.templateId.toLowerCase() === template.templateId.toLowerCase() &&
          BigInt(parsed.args.priceUsdc) === PRICE_RAW
        ) {
          purchased = true;
          break;
        }
      } catch {}
    }

    if (!purchased) return Response.json({ error: "agent_purchase_event_not_found" }, { status: 400 });

    const purchase = await createPurchase({
      id: crypto.randomUUID(),
      owner: getAddress(owner),
      agentId,
      templateId: template.id,
      paymentTxHash: purchaseTxHash,
      amountUsdcRaw: PRICE_RAW.toString(),
      status: "confirmed",
    });

    return Response.json({ purchased: true, purchase, template }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "purchase_verification_failed" }, { status: 503 });
  }
}
