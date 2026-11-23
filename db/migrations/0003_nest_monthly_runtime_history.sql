-- Schema only. Private household runtime records are loaded directly into the
-- owner database and are intentionally not stored in this public repository.

CREATE TABLE IF NOT EXISTS nest_monthly_runtime_history (
  month TEXT PRIMARY KEY CHECK (length(month) = 7),
  heating_runtime_hours REAL NOT NULL DEFAULT 0 CHECK (heating_runtime_hours >= 0),
  cooling_runtime_hours REAL NOT NULL DEFAULT 0 CHECK (cooling_runtime_hours >= 0),
  source TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
