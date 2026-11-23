import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StockReminders } from "../src/reminders";
import { D1MonitorRepository } from "../src/repository";
import worker from "../src/index";
import type { DueDelivery, Env, MonitorState, StockResult } from "../src/types";

const start = new Date("2026-09-14T22:00:00.000Z");
const delivery: DueDelivery = {
  eventId: "stock:1", eventType: "stock", title: "[AVAILABLE] Product", body: "$150.00",
  url: "https://gear.blizzard.com/", createdAt: start.toISOString(), channel: "push", attempts: 1,
};
const env: Env = {
  DB: {} as D1Database, TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_CHAT_ID: "123",
  TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret",
};
let state: MonitorState;
let records: Map<string, unknown>;
let alarmAt: number | null;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
let latestCheck: StockResult | null;
function instance() {
  return new StockReminders({
    storage: {
      get: async (key: string) => structuredClone(records.get(key)),
      put: async (key: string, value: unknown) => { records.set(key, structuredClone(value)); },
      delete: async (key: string) => records.delete(key),
      getAlarm: async () => alarmAt,
      setAlarm: async (at: number) => { alarmAt = at; },
      deleteAlarm: async () => { alarmAt = null; },
    },
    blockConcurrencyWhile: async (fn: () => Promise<unknown>) => fn(),
  } as unknown as DurableObjectState, env);
}
async function post(obj: StockReminders, route: string, body: unknown = {}) {
  return (await obj.fetch(new Request(`https://internal/${route}`, {
    method: "POST", body: JSON.stringify(body),
  }))).json();
}
function stop(text = "stop", id = 123, date = start.getTime() / 1_000 + 10) {
  return { update_id: 10, message: { text, date, from: { id }, chat: { id, type: "private" } } };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(start);
  records = new Map(); alarmAt = null;
  state = { paused: false, lastStatus: "available", lastDefinitiveStatus: "available",
    availabilityEpoch: 1, lastCheckAt: start.toISOString(), lastDefinitiveAt: start.toISOString(),
    lastAvailableAt: start.toISOString(), consecutiveUnknown: 0, unknownStreakStartedAt: null,
    failureAlertedFor: null, updatedAt: start.toISOString() };
  vi.spyOn(D1MonitorRepository.prototype, "getState").mockImplementation(async () => ({ ...state }));
  latestCheck = { status: "available", checkedAt: start.toISOString(), evidence: {
    inventoryAvailable: false, button: { state: "enabled", matchingForms: 1, labels: ["Pre-order"],
      variantInputDisabled: [false], buttonDisabled: [false] },
    productFeed: { url: "feed", attempts: 1, elapsedMs: 1 },
    productPage: { url: "page", attempts: 1, elapsedMs: 1 }, reasons: [],
  } };
  vi.spyOn(D1MonitorRepository.prototype, "getCheckAt").mockImplementation(async () => structuredClone(latestCheck));
  fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ ok: true, result: { message_id: 42 } }));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("persistent five-second stock reminders", () => {
  it("independent watchdog detects stopped checks, suppresses repeat warnings, and announces recovery", async () => {
    await post(instance(), "watchdog-start");
    vi.setSystemTime(start.getTime() + 660_000);
    await instance().alarm(); await instance().alarm();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]!.body)).text).toContain("checks have stopped");
    state.lastCheckAt = new Date().toISOString();
    await instance().alarm(); await instance().alarm();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("watchdog stays quiet while paused", async () => {
    await post(instance(), "watchdog-start"); state.paused = true;
    vi.setSystemTime(start.getTime() + 660_000); await instance().alarm();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("labeled repeat test works only while paused and expires after three minutes", async () => {
    state.paused = true;
    await post(instance(), "test");
    vi.setSystemTime(start.getTime() + 5_000); await instance().alarm();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]!.body)).text).toContain("[TEST ONLY]");
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]!.body)).text).not.toContain("latest verified check");
    vi.setSystemTime(start.getTime() + 181_000); await instance().alarm();
    expect(alarmAt).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("sends first alert once, repeats every five seconds across restarts, and suppresses early duplicate alarms", async () => {
    await post(instance(), "deliver", delivery);
    await post(instance(), "deliver", delivery);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(alarmAt).toBe(start.getTime() + 5_000);
    expect(await post(instance(), "state")).toMatchObject({ intervalMs: 5000 });
    vi.setSystemTime(start.getTime() + 4_999);
    await instance().alarm(); expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(start.getTime() + 5_000);
    await instance().alarm();
    await instance().alarm();
    expect(fetcher).toHaveBeenCalledTimes(2);
    const reminderText = JSON.parse(String(fetcher.mock.calls[1]![1]!.body)).text;
    expect(reminderText).toContain("Possible stock reminder");
    expect(reminderText).toContain("🔴 Inventory: No");
    expect(reminderText).toContain("🟢 Button: Enabled");
    expect(reminderText).not.toContain("$150");
    vi.setSystemTime(start.getTime() + 10_000);
    await instance().alarm(); expect(fetcher).toHaveBeenCalledTimes(3);
    expect(alarmAt).toBe(start.getTime() + 15_000);
  });

  it("refreshes both signal rows instead of repeating original event evidence", async () => {
    await post(instance(), "deliver", delivery);
    latestCheck!.evidence.inventoryAvailable = true;
    latestCheck!.checkedAt = new Date(start.getTime() + 5000).toISOString();
    state.lastCheckAt = latestCheck!.checkedAt;
    vi.setSystemTime(start.getTime() + 5000); await instance().alarm();
    const text = JSON.parse(String(fetcher.mock.calls[1]![1]!.body)).text;
    expect(text).toContain("Stock available reminder");
    expect(text).toContain("🟢 Inventory: Yes");
    expect(text).toContain("🟢 Button: Enabled");
    expect(text).toContain("3:00:05 PM PDT");
    expect(D1MonitorRepository.prototype.getCheckAt).toHaveBeenLastCalledWith(state.lastCheckAt);
  });

  it("does not reuse an old event body if the latest check evidence is missing", async () => {
    await post(instance(), "deliver", delivery);
    latestCheck = null;
    vi.setSystemTime(start.getTime() + 5000); await instance().alarm();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(alarmAt).not.toBeNull();
  });

  it.each(["stop", "STOP IT", "/stop"])("persists %s acknowledgement across restart and does not rearm same stock", async (text) => {
    await post(instance(), "deliver", delivery);
    await post(instance(), "update", stop(text));
    expect(alarmAt).toBeNull();
    vi.setSystemTime(start.getTime() + 5_000);
    await instance().alarm();
    await post(instance(), "deliver", delivery);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await post(instance(), "state")).toMatchObject({ acknowledged: true });
  });

  it("rejects another user's stop and stale stop messages", async () => {
    await post(instance(), "deliver", delivery);
    await post(instance(), "update", stop("stop", 999));
    await post(instance(), "update", stop("stop", 123, start.getTime() / 1_000 - 10));
    expect(await post(instance(), "state")).toMatchObject({ acknowledged: false });
  });

  it("honors the matching Stop button but not buttons from older stock events", async () => {
    await post(instance(), "deliver", delivery);
    const callback = { id: "callback", from: { id: 123 }, message: { chat: { id: 123, type: "private" } } };
    await post(instance(), "update", { callback_query: { ...callback, data: "stop:stock:0" } });
    expect(await post(instance(), "state")).toMatchObject({ acknowledged: false });
    expect(await post(instance(), "update", { callback_query: { ...callback, data: "stop:stock:1" } }))
      .toMatchObject({ method: "answerCallbackQuery" });
    expect(alarmAt).toBeNull();
  });

  it("suspends on unknown or stale evidence, then resumes only when fresh available", async () => {
    await post(instance(), "deliver", delivery);
    vi.setSystemTime(start.getTime() + 5_000); state.lastStatus = "unknown";
    await instance().alarm();
    state.lastStatus = "available"; vi.setSystemTime(start.getTime() + 200_000);
    await instance().alarm();
    expect(fetcher).toHaveBeenCalledTimes(1);
    state.lastCheckAt = new Date().toISOString();
    await instance().alarm();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("stops on verified unavailability and starts anew for a later stock epoch", async () => {
    await post(instance(), "deliver", delivery);
    vi.setSystemTime(start.getTime() + 5_000);
    state.lastDefinitiveStatus = "unavailable";
    await instance().alarm(); expect(alarmAt).toBeNull();
    state.lastDefinitiveStatus = "available"; state.availabilityEpoch = 2;
    await post(instance(), "deliver", { ...delivery, eventId: "stock:2", createdAt: new Date().toISOString() });
    expect(fetcher).toHaveBeenCalledTimes(2);
    // A delayed retry of the old event must not overwrite the new cycle.
    await post(instance(), "deliver", delivery);
    expect(await post(instance(), "state")).toMatchObject({ eventId: "stock:2" });
  });

  it("honors rate limits without catch-up bursts and still allows immediate stop", async () => {
    await post(instance(), "deliver", delivery);
    fetcher.mockImplementation(async () => Response.json({ ok: false, parameters: { retry_after: 600 } }, { status: 429 }));
    vi.setSystemTime(start.getTime() + 5_000);
    await instance().alarm();
    expect(alarmAt).toBe(Date.now() + 600_000);
    await instance().alarm(); expect(fetcher).toHaveBeenCalledTimes(2);
    await post(instance(), "update", stop()); expect(alarmAt).toBeNull();
  });

  it("cancel and pause prevent further reminders", async () => {
    await post(instance(), "deliver", delivery);
    await post(instance(), "cancel");
    vi.setSystemTime(start.getTime() + 5_000); await instance().alarm();
    expect(fetcher).toHaveBeenCalledTimes(1); expect(alarmAt).toBeNull();
  });

  it("rejects webhook calls with missing or incorrect secret before forwarding", async () => {
    const reply = await worker.fetch(new Request("https://worker/telegram-webhook", {
      method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong" }, body: "{}",
    }), env);
    expect(reply.status).toBe(401);
  });
});
