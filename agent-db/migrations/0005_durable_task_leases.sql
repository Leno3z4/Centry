-- Durable task leases and retry metadata for the agent queue.
-- Tasks move pending -> processing -> completed/failed.
-- A processing task whose lease expires can be reclaimed safely.

ALTER TABLE centry_agent_tasks ADD COLUMN lease_id TEXT;
ALTER TABLE centry_agent_tasks ADD COLUMN lease_until INTEGER;
ALTER TABLE centry_agent_tasks ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE centry_agent_tasks ADD COLUMN last_error TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_centry_agent_tasks_lease
  ON centry_agent_tasks(to_agent_id, status, lease_until, created_at);
