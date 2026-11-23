CREATE TABLE IF NOT EXISTS monitor_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  paused INTEGER NOT NULL DEFAULT 1,
  last_status TEXT,
  last_definitive_status TEXT,
  availability_epoch INTEGER NOT NULL DEFAULT 0,
  last_check_at TEXT,
  last_definitive_at TEXT,
  last_available_at TEXT,
  consecutive_unknown INTEGER NOT NULL DEFAULT 0,
  unknown_streak_started_at TEXT,
  failure_alerted_for TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO monitor_state (id, paused, updated_at)
VALUES (1, 1, '1970-01-01T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS check_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checked_at TEXT NOT NULL,
  status TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  error_summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_check_log_checked_at
ON check_log (checked_at);

CREATE TABLE IF NOT EXISTS notification_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  event_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'push')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'retry', 'sent', 'permanent_failure')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  lease_until TEXT,
  provider_id TEXT,
  last_error TEXT,
  sent_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (event_id, channel),
  FOREIGN KEY (event_id) REFERENCES notification_events(event_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_due
ON notification_deliveries (status, next_attempt_at);
