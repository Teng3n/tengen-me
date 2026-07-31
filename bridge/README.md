# Palworld status bridge

This script runs on the Windows computer hosting Palworld. It reads the official REST API over localhost and sends only server availability, player counts, player names, and a timestamp to `tengen.me`. It also collects two explicitly allowlisted owner actions: refresh the public status and ask Palworld to save the world.

## Palworld setup

In `PalWorldSettings.ini`, set `RESTAPIEnabled=True`, `RESTAPIPort=8212`, and a strong `AdminPassword`, then restart the server. Keep TCP 8212 closed on the router and public firewall; the bridge accesses it through `127.0.0.1`.

## Bridge setup

1. Copy this `bridge` folder to the Palworld computer.
2. Copy `bridge-config.example.json` to `bridge-config.local.json`.
3. Put the Palworld `AdminPassword` and the Cloudflare bridge token in the local file.
4. Test one update from PowerShell:

   ```powershell
   .\palworld-status-bridge.ps1 -Once
   ```

5. Run it continuously at startup. From an Administrator PowerShell prompt, adjust the path and run:

   ```powershell
   schtasks /Create /F /SC ONSTART /TN "tengen.me Palworld Status Bridge" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\PalworldBridge\palworld-status-bridge.ps1" /RU SYSTEM /RL HIGHEST
   schtasks /Run /TN "tengen.me Palworld Status Bridge"
   ```

`bridge-config.local.json` contains secrets and is excluded from Git.

## Owner actions

The bridge does not accept arbitrary commands. The only supported actions are:

- **Refresh status** — immediately publishes the next sanitized snapshot.
- **Save world** — calls Palworld's official local `POST /save` endpoint.

Shutdown, restart, process execution, configuration changes, and log retrieval are intentionally not implemented. Each requested action is recorded in the private owner audit trail.
