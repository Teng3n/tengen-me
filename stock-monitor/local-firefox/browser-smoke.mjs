// Offline Firefox check. Uses a new temporary browser context, never a saved profile.
import { firefox } from "playwright";
import assert from "node:assert/strict";
import { inspectForms } from "./browser-read.mjs";
import { clickCartCheckout } from "./checkout.mjs";
import { PRODUCT, TEST_PRODUCT, SHIRT_TEST_PLAN, verifyProduct } from "./guards.mjs";

const browser = await firefox.launch({ headless: true });
try {
  const context = await browser.newContext();
  let networkRequests = 0;
  await context.route("**/*", async route => { networkRequests++; await route.abort(); });
  const page = await context.newPage();
  await page.setContent(`<form data-type="add-to-cart-form" onsubmit="event.preventDefault(); document.querySelector('#cart').textContent = 'Three copies in cart';">
    <input name="product-id" type="hidden" value="${PRODUCT.id}">
    <input name="id" type="hidden" value="${PRODUCT.variant}">
    <label for="quantity">Quantity</label><input id="quantity" name="quantity" type="number" value="1">
    <button name="add" disabled>Pre-order</button>
    </form><div id="cart"></div><button type="button">Checkout</button>
    <button type="button" onclick="document.body.dataset.payment='clicked'">Pay now</button>`);
  const feed = { id: PRODUCT.id, handle: PRODUCT.handle, title: PRODUCT.name,
    variants: [{ id: PRODUCT.variant, sku: PRODUCT.sku, price: 15000, available: true }] };
  assert.throws(() => verifyProduct(feed, []));
  const disabled = await inspectForms(page);
  assert.equal(disabled[0].buttonDisabled, true);
  assert.throws(() => verifyProduct(feed, disabled));
  // Altering OUR OFFLINE FIXTURE tests both states; no merchant protection is changed.
  await page.locator('button[name="add"]').evaluate(button => button.disabled = false);
  assert.equal(verifyProduct(feed, await inspectForms(page)).subtotalCents, 15000);
  const quantity = page.getByRole("spinbutton", { name: "Quantity", exact: true });
  await quantity.fill("1");
  assert.equal(await quantity.inputValue(), "1");
  await page.locator('form[data-type="add-to-cart-form"]')
    .filter({ has: page.locator(`input[name="id"][value="${PRODUCT.variant}"]`) })
    .locator('button[name="add"]').click();
  assert.equal(await page.locator("#cart").innerText(), "Three copies in cart");
  await page.getByRole("button", { name: "Checkout", exact: true }).click();
  assert.equal(await page.locator("body").getAttribute("data-payment"), null);
  await page.setContent(`<form data-type="add-to-cart-form" onsubmit="event.preventDefault()">
    <input name="product-id" type="hidden" value="${TEST_PRODUCT.id}">
    <input name="id" type="hidden" value="${TEST_PRODUCT.variant}">
    <label for="qty">Quantity</label><input id="qty" type="number" value="3">
    <button name="add">Pre-order</button>
    </form><button type="button">Checkout</button><button type="button" onclick="document.body.dataset.payment='clicked'">Pay now</button>`);
  const shirtFeed = { id: TEST_PRODUCT.id, handle: TEST_PRODUCT.handle, title: TEST_PRODUCT.name,
    variants: [{ id: TEST_PRODUCT.variant, sku: TEST_PRODUCT.sku, title: "S", available: true, price: 4000 }] };
  assert.equal(verifyProduct(shirtFeed, await inspectForms(page), SHIRT_TEST_PLAN).subtotalCents, 4000);
  await page.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("1");
  assert.equal(await page.getByRole("spinbutton", { name: "Quantity", exact: true }).inputValue(), "1");
  await page.locator('button[name="add"]').click();
  await page.getByRole("button", { name: "Checkout", exact: true }).click();
  assert.equal(await page.locator("body").getAttribute("data-payment"), null);
  assert.equal(networkRequests, 0);
  // Regression: the merchant uses an explicit link role on its checkout button.
  const checkoutFixture = `<button type="submit" role="link" id="CartDrawer-Checkout"
    name="checkout" form="CartDrawer-Form" onclick="document.body.dataset.checkout=String(Number(document.body.dataset.checkout || 0)+1)">Checkout</button>`;
  await page.setContent(`${checkoutFixture}<button onclick="document.body.dataset.payment='clicked'">Pay now</button>`);
  assert.equal(await page.getByRole("button", { name: "Checkout", exact: true }).count(), 0);
  await clickCartCheckout(page);
  assert.equal(await page.locator("body").getAttribute("data-checkout"), "1");
  assert.equal(await page.locator("body").getAttribute("data-payment"), null);
  await page.locator("#CartDrawer-Checkout").evaluate(control => control.disabled = true);
  await assert.rejects(clickCartCheckout(page), { code: "checkout_control_disabled" });
  await page.locator("#CartDrawer-Checkout").evaluate(control => { control.disabled = false; control.setAttribute("aria-disabled", "true"); });
  await assert.rejects(clickCartCheckout(page), { code: "checkout_control_disabled" });
  await page.setContent(checkoutFixture + checkoutFixture);
  await assert.rejects(clickCartCheckout(page), { code: "checkout_control_missing_or_ambiguous" });
  await page.setContent(checkoutFixture.replace(">Checkout<", ">Pay now<"));
  await assert.rejects(clickCartCheckout(page), { code: "checkout_label_changed" });
  await page.setContent(checkoutFixture.replace('role="link"', 'role="link" style="display:none"'));
  await assert.rejects(clickCartCheckout(page), { code: "checkout_control_not_visible" });
  await page.setContent('<button type="submit">Pay now</button>');
  await assert.rejects(clickCartCheckout(page), { code: "checkout_control_missing_or_ambiguous" });
  assert.equal(networkRequests, 0);
  console.log("PASS: exact role=link Checkout control clicked once; disabled, hidden, ambiguous, missing and changed-label controls rejected. No payment fallback.");
  console.log("PASS: Firefox reads disabled/enabled forms, selects one copy, and locates cart/checkout controls. No payment click or network requests.");
} finally { await browser.close(); }
