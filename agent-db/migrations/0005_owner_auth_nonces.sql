CREATE TABLE IF NOT EXISTS centry_owner_auth_nonces (
  nonce TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  account TEXT NOT NULL,
  action TEXT NOT NULL,
  params_hash TEXT NOT NULL,
  consumed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_centry_owner_auth_nonces_consumed
  ON centry_owner_auth_nonces(consumed_at);
