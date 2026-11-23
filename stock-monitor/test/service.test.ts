import { describe, expect, it, vi, afterEach } from "vitest";
import type { MonitorRepository } from "../src/repository";
import { planCheckTransition, queueTestNotifications, retryNotifications, runMonitor, signalFatalFailure } from "../src/service";
import type {
  DeliveryChannel,
  DueDelivery,
  MonitorState,
  NotificationEvent,
  StockResult,
} from "../src/types";

function initialState(): MonitorState {
  return {
    paused: false,
    lastStatus: null,
    lastDefinitiveStatus: null,
    availabilityEpoch: 0,
    lastCheckAt: null,
    lastDefinitiveAt: null,
    lastAvailableAt: null,
    consecutiveUnknown: 0,
    unknownStreakStartedAt: null,
    failureAlertedFor: null,
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

function result(status: StockResult["status"], checkedAt = "2026-09-14T12:00:00.000Z"): StockResult {
  return {
    status,
    checkedAt,
    evidence: {
      positiveSignals: status === "available" ? ["inventory", "purchase-button"] : [],
      price: "$150.00",
      inventoryAvailable: status === "available",
      button: {
        matchingForms: 1,
        state: status === "available" ? "enabled" : status === "unavailable" ? "disabled" : "missing",
        labels: ["Pre-order"],
        variantInputDisabled: [status !== "available"],
        buttonDisabled: [status !== "available"],
      },
      productFeed: { url: "feed", attempts: 1, elapsedMs: 1 },
      productPage: { url: "page", attempts: 1, elapsedMs: 1 },
      reasons: status === "unknown" ? ["test failure"] : [],
    },
  };
}

interface DeliveryRow extends DueDelivery {
  status: "pending" | "sending" | "retry" | "sent" | "permanent_failure";
  nextAttemptAt: string;
}

class MemoryRepository implements MonitorRepository {
  state = initialState();
  events = new Map<string, NotificationEvent>();
  deliveries = new Map<string, DeliveryRow>();
  checks: StockResult[] = [];

  async getState() { return { ...this.state }; }
  async saveState(state: MonitorState) { this.state = { ...state }; }
  async setPaused(paused: boolean, now: string) { this.state.paused = paused; this.state.updatedAt = now; }
  async recordCheck(check: StockResult) { this.checks.push(check); }
  async pruneChecks() {}
  async enqueueEvent(notification: NotificationEvent) {
    if (this.events.has(notification.eventId)) return;
    this.events.set(notification.eventId, notification);
    for (const channel of ["push"] as const) {
      this.deliveries.set(`${notification.eventId}:${channel}`, {
        ...notification,
        channel,
        attempts: 0,
        status: "pending",
        nextAttemptAt: notification.createdAt,
      });
    }
  }
  async listDueDeliveries(now: string) {
    return [...this.deliveries.values()]
      .filter((delivery) => ["pending", "retry"].includes(delivery.status) && delivery.nextAttemptAt <= now)
      .map((delivery) => ({
        eventId: delivery.eventId,
        eventType: delivery.eventType,
        title: delivery.title,
        body: delivery.body,
        url: delivery.url,
        createdAt: delivery.createdAt,
        channel: delivery.channel,
        attempts: delivery.attempts,
      }));
  }
  async claimDelivery(delivery: DueDelivery) {
    const row = this.deliveries.get(`${delivery.eventId}:${delivery.channel}`);
    if (!row || !["pending", "retry"].includes(row.status)) return false;
    row.status = "sending";
    row.attempts += 1;
    return true;
  }
  async markDeliverySent(eventId: string, channel: DeliveryChannel) {
    this.deliveries.get(`${eventId}:${channel}`)!.status = "sent";
  }
  async markDeliveryFailed(
    eventId: string,
    channel: DeliveryChannel,
    _error: string,
    _now: string,
    nextAttemptAt: string | null,
  ) {
    const row = this.deliveries.get(`${eventId}:${channel}`)!;
    row.status = nextAttemptAt ? "retry" : "permanent_failure";
    if (nextAttemptAt) row.nextAttemptAt = nextAttemptAt;
  }
  async getHealthSnapshot() { return {}; }
  async listChecks() { return []; }
}

it("publishes committed stock to helper before waiting for Telegram", async () => {
  const repository = new MemoryRepository(); const order: string[] = [];
  await runMonitor({ DB: {} as D1Database }, { repository, detector: async () => result("available"),
    onObservation: async (_result, epoch) => {
      expect(repository.state.lastStatus).toBe("available"); expect(epoch).toBe(1); order.push("helper");
    }, sender: async () => { order.push("telegram"); return { ok: true, retryable: false, providerId: "1" }; } });
  expect(order).toEqual(["helper", "telegram"]);
});
it("helper publication failure does not suppress Telegram", async () => {
  const sender = vi.fn().mockResolvedValue({ ok: true, retryable: false, providerId: "1" });
  await runMonitor({ DB: {} as D1Database }, { repository: new MemoryRepository(), detector: async () => result("available"),
    onObservation: async () => { throw new Error("receiver down"); }, sender });
  expect(sender).toHaveBeenCalledOnce();
});

describe("Healthchecks heartbeat", () => {
  const env = { DB: {} as D1Database, HEALTHCHECKS_URL: "https://hc-ping.com/00000000-0000-0000-0000-000000000000" };
  afterEach(() => vi.restoreAllMocks());

  it("records a check without pinging or pruning when the coordinator throttles maintenance", async () => {
    const repository = new MemoryRepository();
    const prune = vi.spyOn(repository, "pruneChecks");
    const fetcher = vi.fn(async () => new Response("OK"));
    await runMonitor(env, { repository, fetcher,
      detector: async () => result("unavailable"), heartbeatAllowed: false, pruneAllowed: false });
    expect(repository.checks).toHaveLength(1);
    expect(repository.state.lastStatus).toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled(); expect(prune).not.toHaveBeenCalled();
  });

  it.each(["available", "unavailable"] as const)("pings after a definitive %s check", async (status) => {
    const fetcher = vi.fn(async () => new Response("OK"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await runMonitor(env, {
      repository: new MemoryRepository(), fetcher,
      detector: async () => result(status),
      sender: async () => ({ ok: true, retryable: false }),
    });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(env.HEALTHCHECKS_URL,
      expect.objectContaining({ method: "POST", redirect: "manual" }));
    expect(log).toHaveBeenCalledWith(JSON.stringify({ event: "healthchecks_ping_accepted", suffix: "success" }));
    expect(JSON.stringify(log.mock.calls)).not.toContain(env.HEALTHCHECKS_URL);
  });

  it("does not report healthy when unknown or paused", async () => {
    const fetcher = vi.fn(async () => new Response("OK"));
    const repository = new MemoryRepository();
    const deps = { repository, fetcher, detector: async () => result("unknown") };
    await runMonitor(env, deps);
    repository.state.paused = true;
    await runMonitor(env, deps);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends a partial-positive stock alert without falsely pinging healthy", async () => {
    const fetcher = vi.fn(async () => new Response("OK"));
    const sender = vi.fn(async () => ({ ok: true, retryable: false }));
    const partial = result("available"); partial.evidence.checksHealthy = false;
    partial.evidence.positiveSignals = ["inventory"];
    await runMonitor(env, { repository: new MemoryRepository(), fetcher, sender, detector: async () => partial });
    expect(sender).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["OK (not found)", "OK (rate limited)"])("rejects misleading HTTP 200: %s", async (body) => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await runMonitor(env, {
      repository: new MemoryRepository(), detector: async () => result("unavailable"),
      fetcher: async () => new Response(body),
    });
    expect(error).toHaveBeenCalledWith(JSON.stringify({ event: "healthchecks_ping_failed", suffix: "success", httpStatus: 200 }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("healthchecks_ping_accepted");
    expect(JSON.stringify(error.mock.calls)).not.toContain(env.HEALTHCHECKS_URL);
  });

  it("sanitizes network errors without interrupting the check", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runMonitor(env, {
      repository: new MemoryRepository(), detector: async () => result("unavailable"),
      fetcher: async () => { throw new Error(env.HEALTHCHECKS_URL); },
    })).resolves.toMatchObject({ status: "unavailable" });
    expect(JSON.stringify(error.mock.calls)).not.toContain(env.HEALTHCHECKS_URL);
    expect(error).toHaveBeenCalledOnce();
  });

  it("signals fatal failures instead of a healthy heartbeat", async () => {
    const fetcher = vi.fn(async () => new Response("OK"));
    await signalFatalFailure(env, fetcher);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`${env.HEALTHCHECKS_URL}/fail`, expect.objectContaining({ method: "POST" }));
  });
});

describe("state transitions", () => {
  it("labels single-source alerts and does not duplicate when the other source turns positive", () => {
    const single = result("available");
    single.evidence.positiveSignals = ["inventory"];
    single.evidence.button!.state = "disabled";
    const first = planCheckTransition(initialState(), single, 5);
    expect(first.events[0]?.title).toBe("Possible stock");
    expect(first.events[0]?.body).toContain("🟢 Inventory: Yes");
    expect(first.events[0]?.body).toContain("🔴 Button: Disabled");
    expect(planCheckTransition(first.state, result("available"), 5).events).toHaveLength(0);
  });

  it("reports prolonged source failure even while the other source is positive", () => {
    const partial = result("available"); partial.evidence.checksHealthy = false;
    partial.evidence.positiveSignals = ["inventory"];
    let state = initialState(); const events: NotificationEvent[] = [];
    for (let i = 0; i < 6; i++) {
      const transition = planCheckTransition(state, partial, 5);
      state = transition.state; events.push(...transition.events);
    }
    expect(events.filter(e => e.eventType === "stock")).toHaveLength(1);
    expect(events.filter(e => e.eventType === "health")).toHaveLength(1);
    expect(planCheckTransition(state, result("available"), 5).events.map(e => e.eventType)).toEqual(["recovery"]);
  });
  it("alerts on first availability, suppresses duplicates, and rearms after verified unavailability", () => {
    const first = planCheckTransition(initialState(), result("available"), 5);
    expect(first.events.map((item) => item.eventId)).toEqual(["stock:1"]);

    const duplicate = planCheckTransition(first.state, result("available", "2026-09-14T12:02:00.000Z"), 5);
    expect(duplicate.events).toHaveLength(0);

    const unavailable = planCheckTransition(duplicate.state, result("unavailable", "2026-09-14T12:04:00.000Z"), 5);
    const restock = planCheckTransition(unavailable.state, result("available", "2026-09-14T12:06:00.000Z"), 5);
    expect(restock.events.map((item) => item.eventId)).toEqual(["stock:2"]);
  });

  it("does not rearm through an unknown result", () => {
    const first = planCheckTransition(initialState(), result("available"), 5);
    const unknown = planCheckTransition(first.state, result("unknown", "2026-09-14T12:02:00.000Z"), 5);
    const availableAgain = planCheckTransition(unknown.state, result("available", "2026-09-14T12:04:00.000Z"), 5);
    expect(availableAgain.events).toHaveLength(0);
  });
});

describe("Telegram-only delivery", () => {
  it("retries the saved test while paused without creating events or ignoring backoff", async () => {
    const repository = new MemoryRepository();
    repository.state.paused = true;
    let current = new Date("2026-09-14T12:00:00.000Z");
    await queueTestNotifications({ DB: {} as D1Database }, {
      repository, now: () => current,
      sender: async () => ({ ok: false, retryable: true, error: "temporary" }),
    });
    let sent = 0;
    const dependencies = {
      repository, now: () => current,
      sender: async () => { sent++; return { ok: true, retryable: false }; },
    };
    await retryNotifications({ DB: {} as D1Database }, dependencies);
    expect(sent).toBe(0);
    current = new Date("2026-09-14T12:02:01.000Z");
    await retryNotifications({ DB: {} as D1Database }, dependencies);
    await retryNotifications({ DB: {} as D1Database }, dependencies);
    expect(sent).toBe(1);
    expect(repository.events.size).toBe(1);
    expect(repository.checks).toHaveLength(0);
    expect(repository.state.paused).toBe(true);
  });

  it("retries failed push delivery and does not resend it once successful", async () => {
    const repository = new MemoryRepository();
    let current = new Date("2026-09-14T12:00:00.000Z");
    const calls: DeliveryChannel[] = [];
    let pushAttempts = 0;
    const sender = async (delivery: DueDelivery) => {
      calls.push(delivery.channel);
      if (delivery.channel === "push" && pushAttempts++ === 0) {
        return { ok: false, retryable: true, error: "temporary" };
      }
      return { ok: true, retryable: false, providerId: `${delivery.channel}-id` };
    };

    await runMonitor({ DB: {} as D1Database }, {
      repository,
      now: () => new Date(current),
      detector: async () => result("available", current.toISOString()),
      sender,
    });
    current = new Date("2026-09-14T12:02:01.000Z");
    await runMonitor({ DB: {} as D1Database }, {
      repository,
      now: () => new Date(current),
      detector: async () => result("available", current.toISOString()),
      sender,
    });

    current = new Date("2026-09-14T12:04:01.000Z");
    await runMonitor({ DB: {} as D1Database }, {
      repository,
      now: () => new Date(current),
      detector: async () => result("available", current.toISOString()),
      sender,
    });

    expect(calls).toEqual(["push", "push"]);
    expect(repository.events.size).toBe(1);
    expect(repository.deliveries.size).toBe(1);
    expect(repository.deliveries.get("stock:1:push")?.status).toBe("sent");
  });

  it("sends one labeled Telegram test while paused without email configuration", async () => {
    const repository = new MemoryRepository();
    repository.state.paused = true;
    const sent: DueDelivery[] = [];
    await queueTestNotifications({ DB: {} as D1Database }, {
      repository,
      sender: async (delivery) => {
        sent.push(delivery);
        return { ok: true, retryable: false, providerId: "test-id" };
      },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.channel).toBe("push");
    expect(sent[0]?.title).toContain("[TEST]");
    expect(sent[0]?.body).toContain("Telegram");
    expect(sent[0]?.body).not.toContain("Both");
    expect(repository.state.paused).toBe(true);
    expect(repository.checks).toHaveLength(0);
  });
});
