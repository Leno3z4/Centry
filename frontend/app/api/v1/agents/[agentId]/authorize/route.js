import { createPublicClient, http, isAddress } from "viem";

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
  {
    type: "function",
    name: "canExecute",
    stateMutability: "view",
    inputs: [
      { name: "operator", type: "address" },
      { name: "target", type: "address" },
      { name: "selector", type: "bytes4" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "allowed", type: "bool" }],
  },
];

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
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

function parseUint256(value) {
  if (typeof value !== "string") return null;
  if (!/^(?:\d+|0x[0-9a-fA-F]+)$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function parseSelector(data) {
  if (typeof data !== "string" || !/^0x[0-9a-fA-F]+$/.test(data) || data.length < 10) return null;
  return data.slice(0, 10);
}

export async function POST(request, { params }) {
  const { agentId: rawAgentId } = await params;
  const agentId = parseAgentId(rawAgentId);
  if (agentId === null) return json({ error: "invalid_agent_id" }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const operator = body?.operator;
  const target = body?.target;
  const value = parseUint256(body?.value ?? "0");
  const data = body?.data;
  const selector = parseSelector(data);

  if (!isAddress(operator || "") || !isAddress(target || "")) {
    return json({ error: "invalid_address" }, 400);
  }
  if (value === null) return json({ error: "invalid_value" }, 400);
  if (selector === null) return json({ error: "invalid_calldata" }, 400);

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

  let account;
  try {
    account = await client.readContract({
      address: identityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "ownerOf",
      args: [agentId],
    });
  } catch {
    return json({ error: "agent_not_found", agentId: rawAgentId }, 404);
  }

  try {
    const [linkedRegistry, linkedAgentId] = await Promise.all([
      client.readContract({
        address: account,
        abi: AGENT_ACCOUNT_ABI,
        functionName: "erc8004IdentityRegistry",
      }),
      client.readContract({
        address: account,
        abi: AGENT_ACCOUNT_ABI,
        functionName: "erc8004AgentId",
      }),
    ]);

    if (
      linkedRegistry.toLowerCase() !== identityRegistry.toLowerCase() ||
      linkedAgentId !== agentId
    ) {
      return json({ error: "agent_identity_mismatch", agentId: rawAgentId }, 409);
    }

    const allowed = await client.readContract({
      address: account,
      abi: AGENT_ACCOUNT_ABI,
      functionName: "canExecute",
      args: [operator, target, selector, value],
    });

    return json({
      allowed,
      agentId: rawAgentId,
      account,
      operator,
      target,
      selector,
      value: value.toString(),
      data,
    }, allowed ? 200 : 403);
  } catch {
    return json({ error: "agent_account_not_linked", agentId: rawAgentId }, 409);
  }
}
