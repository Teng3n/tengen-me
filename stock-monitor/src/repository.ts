import type {
  DeliveryChannel,
  DueDelivery,
  MonitorState,
  NotificationEvent,
  StockResult,
} from "./types";

export interface MonitorRepository {
  getState(): Promise<MonitorState>;
  saveState(state: MonitorState): Promise<void>;
  setPaused(paused: boolean, now: string): Promise<void>;
  recordCheck(result: StockResult): Promise<void>;
  pruneChecks(olderThan: string): Promise<void>;
  enqueueEvent(event: NotificationEvent): Promise<void>;
  listDueDeliveries(now: string, limit?: number): Promise<DueDelivery[]>;
  claimDelivery(delivery: DueDelivery, now: string, leaseUntil: string): Promise<boolean>;
  markDeliverySent(
    eventId: string,
    channel: DeliveryChannel,
    providerId: string | undefined,
    now: string,
  ): Promise<void>;
  markDeliveryFailed(
    eventId: string,
    channel: DeliveryChannel,
    error: string,
    now: string,
    nextAttemptAt: string | null,
  ): Promise<void>;
  getHealthSnapshot(): Promise<Record<string, unknown>>;
  listChecks(limit: number): Promise<Record<string, unknown>[]>;
}

interface StateRow {
  paused: number;
  last_status: MonitorState["lastStatus"];
  last_definitive_status: MonitorState["lastDefinitiveStatus"];
  availability_epoch: number;
  last_check_at: string | null;
  last_definitive_at: string | null;
  last_available_at: string | null;
  consecutive_unknown: number;
  unknown_streak_started_at: string | null;
  failure_alerted_for: string | null;
  updated_at: string;
}

function toState(row: StateRow): MonitorState {
  return {
    paused: row.paused === 1,
    lastStatus: row.last_status,
    lastDefinitiveStatus: row.last_definitive_status,
    availabilityEpoch: row.availability_epoch,
    lastCheckAt: row.last_check_at,
    lastDefinitiveAt: row.last_definitive_at,
    lastAvailableAt: row.last_available_at,
    consecutiveUnknown: row.consecutive_unknown,
    unknownStreakStartedAt: row.unknown_streak_started_at,
    failureAlertedFor: row.failure_alerted_for,
    updatedAt: row.updated_at,
  };
}

export class D1MonitorRepository implements MonitorRepository {
  constructor(private readonly db: D1Database) {}

  async getState(): Promise<MonitorState> {
    const now = new Date().toISOString();
    await this.db.prepare(
      "INSERT OR IGNORE INTO monitor_state (id, updated_at) VALUES (1, ?)",
    ).bind(now).run();
    const row = await this.db.prepare(
      "SELECT * FROM monitor_state WHERE id = 1",
    ).first<StateRow>();
    if (!row) throw new Error("monitor state row is missing");
    return toState(row);
  }

  async saveState(state: MonitorState): Promise<void> {
    await this.db.prepare(`
      UPDATE monitor_state SET
        paused = ?, last_status = ?, last_definitive_status = ?, availability_epoch = ?,
        last_check_at = ?, last_definitive_at = ?, last_available_at = ?,
        consecutive_unknown = ?, unknown_streak_started_at = ?, failure_alerted_for = ?,
        updated_at = ?
      WHERE id = 1
    `).bind(
      state.paused ? 1 : 0,
      state.lastStatus,
      state.lastDefinitiveStatus,
      state.availabilityEpoch,
      state.lastCheckAt,
      state.lastDefinitiveAt,
      state.lastAvailableAt,
      state.consecutiveUnknown,
      state.unknownStreakStartedAt,
      state.failureAlertedFor,
      state.updatedAt,
    ).run();
  }

  async setPaused(paused: boolean, now: string): Promise<void> {
    await this.getState();
    await this.db.prepare(
      "UPDATE monitor_state SET paused = ?, updated_at = ? WHERE id = 1",
    ).bind(paused ? 1 : 0, now).run();
  }

  async recordCheck(result: StockResult): Promise<void> {
    const errorSummary = result.evidence.reasons.length > 0
      ? result.evidence.reasons.join("; ").slice(0, 1_000)
      : null;
    await this.db.prepare(`
      INSERT INTO check_log (checked_at, status, evidence_json, error_summary)
      VALUES (?, ?, ?, ?)
    `).bind(
      result.checkedAt,
      result.status,
      JSON.stringify(result.evidence),
      errorSummary,
    ).run();
  }

  async pruneChecks(olderThan: string): Promise<void> {
    await this.db.prepare("DELETE FROM check_log WHERE checked_at < ?").bind(olderThan).run();
  }

