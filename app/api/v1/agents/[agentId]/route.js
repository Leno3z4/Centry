import { createPublicClient, http } from "viem";

const IDENTITY_REGISTRY_ABI = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
];

const AGENT_ACCOUNT_ABI = [
  {
    type: "function",
    name: "erc8004IdentityRegistry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "registry", type: "address" }],
  },
  {
    type: "function",
    name: "erc8004AgentId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
];

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "public, max-age=30, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function parseAgentId(value) {
  if (!/^\d+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function optionalService(name, endpoint, version) {
  if (!endpoint) return null;
  const service = { name, endpoint };
  if (version) service.version = version;
  return service;
}

export async function GET(request, { params }) {
  const { agentId: rawAgentId } = await params;
  const agentId = parseAgentId(rawAgentId);

  if (agentId === null) {
    return json({ error: "invalid_agent_id" }, 400);
  }

  const rpcUrl = process.env.CENTRY_ERC8004_RPC_URL;
  const identityRegistry = process.env.CENTRY_ERC8004_IDENTITY_REGISTRY;
  const chainId = Number(process.env.CENTRY_ERC8004_CHAIN_ID || 0);

  if (!rpcUrl || !identityRegistry || !Number.isInteger(chainId) || chainId <= 0) {
    return json({ error: "agent_registry_not_configured" }, 503);
  }

  const client = createPublicClient({
    chain: {
      id: chainId,
      name: process.env.CENTRY_ERC8004_CHAIN_NAME || "Centry EVM",
      nativeCurrency: { name: "Native", symbol: "NATIVE", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    },
    transport: http(rpcUrl),
  });

  let agentAccount;
  try {
    agentAccount = await client.readContract({
      address: identityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "ownerOf",
      args: [agentId],
    });
  } catch {
    return json({ error: "agent_not_found", agentId: rawAgentId }, 404);
  }

  let linkedRegistry;
  let linkedAgentId;
  try {
    [linkedRegistry, linkedAgentId] = await Promise.all([
      client.readContract({
        address: agentAccount,
        abi: AGENT_ACCOUNT_ABI,
        functionName: "erc8004IdentityRegistry",
      }),
      client.readContract({
        address: agentAccount,
        abi: AGENT_ACCOUNT_ABI,
        functionName: "erc8004AgentId",
      }),
    ]);
  } catch {
    return json({ error: "agent_account_not_linked", agentId: rawAgentId }, 409);
  }

  if (
    linkedRegistry.toLowerCase() !== identityRegistry.toLowerCase() ||
    linkedAgentId !== agentId
  ) {
    return json({ error: "agent_identity_mismatch", agentId: rawAgentId }, 409);
  }

  const origin = new URL(request.url).origin;
  const publicBaseUrl = process.env.CENTRY_AGENT_BASE_URL || origin;
  const services = [
    optionalService("web", process.env.CENTRY_AGENT_WEB_URL || `${publicBaseUrl}/agents/${rawAgentId}`),
    optionalService("MCP", process.env.CENTRY_MCP_URL, process.env.CENTRY_MCP_VERSION),
    optionalService("A2A", process.env.CENTRY_A2A_URL, process.env.CENTRY_A2A_VERSION),
  ].filter(Boolean);

  return json({
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: process.env.CENTRY_AGENT_NAME || `Centry Agent #${rawAgentId}`,
    description:
      process.env.CENTRY_AGENT_DESCRIPTION ||
      "A user-authorized Centry agent account that can operate within explicitly scoped onchain permissions.",
    image: process.env.CENTRY_AGENT_IMAGE_URL || `${publicBaseUrl}/icon.png`,
    services,
    x402Support: process.env.CENTRY_AGENT_X402_SUPPORT === "true",
    active: process.env.CENTRY_AGENT_ACTIVE !== "false",
    registrations: [
      {
        agentId: Number(agentId),
        agentRegistry: `eip155:${chainId}:${identityRegistry}`,
      },
    ],
    supportedTrust: ["reputation"],
  });
}
