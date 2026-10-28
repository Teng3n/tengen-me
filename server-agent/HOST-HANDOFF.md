# Host installation handoff

Use this document with Codex running on the Windows dedicated-server computer.

## Initial prompt for the host Codex

> Read `server-agent/AGENTS.md`, `server-agent/README.md`, and this handoff completely. Inspect this computer's existing SteamCMD location, Steam library manifests, dedicated-server installation directories, relevant processes, and scheduled tasks. Do not reveal or commit secrets. Copy `config.example.json` to the ignored `config.local.json`, fill in only verified local paths, preserve the existing TENGEN bridge token through the environment or ignored legacy bridge configuration, and run `serverctl.ps1 sync`. Verify that tengen.me reports the correct current game. Then install the startup/six-hour scheduled task and confirm its first run succeeds. Do not stop, replace, or retire any running server unless I explicitly request it.

## Installation sequence

1. Pull the latest `main` branch of the tengen.me repository.
2. Open the repository as the primary Codex project folder so this folder's `AGENTS.md` is discovered.
3. Inspect paths read-only before creating `config.local.json`. Set a per-game `installPath` when an existing server was installed outside a discovered Steam library.
4. Run `.\server-agent\serverctl.ps1 sync` interactively.
5. Confirm `https://tengen.me/api/server-status` shows the detected current server.
6. From an elevated PowerShell session, run `.\server-agent\install-sync-task.ps1`.
7. Start the task once and confirm a successful result.

## Safety boundaries

- The host makes outbound HTTPS requests only.
- The registry endpoint accepts sanitized inventory and status metadata; it cannot execute commands.
- A missing host report means monitoring is unavailable. It does not retire a server.
- A server becomes inactive only after seven days of confirmed absence in successful host reports, and retired after thirty days.
- Manual `retire` is reversible with `unretire`; history is retained.
