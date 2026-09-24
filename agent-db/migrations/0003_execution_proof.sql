CREATE TABLE IF NOT EXISTS centry_agent_runtime (
  agent_id TEXT PRIMARY KEY,
  heartbeat_at TEXT,
  last_evaluation_at TEXT,
  last_action_at TEXT,
  last_success_at TEXT,
  last_failure_at TEXT,
  last_status TEXT NOT NULL DEFAULT 'idle',
  last_reason TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  last_tx_hash TEXT,
  last_run_id TEXT,
  operator_authorized INTEGER,
  account_active INTEGER,
  strategy_state_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS centry_agent_action_receipts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  action_index INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  target TEXT NOT NULL,
  selector TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL,
  simulation_at TEXT,
  broadcast_at TEXT,
  confirmed_at TEXT,
  tx_hash TEXT,
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_centry_agent_runtime_status
  ON centry_agent_runtime(last_status, updated_at);

CREATE INDEX IF NOT EXISTS idx_centry_agent_receipts_run
  ON centry_agent_action_receipts(run_id, action_index);

CREATE INDEX IF NOT EXISTS idx_centry_agent_receipts_agent_created
  ON centry_agent_action_receipts(agent_id, created_at);
