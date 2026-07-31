CREATE TABLE IF NOT EXISTS server_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_slug TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('online', 'offline')),
  current_players INTEGER NOT NULL,
  maximum_players INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_server_status_history_received
  ON server_status_history (server_slug, received_at DESC);

CREATE TABLE IF NOT EXISTS owner_checklist (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  position INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS owner_actions (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('refresh-status', 'save-world')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'expired')),
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  result TEXT
);

CREATE INDEX IF NOT EXISTS idx_owner_actions_status_requested
  ON owner_actions (status, requested_at);

CREATE TABLE IF NOT EXISTS owner_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  event_type TEXT NOT NULL,
  target TEXT NOT NULL,
  outcome TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_owner_audit_created
  ON owner_audit_log (created_at DESC);

CREATE TABLE IF NOT EXISTS owner_network_access (
  id TEXT PRIMARY KEY,
  ipv4_cidr TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

INSERT OR IGNORE INTO owner_checklist (id, title, detail, completed, position, updated_at) VALUES
  ('access-policy', 'Lock owner access to the home network', 'The Worker must require the approved home public IPv4 address for every owner route.', 0, 10, CURRENT_TIMESTAMP),
  ('dashboard-deployed', 'Deploy the owner dashboard', 'Publish the private dashboard, database, and token validation.', 0, 20, CURRENT_TIMESTAMP),
  ('dynamic-ip-updater', 'Install the dynamic home-IP updater', 'Run the token-protected heartbeat on the rebuilt Pi so ISP address changes do not cause a lockout.', 0, 25, CURRENT_TIMESTAMP),
  ('bridge-updated', 'Install the updated Palworld bridge', 'Copy the action-aware bridge to the Palworld host and confirm its scheduled task.', 0, 30, CURRENT_TIMESTAMP),
  ('bridge-reboot', 'Verify the bridge after a reboot', 'Confirm status resumes without manual intervention after the host restarts.', 0, 40, CURRENT_TIMESTAMP),
  ('tailscale-pihole', 'Plan Pi-hole remote DNS', 'Decide whether Tailscale should expose Pi-hole DNS to the phone and provide a stable remote path.', 0, 50, CURRENT_TIMESTAMP),
  ('ipv6-review', 'Recheck IPv6 when the network changes', 'Extend the network gate only if the ISP later provides a stable usable IPv6 prefix.', 0, 60, CURRENT_TIMESTAMP);

UPDATE owner_checklist
SET title = 'Lock owner access to the home network',
    detail = 'The Worker must require the approved home public IPv4 address for every owner route.',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'access-policy';

UPDATE owner_checklist
SET detail = 'Run the token-protected heartbeat on the rebuilt Pi so ISP address changes do not cause a lockout.',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'dynamic-ip-updater';

UPDATE owner_checklist
SET detail = 'Extend the network gate only if the ISP later provides a stable usable IPv6 prefix.',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'ipv6-review';
