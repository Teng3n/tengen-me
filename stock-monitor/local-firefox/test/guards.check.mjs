import { test } from "node:test";
import assert from "node:assert/strict";
import { PRODUCT, INTENT, TEST_PRODUCT, COLLECTOR_PLAN, SHIRT_TEST_PLAN, getPlan, assertProductUrl, verifyProduct, verifyCart, assertAction, isCheckoutDestination } from "../guards.mjs";
import { dryRun } from "../flow.mjs";

const feed = () => ({ id: PRODUCT.id, handle: PRODUCT.handle, title: PRODUCT.name,
  variants: [{ id: PRODUCT.variant, sku: PRODUCT.sku, available: true, price: 15000 }] });
const forms = () => [{ productId: PRODUCT.id, variantId: PRODUCT.variant, label: "Pre-order",
  visible: true, buttonDisabled: false, variantDisabled: false }];
function port() {
  const calls = [];
  return { calls, url: async () => calls.includes("checkout") ? "https://shop.app/checkout/test" : PRODUCT.url,
    challenge: async () => false, feed: async () => feed(), forms: async () => forms(),
    confirmEmptyCart: async () => true, setQuantity: async n => calls.push(`quantity:${n}`),
    addToCart: async () => calls.push("add"), cart: async () => ({ currency: "USD",
      items: [{ variantId: PRODUCT.variant, quantity: 1, unitPriceCents: 15000 }] }),
    openCheckout: async () => calls.push("checkout") };
}
test("one copy under the subtotal cap is only a preflight, never payment authorization", () => {
  assert.deepEqual(verifyProduct(feed(), forms()), { unitPriceCents: 15000, subtotalCents: 15000 });
  assert.equal(INTENT.paymentEnabled, false);
});
for (const label of ["Notify Me", "Sold Out", "Buy now"]) test(`rejects ${label}`, () => {
  const f = forms(); f[0].label = label; assert.throws(() => verifyProduct(feed(), f));
});
test("disabled and conflicting signals stop", () => {
  const f = forms(); f[0].buttonDisabled = true;
  assert.throws(() => verifyProduct(feed(), f), /availability_unknown/);
  const data = feed(); data.variants[0].available = false;
  assert.throws(() => verifyProduct(data, f), /currently_unavailable/);
});
test("wrong product, SKU, ambiguous forms, invalid price and excessive subtotal stop", () => {
  for (const change of [d => d.id = "wrong", d => d.variants[0].sku = "wrong",
    d => d.variants[0].price = 20000, d => d.variants[0].price = NaN]) {
    const d = feed(); change(d); assert.throws(() => verifyProduct(d, forms()));
  }
  assert.throws(() => verifyProduct(feed(), [...forms(), ...forms()]));
});
test("extra items and wrong quantity cannot pass cart verification", () => {
  for (const items of [[], [{ variantId: PRODUCT.variant, quantity: 2, unitPriceCents: 15000 }],
    [{ variantId: PRODUCT.variant, quantity: 3, unitPriceCents: 15000 }, {}]])
    assert.throws(() => verifyCart({ currency: "USD", items }, 15000));
});
test("payment actions and lookalike destinations are rejected", () => {
  for (const action of ["pay", "Pay now", "submit", "complete_checkout"]) assert.throws(() => assertAction(action));
  for (const url of ["http://shop.app/checkout/x", "https://shop.app.evil.test/checkout/x", "https://user@shop.app/checkout/x"])
    assert.equal(isCheckoutDestination(url), false);
});
test("successful dry run stops at checkout with no payment action", async () => {
  const p = port(); const result = await dryRun(p);
  assert.deepEqual(p.calls, ["quantity:1", "add", "checkout"]);
  assert.equal(result.paymentEnabled, false); assert.equal(result.finalTotalVerified, false);
});
test("challenge stops before any cart action", async () => {
  const p = port(); p.challenge = async () => true;
  await assert.rejects(dryRun(p), /verification_requires_user/); assert.deepEqual(p.calls, []);
});
test("unavailable stops before any cart action", async () => {
  const p = port(); p.forms = async () => [{ ...forms()[0], buttonDisabled: true }];
  await assert.rejects(dryRun(p)); assert.deepEqual(p.calls, []);
});
test("price changing during confirmation stops before cart mutation", async () => {
  const p = port(); let n = 0; p.feed = async () => { const d = feed(); d.variants[0].price -= n++; return d; };
  await assert.rejects(dryRun(p), /price_changed/); assert.deepEqual(p.calls, []);
});
test("failed add is not retried and checkout is not opened", async () => {
  const p = port(); p.addToCart = async () => { p.calls.push("add"); throw new Error("uncertain"); };
  await assert.rejects(dryRun(p)); assert.deepEqual(p.calls, ["quantity:1", "add"]);
});
test("cart mismatch stops before checkout", async () => {
  const p = port(); p.cart = async () => ({ currency: "USD", items: [] });
  await assert.rejects(dryRun(p)); assert.deepEqual(p.calls, ["quantity:1", "add"]);
});

