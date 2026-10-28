# Dedicated-server host instructions

This folder contains the deterministic control surface for the Windows computer that runs SteamCMD dedicated servers.

## Required workflow

- Read `HOST-HANDOFF.md` and `README.md` before changing the host.
- Use `serverctl.ps1` for SteamCMD deployment, starting, stopping, retirement, and tengen.me synchronization.
- Do not invoke SteamCMD directly for ordinary provisioning. Improve `serverctl.ps1` when a supported workflow is missing.
- Treat `config.local.json`, `state.local.json`, bridge tokens, server passwords, public IP addresses, and private network details as secrets. Never display, commit, or paste them into chat.
- Do not create a generic remote-command endpoint or accept arbitrary commands from tengen.me.
- Only stop or retire a server when the user explicitly requests that action.
- After a successful host change, run `serverctl.ps1 sync` and verify the sanitized tengen.me response.
- The scheduled synchronization cadence is six hours plus system startup. Do not increase it without the user's request.

## Supported commands

```powershell
.\serverctl.ps1 sync
.\serverctl.ps1 deploy -Game enshrouded
.\serverctl.ps1 deploy -Game palworld
.\serverctl.ps1 start -Game enshrouded
.\serverctl.ps1 stop -Game enshrouded
.\serverctl.ps1 retire -Game enshrouded
.\serverctl.ps1 unretire -Game enshrouded
```

Use `-WhatIf` before the first `deploy`, `start`, `stop`, or `retire` attempt on an unfamiliar host.

## Completion criteria

- `config.local.json` points to the real SteamCMD and library locations.
- A one-time `sync` succeeds without exposing secrets.
- `https://tengen.me/api/server-status` shows the expected current game.
- The scheduled task is installed and its last-run result is successful.
