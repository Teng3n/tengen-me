export interface D1RunResult {
  success: boolean;
  meta?: { changes?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }>;
  run(): Promise<D1RunResult>;
}

export interface OwnerDatabase {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1RunResult[]>;
}

export type StatusHistoryInput = {
  serverSlug: string;
  status: "online" | "offline";
  currentPlayers: number;
  maximumPlayers: number;
  observedAt: string;
  receivedAt: string;
};

type LatestHistoryRow = {
  status: "online" | "offline";
  current_players: number;
  maximum_players: number;
  received_at: string;
};

const HISTORY_HEARTBEAT_MS = 10 * 60 * 1000;

export async function recordStatusHistory(db: OwnerDatabase | undefined, snapshot: StatusHistoryInput) {
  if (!db) return;
  const latest = await db.prepare(
    `SELECT status, current_players, maximum_players, received_at
     FROM server_status_history
     WHERE server_slug = ?
     ORDER BY received_at DESC
     LIMIT 1`,
  ).bind(snapshot.serverSlug).first<LatestHistoryRow>();

  const stateChanged = !latest
    || latest.status !== snapshot.status
    || latest.current_players !== snapshot.currentPlayers
    || latest.maximum_players !== snapshot.maximumPlayers;
  const heartbeatDue = !latest
    || Date.parse(snapshot.receivedAt) - Date.parse(latest.received_at) >= HISTORY_HEARTBEAT_MS;

  if (!stateChanged && !heartbeatDue) return;

  await db.batch([
    db.prepare(
      `INSERT INTO server_status_history
       (server_slug, status, current_players, maximum_players, observed_at, received_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      snapshot.serverSlug,
      snapshot.status,
      snapshot.currentPlayers,
      snapshot.maximumPlayers,
      snapshot.observedAt,
      snapshot.receivedAt,
    ),
    db.prepare("DELETE FROM server_status_history WHERE datetime(received_at) < datetime('now', '-30 days')"),
    db.prepare("DELETE FROM owner_audit_log WHERE created_at < datetime('now', '-90 days')"),
    db.prepare("UPDATE owner_actions SET status = 'expired', completed_at = CURRENT_TIMESTAMP, result = 'Host did not collect the action in time' WHERE status = 'queued' AND requested_at < datetime('now', '-10 minutes')"),
  ]);
}

export async function writeAudit(
  db: OwnerDatabase,
  actor: string,
  eventType: string,
  target: string,
  outcome: string,
  detail: string,
) {
  await db.prepare(
    `INSERT INTO owner_audit_log (actor, event_type, target, outcome, detail, created_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
  ).bind(actor, eventType, target, outcome, detail.slice(0, 300)).run();
}
