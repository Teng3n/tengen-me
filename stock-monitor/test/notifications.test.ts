import { describe, expect, it, vi } from "vitest";
import { sendDelivery } from "../src/notifications";
import { PRODUCT, ONE_COPY_CHECKOUT_URL, type DueDelivery, type Env } from "../src/types";

const delivery: DueDelivery = {
  eventId: "test:telegram", eventType: "test", title: "[TEST] Stock monitor",
  body: "Test only, no stock change", url: PRODUCT.url,
  createdAt: "2026-09-14T21:00:00.000Z", channel: "push", attempts: 1,
};
const env: Env = {
  DB: {} as D1Database, PUSH_PROVIDER: "telegram",
  TELEGRAM_BOT_TOKEN: "dummy-test-token", TELEGRAM_CHAT_ID: "123",
};

describe("Telegram push adapter", () => {
  it("sends a labeled notification with the purchase link and never enables paid broadcasts", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true, result: { message_id: 42 } }));
    expect(await sendDelivery(delivery, env, fetcher)).toEqual({ ok: true, retryable: false, providerId: "42" });
    const body = JSON.parse(String(fetcher.mock.calls[0]![1]!.body));
    expect(body.chat_id).toBe("123");
    expect(body.text).toContain("[TEST]");
    expect(body.text).toContain(PRODUCT.url);
    expect(body.allow_paid_broadcast).toBe(false);
    expect(body.disable_notification).toBe(false);
    expect(fetcher.mock.calls[0]![1]!.redirect).toBe("manual");
  });

  it("rejects redirects without following them or exposing the destination", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {
      status: 302, headers: { Location: "https://example.com/private-destination" },
    }));
    const result = await sendDelivery(delivery, env, fetcher);
    expect(result).toEqual({ ok: false, retryable: false, error: "Telegram request failed (302)" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![1]!.redirect).toBe("manual");
  });

  it("preserves Telegram's requested rate-limit delay", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      ok: false, error_code: 429, parameters: { retry_after: 600 },
    }, { status: 429 }));
    expect(await sendDelivery(delivery, env, fetcher)).toMatchObject({ ok: false, retryable: true, retryAfterMs: 600_000 });
  });

  it("adds a one-copy checkout button only to stock alerts and does not visit checkout", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true, result: { message_id: 43 } }));
    await sendDelivery({ ...delivery, eventType: "stock" }, env, fetcher);
    const body = JSON.parse(String(fetcher.mock.calls[0]![1]!.body));
    expect(body.reply_markup.inline_keyboard).toEqual([
      [{ text: "Review checkout for 1 copy", url: ONE_COPY_CHECKOUT_URL }],
      [{ text: "View product", url: PRODUCT.url }],
      [{ text: "Stop alerts", callback_data: `stop:${delivery.eventId}` }],
    ]);
    expect(body.text).not.toContain(PRODUCT.url);
    expect(new URL(ONE_COPY_CHECKOUT_URL).pathname).toBe(`/cart/${PRODUCT.variantId}:1`);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]![0])).toMatch(/^https:\/\/api\.telegram\.org\//);
  });

  it("does not include a checkout button in a test notification", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true, result: { message_id: 43 } }));
    await sendDelivery(delivery, env, fetcher);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]!.body)).reply_markup).toBeUndefined();
  });

  it.each(["Possible stock", "Possible stock reminder", "Stock available reminder"])(
    "puts a plain checkout URL below the indicators in %s, preserving buttons", async (title) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true, result: { message_id: 45 } }));
      const compactBody = "Warcraft Forever Edition · 12:06:17 PM PDT\n🟢 Inventory: Yes\n🔴 Button: Disabled";
      await sendDelivery({ ...delivery, eventType: "stock", title, body: compactBody }, env, fetcher);
      const body = JSON.parse(String(fetcher.mock.calls[0]![1]!.body));
      expect(body.text).toBe(`${title}\n${compactBody}\n${ONE_COPY_CHECKOUT_URL}`);
      expect(body.text.split(ONE_COPY_CHECKOUT_URL)).toHaveLength(2);
      expect(body.parse_mode).toBeUndefined();
      expect(body.entities).toBeUndefined();
      expect(body.link_preview_options).toEqual({ is_disabled: true });
      expect(body.reply_markup.inline_keyboard).toHaveLength(3);
      expect(body.reply_markup.inline_keyboard[0][0].url).toBe(ONE_COPY_CHECKOUT_URL);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects legacy email deliveries without making any request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const legacy = { ...delivery, channel: "email" } as unknown as DueDelivery;
    expect(await sendDelivery(legacy, env, fetcher)).toMatchObject({ ok: false, retryable: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("defaults to Telegram when no provider is configured", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true, result: { message_id: 44 } }));
    const defaultEnv = { ...env };
    delete defaultEnv.PUSH_PROVIDER;
    expect((await sendDelivery(delivery, defaultEnv, fetcher)).ok).toBe(true);
    expect(String(fetcher.mock.calls[0]![0])).toMatch(/^https:\/\/api\.telegram\.org\//);
  });

  it("does not retry a blocked bot and does not expose provider response text", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      ok: false, description: "private response text",
    }, { status: 403 }));
    const result = await sendDelivery(delivery, env, fetcher);
    expect(result.retryable).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private response text");
  });

  it("does not leak token-bearing network errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(`failed https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`));
    const result = await sendDelivery(delivery, env, fetcher);
    expect(result.retryable).toBe(true);
    expect(JSON.stringify(result)).not.toContain(env.TELEGRAM_BOT_TOKEN);
  });

  it("leaves missing credentials retryable without making a request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect((await sendDelivery(delivery, { DB: env.DB, PUSH_PROVIDER: "telegram" }, fetcher)).retryable).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects an unknown provider rather than selecting an unintended destination", async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect((await sendDelivery(delivery, { ...env, PUSH_PROVIDER: "unknown" }, fetcher)).ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
