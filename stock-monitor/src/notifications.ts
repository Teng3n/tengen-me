import { ONE_COPY_CHECKOUT_URL, type DeliveryResult, type DueDelivery, type Env } from "./types";

type FetchLike = typeof fetch;

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function missing(names: string[], env: Env): string[] {
  return names.filter((name) => !String(env[name as keyof Env] ?? "").trim());
}

async function sendTelegram(
  delivery: DueDelivery,
  env: Env,
  fetcher: FetchLike,
): Promise<DeliveryResult> {
  const missingNames = missing(["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"], env);
  if (missingNames.length > 0) {
    return { ok: false, retryable: true, error: `missing configuration: ${missingNames.join(", ")}` };
  }
  try {
    // Telegram requires a token in the URL. Never log the URL or raw fetch errors.
    const response = await fetcher(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      // workerd supports follow/manual only. Return redirects as failures;
      // never forward the token-bearing URL or message to a redirect target.
      redirect: "manual",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        // Visible URL (not a masked text link) allows ordinary-click opening in
        // Telegram Desktop. Keep it immediately below the two evidence rows.
        text: delivery.eventType === "stock" ? `${delivery.title}\n${delivery.body}\n${ONE_COPY_CHECKOUT_URL}`
          : `${delivery.title}\n\n${delivery.body}${delivery.url ? `\n\n${delivery.url}` : ""}`,
        disable_notification: false,
        link_preview_options: { is_disabled: true },
        allow_paid_broadcast: false,
        ...(delivery.eventType === "stock" ? {
          reply_markup: { inline_keyboard: [
            [{ text: "Review checkout for 1 copy", url: ONE_COPY_CHECKOUT_URL }],
            ...(delivery.url ? [[{ text: "View product", url: delivery.url }]] : []),
            [{ text: "Stop alerts", callback_data: `stop:${delivery.eventId}` }],
          ] },
        } : {}),
        ...(delivery.eventType === "test" && delivery.eventId.startsWith("test-repeat:") ? {
          reply_markup: { inline_keyboard: [[{ text: "Stop test alerts", callback_data: `stop:${delivery.eventId}` }]] },
        } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    // Gateways sometimes return HTML on error. Do not treat a definite 4xx as a timeout.
    const body = await response.json<{
      ok?: boolean;
      error_code?: number;
      result?: { message_id?: number };
      parameters?: { retry_after?: number };
    }>().catch(() => null);
    if (!response.ok || body?.ok !== true) {
      const status = response.ok ? body?.error_code ?? 502 : response.status;
      const retrySeconds = body?.parameters?.retry_after;
      return {
        ok: false,
        retryable: isRetryableStatus(status),
        error: `Telegram request failed (${status})`,
        ...(typeof retrySeconds === "number" && Number.isFinite(retrySeconds) && retrySeconds > 0
          ? { retryAfterMs: retrySeconds * 1_000 } : {}),
      };
    }
    if (!Number.isSafeInteger(body.result?.message_id)) {
      return { ok: false, retryable: true, error: "Telegram response missing message ID" };
    }
    return { ok: true, retryable: false, providerId: String(body.result!.message_id) };
  } catch {
    return { ok: false, retryable: true, error: "Telegram network failure" };
  }
}

export async function sendDelivery(
  delivery: DueDelivery,
  env: Env,
  fetcher: FetchLike = fetch,
): Promise<DeliveryResult> {
  // Reject legacy email rows defensively; no email provider can be called.
  if (delivery.channel !== "push") {
    return { ok: false, retryable: false, error: "Only Telegram push is supported" };
  }
  const provider = env.PUSH_PROVIDER ?? "telegram";
  if (provider === "telegram") return sendTelegram(delivery, env, fetcher);
  return { ok: false, retryable: false, error: "PUSH_PROVIDER must be telegram" };
}
