import { assertAction, assertProductUrl, COLLECTOR_PLAN, SHIRT_TEST_PLAN, SafeStop, verifyProduct, verifyCart, isCheckoutDestination } from "./guards.mjs";

// Deliberately one attempt. An ambiguous mutation must never be retried automatically.
// Port abstraction lets tests exercise all transitions without touching a real store.
export async function dryRun(port, plan = COLLECTOR_PLAN) {
  if (![COLLECTOR_PLAN, SHIRT_TEST_PLAN].includes(plan)) throw new SafeStop("unsupported_plan");
  assertProductUrl(await port.url(), plan.product);
  if (await port.challenge()) throw new SafeStop("verification_requires_user");
  const quote = verifyProduct(await port.feed(), await port.forms(), plan);
  // User must inspect the cart themselves; do not clear unrelated items automatically.
  if (!await port.confirmEmptyCart()) throw new SafeStop("empty_cart_not_confirmed");
  // Revalidate after user input, so an old availability observation cannot trigger a cart change.
  assertProductUrl(await port.url(), plan.product);
  if (await port.challenge()) throw new SafeStop("verification_requires_user");
  const freshQuote = verifyProduct(await port.feed(), await port.forms(), plan);
  if (freshQuote.unitPriceCents !== quote.unitPriceCents) throw new SafeStop("price_changed");
  assertAction("set_quantity");
  await port.setQuantity(plan.intent.quantity);
  assertAction("add_to_cart");
  await port.addToCart();
  if (await port.challenge()) throw new SafeStop("verification_requires_user");
  verifyCart(await port.cart(), quote.unitPriceCents, plan);
  assertAction("open_checkout");
  await port.openCheckout();
  if (!isCheckoutDestination(await port.url())) throw new SafeStop("unexpected_checkout_destination");
  // No typing, clicking, evaluating scripts, or automatic navigation after handoff.
  return { status: "handoff_before_payment", mode: plan.mode, quantity: plan.intent.quantity, ...quote,
    maxTotalCents: plan.intent.maxTotalCents, finalTotalVerified: false, paymentEnabled: false };
}
