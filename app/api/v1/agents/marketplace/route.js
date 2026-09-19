import crypto from "node:crypto";
import { Contract, Interface, JsonRpcProvider, getAddress, isAddress } from "ethers";
import { getAgentTemplate } from "../../../../../lib/agentCatalog";
import { createPurchase } from "../../../../../lib/agentStore";

const CHAIN_ID = 5042n;
const USDC = getAddress(process.env.CENTRY_USDC || "0x3600000000000000000000000000000000000000");
const TREASURY = getAddress(process.env.CENTRY_TREASURY || "0x475a93394F1EDef9255EA565Ee50eb8feaC7744C");
const PRICE_RAW = 2500000n;

const ERC20 = new Interface([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);

export async function GET() {
  return Response.json({
    chainId: Number(CHAIN_ID),
    currency: "USDC",
    priceUsdCents: 250,
    priceUsdcRaw: PRICE_RAW.toString(),
    treasury: TREASURY,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }

  const owner = body?.owner;
  const template = getAgentTemplate(body?.templateId || "");
  const agentId = String(body?.agentId || "");
  const paymentTxHash = String(body?.paymentTxHash || "");

  if (!isAddress(owner) || !template || !agentId || !paymentTxHash) {
    return Response.json({ error: "owner_template_agent_id_and_payment_tx_required" }, { status: 400 });
  }

  try {
    const provider = new JsonRpcProvider(process.env.CENTRY_AGENT_RPC_URL);
    const network = await provider.getNetwork();
    if (network.chainId !== CHAIN_ID) return Response.json({ error: "wrong_network" }, { status: 503 });

    const tx = await provider.getTransaction(paymentTxHash);
    const receipt = await provider.getTransactionReceipt(paymentTxHash);
    if (!tx || !receipt || receipt.status !== 1) return Response.json({ error: "payment_transaction_not_confirmed" }, { status: 400 });
    if (!tx.to || getAddress(tx.to) !== USDC) return Response.json({ error: "payment_must_be_native_usdc_erc20_transfer" }, { status: 400 });
    if (getAddress(tx.from) !== getAddress(owner)) return Response.json({ error: "payment_sender_mismatch" }, { status: 403 });

    let paid = false;
    for (const log of receipt.logs) {
      if (getAddress(log.address) !== USDC) continue;
      try {
        const parsed = ERC20.parseLog(log);
        if (
          parsed?.name === "Transfer" &&
          getAddress(parsed.args.from) === getAddress(owner) &&
          getAddress(parsed.args.to) === TREASURY &&
          BigInt(parsed.args.value) === PRICE_RAW
        ) {
          paid = true;
          break;
        }
      } catch {}
    }

    if (!paid) return Response.json({ error: "exact_agent_price_payment_not_found" }, { status: 400 });

    const purchase = await createPurchase({
      id: crypto.randomUUID(),
      owner: getAddress(owner),
      agentId,
      templateId: template.id,
      paymentTxHash,
      amountUsdcRaw: PRICE_RAW.toString(),
      status: "confirmed",
    });

    return Response.json({ purchased: true, purchase, template }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "purchase_verification_failed" }, { status: 503 });
  }
}
