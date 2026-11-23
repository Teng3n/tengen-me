// One-shot visual preview. Run with node --env-file=.dev.vars from the project.
// No monitor state changes, repeating cycle, cart request, or payment action.
import { stockMessage } from "../src/stock-message.ts";
import { PRODUCT, ONE_COPY_CHECKOUT_URL } from "../src/types.ts";

const token = process.env.TELEGRAM_BOT_TOKEN;
const chat = process.env.TELEGRAM_CHAT_ID;
// Opt-in comparison only; never changes hosted alerts or monitoring state.
const plainLinkTest = process.argv.includes("--plain-link");
if (!token || !chat) {
  console.error("Telegram credentials missing; no message sent.");
  process.exit(1);
}
const preview = stockMessage({
  status: "available", checkedAt: new Date().toISOString(), evidence: {
    inventoryAvailable: false,
    button: { state: "enabled", matchingForms: 1, labels: ["Pre-order"],
      variantInputDisabled: [false], buttonDisabled: [false] },
    productFeed: { url: "test", attempts: 0, elapsedMs: 0 },
    productPage: { url: "test", attempts: 0, elapsedMs: 0 }, reasons: [],
  },
}, true);
try {
  const triggeredAt = new Date();
  const preciseTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit",
    second: "2-digit", fractionalSecondDigits: 3, timeZoneName: "short",
  }).format(triggeredAt);
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chat,
      text: plainLinkTest
        ? `[TEST] Link-opening check\nClick the full URL below normally, without Ctrl:\n\n${ONE_COPY_CHECKOUT_URL}\n\nTest only — NOT a stock alert. Opens the real one-copy checkout link; no automatic payment.\nSent request: ${preciseTime}`
        : `[TEST] ${preview.title}\n${preview.body}\n${ONE_COPY_CHECKOUT_URL}\nSent request: ${preciseTime}\nTest only — simulated signals.`,
      disable_notification: false, allow_paid_broadcast: false,
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: [
        [{ text: "Review checkout for 1 copy", url: ONE_COPY_CHECKOUT_URL }],
        [{ text: "View product", url: PRODUCT.url }],
        // Isolated callback cannot acknowledge or silence a real restock cycle.
        [{ text: "Stop alerts (test)", callback_data: `stop:test-preview:${crypto.randomUUID()}` }],
      ] },
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true) {
    console.error(`Test send not confirmed (HTTP ${response.status}); no automatic retry.`);
    process.exitCode = 1;
  } else {
    const acknowledgedAt = new Date();
    console.log(JSON.stringify({ sent: true, test: true, plainLinkTest, repeating: false,
      triggeredAt: triggeredAt.toISOString(), triggeredPacific: preciseTime,
      acknowledgedAt: acknowledgedAt.toISOString(), requestMs: acknowledgedAt.getTime() - triggeredAt.getTime(),
      messageId: body.result?.message_id }));
  }
} catch {
  console.error("Test delivery uncertain; raw error suppressed. Check Telegram before retrying.");
  process.exitCode = 1;
}
