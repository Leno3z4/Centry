import { createClient } from "@libsql/client";

let clientPromise;

function getClient() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error("agent_store_not_configured");
  }
  if (!clientPromise) {
    clientPromise = Promise.resolve(
      createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      }),
    );
  }
  return clientPromise;
}

let initPromise;

async function db() {
  const client = await getClient();
  if (!initPromise) {
    initPromise = (async () => {
      await client.batch([
        { sql: `CREATE TABLE IF NOT EXISTS centry_agents (
          id TEXT PRIMARY KEY,
          owner TEXT NOT NULL,
          account TEXT NOT NULL UNIQUE,
          type TEXT NOT NULL,
          template_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          operator TEXT,
          metadata_uri TEXT NOT NULL DEFAULT '',
          config_json TEXT NOT NULL DEFAULT '{}',
          price_usd_cents INTEGER NOT NULL DEFAULT 0,
          active INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`, args: [] },
        { sql: `CREATE TABLE IF NOT EXISTS centry_agent_purchases (
          id TEXT PRIMARY KEY,
          owner TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          template_id TEXT NOT NULL,
          payment_tx_hash TEXT NOT NULL UNIQUE,
          amount_usdc_raw TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL
        )`, args: [] },
        { sql: `CREATE TABLE IF NOT EXISTS centry_agent_keys (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          owner TEXT NOT NULL,
          operator TEXT,
          label TEXT NOT NULL,
          key_hash TEXT NOT NULL,
          scopes_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          revoked_at TEXT
        )`, args: [] },
        { sql: `CREATE TABLE IF NOT EXISTS centry_agent_providers (
          agent_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          encrypted_api_key TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (agent_id, provider)
        )`, args: [] },
        { sql: `CREATE TABLE IF NOT EXISTS centry_agent_chats (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL
        )`, args: [] },
      ]);
      try { await client.execute("ALTER TABLE centry_agent_keys ADD COLUMN operator TEXT"); } catch {}
      return client;
    })();
  }
  await initPromise;
  return client;
}

export async function getAgentById(id) {
  const c = await db();
  const r = await c.execute({ sql: "SELECT * FROM centry_agents WHERE id = ?", args: [id] });
  return r.rows[0] || null;
}

export async function getAgentByAccount(account) {
  const c = await db();
  const r = await c.execute({ sql: "SELECT * FROM centry_agents WHERE lower(account) = lower(?)", args: [account] });
  return r.rows[0] || null;
}

export async function listAgents(owner) {
  const c = await db();
  const r = await c.execute({ sql: "SELECT * FROM centry_agents WHERE lower(owner) = lower(?) ORDER BY created_at DESC", args: [owner] });
  return r.rows;
}

export async function upsertAgent(agent) {
  const c = await db();
  const now = new Date().toISOString();
  await c.execute({
    sql: `INSERT INTO centry_agents
      (id, owner, account, type, template_id, name, description, operator, metadata_uri, config_json, price_usd_cents, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        owner=excluded.owner,
        account=excluded.account,
        type=excluded.type,
        template_id=excluded.template_id,
        name=excluded.name,
        description=excluded.description,
        operator=excluded.operator,
        metadata_uri=excluded.metadata_uri,
        config_json=excluded.config_json,
        price_usd_cents=excluded.price_usd_cents,
        active=excluded.active,
        updated_at=excluded.updated_at`,
    args: [
      agent.id,
      agent.owner,
      agent.account,
      agent.type,
      agent.templateId,
      agent.name,
      agent.description || "",
      agent.operator || null,
      agent.metadataURI || "",
      JSON.stringify(agent.config || {}),
      Number(agent.priceUsdCents || 0),
      agent.active ? 1 : 0,
      agent.createdAt || now,
      now,
    ],
  });
  return getAgentById(agent.id);
}

export async function setAgentActive(id, active) {
  const c = await db();
  await c.execute({ sql: "UPDATE centry_agents SET active = ?, updated_at = ? WHERE id = ?", args: [active ? 1 : 0, new Date().toISOString(), id] });
  return getAgentById(id);
}

export async function createPurchase(purchase) {
  const c = await db();
  await c.execute({
    sql: "INSERT INTO centry_agent_purchases (id, owner, agent_id, template_id, payment_tx_hash, amount_usdc_raw, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [purchase.id, purchase.owner, purchase.agentId, purchase.templateId, purchase.paymentTxHash, purchase.amountUsdcRaw, purchase.status || "confirmed", new Date().toISOString()],
  });
  return purchase;
}

export async function createAgentKey({ id, agentId, owner, operator, label, keyHash, scopes }) {
  const c = await db();
  await c.execute({
    sql: "INSERT INTO centry_agent_keys (id, agent_id, owner, operator, label, key_hash, scopes_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [id, agentId, owner, operator || null, label || "External agent", keyHash, JSON.stringify(scopes || ["read"]), new Date().toISOString()],
  });
}

export async function listAgentKeys(agentId) {
  const c = await db();
  const r = await c.execute({ sql: "SELECT id, agent_id, owner, label, scopes_json, created_at, revoked_at FROM centry_agent_keys WHERE agent_id = ? ORDER BY created_at DESC", args: [agentId] });
  return r.rows;
}

export async function getActiveAgentKey(id) {
  const c = await db();
  const r = await c.execute({ sql: "SELECT * FROM centry_agent_keys WHERE id = ? AND revoked_at IS NULL", args: [id] });
  return r.rows[0] || null;
}

export async function revokeAgentKey(id, revokedAt = new Date().toISOString()) {
  const c = await db();
  await c.execute({ sql: "UPDATE centry_agent_keys SET revoked_at = ? WHERE id = ?", args: [revokedAt, id] });
}

export async function setProviderConfig({ agentId, provider, model, encryptedApiKey }) {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO centry_agent_providers (agent_id, provider, model, encrypted_api_key, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(agent_id, provider) DO UPDATE SET
        model=excluded.model,
        encrypted_api_key=excluded.encrypted_api_key,
        updated_at=excluded.updated_at`,
    args: [agentId, provider, model, encryptedApiKey, new Date().toISOString()],
  });
}

export async function listProviderConfigs(agentId) {
  const c = await db();
  const r = await c.execute({ sql: "SELECT agent_id, provider, model, updated_at FROM centry_agent_providers WHERE agent_id = ? ORDER BY provider", args: [agentId] });
  return r.rows;
}

export async function getProviderConfig(agentId, provider) {
  const c = await db();
  const r = await c.execute({ sql: "SELECT * FROM centry_agent_providers WHERE agent_id = ? AND provider = ?", args: [agentId, provider] });
  return r.rows[0] || null;
}

export async function addAgentChatMessage({ id, agentId, role, content }) {
  const c = await db();
  await c.execute({
    sql: "INSERT INTO centry_agent_chats (id, agent_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [id, agentId, role, content, new Date().toISOString()],
  });
}

export async function listAgentChatMessages(agentId, limit = 50) {
  const c = await db();
  const bounded = Math.max(1, Math.min(100, Number(limit) || 50));
  const r = await c.execute({ sql: `SELECT role, content, created_at FROM centry_agent_chats WHERE agent_id = ? ORDER BY created_at DESC LIMIT ${bounded}`, args: [agentId] });
  return [...r.rows].reverse();
}
