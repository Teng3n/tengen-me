import { checkAvailability } from "./detection";
import { stockMessage } from "./stock-message";
import { sendDelivery } from "./notifications";
import { deliverStock, reminderStub, startWatchdog } from "./reminders";
import { D1MonitorRepository, type MonitorRepository } from "./repository";
import {
  PRODUCT,
  type DeliveryResult,
  type DueDelivery,
  type Env,
  type MonitorState,
  type NotificationEvent,
  type StockResult,
} from "./types";

type FetchLike = typeof fetch;
type Detector = (fetcher?: FetchLike, now?: Date) => Promise<StockResult>;
type Sender = (delivery: DueDelivery, env: Env, fetcher?: FetchLike) => Promise<DeliveryResult>;

export interface ServiceDependencies {
  onObservation?: (result: StockResult, epoch: number) => Promise<void>;
  heartbeatAllowed?: boolean;
  pruneAllowed?: boolean;
  repository?: MonitorRepository;
  fetcher?: FetchLike;
  detector?: Detector;
  sender?: Sender;
  now?: () => Date;
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

export function formatLosAngeles(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "long",
  }).format(new Date(iso));
}

export function deliveryBackoffMs(attempt: number): number {
  return Math.min(120_000 * 2 ** Math.max(0, attempt - 1), 6 * 60 * 60 * 1_000);
}

function event(
  eventId: string,
  eventType: NotificationEvent["eventType"],
  title: string,
  body: string,
  createdAt: string,
  withProductUrl = true,
): NotificationEvent {
  return {
    eventId,
    eventType,
    title,
    body,
    url: withProductUrl ? PRODUCT.url : null,
    createdAt,
  };
}

function stockEvent(epoch: number, result: StockResult): NotificationEvent {
  const message = stockMessage(result);
  return event(
    `stock:${epoch}`,
    "stock",
    message.title,
    message.body,
    result.checkedAt,
  );
}

function healthEvent(streakId: string, count: number, result: StockResult): NotificationEvent {
  const reason = result.evidence.reasons.join("; ") || "unknown checking failure";
  return event(
    `health:${streakId}`,
    "health",
    `[MONITOR UNHEALTHY] Blizzard stock checks failing`,
    `The monitor has had incomplete or unknown checks ${count} consecutive times.\nLatest check: ${formatLosAngeles(result.checkedAt)} (America/Los_Angeles).\nReason: ${reason}\nA working source may still send possible-availability alerts, but full checking has not recovered.`,
    result.checkedAt,
    false,
  );
}

function recoveryEvent(streakId: string, result: StockResult): NotificationEvent {
  return event(
    `recovery:${streakId}`,
    "recovery",
    `[RECOVERED] Blizzard stock monitor`,
    `Fresh stock checks recovered at ${formatLosAngeles(result.checkedAt)} (America/Los_Angeles).\nCurrent alert-rule state: ${result.status}. Available means at least one positive signal, not a guaranteed purchase.`,
    result.checkedAt,
  );
}

export function planCheckTransition(
  state: MonitorState,
  result: StockResult,
  failureAlertAfter: number,
): { state: MonitorState; events: NotificationEvent[] } {
  const next: MonitorState = {
    ...state,
    lastStatus: result.status,
    lastCheckAt: result.checkedAt,
    updatedAt: result.checkedAt,
  };
  const events: NotificationEvent[] = [];

  if (result.status === "unknown" || result.evidence.checksHealthy === false) {
    next.consecutiveUnknown = state.consecutiveUnknown + 1;
    next.unknownStreakStartedAt = state.unknownStreakStartedAt ?? result.checkedAt;
    if (next.consecutiveUnknown >= failureAlertAfter && !state.failureAlertedFor) {
      next.failureAlertedFor = next.unknownStreakStartedAt;
      events.push(healthEvent(next.failureAlertedFor, next.consecutiveUnknown, result));
    }
  } else {
    if (state.failureAlertedFor) {
      events.push(recoveryEvent(state.failureAlertedFor, result));
    }
    next.consecutiveUnknown = 0;
    next.unknownStreakStartedAt = null;
    next.failureAlertedFor = null;
  }
  if (result.status === "unknown") return { state: next, events };
  next.lastDefinitiveStatus = result.status;
  next.lastDefinitiveAt = result.checkedAt;

  if (result.status === "available") {
    next.lastAvailableAt = result.checkedAt;
    if (state.lastDefinitiveStatus !== "available") {
      next.availabilityEpoch = state.availabilityEpoch + 1;
      events.push(stockEvent(next.availabilityEpoch, result));
    }
  }

  return { state: next, events };
}

