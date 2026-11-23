# Firefox Direct Alert Helper 0.2.4

This version replaces local product-page checking with a secure connection to the existing hosted stock checker. The checker publishes committed evidence before waiting for Telegram. No extra Blizzard polling, no Telegram account access, and no page refresh/stability wait on your PC.

## Install and connect

1. Remove the old 0.1.x temporary helper in Firefox `about:debugging` → **This Firefox**, and close its control tab. Reload any product tab to remove old content scripts. Do not run both versions.
2. Extract **firefox-queue-helper-0.2.4.zip**. **Load Temporary Add-on** → choose its `manifest.json`. If upgrading from 0.2.x, pause and close its control tab first and load the new manifest instead. Do not clear extension storage to reset an attempt. Older versions cannot establish new connections under the new identified-receiver server policy; upgrade before arming.
3. Open the extension's control tab using the toolbar/puzzle menu.
4. Select your private **.helper.env** file in **Load pairing file**. Wait for **Connected**. This file is separate from the ZIP; do not post it in chat or share it. Never select the monitor's .dev.vars file.
5. Click **Enable & test alarm**, then **Test hosted connection**. You should hear sound and see an extension TEST page. This test never opens the store or changes stock state. Silence the alarm afterward.
6. In your normal non-container Firefox profile, sign into the store yourself and verify your cart is empty. No store tab needs to be watched or refreshed.
7. Check the one-copy authorization box, then **Arm one attempt**. If an earlier attempt is locked, inspect cart/order history before explicitly acknowledging rearming.
8. Keep Firefox and the control/sound tab open, Windows awake, and audio unmuted.

**A fresh currently-BOTH-positive snapshot can open checkout immediately when you arm.** The new tab opens selected in the control tab's window. The helper restores that window if minimized and requests foreground focus. Other window sizes/states are preserved. If the focus API fails, it requests taskbar attention without opening another tab. Windows may still prevent focus stealing, and this cannot unlock your screen. The alarm remains the fallback.

The harmless **Test hosted connection** uses this same tab-selection/foreground behavior. To verify on your PC, click it and immediately switch to another app; check whether Firefox returns with its TEST tab selected. Automated tests cover API calls, not actual Windows foreground behavior.

### Window targeting and diagnostics (0.2.3)

Arming now tracks the control tab ID, not a snapshot of its window ID. Immediately
before opening, both real checkout and harmless test resolve that exact tab's
current normal, non-private Firefox window. Moving the control tab to another
window no longer leaves the checkout targeting the old window. If the original
control tab is closed, replaced, or navigated away, the helper stops rather than
choosing an unrelated window. Closing a window during the final opening can still
fail; there is no blind retry after an uncertain creation.

The status box records a timestamp and a fixed diagnostic code. Last checkout
diagnostics survive later tests and extension restarts independently of the last
test result. Old 0.2.2 failures cannot be reconstructed after upgrading. Raw Firefox
error messages, URLs, secrets, and session data are never logged or saved.

- `opened`: Firefox returned a created tab and accepted the focus calls; not proof of stock or payment.
- `focus_failed`: tab creation succeeded but foregrounding failed; check other Firefox windows.
- `control_missing` / `control_invalid`: original control tab could not be found or is no longer an eligible control page. No tab creation attempted.
- `window_missing` / `window_invalid`: target window could not be found or is not a normal non-private window.
- `permission_denied` / `invalid_argument`: Firefox rejected an opening request with that error category.
- `tab_create_failed`: another creation error occurred; raw text is suppressed. Inspect tabs/cart before any explicit rearm.
- `evidence_expired`: evidence became stale or the receiver/control became unavailable during preflight; no tab creation attempted.

These codes identify a failure category, not always its root cause. The failed
September 21 attempt had no detailed diagnostic in 0.2.2, so a stale window remains
a hypothesis, not a confirmed explanation. The alarm still sounds for a qualified
attempt even when opening fails; always check the status text.

At checkout, verify the product, quantity ONE, shipping, final total (your limit is $250), and payment method. Pay manually. The helper never reads payment fields or clicks Pay now, and does not enforce your final-total cap.

## Trigger behavior

- Requires inventory **Yes AND button Enabled in the SAME fresh, healthy check**. Partial positives, unhealthy checks, or positives from separate checks cannot trigger or consume the attempt. Telegram independently retains its any-positive warning rule. Even both positives cannot guarantee successful checkout.
- The hosted checker normally targets five seconds. Either positive starts a fixed one-minute burst targeting two seconds, without extending on repeated positives. After expiry it returns to five seconds, and requires a verified both-negative result followed by a positive before another burst. Backoff/Retry-After overrides burst timing. No additional local polling occurs.
- The destination is hard-coded to the same one-copy cart permalink as Telegram. No received URL or arbitrary command is executed.
- Only matching-variant, well-formed checks at most 20 seconds old qualify. Incorrect Windows clock settings can cause checks to be rejected. Tests, unknown/negative states, stale checks, and previously consumed restock epochs do not open checkout.
- The one-attempt latch and consumed epoch are saved BEFORE opening. Additional signals, repeated reminders, reconnections, and restarts cannot automatically repeat it. Uncertain tab creation also stays locked. This is an attempt lock, not purchase detection.
- Explicit rearming permits a later restock epoch, not a repeat of an already-consumed epoch. Do not clear storage just to retry a purchase you have not checked.
- Opens the fixed one-copy checkout link once, sounds the alarm, and hands control to you. It does not click Pre-order, cart Checkout, queue controls, or payment.
- A queue does not prove quantity was accepted or inventory reserved. The store may sell out before payment. This removes local checking/Telegram delivery delays but does not guarantee beating a manual click or entering a queue.

