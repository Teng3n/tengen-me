# Blizzard Forever Collector's Edition stock monitor

**Current choice: Telegram-only.** No Resend, email credentials, Pushover, or sending
domain needed. Start with [START-HERE](START-HERE.md).

## Operational status — November 23, 2026

The hosted Worker and public health endpoint are reachable, but monitoring is currently
paused. The persisted state reports the last check on September 24, 2026, no pending or
failed notification deliveries, and no checks have run since the pause. This is the
authoritative current state; the activation notes below are historical deployment records.
Do not resume the monitor unless live store checks and Telegram alerts are wanted again.

The source currently passes TypeScript validation, 102 hosted-monitor tests, 26 local
checkout-guard tests, 44 Firefox receiver tests, both offline Firefox UI integrations,
and a Cloudflare deployment dry run. Local credentials remain ignored.

## Direct Firefox receiver — September 18, 2026

September 22 explicit checkout-opening simulation: admin-only POST
`/helper-checkout-test` requires `X-Checkout-Test-Confirm: OPEN_ONE_COPY_NO_PAYMENT`
and a unique 32-hex `X-Checkout-Test-Id`. It sends ONE synthetic both-positive check
to the current identified receiver using the actual opening path in 0.2.4, without
changing real monitor state, check logs, notifications, or the reconnect snapshot.
The envelope includes `simulation: true`; existing helpers still display their
normal trigger text, so announce clearly that this is a test before sending.
A reserved high test epoch avoids consuming a future real sequential stock epoch.
The helper must already be WATCHING and the test consumes its one-attempt latch.
Afterward inspect/clean the cart and explicitly rearm; payment remains manual.
Use `scripts/Invoke-CheckoutSimulation.ps1 -TestId <32-hex-id>` only after explicit
user authorization for a real checkout-link test. Reuse the SAME ID on any manual
retry; sends are durably recorded before delivery and never automatically repeated.
No receiver means HTTP 409 and nothing queued. A successful send is NOT receiver
acknowledgement, proof of tab creation, or proof that checkout/stock is available.
Deployment `29eba735-9455-49b7-9800-6f0a1fdf9bee`; 102 hosted + 25 receiver tests passed.
User-authorized test `933c52d8e1704ecfbb25476b7e416df9` was sent once at
2026-09-22T16:27:06.118Z. Browser outcome requires user confirmation.

September 22 connection fix: helper **0.2.4** adds a persistent non-secret receiver
identity and handshake sequence. The hosted receiver rejects competing identities
instead of ejecting the active client; same-identity reconnects supersede only older
attempts. Out-of-order/replayed handshakes cannot displace newer ones. Upgrade old
extensions to connect under this policy. Attempt locks and both-positive detection
remain unchanged. Deployment: `bb67af4e-c86a-4df1-b276-2ef28c6f9c48`.
96 hosted tests, 24 receiver tests, offline Firefox UI integration, and live transport
verification passed (same-identity reconnect, competing receiver rejection, old
handshake rejection, active connection preserved). No checkout/browser actions or
fabricated stock events were used. This addresses the takeover-prone design, not
a proven reconstruction of the September 22 incident. Telegram/check cadence is unchanged.

September 21 local-only update: Firefox helper **0.2.3** resolves the armed control
tab's current window immediately before opening, rather than reusing a window ID
saved when armed. It records fixed, privacy-safe opening codes and keeps the last
checkout diagnostic across harmless tests/restarts. 21 receiver tests and offline
Firefox UI integration passed, including moving the armed tab to a new window.
No hosted deployment, stock-state change, or live checkout test was needed.
The September 21 failure's root cause remains unconfirmed because the earlier
helper suppressed the original error. This fixes the identified stale-window risk.

Latest update: helper 0.2.2 requires BOTH positive signals in the same healthy check;
Telegram still warns on either positive. Replace older installed helpers to adopt
this stricter rule. The checker adds a persisted, fixed one-minute burst of two-second
checks after either positive, then returns to five seconds. Repeated positives do
not extend/restart the burst; after expiry, a verified both-negative result rearms
it for the next positive. Error/rate-limit backoff always wins. Maintenance and
Telegram reminder intervals are unchanged. Bursts add approximately 18 checks
(36 public requests) per full minute versus baseline; usage can increase accordingly.
The historical 0.2.0 behavior below is superseded by this paragraph.

