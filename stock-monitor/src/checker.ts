import { runMonitor, signalFatalFailure } from "./service";
import type { Env, StockEvidence } from "./types";
import { HelperStream } from "./helper-stream";

export const CHECK_INTERVAL_MS = 5_000;
export const BURST_INTERVAL_MS = 2_000;
export const BURST_DURATION_MS = 60_000;
const HEALTHCHECK_INTERVAL_MS = 30_000;
const PRUNE_INTERVAL_MS = 3_600_000;
const RECOVERY_LEASE_MS = 300_000;
interface Schedule {
  nextAt: number; failures: number; lastStatus?: string;
  nextHeartbeatAt?: number; nextPruneAt?: number;
  burstUntil?: number; burstLatched?: boolean;
}

// One bounded burst per positive episode. Unknown results never rearm it.
export function burstSchedule(previous: Pick<Schedule, "burstUntil" | "burstLatched">,
  status: unknown, evidence: StockEvidence | undefined, now: number) {
  let burstUntil = previous.burstUntil ?? 0, burstLatched = previous.burstLatched ?? false;
  const positive = status === "available" && (evidence?.inventoryAvailable === true || evidence?.button?.state === "enabled");
  const negative = status === "unavailable" && evidence?.checksHealthy === true
    && evidence.inventoryAvailable === false && evidence.button?.state === "disabled";
  if (status === "paused") return { burstUntil: 0, burstLatched: false };
  if (now >= burstUntil && negative) burstLatched = false;
  if (positive && !burstLatched) { burstUntil = now + BURST_DURATION_MS; burstLatched = true; }
  return { burstUntil, burstLatched };
}

export function nextDelay(status: unknown, failures: number, evidence?: StockEvidence): number {
  const endpoints = [evidence?.productFeed, evidence?.productPage];
  const sourceFailed = endpoints.some(e => e?.error || (e?.httpStatus !== undefined && e.httpStatus !== 200));
  if (status !== "unknown" && !sourceFailed) return CHECK_INTERVAL_MS;
  // Logical disagreements do not require network backoff. A positive result
  // from the other source must never override an error or Retry-After.
  if (!sourceFailed && endpoints.every(e => e?.httpStatus === 200)) return CHECK_INTERVAL_MS;
  const restricted = endpoints.some(e => e?.httpStatus === 429 || e?.httpStatus === 403);
  const backoff = Math.min((restricted ? 120_000 : 60_000) * 2 ** Math.min(Math.max(failures - 1, 0), 8), 1_800_000);
  return Math.max(backoff, ...endpoints.map(e => e?.retryAfterMs ?? 0));
}

export function checkerStub(env: Env): DurableObjectStub | undefined {
  return env.CHECKER?.get(env.CHECKER.idFromName("blizzard-availability-checker"));
}

// All normal scheduled/manual checks share this coordinator. Cron only ensures
// the alarm exists; it cannot create a second stock-polling loop.
export class StockChecker implements DurableObject {
  private running = false;
  private readonly helper: HelperStream;
  constructor(private readonly ctx: DurableObjectState, private readonly env: Env) { this.helper = new HelperStream(ctx, env); }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void { this.helper.message(socket, message); }
  webSocketClose(socket: WebSocket, code: number): void { try { socket.close(code, "Closed"); } catch {} }
  webSocketError(socket: WebSocket): void { try { socket.close(1011, "Connection error"); } catch {} }