## Connection and stopping

The control tab shows **Connected** or **Disconnected / reconnecting**, latest hosted evidence/time, and whether evidence is stale. A live connection with stale stock evidence is not a healthy stock check. Telegram/Healthchecks still provide their existing independent monitor alerts.

Transport loss retries after exponential delays of 2–60 seconds. A fresh snapshot on reconnection may trigger if still armed; old evidence cannot. No stock checks are requested by reconnecting. Sleep over 30 seconds or a stalled/closed control tab disarms the helper and sounds an alarm where possible.

Version 0.2.4 saves a random, non-secret installation identity and a monotonically
increasing handshake counter in extension-local storage. The counter is saved before
connecting. A newer handshake from the same identity may supersede its older socket
without disarming the helper. Delayed older/equal attempts are rejected. Socket
attachments and the server's last accepted identity/counter survive hibernation.
Delayed close events from an obsolete client socket cannot disarm its replacement.

A different identity cannot kick off a healthy connected receiver. It receives
`receiver_busy`, stops, and requires manual reconnect after the other helper is
closed. A stale handshake receives `receiver_outdated`; it cannot eject the newer
connection. A socket silent for more than 90 seconds is not protected as healthy;
regular helper pings refresh this activity. Closed sockets do not reserve a slot.
Closing/removing the old extension releases its connection; merely pausing does not.
The normal single-helper reconnect preserves arming and the existing attempt lock,
but restarting/reinstalling still requires manual pairing and arming. Do not copy
extension storage between profiles: identity is per installation, not a credential.
If Firefox removes storage with a temporary extension, it creates a new identity;
close the previous instance before connecting it.

Connection logs contain fixed outcomes (connected/reconnected/busy/outdated), never
keys or raw headers. This fixes the takeover-prone connection design; it does not
prove exactly which connection caused the September 22 disarm, because that older
version had no receiver identity or diagnostic history.

**Pause / stop actions** disarms checkout opening without pausing the hosted monitor. **Silence alarm** affects only sound. Removing the extension disconnects it. Pause cannot undo a navigation already submitted.

Temporary installation disappears on Firefox restart. Reinstall, reload the pairing file, and explicitly arm again. The pairing key is memory-only; the attempt latch remains in extension-local storage when Firefox preserves it. The helper does not auto-start or auto-arm on login.

## Privacy and hosting

The random 256-bit receiver-only key is kept in Cloudflare's secret manager and your private ignored .helper.env file. The extension holds it in memory only and sends it in a WebSocket subprotocol over TLS, never in the URL. Raw headers/protocols/errors must not be logged. Do not share DevTools network captures containing them.

The key grants stock-receiver access and a harmless test echo only. It is not the administrator token or Telegram bot token. It cannot pause the monitor, read detailed logs, send Telegram messages, or change stock state. Someone possessing it could occupy a vacant receiver slot; the non-secret identity is not a substitute for authentication. Keep the pairing file private and outside public backups/shares.

No content scripts run on the store. This version has no Gear Store host, cookie, or webRequest permission. It cannot inspect passwords/cards/sessions. Local state contains the non-secret receiver identity/counter, attempt/epoch IDs, control tab ID, status, safe diagnostic codes, and timestamps; never the pairing key.

This uses the existing paid Workers plan and checker Durable Object. It adds socket messages, one small latest-observation storage update per check, and reconnect requests. These count toward existing Cloudflare usage; no new service/subscription is purchased and no zero-overage guarantee is made. The hibernation-capable connection avoids keeping an idle object running solely for a socket.

## Maintainer setup / tests

From stock-monitor: `node scripts/Prepare-Direct-Helper.mjs` creates/reuses the private .helper.env file and configures HELPER_TOKEN via Wrangler stdin. It does not print the token. Deploy with `npm.cmd run deploy`. No new database migration or binding is required.

`node scripts/Verify-Direct-Helper.mjs` first checks the authenticated checker-state policy version and refuses older takeover-prone servers. It verifies test echo, hosted observation, same-identity reconnect, competitor rejection, and old-handshake rejection without browser/cart actions. An active user helper blocks the test; it is never ejected. The script reads local credentials privately and closes its test sockets afterward. Run while the user helper is disconnected for a complete test.

Tests:
- `npm.cmd run check` and `npm.cmd test`: hosted checks, notification isolation, stream authentication, reconnect snapshots, and test isolation.
- From firefox-queue-helper: `node --test test/direct.test.mjs`.
- `node test/direct-ui.check.mjs`: offline Firefox UI/receiver integration; uses the existing sibling local-firefox Playwright dependency. No Node install is needed on the watching PC.

Old source/tests remain for historical local-watcher versions but are excluded from the current package. Do not use their old UI or tests as the current direct receiver.

Sources: [Cloudflare hibernating WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [Firefox temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).