Adaptive-check deployment: `0b1272d6-661f-4e16-ad1e-ac892722d3e5`.
TypeScript, 91 monitor tests, 16 receiver tests, offline Firefox UI integration,
and deployment dry-run passed. Burst behavior was tested with simulated evidence;
no live stock was fabricated and no checkout was opened during verification.

Deployed as `81fb1bfd-123f-433e-8df6-53dc42d5531c`. The hosted checker now publishes
committed observations to an authenticated, receiver-only WebSocket before waiting
for Telegram delivery. Existing five-second checks, Telegram reminders, and health
monitoring remain in place. Firefox helper 0.2.0 replaces local page polling and
opens the fixed one-copy checkout link once per explicitly armed attempt. Payment
remains manual. Any-positive evidence can trigger; it does not prove purchasability.

Live verification received an authenticated hello, test echo, and hosted observation
without browser/cart actions. TypeScript, 86 monitor tests, 13 receiver tests, and
an offline Firefox UI integration test passed. The extension still requires user
installation, private pairing-file loading, sound testing, and explicit arming.
See [receiver setup and limitations](firefox-queue-helper/README.md).

The older deployment notes below describe historical behavior and are superseded
by this section where they say no PC trigger is available.

## Current alert rule — any positive source

### Compact Telegram messages — September 18

Deployed as `e8923436-c03d-4b70-9e2d-b4b33480b632`; 76 monitor tests and TypeScript pass.

Stock alerts and reminders show a heading, short product name, Pacific check
time, two signal rows (green Yes/Enabled, red No/Disabled, yellow Unknown), then
the full one-copy checkout URL immediately below the indicators. It is plain text,
not a masked link, for ordinary-click opening as verified in Telegram Desktop.
Link previews remain disabled.
"Stock available" means both signals are positive; "Possible stock" means only one.
The checkout, product, and Stop buttons are unchanged. Price, quantity instructions,
and long explanatory paragraphs are omitted from stock messages.
Reminders read the exact latest committed check evidence rather than recycling the
original event body. Missing, stale, or no-longer-positive evidence suspends delivery.
Existing persisted cycles also use this format; historical sent messages are untouched.

Deployed September 16, 2026 as `dc80aebf-0fd7-4176-8f60-a64bd187d905`.
65 tests, TypeScript, and deployment dry-run passed. Scheduled checks at
11:11:35 and 11:11:40 PM America/Los_Angeles recorded `alertRule: any-positive`,
both endpoints HTTP 200, and both signals unavailable. The monitor was unpaused
with no pending/retrying/permanently failed notifications at verification.

At the user's request, either independently validated inventory availability OR an
enabled purchase/pre-order button for the exact product variant triggers Telegram.
Single-source alerts say **POSSIBLE AVAILABILITY**, including when the other source
disagrees, is malformed, or fails. They do not confirm checkout availability.
Both valid negative signals are required to end/rearm a cycle; absent a positive,
incomplete evidence stays unknown. Changing which source is positive does not create
duplicate stock events. Five-second checking/reminders and 30-day retention remain.
Endpoint failures still back off and honor Retry-After even if the other source is
positive. Prolonged partial failures still trigger health warnings and withhold
healthy external pings. Historical logs retain their original rule and status.
This changes hosted notifications only; the supervised local helper and its payment
disabled guard are unchanged. No automatic purchase or PC trigger is enabled.

## Live five-second update — September 16, 2026

Deployed as `e158f04f-97b7-43d1-99dc-0639a4407760`: healthy stock checks target every five seconds
(17,280 checks / 34,560 public endpoint requests per day). User chose to upgrade
Cloudflare Workers rather than shorten detailed check retention: keep **30 days**.
The user confirmed Workers Paid was active before deployment on September 16.
This supersedes the historical thirty-second deployment described below.

The five-second scheduler persists separate maintenance deadlines: Healthchecks is
pinged at most once per 30 seconds after a definitive result (its API rate-limits above
five pings/minute), and expired check logs are pruned hourly. Every stock check still
records its full evidence. Under the current any-positive rule, disagreement with one
positive source triggers possible-availability alerts and retains normal polling.
Actual request failures and 403/429 retain exponential backoff
and honor Retry-After. Slow checks do not overlap or cause catch-up bursts.

55 monitor tests, TypeScript and deployment dry-run pass. Five-second cadence is a
target, not a guarantee. Telegram reminders now target five seconds while fresh
checks show at least one positive source; stop conditions and the local helper are unchanged.
Automatic purchase is not enabled. The user performed the plan upgrade.
Workers Paid has a $5/month base with possible usage charges.

