import { sendDelivery } from "./notifications";
import { D1MonitorRepository } from "./repository";
import { stockMessage } from "./stock-message";
import { PRODUCT, type DeliveryResult, type DueDelivery, type Env } from "./types";

export const REMINDER_INTERVAL_MS = 5_000;
const MAX_EVIDENCE_AGE_MS = 180_000;
interface Cycle {
  delivery: DueDelivery;
  acknowledged: boolean;
  finished: boolean;
  providerId?: string;
  failures: number;
  nextAt: number;
  sentCount: number;
}
interface TelegramUpdate {
  update_id?: number;
  message?: {
    text?: string; date?: number; from?: { id?: number };
    chat?: { id?: number; type?: string };
  };
  callback_query?: {
    id?: string; data?: string; from?: { id?: number };
    message?: { chat?: { id?: number; type?: string } };
  };
}

export function isStop(update: TelegramUpdate, chatId: string, cycle: Cycle): boolean {
  const callback = update.callback_query;
  if (callback) return String(callback.from?.id) === chatId &&
    String(callback.message?.chat?.id) === chatId && callback.message?.chat?.type === "private" &&
    callback.data === `stop:${cycle.delivery.eventId}`;
  const message = update.message;
  return !!message && String(message.from?.id) === chatId &&
    String(message.chat?.id) === chatId && message.chat?.type === "private" &&
    typeof message.date === "number" &&
    message.date >= Math.floor(Date.parse(cycle.delivery.createdAt) / 1_000) &&
    /^(?:\/stop(?:@[a-z0-9_]+)?|stop|stop it)[.!\s]*$/i.test(message.text?.trim() ?? "");
}

export function reminderStub(env: Env, test = false): DurableObjectStub | undefined {
  return env.REMINDERS?.get(env.REMINDERS.idFromName(test ? "blizzard-test-reminders" : "blizzard-stock-reminders"));
}

export async function startWatchdog(env: Env): Promise<void> {
  const stub = env.REMINDERS?.get(env.REMINDERS.idFromName("blizzard-check-watchdog"));
  if (stub) await stub.fetch("https://reminders/watchdog-start", { method: "POST" });
}

export async function deliverStock(delivery: DueDelivery, env: Env): Promise<DeliveryResult> {
  const stub = reminderStub(env);
  if (!stub) return { ok: false, retryable: true, error: "Reminder binding missing" };
  try {
    const response = await stub.fetch("https://reminders/deliver", {
      method: "POST", body: JSON.stringify(delivery),
    });
    if (!response.ok) return { ok: false, retryable: true, error: "Reminder coordinator failure" };
    return await response.json<DeliveryResult>();
  } catch {
    return { ok: false, retryable: true, error: "Reminder coordinator unavailable" };
  }
}

// One SQLite-backed object serializes first delivery, repeats, and acknowledgements.
// No long-lived process or Windows PC is needed after hosted deployment.
export class StockReminders implements DurableObject {
  constructor(private readonly ctx: DurableObjectState, private readonly env: Env) {}

  private async currentDelivery(cycle: Cycle, reminder: boolean): Promise<DueDelivery | null> {
    if (cycle.delivery.eventType === "test") return cycle.delivery;
    const repository = new D1MonitorRepository(this.env.DB);
    const state = await repository.getState();
    const age = Date.now() - Date.parse(state.lastCheckAt ?? "");
    if (state.paused || state.lastStatus !== "available" ||
      `stock:${state.availabilityEpoch}` !== cycle.delivery.eventId ||
      !Number.isFinite(age) || age < 0 || age > MAX_EVIDENCE_AGE_MS) return null;
    const latest = await repository.getCheckAt(state.lastCheckAt!);
    if (!latest || latest.status !== "available") return null;
    return { ...cycle.delivery, ...stockMessage(latest, reminder) };
  }

  private async eligible(cycle: Cycle): Promise<"yes" | "wait" | "finished"> {
    const state = await new D1MonitorRepository(this.env.DB).getState();
    if (cycle.delivery.eventType === "test") {
      return state.paused && Date.now() - Date.parse(cycle.delivery.createdAt) < 180_000 ? "yes" : "finished";
    }
    if (state.paused || `stock:${state.availabilityEpoch}` !== cycle.delivery.eventId ||
      state.lastDefinitiveStatus === "unavailable") return "finished";
    const checkedAt = Date.parse(state.lastCheckAt ?? "");
    const age = Date.now() - checkedAt;
    return state.lastStatus === "available" && Number.isFinite(age) && age >= 0 &&
      age <= MAX_EVIDENCE_AGE_MS ? "yes" : "wait";
  }

