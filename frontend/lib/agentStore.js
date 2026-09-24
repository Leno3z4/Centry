const dbUrl = () => (process.env.CENTRY_AGENT_DB_URL || "").replace(/\/$/, "");
const dbSecret = () => process.env.CENTRY_AGENT_DB_SECRET || "";

async function call(operation, args = {}) {
  const url = dbUrl();
  const secret = dbSecret();
  if (!url || !secret) throw new Error("agent_store_not_configured");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ operation, args }),
    cache: "no-store",
  });

  let body = null;
  try { body = await response.json(); } catch {}

  if (!response.ok) {
    const error = body?.error || "agent_store_request_failed";
    throw new Error(error);
  }

  return body?.result;
}

export async function getAgentById(id) {
  return call("get_agent_by_id", { id });
}

export async function getAgentByAccount(account) {
  return call("get_agent_by_account", { account });
}

export async function listAgents(owner) {
  return call("list_agents", { owner });
}

export async function listAllAgents() {
  return call("list_all_agents");
}

export async function upsertAgent(agent) {
  return call("upsert_agent", { agent });
}

export async function setAgentActive(id, active) {
  return call("set_agent_active", { id, active: Boolean(active) });
}

export async function createPurchase(purchase) {
  return call("create_purchase", { purchase });
}

export async function createAgentKey({ id, agentId, owner, operator, label, keyHash, scopes }) {
  return call("create_agent_key", {
    id,
    agentId,
    owner,
    operator,
    label,
    keyHash,
    scopes,
  });
}

export async function listAgentKeys(agentId) {
  return call("list_agent_keys", { agentId });
}

export async function getActiveAgentKey(id) {
  return call("get_active_agent_key", { id });
}

export async function revokeAgentKey(id, revokedAt = new Date().toISOString()) {
  return call("revoke_agent_key", { id, revokedAt });
}

export async function setProviderConfig({ agentId, provider, model, encryptedApiKey }) {
  return call("set_provider_config", {
    agentId,
    provider,
    model,
    encryptedApiKey,
  });
}

export async function listProviderConfigs(agentId) {
  return call("list_provider_configs", { agentId });
}

export async function getProviderConfig(agentId, provider) {
  return call("get_provider_config", { agentId, provider });
}

export async function addAgentChatMessage({ id, agentId, role, content }) {
  return call("add_agent_chat_message", { id, agentId, role, content });
}

export async function listAgentChatMessages(agentId, limit = 50) {
  return call("list_agent_chat_messages", { agentId, limit });
}

export async function tryLockAgent(agentId, ttlMs = 50_000) {
  return call("try_lock_agent", { agentId, ttlMs });
}

export async function unlockAgent(agentId) {
  return call("unlock_agent", { agentId });
}

export async function createAgentRun(run) {
  return call("create_agent_run", { run });
}

export async function finishAgentRun(run) {
  return call("finish_agent_run", { run });
}

export async function listAgentRuns(agentId, limit = 10) {
  return call("list_agent_runs", { agentId, limit });
}

export async function enqueueAgentTask(task) {
  return call("enqueue_agent_task", { task });
}

export async function listPendingAgentTasks(agentId, limit = 20) {
  return call("list_pending_agent_tasks", { agentId, limit });
}

export async function completeAgentTask({ id, status, result }) {
  return call("complete_agent_task", { id, status, result });
}

export async function getAgentTask(id) {
  return call("get_agent_task", { id });
}

export async function updateAgentConfig(id, config) { return call("update_agent_config", { id, config }); }


export async function getAgentRuntime(agentId) {
  return call("get_agent_runtime", { agentId });
}

export async function listActionReceipts(agentId, limit = 20) {
  return call("list_action_receipts", { agentId, limit });
}