Sources verified September 16:
[Cloudflare pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
[Healthchecks ping limits](https://healthchecks.io/docs/http_api/).

## Local Firefox supervised test — September 15, 2026

The separate [Windows Firefox helper](local-firefox/README.md) prepares a one-copy
checkout only during a supervised dry run and stops before payment. It has no buy
mode or overnight polling. It does not modify this deployed monitor or its existing
alert delivery. Its 26 unit tests and offline Firefox smoke test pass; the updated
monitor's 51 tests also pass. The explicit `test-shirt` mode uses one Orphea White
T-Shirt (size S, item subtotal no more than $40) for a supervised, no-payment checkout
test, with manual cleanup. The user verified automatic checkout and confirmed test
cleanup on September 15. No payment was submitted. Payment and a local trigger
listener are not implemented.

## Thirty-second checker update — September 15, 2026

Deployed version: `65e7e98c-5169-4a62-b48a-d7e5bb9770b3`. Activated at
1:05:23 PM America/Los_Angeles. Initial fresh inventory was false and the matching
Pre-order button disabled ($150). This is historical evidence, not current stock.

The new StockChecker SQLite Durable Object targets 30 seconds between healthy check
starts. The existing two-minute Cron now only ensures that this object's alarm exists;
it does not run a second checker. Normal manual checks use the same coordinator.
Duplicate alarm deliveries and restarts honor a persisted next-run time/recovery lease.
Alarms are approximate, not a timing guarantee; brief restocks can still be missed.

Each check makes one fresh request per public endpoint. Unknown results back off from
one minute, or two minutes for HTTP 403/429, exponentially up to 30 minutes. A longer
Retry-After is honored without truncation. There are no rapid inline retry bursts or
attempts to bypass restrictions. Backoff persists across restarts. Healthchecks remains
configured separately: a long backoff can intentionally produce an unhealthy alert.
The diagnostic /probe bypasses the scheduler; use sparingly, never as another poller.

The target is 2,880 checks/day and 5,760 store requests/day. Cloudflare's current free
SQLite Durable Objects allowance includes 100,000 requests/day, 13,000 GB-s/day, and
100,000 rows written/day. This monitor is expected to fit; account-wide usage and D1
quotas still matter. No paid upgrade is needed or authorized. Free quota exhaustion
causes errors. Telegram repeats remain separate from checking.

Authenticated GET /checker-state reports nextAt, failures and lastStatus. The public
/health still reports actual check timestamps and notification state. /pause prevents
stock requests (the coordinator can still wake); /resume preserves any existing
rate-limit cooldown. Pause Healthchecks separately if intentionally stopping.

Latest desired quantity is ONE, including new Telegram checkout links. This change
does not create an unattended buyer. A future authenticated PC trigger must use a
durable one-order latch, reject stale/duplicate events, and stop for uncertain order
outcomes rather than retry payment. Telegram remains the alert channel, not a source
of trusted purchase commands. No card secrets belong in scripts, logs, or trigger data.

## Historical initial deployment — September 14, 2026

Hosted at https://blizzard-forever-stock-monitor.teng3n.workers.dev and activated.
D1 ID: bfec4043-dbf0-424b-8f65-e10853f75937. Deployed version:
bf6f8e90-8f2f-4aeb-bdb5-489aede99eda. Two-minute Cron Trigger is installed.
No paid plan upgrade was performed. Usage remains subject to the account's quotas.

The hosted test sent five clearly labeled messages about 30 seconds apart; the user's
Stop action reached the authenticated Telegram webhook and persisted acknowledgement.
The test timer was cancelled before normal monitoring was activated. The initial live
check at 4:12:56 PM PDT found inventory false and the matching Pre-order button disabled,
price $150.00. This is historical deployment evidence; use /health for the latest result.
An automatic Cron Trigger check completed successfully at 4:14:37 PM PDT with the same
unavailable result, independently of the manual activation request.
TypeScript and 37 tests passed. Credentials are in host secrets and ignored local settings.
The monitor runs independently of the Windows PC; local terminals may be closed.

Quick operations from this directory (Windows PowerShell):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Invoke-Monitor.ps1 -Action health
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Invoke-Monitor.ps1 -Action pause
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Invoke-Monitor.ps1 -Action resume
```

Replying stop in Telegram silences one stock cycle; it does not pause future stock checks.
Use the pause command to suspend monitoring. Keep the ignored local settings for admin
commands. Never rerun pairing for this deployed bot: it now uses a webhook, not polling.

## Repeating stock alerts (new)

Five-second reminders deployed September 16 as
`eebd7f9a-cbd1-433c-9fa6-1b2dc32f771a`. All 55 monitor tests pass, including
five-second repeats, restart persistence, Stop, sold-out/unknown suppression, and
Telegram rate-limit backoff. GET /reminders-state exposes `intervalMs: 5000`.
No live test notifications were sent or monitoring paused for this update.

After the first verified available result, stock notifications repeat approximately every
5 seconds until you reply **stop**, **stop it**, **/stop**, or tap **Stop alerts**. These
are intentional reminders, not duplicate stock events. Checks target 5 seconds with
backoff; reminders cite the latest check time rather than imply a new successful check.
Unknown or evidence older than three minutes suspends reminders. Verified unavailability
ends the cycle. A later verified restock creates a new cycle, even if you stopped the last.
Pausing cancels the current reminder cycle; resuming does not revive a cancelled cycle.

A SQLite-backed Durable Object persists the cycle, acknowledgement, failures, and next
alarm across restarts. Only your paired private Telegram user/chat can stop it; old stock
buttons and messages predating the cycle cannot silence a new restock. Webhooks require a
separate secret header. An already-in-flight notification may arrive just after Stop.
Alarm timing, delivery, and exactly-once sending are not guaranteed. Rate limits/errors
delay repeats with exponential backoff, without catch-up bursts. Permanent send failures
end reminders and are visible at authorized GET /reminders-state, not D1 delivery totals.

Cloudflare Free supports SQLite Durable Objects: 100,000 requests and 13,000 GB-s daily,
verified September 14, 2026. A continuous day of reminders is about 2,880 alarm invocations.
Actual use counts against account-wide quotas; free quota exhaustion causes failures,
not an automatic paid upgrade. See [pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
and [alarm semantics](https://developers.cloudflare.com/durable-objects/api/alarms/).

Telegram sounds cannot be forced through Silent Mode by this bot. Allow Telegram in
Sleep/Do Not Disturb Focus, enable its notification sounds, and test on a locked phone.
This is not a guaranteed wake-up alarm. Ordinary test notifications do not repeat.

### Stop-webhook deployment prerequisite

The existing deployment is registered and tested. For a future fresh deployment:

1. Existing paired users run the following once to add only the new secret locally:
   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Prepare-ReminderWebhook.ps1`.
   Do not rerun the original pairing helper or display .dev.vars.
2. Upload TELEGRAM_WEBHOOK_SECRET along with the existing host secrets. Deploy with the
   new Durable Object binding/migration in wrangler.jsonc, leaving the D1 monitor paused.
3. Register the webhook, replacing the origin with the real deployed Worker:
   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Prepare-ReminderWebhook.ps1 -Register -WorkerUrl https://YOUR-WORKER.workers.dev`.
   The helper verifies paused state and host secret, refuses to replace a different existing
   webhook, and never prints tokens. It preserves pending updates. Do not run getUpdates
   pairing or another polling consumer once the webhook is installed.
4. While paused, call the authorized /test-reminders endpoint and verify a real stop
   reply/button reaches the test coordinator before activation. This test is separately
   labeled, uses a separate object, never alters stock state, and expires after 3 minutes.
   GET /test-reminders-state shows acknowledgement. Ordinary /test-notifications is one-shot.

The secret alone does not prove webhook registration; keep checks paused until the
above registration and stop test complete. No new user account is required.

A Cloudflare Durable Object targets checks every 5 seconds; D1 stores state, evidence, and retries.
Deployment has been approved and completed. Any paid service still requires approval.

## Detection

An alert requires at least one positive fresh signal for the exact variant:

1. Shopify's public `.js` product feed reports availability.
2. Its matching server-rendered purchase/pre-order button is enabled.

Disabled Pre-order, Notify Me, and Sold Out are not positive button signals, but a
valid positive inventory feed can independently trigger an alert. Conversely a
matching enabled button can trigger even if inventory is negative or unverified.
If neither is positive, both validated negative signals mean unavailable; otherwise
the result is unknown. Each run fetches both endpoints using unique query values
and no-cache headers, one attempt per endpoint with timeouts and scheduler backoff.
No search extracts, checkout requests, orders, or anti-bot bypasses are used.

Product: [World of Warcraft: Forever Collector's Edition](https://gear.blizzard.com/products/wowccl0012-world-of-warcraft-forever-collectors-edition)

- Product ID: `10220685590777`
- Variant ID: `48891708506361`
- SKU: `WOWCCL001200`
- Earlier September 14, 2026 inspection: $150.00, feed unavailable, matching Pre-order
  disabled in HTML and browser. This is historical evidence, not current stock.

## Hosting and cost

Selected: Cloudflare Workers + D1 Free and Telegram bot messages. Expected additional
cost is $0 within free quotas; tengen.me is not required. Paid broadcasts are disabled.

Limits verified during September 14 setup: Workers Free 100,000 requests/day, 5 cron
triggers/account, 10 ms CPU/invocation; D1 Free 5 million rows read/day, 100,000 rows
written/day, 5 GB storage. Two-minute checks use about 720 invocations/day. Parsing
the page may hit the CPU limit. Workers Paid starts at $5/month, but is not authorized.
Recheck before deployment or upgrade:
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[limits](https://developers.cloudflare.com/workers/platform/limits/),
[cron scheduling](https://developers.cloudflare.com/workers/configuration/cron-triggers/),
[Telegram limits](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this).

## Reliability

- D1 persists state, evidence, events, and Telegram delivery records across restarts.
- First verified availability alerts, including the first active run. Continued stock
  does not create another event. Only verified unavailability rearms; unknown does not.
- Telegram retries persist with exponential backoff from 2 minutes to 6 hours and honor
  Telegram's retry_after. Successful deliveries are not retried; permanent rejections
  remain visible in /health.
- Telegram has no send-message idempotency key. Acceptance followed by a lost response
  or crash before saving success can cause a duplicate on retry. Exactly-once delivery
  is not guaranteed.
- Only push rows are queued or processed. The original database schema still permits
  legacy email rows, but they are ignored and excluded from delivery-health totals.
  Email and Pushover sending code has been removed.
- Five consecutive unknown checks create an unhealthy Telegram alert; the next definitive
  check creates a recovery alert. Check evidence retention defaults to 30 days.
- Logs contain evidence, status, attempts, and sanitized errors, not secrets or raw provider
  responses. Telegram's token-bearing API URL must never be logged.
- New hosted databases start paused. Pause suspends checks and background retries.
  Manual tests still send while paused and also process other due deliveries.
  Authorized POST /retry-notifications processes existing due deliveries without creating
  another test event, including while paused; persisted backoff still applies.

An independent Durable Object alarm is active and checks every two minutes for main
checks that have stopped completing for over 10 minutes. It sends one Telegram warning
per incident and a recovery message, with persisted retry state. It stays quiet while
paused. This detects a stopped cron/main handler, not a Cloudflare-wide or Telegram outage.

External watchdog: [Healthchecks.io](https://healthchecks.io/). HEALTHCHECKS_URL was
activated as a Cloudflare secret on September 14, 2026, and the hosted monitor's real
check received an accepted heartbeat response at 5:32 PM America/Los_Angeles.
The intended dashboard settings are period 2 minutes, grace 8 minutes, with Telegram
enabled for this check; dashboard configuration and phone delivery need user confirmation.
This uses one check slot, not a slot per ping. Its Free tier supported 20 checks during
setup; [verify pricing](https://healthchecks.io/pricing/) if changing plans.

The watchdog receives healthy pings only after definitive stock checks; these do not
certify notification delivery. It detects stopped or persistently failing checks.
Successful pings log `healthchecks_ping_accepted`; rejected acknowledgments, HTTP errors,
and network failures log `healthchecks_ping_failed` without the URL or response body.
HTTP 200 alone is not sufficient: the acknowledgment body must be `OK`.
In Healthchecks, verify the check is Up and use the Telegram integration's test action
to verify delivery to your phone. Pause/resume the Healthchecks check separately when
intentionally pausing/resuming this monitor to avoid expected outage warnings.
The built-in watchdog also relies on Cloudflare. A provider-wide outage can remain silent
without an external watchdog. A Telegram outage can silence both
alert sources. /health returns a snapshot, not a stale-aware HTTP failure code.

## Local setup and tests

```powershell
Set-Location 'C:\Users\teng3\Documents\Tengen.me\stock-monitor'
npm ci
npm run check
npm test
npm run build
npm run setup:notifications
npm run db:migrate:local
npm run dev
```

Build is a dry run, not deployment. The helper prompts for only your Telegram token,
verifies a private pairing message, and creates ignored .dev.vars without overwriting
existing secrets. Alternatively use .env.example for manual local configuration.
Never commit .dev.vars, put tokens in commands, or paste them into chat.

Tests cover detection, first availability, duplicate suppression, rearming, Telegram-only
queueing, retry completion, labeled tests, token-safe errors, rate limits, and checkout links.

## Deployment (only after approval)

1. Sign into Cloudflare if necessary with `npx wrangler login` (authenticated locally
   during setup). Create the hosted database with `npm run db:create`.
2. Replace REPLACE_WITH_D1_DATABASE_ID in wrangler.jsonc with the returned ID.
3. Run `npm run db:migrate:remote` to initialize the paused hosted database.
4. Upload secrets interactively or through the host secret manager:

   ```powershell
   npx wrangler secret put ADMIN_TOKEN --config ./wrangler.jsonc
   npx wrangler secret put TELEGRAM_BOT_TOKEN --config ./wrangler.jsonc
   npx wrangler secret put TELEGRAM_CHAT_ID --config ./wrangler.jsonc
   npx wrangler secret put HEALTHCHECKS_URL --config ./wrangler.jsonc
   ```

   The last secret is optional. PUSH_PROVIDER=telegram is already configured.
   Secret uploads can create a Worker, so require deployment approval.
   Local .dev.vars is not automatically uploaded by deployment.
5. Run `npm run deploy`. Keep the database paused until the phone test succeeds.
6. Inspect health and test (Windows PowerShell or PowerShell 7, with hidden token input):

   ```powershell
   $workerUrl = 'https://blizzard-forever-stock-monitor.YOUR-SUBDOMAIN.workers.dev'
   $protectedToken = Read-Host 'ADMIN_TOKEN' -AsSecureString
   $adminToken = [System.Net.NetworkCredential]::new('', $protectedToken).Password
   $monitorHeaders = @{ Authorization = "Bearer $adminToken" }
   Invoke-RestMethod "$workerUrl/health"
   Invoke-RestMethod -Method Post "$workerUrl/test-notifications" -Headers $monitorHeaders
   ```

   Confirm one [TEST] Telegram message on the iPhone. Each call creates a new test event.
   An HTTP response alone does not prove phone delivery. Tests have no checkout shortcut.
7. Start checks after confirming receipt:

   ```powershell
   Invoke-RestMethod -Method Post "$workerUrl/resume" -Headers $monitorHeaders
   Invoke-RestMethod -Method Post "$workerUrl/check" -Headers $monitorHeaders
   Invoke-RestMethod "$workerUrl/health"
   ```

## Operations and troubleshooting

```powershell
# Recent evidence and live host logs
Invoke-RestMethod "$workerUrl/logs?limit=20" -Headers $monitorHeaders
npm run logs
# Pause/resume the external watchdog separately in its dashboard
Invoke-RestMethod -Method Post "$workerUrl/pause" -Headers $monitorHeaders
Invoke-RestMethod -Method Post "$workerUrl/resume" -Headers $monitorHeaders
```

To stop completely, pause first and disable the Cron Trigger in Cloudflare's dashboard,
or remove triggers.crons and redeploy. Preserve D1 state if you might resume later.
Export any data you want before deleting hosted resources.

- **No push:** check notification permission, unmuted chat, Focus settings, token/chat ID,
  and that you started and have not blocked the bot. Inspect /health for delivery failures.
  After fixing a permanent rejection, send a new labeled test; those failures do not retry.
- **Unknown checks:** inspect /logs. If the store blocks requests, pause and reassess;
  do not bypass protections or use the feed alone.
- **Watchdog down:** inspect last definitive check time and Worker errors. A healthy ping
  does not prove Telegram delivery.
- **CPU errors:** consider another host or paid Workers only with approval. Do not weaken detection.

## Limitations and purchasing

Brief restocks between checks can be missed; scheduling and error backoff can delay checks.
Public feeds and HTML may change or be blocked. Server HTML may differ from the button
after browser scripts run. Single-source signals can produce false alarms; missing
or conflicting evidence without a positive remains unknown. This is not continuous
runtime browser verification. Availability does not guarantee
stock remains by checkout.

Stock alerts include product name, price if available, Los Angeles check time, product
link, and a **Review checkout for 1 copy** shortcut based on
[Shopify cart permalinks](https://shopify.dev/docs/apps/build/checkout/create-cart-permalinks).
The monitor never fetches this shortcut. Store-specific behavior is untested with live
stock; use the product link if rejected. You review the total and approve payment.
No card data is collected; human-approval and anti-bot steps are not bypassed.
