import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StockChecker, nextDelay, burstSchedule } from "../src/checker";
import { runMonitor, signalFatalFailure } from "../src/service";
import { checkAvailability } from "../src/detection";
import type { Env, StockEvidence } from "../src/types";
vi.mock("../src/service", () => ({ runMonitor: vi.fn(), signalFatalFailure: vi.fn() }));
let records: Map<string, unknown>;
let alarmAt: number | null;
function instance() {
  return new StockChecker({ storage: {
    get: async (key: string) => structuredClone(records.get(key)),
    put: async (key: string, value: unknown) => { records.set(key, structuredClone(value)); },
    getAlarm: async () => alarmAt,
    setAlarm: async (at: number) => { alarmAt = at; },
  }, blockConcurrencyWhile: async (fn: () => Promise<unknown>) => fn(),
  } as unknown as DurableObjectState, {} as Env);
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1_000_000); records = new Map(); alarmAt = null;
  vi.mocked(runMonitor).mockReset().mockResolvedValue({ status: "unavailable" });
  vi.mocked(signalFatalFailure).mockReset().mockResolvedValue();
});
afterEach(() => { vi.useRealTimers(); });
it("targets five seconds and duplicate/restarted alarms cannot check early", async () => {
  await instance().alarm();
  expect(alarmAt).toBe(1_005_000);
  await instance().alarm(); expect(runMonitor).toHaveBeenCalledTimes(1);
  vi.setSystemTime(1_005_000); await instance().alarm();
  expect(runMonitor).toHaveBeenCalledTimes(2);
});

const burstEvidence = (inventory: boolean, button: "enabled" | "disabled") => ({
  inventoryAvailable: inventory, button: { state: button }, checksHealthy: true,
  productFeed: { httpStatus: 200 }, productPage: { httpStatus: 200 },
}) as StockEvidence;

it("either positive starts a two-second burst persisted across object restarts", async () => {
  for (const evidence of [burstEvidence(true, "disabled"), burstEvidence(false, "enabled"), burstEvidence(true, "enabled")]) {
    records.clear(); vi.setSystemTime(1_000_000);
    vi.mocked(runMonitor).mockResolvedValue({ status: "available", evidence });
    await instance().alarm(); expect(alarmAt).toBe(1_002_000);
    expect(records.get("schedule")).toMatchObject({ burstUntil: 1_060_000, burstLatched: true });
    vi.setSystemTime(1_002_000); await instance().alarm(); expect(alarmAt).toBe(1_004_000);
    expect(records.get("schedule")).toMatchObject({ burstUntil: 1_060_000 });
  }
});

it("continuous positives cannot extend or restart a completed one-minute burst", async () => {
  vi.mocked(runMonitor).mockResolvedValue({ status: "available", evidence: burstEvidence(true, "disabled") });
  for (let second = 0; second <= 60; second += 2) {
    vi.setSystemTime(1_000_000 + second * 1000); await instance().alarm();
  }
  expect(alarmAt).toBe(1_065_000);
  vi.setSystemTime(1_065_000); await instance().alarm(); expect(alarmAt).toBe(1_070_000);
  expect(records.get("schedule")).toMatchObject({ burstUntil: 1_060_000, burstLatched: true });
});

it("keeps burst for its minute through negatives, then requires verified negatives to rearm", () => {
  const started = burstSchedule({}, "available", burstEvidence(true, "disabled"), 1000);
  expect(burstSchedule(started, "unavailable", burstEvidence(false, "disabled"), 2000)).toEqual(started);
  expect(burstSchedule(started, "unknown", undefined, 62000)).toEqual(started);
  const reset = burstSchedule(started, "unavailable", burstEvidence(false, "disabled"), 62000);
  expect(reset.burstLatched).toBe(false);
  expect(burstSchedule(reset, "available", burstEvidence(false, "enabled"), 67000)).toEqual({ burstUntil: 127000, burstLatched: true });
});

it("burst never overrides rate limits or error backoff", async () => {
  const evidence = burstEvidence(true, "disabled");
  evidence.checksHealthy = false; evidence.productPage = { ...evidence.productPage, httpStatus: 429, retryAfterMs: 7200000 };
  vi.mocked(runMonitor).mockResolvedValue({ status: "available", evidence });
  await instance().alarm(); expect(alarmAt).toBe(8_200_000);
  expect(records.get("schedule")).toMatchObject({ burstUntil: 1_060_000 });
});

