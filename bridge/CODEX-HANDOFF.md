# Codex handoff: connect the Palworld server to tengen.me

## Objective

Finish the Palworld host-side setup so the server widget at `https://tengen.me` shows:

- whether the Palworld server is online;
- current and maximum player counts;
- the names of online players; and
- the time of the most recent successful check.

The website, Cloudflare storage, authenticated ingest endpoint, and UI widget are already deployed. This handoff is only for the Windows computer that actually hosts Palworld.

## Current deployed state

- GitHub repository: `https://github.com/Teng3n/tengen-me`
- Deployed branch: `main`
- Implementation commit: `869add7` (`Connect Palworld status widget`)
- Production website: `https://tengen.me`
- Public status endpoint: `GET https://tengen.me/api/server-status`
- Private ingest endpoint: `POST https://tengen.me/api/server-status/ingest`
- Cloudflare Worker: `tengen-me`
- Cloudflare KV binding: `STATUS_KV`
- KV namespace: `tengen-me-server-status`
- Cloudflare secret: `PALWORLD_BRIDGE_TOKEN`
- Expected server slug: `palworld-home`

Before the host bridge sends its first update, the public endpoint correctly reports `status: "pending"` and the widget displays **Bridge pending**.

## Files in this folder

- `palworld-status-bridge.ps1` — polls the local Palworld REST API and publishes a sanitized snapshot.
- `bridge-config.example.json` — safe configuration template.
- `bridge-config.local.json` — private configuration; ignored by Git. If this file was copied from the original development computer, its Cloudflare token is already populated. Never display, commit, log, or paste that token into chat.
- `README.md` — short operator instructions.
- `CODEX-HANDOFF.md` — this handoff.

## Security boundaries

1. Access Palworld's REST API only through `127.0.0.1`.
2. Do not expose TCP port `8212` through the router, Cloudflare, or the public firewall.
3. Do not commit `bridge-config.local.json` or reveal either secret it contains.
4. Do not replace the bridge with a browser request directly to the Palworld REST API.
5. The website must receive only status, counts, player names, and timestamps—never player IDs, IP addresses, account identifiers, or admin credentials.

Palworld REST API reference:

- `https://docs.palworldgame.com/0.4.15/api/rest-api/palwold-rest-api/`
- `https://docs.palworldgame.com/api/rest-api/metrics/`
- `https://docs.palworldgame.com/0.2.4.0/api/rest-api/players/`

## Work to perform on the Palworld host

### 1. Locate and safely back up the Palworld configuration

Find the active `PalWorldSettings.ini` used by the dedicated server. Confirm its path from the service, startup script, or Palworld installation rather than assuming a location. Make a recoverable backup beside it before editing.

In the existing `OptionSettings=(...)` value, ensure these settings are present:

```ini
RESTAPIEnabled=True
RESTAPIPort=8212
AdminPassword="use-the-existing-strong-admin-password"
```

Preserve all unrelated settings and the required single-line `OptionSettings` format. Restart the Palworld server after the edit.

### 2. Confirm the REST API is local and listening

Run:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 8212
```

Confirm the Palworld process owns the listener. Ensure there is no router port-forward for `8212` and no inbound public firewall rule for it.

### 3. Prepare the private bridge configuration

Work from the directory containing this handoff and the bridge script.

If `bridge-config.local.json` already exists, preserve its `TENGEN_BRIDGE_TOKEN` value and replace only the placeholder `PALWORLD_ADMIN_PASSWORD` with the exact Palworld `AdminPassword`.

If it does not exist, copy the example:

```powershell
Copy-Item .\bridge-config.example.json .\bridge-config.local.json
```

Then populate both private values. The final non-secret settings should remain:

```json
{
  "PALWORLD_API_URL": "http://127.0.0.1:8212/v1/api",
  "PALWORLD_API_USERNAME": "admin",
  "PALWORLD_ADMIN_PASSWORD": "PRIVATE",
  "TENGEN_BRIDGE_URL": "https://tengen.me/api/server-status/ingest",
  "TENGEN_BRIDGE_TOKEN": "PRIVATE"
}
```

Do not print the completed file in terminal output. Verify only that the required values are non-placeholder strings.

### 4. Test the Palworld REST API locally

Use the same Basic authentication behavior as the bridge. Prefer running the bridge's one-shot mode instead of placing the password directly on a command line:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\palworld-status-bridge.ps1 -Once
```

A successful run prints a message similar to:

```text
Published online: 0/32 players.
```

Then verify the public status without exposing credentials:

```powershell
Invoke-RestMethod -Uri 'https://tengen.me/api/server-status' | ConvertTo-Json -Depth 6
```

Expected results:

- `slug` is `palworld-home`;
- `status` is `online` while Palworld is reachable;
- `players.current` is a number;
- `players.maximum` matches the server limit;
- `lastUpdated` contains a recent UTC timestamp; and
- player names are present only when players are online.

Open `https://tengen.me` and confirm the widget matches the API response.

### 5. Install continuous startup operation

Move or retain this folder at a stable absolute path. Do not schedule it from Downloads, a temporary directory, or a path that will later be removed.

From an Administrator PowerShell prompt, replace `C:\PalworldBridge` below with the verified folder path:

```powershell
schtasks /Create /F /SC ONSTART /TN "tengen.me Palworld Status Bridge" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\PalworldBridge\palworld-status-bridge.ps1" /RU SYSTEM /RL HIGHEST
schtasks /Run /TN "tengen.me Palworld Status Bridge"
```

Verify it:

```powershell
schtasks /Query /TN "tengen.me Palworld Status Bridge" /V /FO LIST
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Select-Object ProcessId, CommandLine
```

The bridge publishes every 60 seconds. The website polls every 30 seconds. If updates stop for more than roughly three minutes, the public endpoint intentionally reports the feed as offline/stale.

## Troubleshooting order

1. **`PALWORLD_ADMIN_PASSWORD is required`** — complete `bridge-config.local.json`; do not alter the script to embed it.
2. **`TENGEN_BRIDGE_TOKEN is required`** — the private local config was not copied or populated. Retrieve it securely from the original development computer or rotate the Cloudflare secret and update both sides.
3. **Connection refused on `127.0.0.1:8212`** — confirm Palworld restarted, the correct configuration file was edited, and `RESTAPIEnabled=True` is in the active `OptionSettings` value.
4. **HTTP 401 from the local Palworld API** — the configured admin password does not exactly match `AdminPassword` in the active Palworld configuration.
5. **HTTP 401 from `tengen.me/api/server-status/ingest`** — the local bridge token does not match Cloudflare's `PALWORLD_BRIDGE_TOKEN` secret.
6. **One-shot works but scheduled task does not** — check the task's absolute script path, run-as identity, last result, and read access to `bridge-config.local.json`.
7. **Widget becomes unavailable after several minutes** — confirm the scheduled bridge process is still running and run one-shot mode interactively to expose the current error.

## Completion criteria

Do not consider the handoff complete until all of the following are true:

- Palworld is running normally after the configuration change.
- Port `8212` responds locally but is not publicly exposed.
- One-shot bridge execution succeeds.
- `https://tengen.me/api/server-status` reports a recent `online` snapshot.
- The homepage widget displays the correct count and names.
- The scheduled task survives a reboot or a controlled service restart.
- No secrets were committed, printed, or copied into a tracked file.

When reporting completion, include the scheduled task status, the public API's sanitized response, and any non-secret paths changed. Do not include passwords or tokens.