async function processDeliveries(
  repository: MonitorRepository,
  env: Env,
  fetcher: FetchLike,
  sender: Sender,
  now: () => Date,
): Promise<{ sent: number; retrying: number; permanentFailures: number }> {
  const dueAt = now().toISOString();
  const due = await repository.listDueDeliveries(dueAt);
  const summary = { sent: 0, retrying: 0, permanentFailures: 0 };

  for (const delivery of due) {
    const claimedAt = now();
    const claimed = await repository.claimDelivery(
      delivery,
      claimedAt.toISOString(),
      new Date(claimedAt.getTime() + 60_000).toISOString(),
    );
    if (!claimed) continue;

    const result = delivery.eventType === "stock" && env.REMINDERS
      ? await deliverStock({ ...delivery, attempts: delivery.attempts + 1 }, env)
      : await sender({ ...delivery, attempts: delivery.attempts + 1 }, env, fetcher);
    const completedAt = now();
    if (result.ok) {
      await repository.markDeliverySent(
        delivery.eventId,
        delivery.channel,
        result.providerId,
        completedAt.toISOString(),
      );
      summary.sent += 1;
      console.log(JSON.stringify({
        event: "notification_sent",
        eventId: delivery.eventId,
        channel: delivery.channel,
        attempt: delivery.attempts + 1,
      }));
      continue;
    }

    const error = result.error ?? "provider failure";
    const nextAttemptAt = result.retryable
      ? new Date(completedAt.getTime() + Math.max(
        deliveryBackoffMs(delivery.attempts + 1), result.retryAfterMs ?? 0,
      )).toISOString()
      : null;
    await repository.markDeliveryFailed(
      delivery.eventId,
      delivery.channel,
      error,
      completedAt.toISOString(),
      nextAttemptAt,
    );
    if (result.retryable) summary.retrying += 1;
    else summary.permanentFailures += 1;
    console.error(JSON.stringify({
      event: "notification_failed",
      eventId: delivery.eventId,
      channel: delivery.channel,
      retryable: result.retryable,
      error,
    }));
  }

  return summary;
}

async function pingHealthchecks(env: Env, fetcher: FetchLike, suffix = ""): Promise<void> {
  if (!env.HEALTHCHECKS_URL) return;
  const url = `${env.HEALTHCHECKS_URL.replace(/\/$/, "")}${suffix}`;
  try {
    const response = await fetcher(url, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(5_000) });
    // Healthchecks also returns HTTP 200 for unknown UUIDs and rate-limited pings.
    // Never log the secret URL, raw response body, or provider error details.
    const accepted = response.ok && (await response.text()).trim() === "OK";
    if (!accepted) {
      console.error(JSON.stringify({
        event: "healthchecks_ping_failed",
        suffix: suffix || "success",
        httpStatus: response.status,
      }));
    } else {
      console.log(JSON.stringify({ event: "healthchecks_ping_accepted", suffix: suffix || "success" }));
    }
  } catch {
    console.error(JSON.stringify({ event: "healthchecks_ping_failed", suffix: suffix || "success" }));
  }
}

