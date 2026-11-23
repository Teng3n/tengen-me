import { D1MonitorRepository } from "./repository";
import { queueTestNotifications, retryNotifications, runMonitor, setPaused, signalFatalFailure } from "./service";
import type { Env } from "./types";
import { reminderStub } from "./reminders";
import { checkAvailability } from "./detection";
import { checkerStub } from "./checker";
import { helperAuthorized } from "./helper-stream";
export { StockReminders } from "./reminders";
export { StockChecker } from "./checker";

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function authorized(request: Request, env: Env): boolean {
  if (!env.ADMIN_TOKEN) return false;
  return request.headers.get("authorization") === `Bearer ${env.ADMIN_TOKEN}`;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

export default {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    try {
      const checker = checkerStub(env);
      if (checker) {
        const response = await checker.fetch("https://checker/ensure", { method: "POST" });
        if (!response.ok) throw new Error("checker unavailable");
      } else await runMonitor(env);
    } catch (error) {
      console.error(JSON.stringify({ event: "monitor_fatal", error: errorName(error) }));
      await signalFatalFailure(env);
      throw error;
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/helper-stream") {
      if (!helperAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return await checkerStub(env)?.fetch(new Request("https://checker/helper-stream", request))
        ?? new Response("Unavailable", { status: 503 });
    }
    const repository = new D1MonitorRepository(env.DB);

    if (request.method === "POST" && url.pathname === "/telegram-webhook") {
      if (!env.TELEGRAM_WEBHOOK_SECRET ||
        request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
        return json({ error: "unauthorized" }, 401);
      }
      const stub = reminderStub(env);
      if (!stub) return json({ error: "reminders unavailable" }, 503);
      // Bound input and forward only over the internal Durable Object binding.
      const body = await request.text();
      if (body.length > 32_768) return json({ error: "update too large" }, 413);
      const liveReply = await stub.fetch("https://reminders/update", { method: "POST", body });
      const testReply = await reminderStub(env, true)!.fetch("https://reminders/update", { method: "POST", body });
      const testResult = await testReply.clone().json<{ method?: string }>();
      return testResult.method ? testReply : liveReply;
    }

    if (request.method === "GET" && url.pathname === "/") {
      return json({
        service: "Blizzard Forever Collector's Edition stock monitor",
        alertRule: "any-positive; single-source positives are possible availability, not confirmed purchase availability",
        schedule: env.CHECKER ? "target every 5 seconds; errors and rate limits back off" : "every 2 minutes",
        endpoints: ["GET /health"],
      });
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return json(await repository.getHealthSnapshot());
    }
    if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
    if (request.method === "POST" && url.pathname === "/helper-checkout-test") {
      if (request.headers.get("X-Checkout-Test-Confirm") !== "OPEN_ONE_COPY_NO_PAYMENT")
        return json({ error: "explicit_checkout_test_confirmation_required" }, 400);
      return await checkerStub(env)?.fetch("https://checker/helper-checkout-test", { method: "POST",
        headers: { "X-Checkout-Test-Id": request.headers.get("X-Checkout-Test-Id") ?? "" } })
        ?? json({ error: "checker_unavailable" }, 503);
    }
    if (request.method === "GET" && url.pathname === "/checker-state") {
      return await checkerStub(env)?.fetch("https://checker/state") ?? json({ started: false });
    }
    if (request.method === "POST" && url.pathname === "/probe") {
      // Read-only deployment verification: no state transition or notification.
      return json(await checkAvailability());
    }
    if (request.method === "GET" && url.pathname === "/reminders-state") {
      return await reminderStub(env)?.fetch("https://reminders/state") ?? json({ active: false });
    }
    if (request.method === "GET" && url.pathname === "/test-reminders-state") {
      return await reminderStub(env, true)?.fetch("https://reminders/state") ?? json({ active: false });
    }
    if (request.method === "POST" && url.pathname === "/test-reminders") {
      if (!(await repository.getState()).paused) return json({ error: "pause before testing" }, 409);
      return await reminderStub(env, true)?.fetch("https://reminders/test", { method: "POST" }) ?? json({ error: "binding missing" }, 503);
    }

    if (request.method === "GET" && url.pathname === "/logs") {
      const limit = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));
      return json({ checks: await repository.listChecks(limit) });
    }
    if (request.method === "POST" && url.pathname === "/check") {
      const checker = checkerStub(env);
      if (checker) return await checker.fetch("https://checker/tick", { method: "POST" });
      return json(await runMonitor(env, { repository }));
    }
    if (request.method === "POST" && url.pathname === "/test-notifications") {
      return json(await queueTestNotifications(env, { repository }), 202);
    }
    if (request.method === "POST" && url.pathname === "/retry-notifications") {
      return json(await retryNotifications(env, { repository }));
    }
    if (request.method === "POST" && url.pathname === "/pause") {
      await setPaused(env, true, { repository });
      return json({ status: "paused" });
    }
    if (request.method === "POST" && url.pathname === "/resume") {
      await reminderStub(env, true)?.fetch("https://reminders/cancel", { method: "POST" });
      await setPaused(env, false, { repository });
      return json({ status: "running" });
    }
    return json({ error: "not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
