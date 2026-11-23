# Windows Firefox supervised dry run

This is **not an automatic buyer or an overnight local monitor**. It is a one-shot,
supervised checkout-readiness helper. No payment-submit action or purchase mode exists.
It does not change the deployed Cloudflare monitor, polling interval, Telegram messages,
or hosted alert delivery. The helper's desired quantity is now **one**. Its conservative
item-subtotal ceiling is $150; this is not a final tax/shipping payment authorization.

## Update an existing installation: T-shirt test

The checkout fix targets the store's exact cart Checkout control, which is a button
with an explicit accessibility `link` role. It does not use a generic submit-button
fallback. Missing, ambiguous, hidden, disabled or renamed controls stop safely.
Checkout-click and navigation failures now have separate privacy-safe error codes;
neither is retried automatically. This update does not add payment capability.

Close the helper via its final terminal Enter prompt first. Extract the updated ZIP
into the same helper folder and replace source files when Windows asks. It contains
no credentials, browser profiles, or node_modules. Dependencies have not changed:
no reinstall or repeat login is needed if the earlier setup succeeded. The profile
remains outside this folder. In PowerShell, use `npm.cmd`, not `npm`, to avoid the
blocked npm.ps1 launcher; no execution-policy change is needed.

If extracting into a **new folder**, first run `npm.cmd ci` in that folder. The saved
Firefox login and installed browser are shared outside the source folder.

```powershell
npm.cmd run test-shirt
```

This explicitly selects **one Heroes of the Storm Orphea White T-Shirt, size S**,
the $40 variant from the user's screenshot. It never substitutes this shirt during
the Collector's Edition dry run. It stops if unavailable or the item subtotal is
above $40; this is not approval to purchase the shirt at any price.

1. It opens the shirt in your existing dedicated Firefox profile.
2. Inspect the store cart yourself. Return to the shirt page with an empty cart, then
   type `EMPTY` in the terminal. Never clear unrelated items merely for this test.
3. After one add attempt, inspect the cart: exactly one Orphea White T-Shirt, size S,
   expected USD unit price, and no other items. Type `ONE TEST SHIRT` only if correct.
4. The helper clicks Checkout once and stops all browser actions. **Do not click
   Pay now.** Manually check whether the account, shipping address, payment method,
   shipping charge, taxes, and final total are fully loaded and correct. The helper
   does not extract private checkout data or certify the final total.
5. Use the browser yourself to return to the store cart and remove only this test
   shirt. Check the cart is empty. Type `REMOVED` in the terminal to confirm cleanup
   and close. If you close without confirming, the shirt may remain in your cart.

Report only whether login persisted and whether shipping/taxes/total loaded. Do not
send passwords, payment details, addresses, cookies, or checkout URLs. If sharing a
screenshot, hide personal information and crop out the address bar. A successful
shirt test does not establish Collector stock or automatic payment
for the Collector's Edition. No payment capability is present in either mode.

## Install on the other Windows PC

Copy just this `local-firefox` folder there, **excluding node_modules**. Do not copy
the parent project's `.dev.vars`, any Firefox profile, or cookies. Install Node.js 22+
if it is not already present. Open PowerShell in the copied folder and run:

```powershell
npm.cmd ci
npm.cmd run install:browser
npm.cmd test
npm.cmd run test:browser
npm.cmd run setup
```

Playwright installs a separate automation-compatible Firefox build. This does not
control or modify your normal Firefox installation/profile. Sign in yourself in the
opened window; complete any legitimate verification yourself. The helper never reads
your password, exports cookies, or asks you to enter credentials into the terminal.
Press Enter in the terminal when done to close Firefox and retain its local session.
Store login does not guarantee a Shop Pay login or that it will remain valid.

The dedicated profile lives in `%LOCALAPPDATA%\BlizzardForeverDryRun\firefox-profile`.
It contains sensitive login state protected by your Windows account's filesystem
permissions, **not a custom encrypted vault**. Keep it private; do not sync, upload,
commit, or copy it to another device. We do not save screenshots, traces, page bodies,
checkout URLs, payment tokens, or raw browser/network errors. Close other tabs in this
dedicated browser before using the helper.

## Run a supervised test

```powershell
npm.cmd run dry-run
```

1. Opens only the exact Collector's Edition product. Reads a fresh public variant feed
   and the rendered matching form. Disabled buttons, unavailable inventory, ambiguity,
   failed checks, or detected challenges stop the run. HTTP 429 is not retried.
2. Checks the one-copy item subtotal against the $150 cap. **This is not a final
   tax/shipping budget check**; the helper never authorizes payment.
3. If available, asks you to inspect that the cart is empty and return to the product
   page. Type `EMPTY` only if that is true. It revalidates stock and price, sets quantity
   one, and clicks Pre-order once. It never clears or changes unrelated cart items.
4. Asks you to inspect the actual cart: exact Collector's Edition, one copy, correct
   USD unit price, no other items. This verification is **manual**, not an automatic cart
   parser. Type `ONE ONLY` only after checking. Otherwise stop.
5. Clicks Checkout once and stops all browser actions at the checkout destination.
   Review the resulting screen yourself. Do **not** buy a test item. Pay now is never
   clicked. Taxes, shipping, final total, saved payment, and order eligibility are not
   certified by this version.

If the Collector's Edition is unavailable, the helper stops; it does not substitute
the example T-shirt or try disabled controls. Creating a cart does not reserve stock
or guarantee stock. A challenge may appear later even if none appeared earlier.

## Stop and recover

At a prompt, press Enter without the required phrase to stop. Close via the terminal's
final Enter prompt. Ctrl+C is an emergency stop; closing/killing mid-step can leave cart
changes in place. Always inspect the cart manually before another run. Never repeat a
failed add just because no success appeared.

Only one helper can use this profile at a time. If a crash leaves `runner.lock`, first
verify every helper process and its dedicated Firefox window is closed. Then delete
only `%LOCALAPPDATA%\BlizzardForeverDryRun\runner.lock` using File Explorer. Do not delete
or alter your everyday Firefox profile. No Windows sleep settings, startup tasks,
services, remote-debugging ports, or firewall/security settings are changed.

## Verification scope

Unit tests cover identity, availability conflicts, subtotal limits, quantity/cart
attestations, challenge stops, no automatic retries, and exclusion of payment actions.
The Firefox smoke test uses only an offline synthetic page with external requests
blocked. It does not validate the live cart or Shop Pay navigation. Those require the
supervised test on your other PC when the exact product is available.

This helper does not establish that an unattended purchase integration is supported.
Any future implementation would additionally require a verified permitted payment
path, final total/identity checks, durable one-order state, and reconciliation after
uncertain outcomes. The user's latest requested intent is exactly ONE copy, then
permanently ignore future purchase triggers. The former three-copy $550 budget is
not reused as permission to pay $550 for one. The buyer trigger and automatic payment
are not implemented; there is no durable purchase-completion state in this dry run.