export async function runMonitor(env: Env, dependencies: ServiceDependencies = {}): Promise<Record<string, unknown>> {
  const repository = dependencies.repository ?? new D1MonitorRepository(env.DB);
  const fetcher = dependencies.fetcher ?? fetch;
  const detector = dependencies.detector ?? checkAvailability;
  const sender = dependencies.sender ?? sendDelivery;
  const now = dependencies.now ?? (() => new Date());
  const state = await repository.getState();

  if (state.paused) {
    await dependencies.onObservation?.({ status: "unknown", checkedAt: now().toISOString(),
      evidence: { reasons: ["Monitor paused"], checksHealthy: false,
        productFeed: { url: PRODUCT.url, attempts: 0, elapsedMs: 0 },
        productPage: { url: PRODUCT.url, attempts: 0, elapsedMs: 0 } } }, state.availabilityEpoch).catch(() => {});
    console.log(JSON.stringify({ event: "check_skipped", reason: "paused" }));
    return { status: "paused" };
  }

  const result = await detector(fetcher, now());
  await repository.recordCheck(result);
  const failureAlertAfter = boundedInteger(env.FAILURE_ALERT_AFTER, 5, 2, 100);
  const transition = planCheckTransition(state, result, failureAlertAfter);
  for (const notification of transition.events) {
    await repository.enqueueEvent(notification);
  }
  await repository.saveState(transition.state);

  // Publish immediately after committing evidence, BEFORE Telegram/network delivery.
  // A receiver outage must never prevent ordinary notifications or health checks.
  try { await dependencies.onObservation?.(result, transition.state.availabilityEpoch); }
  catch { console.error(JSON.stringify({ event: "helper_publish_failed" })); }

  const retentionDays = boundedInteger(env.CHECK_LOG_RETENTION_DAYS, 30, 1, 365);
  if (dependencies.pruneAllowed ?? now().getUTCMinutes() < 2) {
    await repository.pruneChecks(
      new Date(now().getTime() - retentionDays * 86_400_000).toISOString(),
    );
  }

  const delivery = await processDeliveries(repository, env, fetcher, sender, now);
  if (result.status !== "unknown" && result.evidence.checksHealthy !== false
    && dependencies.heartbeatAllowed !== false) await pingHealthchecks(env, fetcher);
  console.log(JSON.stringify({
    event: "stock_check",
    checkedAt: result.checkedAt,
    status: result.status,
    inventoryAvailable: result.evidence.inventoryAvailable,
    buttonState: result.evidence.button?.state,
    reasons: result.evidence.reasons,
    delivery,
  }));
  return { status: result.status, checkedAt: result.checkedAt, evidence: result.evidence, delivery };
}

export async function retryNotifications(
  env: Env,
  dependencies: ServiceDependencies = {},
): Promise<Record<string, unknown>> {
  const repository = dependencies.repository ?? new D1MonitorRepository(env.DB);
  return processDeliveries(
    repository, env, dependencies.fetcher ?? fetch,
    dependencies.sender ?? sendDelivery, dependencies.now ?? (() => new Date()),
  );
}

export async function queueTestNotifications(
  env: Env,
  dependencies: ServiceDependencies = {},
): Promise<Record<string, unknown>> {
  const repository = dependencies.repository ?? new D1MonitorRepository(env.DB);
  const fetcher = dependencies.fetcher ?? fetch;
  const sender = dependencies.sender ?? sendDelivery;
  const now = dependencies.now ?? (() => new Date());
  const createdAt = now().toISOString();
  const eventId = `test:${crypto.randomUUID()}`;
  await repository.enqueueEvent(event(
    eventId,
    "test",
    `[TEST] Blizzard stock monitor notification`,
    `[TEST ONLY — no stock change]\nYour Telegram notification is being verified.\nSent at ${formatLosAngeles(createdAt)} (America/Los_Angeles).`,
    createdAt,
  ));
  const delivery = await processDeliveries(repository, env, fetcher, sender, now);
  return { eventId, delivery };
}

export async function setPaused(
  env: Env,
  paused: boolean,
  dependencies: ServiceDependencies = {},
): Promise<void> {
  const repository = dependencies.repository ?? new D1MonitorRepository(env.DB);
  await repository.setPaused(paused, new Date().toISOString());
  if (paused && env.CHECKER) await env.CHECKER.get(env.CHECKER.idFromName("blizzard-availability-checker"))
    .fetch("https://checker/helper-clear", { method: "POST" });
  if (paused) await reminderStub(env)?.fetch("https://reminders/cancel", { method: "POST" });
  else await startWatchdog(env);
  // The Pinging API has no /pause route. Pause/resume the external watchdog
  // separately in its dashboard; do not forge healthy pings while paused.
}

export async function signalFatalFailure(env: Env, fetcher: FetchLike = fetch): Promise<void> {
  await pingHealthchecks(env, fetcher, "/fail");
}
