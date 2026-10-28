CREATE TABLE IF NOT EXISTS server_hosts (
  host_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  agent_version TEXT NOT NULL,
  last_report_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_server_registry (
  slug TEXT PRIMARY KEY,
  host_id TEXT NOT NULL,
  name TEXT NOT NULL,
  game TEXT NOT NULL,
  steam_app_id TEXT,
  region TEXT NOT NULL,
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('active', 'inactive', 'retired')),
  status TEXT NOT NULL CHECK (status IN ('online', 'offline')),
  is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
  current_players INTEGER,
  maximum_players INTEGER,
  player_names_json TEXT NOT NULL DEFAULT '[]',
  observed_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  absent_since TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (host_id) REFERENCES server_hosts(host_id)
);

CREATE INDEX IF NOT EXISTS idx_game_server_registry_current
  ON game_server_registry (lifecycle, is_current DESC, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_server_registry_host
  ON game_server_registry (host_id, lifecycle, last_seen_at DESC);
