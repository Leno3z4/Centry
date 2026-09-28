import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getAgentById, runAgent } from "../../agent-runner/src/index.js";

const DEFAULT_ARC_RPC = "https://rpc.mainnet.arc.io";

const ARC_CHAIN = {
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [DEFAULT_ARC_RPC] } },
};

function getSigner(env) {
  const privateKey = String(env.CENTRY_AGENT_EXECUTOR_PRIVATE_KEY || env.CENTRY_AGENT_RUNNER_PRIVATE_KEY || "");
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("agent_executor_private_key_not_configured");
  }
  return privateKeyToAccount(privateKey);
}

function publicClientFor(rpcUrl) {
  return createPublicClient({
    chain: { ...ARC_CHAIN, rpcUrls: { default: { http: [rpcUrl] } } },
    transport: http(rpcUrl, {
      retryCount: 0,
      timeout: 15_000,
    }),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      try {
        const signer = getSigner(env);
        return Response.json({
          ok: true,
          service: "centry-agent-executor",
          signer: signer.address,
          chainId: 5042,
        });
      } catch (error) {
        return Response.json(
          { ok: false, error: error instanceof Error ? error.message : "executor_not_configured" },
          { status: 503 },
        );
      }
    }

    if (request.method !== "POST" || url.pathname !== "/execute") {
      return new Response("Not found", { status: 404 });
    }

    const secret = String(env.CENTRY_AGENT_EXECUTOR_HTTP_SECRET || "");
    if (!secret || request.headers.get("authorization") !== "Bearer " + secret) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }

    const agentId = String(body?.agentId || "").trim();
    const message = String(body?.message || "").trim().slice(0, 4000);
    if (!agentId || !message) {
      return Response.json({ error: "agent_id_and_message_required" }, { status: 400 });
    }

    try {
      const agent = await getAgentById(env.DB, agentId);
      if (!agent) {
        return Response.json({ error: "agent_not_found" }, { status: 404 });
      }

      const rpcUrl = String(env.CENTRY_AGENT_RPC_URL || DEFAULT_ARC_RPC);
      const signer = getSigner(env);
      const publicClient = publicClientFor(rpcUrl);
      const walletClient = createWalletClient({
        account: signer,
        chain: { ...ARC_CHAIN, rpcUrls: { default: { http: [rpcUrl] } } },
        transport: http(rpcUrl, { timeout: 15_000 }),
      });

      const result = await runAgent(
        env.DB,
        publicClient,
        walletClient,
        getAddress(signer.address),
        agent,
        new Date().toISOString(),
        env,
        null,
        message,
      );

      if (result?.status === "locked") {
        return Response.json(
          { error: "agent_execution_busy", result },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }

      return Response.json(
        {
          mode: "executed",
          status: result?.status || "processed",
          result: {
            answer: result?.answer || null,
            txHash: result?.txHash || null,
            reason: result?.reason || null,
            error: result?.error || null,
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "agent_execution_failed" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
};
