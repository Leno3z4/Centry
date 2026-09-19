CREATE TABLE IF NOT EXISTS centry_agents (
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
);

CREATE INDEX IF NOT EXISTS idx_centry_agents_owner
  ON centry_agents(owner);

CREATE TABLE IF NOT EXISTS centry_agent_purchases (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  payment_tx_hash TEXT NOT NULL UNIQUE,
  amount_usdc_raw TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_centry_agent_purchases_owner
  ON centry_agent_purchases(owner);

CREATE TABLE IF NOT EXISTS centry_agent_keys (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  operator TEXT,
  label TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_centry_agent_keys_agent
  ON centry_agent_keys(agent_id);

CREATE TABLE IF NOT EXISTS centry_agent_providers (
  agent_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (agent_id, provider)
);

CREATE TABLE IF NOT EXISTS centry_agent_chats (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_centry_agent_chats_agent_created
  ON centry_agent_chats(agent_id, created_at);
