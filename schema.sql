-- D1 schema for A-share alert app (MVP)

CREATE TABLE IF NOT EXISTS stock_list_cache (
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  exchange TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  formula TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  rule_id TEXT,
  code TEXT NOT NULL,
  exchange TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  trigger_date TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rules_enabled ON rules(enabled);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);
