import { firefox } from "playwright";
import { mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { getPlan, SafeStop } from "./guards.mjs";
import { dryRun } from "./flow.mjs";
import { inspectForms } from "./browser-read.mjs";
import { openCartCheckout } from "./checkout.mjs";

const mode = process.argv[2];
if (!["setup", "dry-run", "test-shirt"].includes(mode) || process.argv.length !== 3) {
  console.error("Use npm.cmd run setup, dry-run, or test-shirt. There is no purchase mode.");
  process.exit(1);
}
if (process.platform !== "win32" || !process.env.LOCALAPPDATA) {
  console.error("This launcher requires Windows and LOCALAPPDATA."); process.exit(1);
}
const base = path.join(process.env.LOCALAPPDATA, "BlizzardForeverDryRun");
await mkdir(base, { recursive: true });
let lock;
try { lock = await open(path.join(base, "runner.lock"), "wx"); }
catch { console.error("Another helper may be open. Close it before restarting; see README for stale-lock recovery."); process.exit(1); }
let context;
let cartMutationAttempted = false;
const terminal = createInterface({ input: process.stdin, output: process.stdout });
try {
  context = await firefox.launchPersistentContext(path.join(base, "firefox-profile"), {
    headless: false, acceptDownloads: false,
  });
  context.setDefaultTimeout(15000);
  context.setDefaultNavigationTimeout(30000);
  const page = context.pages()[0] ?? await context.newPage();
  // No traces, screenshots, cookie exports, URL logs, or raw browser errors.
  console.log("DRY RUN ONLY: this helper never clicks Pay now or submits payment.");
  if (mode === "setup") {
    await page.goto("https://gear.blizzard.com/account/login", { waitUntil: "domcontentloaded" });
    console.log("Sign in yourself in this separate Firefox window. Do not type credentials in this terminal.");
    console.log("The browser keeps its own session locally. Do not share or sync its profile folder.");
    await terminal.question("Press Enter here when finished to close and save the browser session. ");
  } else {
    const plan = getPlan(mode);
    const { product, intent } = plan;
    console.log(mode === "test-shirt"
      ? "[TEST ONLY] One Orphea White T-Shirt, size S, item subtotal at most USD 40.00. NO PURCHASE. Remove it after inspecting checkout."
      : "Collector's Edition dry run: exactly one copy, at most $150 item subtotal; no payment.");
    await page.goto(`${product.url}?variant=${product.variant}`, { waitUntil: "domcontentloaded" });
    const form = page.locator('form[data-type="add-to-cart-form"]')
      .filter({ has: page.locator(`input[name="id"][value="${product.variant}"]`) });
    const port = {
      url: async () => page.url(),
      challenge: async () => {
        const text = await page.locator("body").innerText();
        return /verify (?:you are|you're) human|unusual traffic|access denied|too many requests|complete the security check|captcha failed/i.test(text)
          || await page.locator('iframe[title*="challenge" i], iframe[title*="captcha" i]').count() > 0;
      },
      feed: async () => {
        const url = new URL(`${product.url}.js`);
        url.searchParams.set("monitor_nonce", crypto.randomUUID());
        // Standalone public request: never exports or copies the browser's cookies.
        const response = await fetch(url, { cache: "no-store", redirect: "error",
          headers: { "Cache-Control": "no-cache, no-store", Accept: "application/json" },
          signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new SafeStop(response.status === 429 ? "rate_limited_no_retry" : "product_feed_failed");
        return await response.json();
      },
      forms: async () => await inspectForms(page),
      confirmEmptyCart: async () => {
        console.log(`Available signals matched. Inspect your cart manually; it must be empty. This test may add ${intent.quantity} item(s) but will not buy them.`);
        return (await terminal.question("Return to the product page, then type EMPTY to continue: ")).trim() === "EMPTY";
      },
      setQuantity: async quantity => {
        const quantityInput = page.getByRole("spinbutton", { name: "Quantity", exact: true });
        await quantityInput.fill(String(quantity));
        if (await quantityInput.inputValue() !== String(quantity)) throw new SafeStop("quantity_not_set");
      },
      addToCart: async () => {
        cartMutationAttempted = true;
        await form.locator('button[name="add"]').click();
      },
      cart: async () => {
        // Supervised verification avoids relying on undocumented private cart endpoints.
        console.log(`Inspect the visible cart: ${product.name}${product.size ? `, size ${product.size}` : ""}, quantity ${intent.quantity}, USD ${(lastUnitPrice / 100).toFixed(2)} each. No other items.`);
        const answer = (await terminal.question(`Type ${plan.cartPhrase} only if all of those match; otherwise press Enter to stop: `)).trim();
        if (answer !== plan.cartPhrase) throw new SafeStop("cart_not_confirmed");
        // This is a buyer-attested cart summary, NOT machine-observed cart evidence.
        return { currency: "USD", items: [{ variantId: product.variant, quantity: intent.quantity,
          unitPriceCents: lastUnitPrice }] };
      },
      openCheckout: async () => {
        console.log("Opening the cart's Checkout control once. Payment will not be submitted.");
        await openCartCheckout(page);
      },
    };
    let lastUnitPrice;
    const readFeed = port.feed;
    port.feed = async () => {
      const data = await readFeed();
      lastUnitPrice = data.variants?.find(v => String(v.id) === product.variant)?.price;
      return data;
    };
    const result = await dryRun(port, plan);
    console.log(JSON.stringify(result));
    console.log("Stopped before payment. Final tax/shipping total and payment readiness are NOT automatically verified. Do not click Pay now.");
    if (mode === "test-shirt") {
      console.log("Inspect manually: correct shirt/size/quantity; saved login, shipping address and payment method; fully loaded shipping/tax/total. Do not share private details or the checkout URL.");
      console.log("After inspection, use the browser to return to the store cart and remove ONLY this test shirt. Verify the cart is empty. The helper will take no more browser actions.");
      const cleanup = await terminal.question("Type REMOVED after removing the shirt; otherwise press Enter to close with cleanup still pending: ");
      console.log(cleanup.trim() === "REMOVED" ? "[TEST] You confirmed the shirt was removed. No payment submitted by helper."
        : "[TEST] Cleanup not confirmed. The test shirt may remain in your cart; remove it manually before any future test/order.");
    } else {
      await terminal.question("Inspect checkout yourself. Press Enter here to close the browser. ");
    }
  }
} catch (error) {
  console.error(error instanceof SafeStop ? `Stopped: ${error.code}` : "Stopped: browser or network step failed. Raw details suppressed for session privacy.");
  console.error(cartMutationAttempted
    ? "No automatic retry. A cart change may have succeeded; inspect the cart and remove any test item manually before another attempt."
    : "No cart change was attempted by the helper.");
  process.exitCode = 1;
  if (context) await terminal.question("Press Enter to close this helper's browser. ").catch(() => {});
} finally {
  terminal.close();
  await context?.close().catch(() => {});
  await lock.close();
  await unlink(path.join(base, "runner.lock"));
}
