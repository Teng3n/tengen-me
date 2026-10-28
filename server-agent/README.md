# tengen.me dedicated-server controller

This folder turns SteamCMD provisioning into a deterministic, non-AI workflow. Codex may run the commands conversationally, but PowerShell performs installation, process control, discovery, and synchronization.

## What it does

- Discovers supported installations from Steam `appmanifest_*.acf` files and local controller state.
- Detects whether the known dedicated-server process is running.
- Publishes a sanitized inventory to `https://tengen.me/api/server-registry/sync`.
- Immediately synchronizes after deploy, start, stop, retire, or unretire.
- Supports a startup and six-hour inventory task.
- Installs a separate startup health monitor that queries Enshrouded's local A2S endpoint every 60 seconds.

The first catalog includes Enshrouded and Palworld. Adding a game requires a reviewed catalog entry with its Steam dedicated-server App ID, process name, executable path, and default player capacity.

## Setup

1. Copy `config.example.json` to `config.local.json`.
2. Replace only the example local paths with paths verified on the server host. Use a per-game `installPath` for an existing custom SteamCMD installation.
3. Supply `TENGEN_BRIDGE_TOKEN` as a machine environment variable, in the ignored local config, or through the existing ignored bridge config.
4. Test discovery:

   ```powershell
   .\serverctl.ps1 sync
   ```

5. Install the inventory schedule from an elevated PowerShell session:

   ```powershell
   .\install-sync-task.ps1
   ```

6. Install the live Enshrouded health monitor from the same elevated session. It reuses the existing ignored bridge configuration and token referenced by `config.local.json`:

   ```powershell
   .\install-health-monitor-task.ps1
   Start-ScheduledTask -TaskName "tengen.me Enshrouded Health Monitor"
   ```

The inventory task discovers installed/current games every six hours. The health monitor separately queries the active Enshrouded game endpoint every minute, so the public online state does not wait for inventory discovery.

No OpenAI or ChatGPT API is used by these scripts.