it("pause clears burst state and burst cadence does not accelerate maintenance", async () => {
  vi.mocked(runMonitor).mockResolvedValue({ status: "available", evidence: burstEvidence(true, "disabled") });
  for (let second = 0; second <= 60; second += 2) {
    vi.setSystemTime(1_000_000 + second * 1000); await instance().alarm();
  }
  const options = vi.mocked(runMonitor).mock.calls.map(call => call[1]);
  expect(options.filter(o => o?.heartbeatAllowed)).toHaveLength(3);
  expect(options.filter(o => o?.pruneAllowed)).toHaveLength(1);
  vi.mocked(runMonitor).mockResolvedValue({ status: "paused" });
  vi.setSystemTime(1_065_000); await instance().alarm();
  expect(records.get("schedule")).toMatchObject({ burstUntil: 0, burstLatched: false });
  expect(alarmAt).toBe(1_070_000);
});
it("cron ensure does not poll or replace a later retry alarm", async () => {
  records.set("schedule", { nextAt: 2_000_000, failures: 3 });
  await instance().fetch(new Request("https://checker/ensure"));
  expect(alarmAt).toBe(2_000_000); expect(runMonitor).not.toHaveBeenCalled();
});
it("serializes overlapping handlers and preserves crash recovery lease", async () => {
  let finish!: (value: Record<string, unknown>) => void;
  vi.mocked(runMonitor).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const object = instance(); const first = object.alarm();
  await vi.waitFor(() => expect(runMonitor).toHaveBeenCalledTimes(1));
  await object.alarm(); await instance().alarm();
  expect(runMonitor).toHaveBeenCalledTimes(1);
  expect(alarmAt).toBe(1_300_000);
  finish({ status: "unavailable" }); await first;
});
it("unknown results back off across restarts and recovery resets cadence", async () => {
  vi.mocked(runMonitor).mockResolvedValue({ status: "unknown" });
  await instance().alarm(); expect(alarmAt).toBe(1_060_000);
  vi.setSystemTime(1_060_000); await instance().alarm(); expect(alarmAt).toBe(1_180_000);
  vi.mocked(runMonitor).mockResolvedValue({ status: "available" });
  vi.setSystemTime(1_180_000); await instance().alarm(); expect(alarmAt).toBe(1_185_000);
});
it("fatal errors signal health failure and retain a recovery alarm", async () => {
  vi.mocked(runMonitor).mockRejectedValue(new Error("private error"));
  await instance().alarm(); expect(signalFatalFailure).toHaveBeenCalledTimes(1);
  expect(alarmAt).toBe(1_060_000);
});
it("honors long Retry-After and slows for rate limits without truncation", () => {
  const evidence = { productFeed: { httpStatus: 429, retryAfterMs: 7_200_000 } } as StockEvidence;
  expect(nextDelay("unknown", 1, evidence)).toBe(7_200_000);
  expect(nextDelay("available", 1, evidence)).toBe(7_200_000);
  expect(nextDelay("unknown", 1, { productFeed: { httpStatus: 403 } } as StockEvidence)).toBe(120_000);
});

it("partial-positive failures back off exponentially across restarts", async () => {
  const evidence = { checksHealthy: false, productFeed: { httpStatus: 200 },
    productPage: { httpStatus: 503, error: "HTTP 503" } } as StockEvidence;
  vi.mocked(runMonitor).mockResolvedValue({ status: "available", evidence });
  await instance().alarm(); expect(alarmAt).toBe(1_060_000);
  vi.setSystemTime(1_060_000); await instance().alarm(); expect(alarmAt).toBe(1_180_000);
});
it("keeps five-second polling for HTTP-successful signal conflicts without claiming availability", async () => {
  const evidence = { productFeed: { httpStatus: 200 }, productPage: { httpStatus: 200 } } as StockEvidence;
  expect(nextDelay("unknown", 1, evidence)).toBe(5000);
  vi.mocked(runMonitor).mockResolvedValue({ status: "unknown", evidence });
  await instance().alarm(); expect(alarmAt).toBe(1_005_000);
  expect(records.get("schedule")).toMatchObject({ lastStatus: "unknown" });
});
it("persists heartbeat and hourly maintenance throttles across restarts", async () => {
  for (let second = 0; second <= 60; second += 5) {
    vi.setSystemTime(1_000_000 + second * 1000); await instance().alarm();
  }
  const options = vi.mocked(runMonitor).mock.calls.map(call => call[1]);
  expect(options.filter(o => o?.heartbeatAllowed)).toHaveLength(3);
  expect(options.filter(o => o?.pruneAllowed)).toHaveLength(1);
  expect(runMonitor).toHaveBeenCalledTimes(13);
});
it("a slow check cannot overlap or create a catch-up burst", async () => {
  vi.mocked(runMonitor).mockImplementation(async () => {
    vi.setSystemTime(1_012_000); return { status: "unavailable" };
  });
  await instance().alarm(); expect(alarmAt).toBe(1_013_000);
  await instance().alarm(); expect(runMonitor).toHaveBeenCalledTimes(1);
});
it("rate-limited stock endpoints are attempted once each and return unknown", async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response("", {
    status: 429, headers: { "Retry-After": "3600" },
  }));
  const result = await checkAvailability(fetcher);
  expect(result.status).toBe("unknown"); expect(fetcher).toHaveBeenCalledTimes(2);
  expect(result.evidence.productFeed.retryAfterMs).toBe(3_600_000);
  expect(result.evidence.productPage.attempts).toBe(1);
  expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe("manual");
});
