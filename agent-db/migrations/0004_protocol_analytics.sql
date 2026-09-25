CREATE TABLE IF NOT EXISTS centry_analytics_indexer_state (
  id TEXT PRIMARY KEY,
  cursor_block INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS centry_protocol_events (
  id TEXT PRIMARY KEY,
  block_number INTEGER NOT NULL,
  block_hash TEXT,
  transaction_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  event_name TEXT NOT NULL,
  asset TEXT,
  asset2 TEXT,
  actor TEXT,
  amount_raw TEXT,
  amount2_raw TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_centry_protocol_events_tx_log
  ON centry_protocol_events(transaction_hash, log_index);

CREATE INDEX IF NOT EXISTS idx_centry_protocol_events_timestamp
  ON centry_protocol_events(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_centry_protocol_events_name_timestamp
  ON centry_protocol_events(event_name, timestamp DESC);

CREATE TABLE IF NOT EXISTS centry_protocol_hourly (
  bucket_start INTEGER NOT NULL,
  asset TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decimals INTEGER NOT NULL,
  supply_raw TEXT NOT NULL DEFAULT '0',
  borrow_raw TEXT NOT NULL DEFAULT '0',
  cash_raw TEXT NOT NULL DEFAULT '0',
  price_e18 TEXT NOT NULL DEFAULT '0',
  utilization_e18 TEXT NOT NULL DEFAULT '0',
  borrow_rate_e18 TEXT NOT NULL DEFAULT '0',
  supply_rate_e18 TEXT NOT NULL DEFAULT '0',
  supply_usd_e18 TEXT NOT NULL DEFAULT '0',
  borrow_usd_e18 TEXT NOT NULL DEFAULT '0',
  cash_usd_e18 TEXT NOT NULL DEFAULT '0',
  ltv_bps INTEGER NOT NULL DEFAULT 0,
  liquidation_threshold_bps INTEGER NOT NULL DEFAULT 0,
  liquidation_bonus_bps INTEGER NOT NULL DEFAULT 0,
  reserve_factor_bps INTEGER NOT NULL DEFAULT 0,
  supply_cap_raw TEXT NOT NULL DEFAULT '0',
  borrow_cap_raw TEXT NOT NULL DEFAULT '0',
  captured_at TEXT NOT NULL,
  PRIMARY KEY (bucket_start, asset)
);

CREATE INDEX IF NOT EXISTS idx_centry_protocol_hourly_bucket
  ON centry_protocol_hourly(bucket_start DESC);

CREATE INDEX IF NOT EXISTS idx_centry_protocol_hourly_asset_bucket
  ON centry_protocol_hourly(asset, bucket_start DESC);
