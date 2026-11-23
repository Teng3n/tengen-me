import test from "node:test";
import assert from "node:assert/strict";
import { openCartCheckout } from "../checkout.mjs";

function fixture({ clickFails = false, navigationFails = false, destination = "https://shop.app/checkout/example" } = {}) {
  const calls = { clicks: 0, waits: 0 };
  return { calls, page: {
    locator: () => ({ count: async () => 1, innerText: async () => "Checkout",
      isVisible: async () => true, isEnabled: async () => true, getAttribute: async () => null,
      click: async () => { calls.clicks++; if (clickFails) throw new Error("private URL must never be exposed"); } }),
    waitForURL: async predicate => {
      calls.waits++;
      if (navigationFails) throw new Error("private navigation details");
      assert.equal(predicate(new URL(destination)), true);
    },
    url: () => destination,
  } };
}

test("checkout hands off after one click and approved destination", async () => {
  const { page, calls } = fixture();
  await openCartCheckout(page);
  assert.deepEqual(calls, { clicks: 1, waits: 1 });
});
test("uncertain checkout click is sanitized and never retried", async () => {
  const { page, calls } = fixture({ clickFails: true });
  await assert.rejects(openCartCheckout(page), { code: "checkout_click_unconfirmed_no_retry" });
  assert.deepEqual(calls, { clicks: 1, waits: 0 });
});
test("uncertain checkout navigation never causes a second click", async () => {
  const { page, calls } = fixture({ navigationFails: true });
  await assert.rejects(openCartCheckout(page), { code: "checkout_navigation_unconfirmed_no_retry" });
  assert.deepEqual(calls, { clicks: 1, waits: 1 });
});
test("unapproved checkout destination stops", async () => {
  const { page, calls } = fixture({ destination: "https://example.org/checkout/private" });
  await assert.rejects(openCartCheckout(page), { code: "unexpected_checkout_destination" });
  assert.equal(calls.clicks, 1);
});
