# Start here: Telegram-only stock alerts

No Resend account, email settings, paid push app, or domain/DNS changes are needed.
Your existing Telegram bot is paired and the monitor is deployed at
https://blizzard-forever-stock-monitor.teng3n.workers.dev.
The hosted repeating test and your Stop button action were verified September 14, 2026.
As of November 23, 2026, the hosted monitor is deliberately paused; its public health
endpoint is reachable, has no pending or failed deliveries, and shows the last check on
September 24. Resume it only when you want live stock checks and Telegram alerts again.
Your PC can be off. **Do not rerun pairing for this deployed bot.**
The steps below are retained for a future fresh setup; current operations are in the README.

## 1. Pair your bot privately

You already created a bot with @BotFather and tapped Start in its private chat.
Run this in your existing Windows PowerShell (no PowerShell 7 installation needed):

```powershell
Set-Location 'C:\Users\teng3\Documents\Tengen.me\stock-monitor'
npm run setup:notifications
```

The helper asks for your bot token with hidden input. Send the unique pairing phrase
it displays to your bot, then press Enter in PowerShell. It verifies your private chat ID
and saves it, the bot token, and a random admin token in the git-ignored `.dev.vars` file.
Do not paste your token into this conversation.

It refuses to overwrite existing settings. It does not deploy, send a notification,
change DNS, or make purchases. If pairing fails, confirm the exact text went to this bot,
not BotFather. Avoid a bot with another application consuming its updates.

## 2. Finish activation

Tell Codex: **“The Telegram credentials are ready.”** Deployment requires your approval.
After deployment, send one clearly labeled `[TEST]` notification while the monitor is
paused. Confirm it arrives on your iPhone before enabling two-minute checks. Keep the
chat unmuted and allow Telegram notifications; iPhone Focus settings may silence them.

Stock alerts now support 30-second reminders until you reply **stop** or tap **Stop alerts**.
The hosted stop webhook must be registered and tested before activation; see the README.
Your existing bot token is enough. The additional webhook secret is generated locally,
not something you need to obtain from Telegram. Regular test messages do not repeat.

## 3. Detect silent failures

The independent [Healthchecks.io](https://healthchecks.io/) watchdog connection is now
active, with a real hosted heartbeat accepted September 14, 2026 at 5:32 PM Pacific.
Verify its dashboard shows Up, period 2 minutes, grace 8 minutes, and Telegram enabled
for this check. Use the integration's test action to confirm phone delivery.
Its ping URL is stored as the Cloudflare secret `HEALTHCHECKS_URL`. No email is required. It detects
stopped or persistently failing checks even when the Worker cannot alert.
Pause/resume this check separately when pausing/resuming the monitor.

For a future fresh setup, after enabling the Healthchecks check and Telegram, run
`npm run setup:healthchecks`. Right-click to paste the base Ping URL at its hidden
prompt. This adds only HEALTHCHECKS_URL to the ignored local settings, preserving the
Telegram/admin secrets. Tell Codex when saved so it can upload the secret and verify
real hosted heartbeats. The helper itself does not ping, upload, or deploy anything.

A built-in Cloudflare alarm watchdog now warns when the main checks stop for over 10
minutes. Healthchecks provides an outside warning for a Cloudflare-wide outage.
A Telegram outage can still silence both alert sources.

Stock alerts include a product link and a **Review checkout for 2 copies** shortcut.
Sufficient stock must remain; you review the total and approve payment yourself.
The monitor never orders anything. Brief restocks between checks can be missed.

See [README](README.md) for deployment, operations, tests, and limitations.
