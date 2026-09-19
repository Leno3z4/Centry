CREATE TABLE IF NOT EXISTS centry_agent_tasks (
  id TEXT PRIMARY KEY,
  from_agent_id TEXT,
  to_agent_id TEXT NOT NULL,
  task TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_centry_agent_tasks_target_status
  ON centry_agent_tasks(to_agent_id, status, created_at);

CREATE TABLE IF NOT EXISTS centry_agent_runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  cycle_key TEXT NOT NULL,
  status TEXT NOT NULL,
  task_count INTEGER NOT NULL DEFAULT 0,
  action_count INTEGER NOT NULL DEFAULT 0,
  tx_hash TEXT,
  reason TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_centry_agent_runs_agent_started
  ON centry_agent_runs(agent_id, started_at);

CREATE TABLE IF NOT EXISTS centry_agent_locks (
  agent_id TEXT PRIMARY KEY,
  locked_until INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
