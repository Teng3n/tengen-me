# Enshrouded status bridge

This PowerShell bridge runs on the Windows computer hosting Enshrouded. It reads the server's local Steam query endpoint and publishes only availability, player counts, player names when available, and a timestamp to `tengen.me`.

Enshrouded's official configuration uses UDP query port `15637` and supports up to 16 player slots. The bridge queries `127.0.0.1` by default, so no additional public management port or password is required.

## Setup

1. Confirm `enshrouded_server.json` has the expected `queryPort` and `slotCount` values.
2. Copy `bridge-config.example.json` to `bridge-config.local.json`.
3. Preserve the existing `TENGEN_BRIDGE_TOKEN` from the Palworld bridge configuration.
4. Run a one-time test from the server host:

   ```powershell
   .\enshrouded-status-bridge.ps1 -Once
   ```

5. Replace the old scheduled task with the Enshrouded bridge. Adjust the folder path if needed:

   ```powershell
   schtasks /Delete /F /TN "tengen.me Palworld Status Bridge"
   schtasks /Create /F /SC ONSTART /TN "tengen.me Enshrouded Status Bridge" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\EnshroudedBridge\enshrouded-status-bridge.ps1" /RU SYSTEM /RL HIGHEST
   schtasks /Run /TN "tengen.me Enshrouded Status Bridge"
   ```

`bridge-config.local.json` contains the private bridge token and is excluded from Git.

## Owner action

The only allowlisted owner action is **Refresh status**, which asks the bridge to immediately publish its next sanitized snapshot. Enshrouded automatically maintains rolling world saves, so the former Palworld-specific save API action has been removed. Shutdown, restart, process execution, configuration changes, and log retrieval are not implemented.

## Troubleshooting

- A timeout to `127.0.0.1:15637` usually means the Enshrouded process is stopped or its configured query port differs.
- An HTTP 401 from `tengen.me` means `TENGEN_BRIDGE_TOKEN` does not match the Cloudflare bridge secret.
- If the player count appears but names do not, the server answered `A2S_INFO` but did not provide `A2S_PLAYER`; the bridge will still publish the accurate count.
