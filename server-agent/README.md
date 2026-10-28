# tengen.me dedicated-server controller

This folder turns SteamCMD provisioning into a deterministic, non-AI workflow. Codex may run the commands conversationally, but PowerShell performs installation, process control, discovery, and synchronization.

## What it does

- Discovers supported installations from Steam `appmanifest_*.acf` files and local controller state.
- Detects whether the known dedicated-server process is running.
- Publishes a sanitized inventory to `https://tengen.me/api/server-registry/sync`.
- Immediately synchronizes after deploy, start, stop, retire, or unretire.
- Supports a startup and six-hour Windows Scheduled Task.

The first catalog includes Enshrouded and Palworld. Adding a game requires a reviewed catalog entry with its Steam dedicated-server App ID, process name, executable path, and default player capacity.

## Setup

1. Copy `config.example.json` to `config.local.json`.
2. Replace only the example local paths with paths verified on the server host. Use a per-game `installPath` for an existing custom SteamCMD installation.
3. Supply `TENGEN_BRIDGE_TOKEN` as a machine environment variable, in the ignored local config, or through the existing ignored bridge config.
4. Test discovery:

   ```powershell
   .\serverctl.ps1 sync
   ```

5. Install the schedule from an elevated PowerShell session:

   ```powershell
   .\install-sync-task.ps1
   ```

No OpenAI or ChatGPT API is used by these scripts.
