# Codex handoff: activate the Enshrouded bridge

The website and Cloudflare Worker expect server slug `enshrouded-home`. Complete the host-side setup on the Windows computer running `enshrouded_server.exe`.

1. Locate the active `enshrouded_server.json` beside the server executable and note `queryPort` and `slotCount`. The official defaults are UDP `15637` and 16 slots.
2. Copy this folder to the server host and copy `bridge-config.example.json` to `bridge-config.local.json`.
3. Preserve the existing private `TENGEN_BRIDGE_TOKEN`; do not paste it into source control or logs.
4. Update the local config only if the host uses a non-default query port or slot count.
5. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\enshrouded-status-bridge.ps1 -Once`.
6. Verify `https://tengen.me/api/server-status` reports `enshrouded-home`, then replace the former Palworld scheduled task using the commands in `README.md`.

The Worker accepts either the preferred `ENSHROUDED_BRIDGE_TOKEN` binding or the existing `PALWORLD_BRIDGE_TOKEN` binding during migration, so the Cloudflare secret does not need to be rotated. The bridge accepts only the `refresh-status` action and never runs arbitrary commands.

Official Enshrouded references:

- https://enshrouded.zendesk.com/hc/en-us/articles/16055441447709-Dedicated-Server-Configuration
- https://enshrouded.zendesk.com/hc/en-us/articles/16056312924957-Dedicated-Server-FAQ