  async fetch(request: Request): Promise<Response> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const path = new URL(request.url).pathname;
      if (path === "/watchdog-start") {
        await this.ctx.storage.put("watchdog", true);
        if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + 120_000);
        return Response.json({ started: true });
      }
      let cycle = await this.ctx.storage.get<Cycle>("cycle");
      if (path === "/state") return Response.json(cycle ? {
        intervalMs: REMINDER_INTERVAL_MS,
        eventId: cycle.delivery.eventId, acknowledged: cycle.acknowledged,
        finished: cycle.finished, sentCount: cycle.sentCount, failures: cycle.failures,
        nextAt: cycle.nextAt,
      } : { active: false, intervalMs: REMINDER_INTERVAL_MS });
      if (path === "/cancel") {
        if (cycle) { cycle.finished = true; await this.ctx.storage.put("cycle", cycle); }
        await this.ctx.storage.deleteAlarm();
        return Response.json({ stopped: true });
      }
      if (path === "/update") {
        const update = await request.json<TelegramUpdate>();
        if (!cycle || !isStop(update, this.env.TELEGRAM_CHAT_ID ?? "", cycle)) {
          return Response.json({ ok: true });
        }
        const alreadyStopped = cycle.acknowledged;
        cycle.acknowledged = true;
        await this.ctx.storage.put("cycle", cycle);
        await this.ctx.storage.deleteAlarm();
        console.log(JSON.stringify({ event: "reminders_acknowledged", eventId: cycle.delivery.eventId }));
        if (update.callback_query?.id) return Response.json({
          method: "answerCallbackQuery", callback_query_id: update.callback_query.id,
          text: cycle.delivery.eventType === "test" ? "Test alerts stopped." : "Alerts stopped for this restock.",
        });
        if (!alreadyStopped) return Response.json({
          method: "sendMessage", chat_id: this.env.TELEGRAM_CHAT_ID,
          text: cycle.delivery.eventType === "test" ? "Test alerts stopped. No stock change." : "Alerts stopped for this restock. A later verified restock can alert again.",
          disable_notification: true,
        });
        return Response.json({ ok: true });
      }
      if (path !== "/deliver" && path !== "/test") return new Response("Not found", { status: 404 });
      const delivery: DueDelivery = path === "/test" ? {
        eventId: `test-repeat:${crypto.randomUUID()}`, eventType: "test", channel: "push", attempts: 1,
        title: "[TEST] Repeating Telegram alert — no stock change",
        body: "[TEST ONLY] This will repeat about every 5 seconds. Reply stop or tap Stop test alerts. Automatically ends after 3 minutes.",
        url: PRODUCT.url, createdAt: new Date().toISOString(),
      } : await request.json<DueDelivery>();
      if (path !== "/test" && (delivery.eventType !== "stock" || !/^stock:\d+$/.test(delivery.eventId))) {
        return new Response("Invalid stock event", { status: 400 });
      }
      if (!cycle || cycle.delivery.eventId !== delivery.eventId) {
        const candidate: Cycle = { delivery, acknowledged: false, finished: false,
          failures: 0, sentCount: 0, nextAt: 0 };
        // Do not let a stale queued event replace a newer acknowledged cycle.
        if (await this.eligible(candidate) === "finished") return Response.json({
          ok: false, retryable: false, error: "Stock event no longer eligible",
        });
        cycle = candidate;
        await this.ctx.storage.put("cycle", cycle);
      }
      if (cycle.acknowledged) return Response.json({ ok: true, retryable: false, providerId: "acknowledged" });
      if (cycle.providerId) {
        if (!cycle.finished && await this.ctx.storage.getAlarm() === null) {
          await this.ctx.storage.setAlarm(Math.max(Date.now() + REMINDER_INTERVAL_MS, cycle.nextAt));
        }
        return Response.json({ ok: true, retryable: false, providerId: cycle.providerId });
      }
      const eligible = await this.eligible(cycle);
      if (eligible !== "yes") return Response.json({ ok: false, retryable: eligible === "wait",
        error: eligible === "wait" ? "Fresh verified availability required" : "Stock event no longer eligible" });
      // Refuse to start persistent reminders until the stop webhook is configured.
      if (!this.env.TELEGRAM_WEBHOOK_SECRET) return Response.json({
        ok: false, retryable: true, error: "Telegram stop webhook secret missing",
      });
      const current = await this.currentDelivery(cycle, false);
      if (!current) return Response.json({ ok: false, retryable: true, error: "Fresh availability evidence required" });
      const result = await sendDelivery(current, this.env);
      if (result.ok) {
        if (result.providerId) cycle.providerId = result.providerId;
        cycle.sentCount = 1;
        cycle.nextAt = Date.now() + REMINDER_INTERVAL_MS;
        await this.ctx.storage.put("cycle", cycle);
        await this.ctx.storage.setAlarm(cycle.nextAt);
      }
      return Response.json(result);
    });
  }

  async alarm(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (await this.ctx.storage.get<boolean>("watchdog")) {
        await this.watchdogTick();
        return;
      }
      const cycle = await this.ctx.storage.get<Cycle>("cycle");
      if (!cycle || cycle.acknowledged || cycle.finished || !cycle.providerId) return;
      // Pre-arm recovery before network/storage work; alarm delivery is at least once.
      await this.ctx.storage.setAlarm(Math.max(Date.now() + REMINDER_INTERVAL_MS, cycle.nextAt));
      if (Date.now() < cycle.nextAt) return;
      const eligible = await this.eligible(cycle);
      if (eligible === "finished") {
        cycle.finished = true;
        await this.ctx.storage.put("cycle", cycle);
        await this.ctx.storage.deleteAlarm();
        return;
      }
      if (eligible === "wait") return;
      const current = await this.currentDelivery(cycle, true);
      if (!current) return;
      const result = await sendDelivery(current, this.env);
      if (result.ok) { cycle.sentCount++; cycle.failures = 0; }
      else cycle.failures++;
      cycle.nextAt = Date.now() + (result.ok ? REMINDER_INTERVAL_MS : Math.max(
        Math.min(30_000 * 2 ** Math.min(cycle.failures, 10), 21_600_000), result.retryAfterMs ?? 0,
      ));
      if (!result.ok && !result.retryable) cycle.finished = true;
      await this.ctx.storage.put("cycle", cycle);
      if (cycle.finished) await this.ctx.storage.deleteAlarm();
      else await this.ctx.storage.setAlarm(cycle.nextAt);
      console.log(JSON.stringify({ event: "stock_reminder", eventId: cycle.delivery.eventId,
        sent: result.ok, count: cycle.sentCount, error: result.error }));
    });
  }

  private async watchdogTick(): Promise<void> {
    // Independent alarm detects a stopped Cron Trigger/main handler. A Cloudflare-wide
    // outage still needs an external watchdog; this object cannot detect its own outage.
    await this.ctx.storage.setAlarm(Date.now() + 120_000);
    const state = await new D1MonitorRepository(this.env.DB).getState();
    if (state.paused) return;
    const timestamp = state.lastCheckAt ?? state.updatedAt;
    const stale = Date.now() - Date.parse(timestamp) > 600_000;
    const incident = await this.ctx.storage.get<{ start: string; notified: boolean; nextAt: number; failures: number }>("incident");
    if (!stale && !incident?.notified) {
      if (incident) await this.ctx.storage.delete("incident");
      return;
    }
    if (stale && incident?.notified) return;
    if (incident && Date.now() < incident.nextAt) return;
    const current = incident ?? { start: new Date().toISOString(), notified: false, nextAt: 0, failures: 0 };
    const result = await sendDelivery({
      eventId: `watchdog:${current.start}:${stale ? "stale" : "recovery"}`, eventType: "health",
      title: stale ? "[MONITOR UNHEALTHY] Stock checks have stopped" : "[RECOVERED] Stock checks are running again",
      body: stale ? "No stock check has completed in over 10 minutes. Silence does not mean out of stock. Inspect the hosted monitor."
        : "The hosted monitor is completing checks again. Availability is determined separately by its inventory and button evidence.",
      url: null, createdAt: new Date().toISOString(), channel: "push", attempts: current.failures + 1,
    }, this.env);
    if (result.ok && !stale) { await this.ctx.storage.delete("incident"); return; }
    if (result.ok) current.notified = true;
    else { current.failures++; current.nextAt = Date.now() + Math.max(
      Math.min(120_000 * 2 ** Math.min(current.failures, 8), 21_600_000), result.retryAfterMs ?? 0,
    ); }
    await this.ctx.storage.put("incident", current);
    console.log(JSON.stringify({ event: "watchdog_notification", stale, sent: result.ok, error: result.error }));
  }
}