  async enqueueEvent(event: NotificationEvent): Promise<void> {
    await this.db.batch([
      this.db.prepare(`
        INSERT OR IGNORE INTO notification_events
          (event_id, event_type, title, body, url, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(event.eventId, event.eventType, event.title, event.body, event.url, event.createdAt),
      ...(["push"] as const).map((channel) => this.db.prepare(`
        INSERT OR IGNORE INTO notification_deliveries
          (event_id, channel, status, attempts, next_attempt_at, updated_at)
        VALUES (?, ?, 'pending', 0, ?, ?)
      `).bind(event.eventId, channel, event.createdAt, event.createdAt)),
    ]);
  }

  async listDueDeliveries(now: string, limit = 20): Promise<DueDelivery[]> {
    const result = await this.db.prepare(`
      SELECT e.event_id, e.event_type, e.title, e.body, e.url, e.created_at,
             d.channel, d.attempts
      FROM notification_deliveries d
      JOIN notification_events e ON e.event_id = d.event_id
      WHERE d.channel = 'push' AND (
        (d.status IN ('pending', 'retry') AND d.next_attempt_at <= ?)
        OR (d.status = 'sending' AND d.lease_until <= ?)
      )
      ORDER BY d.next_attempt_at ASC
      LIMIT ?
    `).bind(now, now, limit).all<Record<string, unknown>>();

    return result.results.map((row) => ({
      eventId: String(row.event_id),
      eventType: row.event_type as DueDelivery["eventType"],
      title: String(row.title),
      body: String(row.body),
      url: row.url === null ? null : String(row.url),
      createdAt: String(row.created_at),
      channel: row.channel as DeliveryChannel,
      attempts: Number(row.attempts),
    }));
  }

  async claimDelivery(delivery: DueDelivery, now: string, leaseUntil: string): Promise<boolean> {
    const result = await this.db.prepare(`
      UPDATE notification_deliveries
      SET status = 'sending', attempts = attempts + 1, lease_until = ?, updated_at = ?
      WHERE event_id = ? AND channel = ? AND (
        (status IN ('pending', 'retry') AND next_attempt_at <= ?)
        OR (status = 'sending' AND lease_until <= ?)
      )
    `).bind(
      leaseUntil,
      now,
      delivery.eventId,
      delivery.channel,
      now,
      now,
    ).run();
    return (result.meta.changes ?? 0) === 1;
  }

  async markDeliverySent(
    eventId: string,
    channel: DeliveryChannel,
    providerId: string | undefined,
    now: string,
  ): Promise<void> {
    await this.db.prepare(`
      UPDATE notification_deliveries
      SET status = 'sent', provider_id = ?, last_error = NULL, sent_at = ?,
          lease_until = NULL, updated_at = ?
      WHERE event_id = ? AND channel = ?
    `).bind(providerId ?? null, now, now, eventId, channel).run();
  }

  async markDeliveryFailed(
    eventId: string,
    channel: DeliveryChannel,
    error: string,
    now: string,
    nextAttemptAt: string | null,
  ): Promise<void> {
    await this.db.prepare(`
      UPDATE notification_deliveries
      SET status = ?, next_attempt_at = COALESCE(?, next_attempt_at), last_error = ?,
          lease_until = NULL, updated_at = ?
      WHERE event_id = ? AND channel = ?
    `).bind(
      nextAttemptAt ? "retry" : "permanent_failure",
      nextAttemptAt,
      error.slice(0, 500),
      now,
      eventId,
      channel,
    ).run();
  }

  async getHealthSnapshot(): Promise<Record<string, unknown>> {
    const state = await this.getState();
    const deliveries = await this.db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'retry' THEN 1 ELSE 0 END), 0) AS retrying,
        COALESCE(SUM(CASE WHEN status = 'permanent_failure' THEN 1 ELSE 0 END), 0) AS permanent_failures,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
        MAX(CASE WHEN status = 'sent' THEN sent_at ELSE NULL END) AS last_delivery_at
      FROM notification_deliveries WHERE channel = 'push'
    `).first<Record<string, unknown>>();
    return { state, deliveries: deliveries ?? {} };
  }

  async listChecks(limit: number): Promise<Record<string, unknown>[]> {
    const result = await this.db.prepare(`
      SELECT id, checked_at, status, evidence_json, error_summary
      FROM check_log ORDER BY id DESC LIMIT ?
    `).bind(limit).all<Record<string, unknown>>();
    return result.results.map((row) => ({
      id: row.id,
      checkedAt: row.checked_at,
      status: row.status,
      evidence: JSON.parse(String(row.evidence_json)),
      errorSummary: row.error_summary,
    }));
  }

  async getCheckAt(checkedAt: string): Promise<StockResult | null> {
    // Read the exact committed-state observation, not an in-flight newer log row.
    const row = await this.db.prepare(`
      SELECT checked_at, status, evidence_json FROM check_log
      WHERE checked_at = ? ORDER BY id DESC LIMIT 1
    `).bind(checkedAt).first<{ checked_at: string; status: StockResult["status"]; evidence_json: string }>();
    return row ? { checkedAt: row.checked_at, status: row.status, evidence: JSON.parse(row.evidence_json) } : null;
  }
}
