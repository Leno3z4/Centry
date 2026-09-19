export const AGENT_CATALOG = Object.freeze([
  {
    id: "centry-general-agent",
    name: "Centry Agent",
    description: "A configurable onchain agent for lending, repayment, swaps and Centry account operations.",
    priceUsdCents: 250,
    templateId: "0x" + "00".repeat(32),
    type: "purchased",
  },
]);

export function getAgentTemplate(id) {
  return AGENT_CATALOG.find((agent) => agent.id === id) || null;
}
