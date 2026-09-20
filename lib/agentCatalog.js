const PAYWALL_ENABLED = process.env.NEXT_PUBLIC_CENTRY_AGENT_PAYWALL === "true";

export const AGENT_CATALOG = Object.freeze([
  {
    id: "centry-general-agent",
    name: "Centry Agent",
    description: "A configurable onchain agent for lending, repayment, swaps and Centry account operations.",
    priceUsdCents: PAYWALL_ENABLED ? 250 : 0,
    templateId: "0x" + "00".repeat(32),
    type: PAYWALL_ENABLED ? "purchased" : "standard",
  },
]);

export function getAgentTemplate(id) {
  return AGENT_CATALOG.find((agent) => agent.id === id) || null;
}