  async fetch(request: Request): Promise<Response> {
    const route = new URL(request.url).pathname;
    if (route === "/helper-stream") return this.ctx.blockConcurrencyWhile(() => this.helper.open(request));
    if (route === "/helper-checkout-test" && request.method === "POST") {
      const id = request.headers.get("X-Checkout-Test-Id") ?? "";
      return this.ctx.blockConcurrencyWhile(() => this.helper.checkoutSimulation(id));
    }
    if (route === "/helper-clear") { await this.helper.clear(); return Response.json({ cleared: true }); }
    if (route === "/state") return Response.json({
      ...await this.ctx.storage.get<Schedule>("schedule") ?? { started: false }, helperProtocol: "forever-monitor-v1",
      helperConnectionPolicy: "identified-receiver-v2",
    });
    if (route === "/ensure") {
      await this.ctx.blockConcurrencyWhile(async () => {
        const state = await this.ctx.storage.get<Schedule>("schedule");
        if (await this.ctx.storage.getAlarm() === null) {
          await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, state?.nextAt ?? 0));
        }
      });
      return Response.json({ scheduled: true });
    }
    if (route === "/tick") return Response.json(await this.tick());
    return new Response("Not found", { status: 404 });
  }

  async alarm(): Promise<void> { await this.tick(); }

  private async tick(): Promise<Record<string, unknown>> {
    const start = Date.now();
    const acquired = await this.ctx.blockConcurrencyWhile(async () => {
      const state = await this.ctx.storage.get<Schedule>("schedule") ?? { nextAt: 0, failures: 0 };
      if (this.running || start < state.nextAt) {
        await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, state.nextAt));
        return null;
      }
      // Persist before network work. If this isolate dies, a later alarm can recover.
      const heartbeatAllowed = start >= (state.nextHeartbeatAt ?? 0);
      const pruneAllowed = start >= (state.nextPruneAt ?? 0);
      const reserved = { ...state,
        nextHeartbeatAt: heartbeatAllowed ? start + HEALTHCHECK_INTERVAL_MS : state.nextHeartbeatAt!,
        nextPruneAt: pruneAllowed ? start + PRUNE_INTERVAL_MS : state.nextPruneAt!,
      };
      await this.ctx.storage.put("schedule", { ...reserved, nextAt: start + RECOVERY_LEASE_MS });
      await this.ctx.storage.setAlarm(start + RECOVERY_LEASE_MS);
      this.running = true;
      return { ...reserved, heartbeatAllowed, pruneAllowed };
    });
    if (!acquired) return { status: "not_due" };
    let result: Record<string, unknown> = { status: "unknown" };
    try {
      result = await runMonitor(this.env, {
        heartbeatAllowed: acquired.heartbeatAllowed, pruneAllowed: acquired.pruneAllowed,
        onObservation: (observation, epoch) => this.helper.publish(observation, epoch),
      });
    } catch {
      console.error(JSON.stringify({ event: "checker_failed", error: "monitor execution failed" }));
      await this.helper.clear().catch(() => {});
      await signalFatalFailure(this.env).catch(() => {});
    } finally {
      const evidence = result.evidence as StockEvidence | undefined;
      const failed = result.status === "unknown" || evidence?.checksHealthy === false;
      const failures = failed ? acquired.failures + 1 : 0;
      const burst = burstSchedule(acquired, result.status, evidence, Date.now());
      const baseDelay = nextDelay(result.status, failures, evidence);
      // A burst can only shorten a healthy cadence, never network/rate-limit backoff.
      const delay = baseDelay === CHECK_INTERVAL_MS && Date.now() < burst.burstUntil
        ? BURST_INTERVAL_MS : baseDelay;
      // No catch-up bursts. Unknown results back off from completion; healthy checks
      // target five seconds between starts, never overlap or run back-to-back.
      const nextAt = failed ? Date.now() + delay : Math.max(start + delay, Date.now() + 1000);
      try {
        await this.ctx.blockConcurrencyWhile(async () => {
          await this.ctx.storage.put("schedule", { nextAt, failures, lastStatus: result.status, ...burst,
            nextHeartbeatAt: acquired.nextHeartbeatAt, nextPruneAt: acquired.nextPruneAt });
          await this.ctx.storage.setAlarm(nextAt);
        });
      } finally { this.running = false; }
      console.log(JSON.stringify({ event: "next_check_scheduled", nextAt: new Date(nextAt).toISOString(), failures,
        intervalMs: delay, burstUntil: burst.burstUntil }));
    }
    return result;
  }
}
