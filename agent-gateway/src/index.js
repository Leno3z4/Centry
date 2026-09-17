import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import * as z from "zod/v4";

function createServer(env) {
  const server = new McpServer({
    name: "centry-agent-gateway",
    version: "0.1.0",
    description: "Centry's stateless MCP gateway for ERC-8004 agent discovery and permission checks.",
  });

  const apiOrigin = env.CENTRY_API_ORIGIN?.replace(/\/$/, "");

  server.registerTool(
    "get_agent",
    {
      title: "Resolve Centry agent",
      description: "Resolve an ERC-8004 agent ID to its verified Centry registration file.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        agentId: z.string().regex(/^\d+$/, "agentId must be an unsigned integer"),
      }),
    },
    async ({ agentId }) => {
      if (!apiOrigin) {
        return {
          isError: true,
          content: [{ type: "text", text: "CENTRY_API_ORIGIN is not configured." }],
        };
      }

      const response = await fetch(`${apiOrigin}/api/v1/agents/${agentId}`);
      const body = await response.json();

      return {
        isError: !response.ok,
        content: [{ type: "text", text: JSON.stringify(body) }],
      };
    }
  );

  server.registerTool(
    "check_agent_call_permission",
    {
      title: "Check agent call permission",
      description:
        "Read the current onchain Centry account policy and check whether an operator may call the supplied target, calldata, and native value.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        agentId: z.string().regex(/^\d+$/, "agentId must be an unsigned integer"),
        operator: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid operator address"),
        target: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid target address"),
        value: z.string().regex(/^(?:\d+|0x[0-9a-fA-F]+)$/, "value must be uint256 text"),
        data: z.string().regex(/^0x[0-9a-fA-F]+$/, "data must be hex calldata"),
      }),
    },
    async ({ agentId, operator, target, value, data }) => {
      if (!apiOrigin) {
        return {
          isError: true,
          content: [{ type: "text", text: "CENTRY_API_ORIGIN is not configured." }],
        };
      }

      const response = await fetch(`${apiOrigin}/api/v1/agents/${agentId}/authorize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operator, target, value, data }),
      });
      const body = await response.json();

      return {
        isError: !response.ok && response.status !== 403,
        content: [{ type: "text", text: JSON.stringify(body) }],
      };
    }
  );

  return server;
}

export default {
  fetch(request, env, ctx) {
    return createMcpHandler(() => createServer(env))(request, env, ctx);
  },
};