function shirtPort() {
  const p = port();
  p.url = async () => p.calls.includes("checkout") ? "https://shop.app/checkout/test" : `${TEST_PRODUCT.url}?variant=${TEST_PRODUCT.variant}`;
  p.feed = async () => ({ id: TEST_PRODUCT.id, title: TEST_PRODUCT.name, handle: TEST_PRODUCT.handle,
    variants: [{ id: TEST_PRODUCT.variant, sku: TEST_PRODUCT.sku, title: "S", available: true, price: 4000 }] });
  p.forms = async () => [{ ...forms()[0], productId: TEST_PRODUCT.id, variantId: TEST_PRODUCT.variant }];
  p.cart = async () => ({ currency: "USD", items: [{ variantId: TEST_PRODUCT.variant, quantity: 1, unitPriceCents: 4000 }] });
  return p;
}

test("explicit shirt test adds exactly one and ends before payment", async () => {
  const p = shirtPort();
  const result = await dryRun(p, SHIRT_TEST_PLAN);
  assert.deepEqual(p.calls, ["quantity:1", "add", "checkout"]);
  assert.equal(result.mode, "test-shirt");
  assert.equal(result.quantity, 1);
  assert.equal(result.subtotalCents, 4000);
  assert.equal(result.paymentEnabled, false);
  assert.equal(result.finalTotalVerified, false);
});
test("test mode is opt-in and does not change the Collector intent", () => {
  assert.equal(getPlan("dry-run"), COLLECTOR_PLAN);
  assert.equal(getPlan("test-shirt"), SHIRT_TEST_PLAN);
  assert.equal(COLLECTOR_PLAN.intent.quantity, 1);
  assert.equal(COLLECTOR_PLAN.intent.maxTotalCents, 15000);
  for (const mode of ["buy", "pay", "auto", "test", "setup"]) assert.throws(() => getPlan(mode));
});
test("a shirt cannot substitute for the Collector or vice versa", async () => {
  const shirt = shirtPort(); const collector = port();
  await assert.rejects(dryRun(shirt), /unexpected_product_page/);
  await assert.rejects(dryRun(collector, SHIRT_TEST_PLAN), /unexpected_product_page/);
  assert.deepEqual(shirt.calls, []); assert.deepEqual(collector.calls, []);
});
test("shirt size and price must match the approved test", async () => {
  for (const mutate of [d => d.variants[0].title = "M", d => d.variants[0].price = 4001,
    d => d.variants[0].sku = "wrong", d => d.variants[0].id = "wrong"]) {
    const p = shirtPort(); const d = await p.feed(); mutate(d); p.feed = async () => d;
    await assert.rejects(dryRun(p, SHIRT_TEST_PLAN)); assert.deepEqual(p.calls, []);
  }
});
test("refusing the empty-cart prompt stops the test without mutation", async () => {
  const p = shirtPort(); p.confirmEmptyCart = async () => false;
  await assert.rejects(dryRun(p, SHIRT_TEST_PLAN), /empty_cart_not_confirmed/);
  assert.deepEqual(p.calls, []);
});
test("a second test shirt fails verification before checkout", async () => {
  const p = shirtPort(); p.cart = async () => ({ currency: "USD", items: [{ variantId: TEST_PRODUCT.variant, quantity: 2, unitPriceCents: 4000 }] });
  await assert.rejects(dryRun(p, SHIRT_TEST_PLAN), /cart_does_not_match_intent/);
  assert.deepEqual(p.calls, ["quantity:1", "add"]);
});
test("arbitrary injected purchase plans cannot run", async () => {
  const p = shirtPort();
  await assert.rejects(dryRun(p, { ...SHIRT_TEST_PLAN, intent: { quantity: 10, paymentEnabled: true } }), /unsupported_plan/);
  assert.deepEqual(p.calls, []);
});
test("an explicitly different URL variant fails closed", () => {
  assert.throws(() => assertProductUrl(`${TEST_PRODUCT.url}?variant=123`, TEST_PRODUCT), /unexpected_product_page/);
});
