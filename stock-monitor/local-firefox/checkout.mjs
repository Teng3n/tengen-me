import { SafeStop, isCheckoutDestination } from "./guards.mjs";

// Observed in the public store HTML: a <button role="link">, not an
// accessibility-role button. Never fall back to generic submit/payment controls.
export async function clickCartCheckout(page, timeout = 15000) {
  const control = page.locator('button#CartDrawer-Checkout[name="checkout"][form="CartDrawer-Form"]');
  if (await control.count() !== 1) throw new SafeStop("checkout_control_missing_or_ambiguous");
  if ((await control.innerText()).trim() !== "Checkout") throw new SafeStop("checkout_label_changed");
  if (!await control.isVisible()) throw new SafeStop("checkout_control_not_visible");
  if (!await control.isEnabled() || await control.getAttribute("aria-disabled") === "true") {
    throw new SafeStop("checkout_control_disabled");
  }
  try { await control.click({ timeout }); }
  catch { throw new SafeStop("checkout_click_unconfirmed_no_retry"); }
}

export async function openCartCheckout(page, timeout = 30000) {
  await clickCartCheckout(page);
  try {
    await page.waitForURL(url => /\/(?:checkout|checkouts)(?:\/|$)/.test(url.pathname), { timeout });
  } catch { throw new SafeStop("checkout_navigation_unconfirmed_no_retry"); }
  if (!isCheckoutDestination(page.url())) throw new SafeStop("unexpected_checkout_destination");
  // No page inspection, form filling, or further clicking at checkout.
}
