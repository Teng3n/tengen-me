# Tengen.me project context and decision record

Last consolidated: July 17, 2026

This document is the handoff context for any Codex task working on Tengen.me. Read it before changing the project. It records the owner's requests, established workflow, architecture, completed work, security boundaries, and unresolved items.

## Canonical project identity

- Project/site name: **Tengen.me**
- Production URL: `https://tengen.me`
- GitHub repository: `https://github.com/Teng3n/tengen-me`
- Git branch used for production: `main`
- Canonical local repository: `C:\Users\teng3\Documents\Tengen.me`
- Cloudflare Worker/service: `tengen-me`
- Hosting: Cloudflare, deployed automatically from GitHub

This is a personal site. It is separate from the World of Warcraft guild site at `https://vitality-mop.pages.dev/`. That guild site and its blueprint were an initial visual/structural reference, not the hosting destination for Tengen.me.

The Tengen.me repository was originally created inside the wrong Codex project at:

```text
C:\Users\teng3\Documents\Codex Projects\MoP CF Pages Site\tengen-me
```

It has since been moved into the canonical location above. Do not recreate or edit the site in the old MoP project. The old path may remain as an empty directory, but it contains no Tengen.me project files.

## Owner's non-negotiable workflow

For every website change, use this sequence:

1. Edit the local files directly in `C:\Users\teng3\Documents\Tengen.me`.
2. Review the diff and preserve unrelated user changes.
3. Run the appropriate local lint, build, and tests.
4. Commit the verified changes to Git.
5. Push the production branch to GitHub.
6. Allow the existing GitHub-to-Cloudflare pipeline to build and deploy.
7. When appropriate, verify the Cloudflare deployment and smoke-test production.

Explicit prohibitions:

- Do **not** use ChatGPT Sites, OpenAI Sites, a site-building workflow, or ChatGPT-hosted publishing.
- Do **not** create a second hosted copy of the site.
- Do **not** bypass GitHub by treating the Cloudflare dashboard editor as the source of truth.
- Do **not** manually replace the existing Git-to-Cloudflare pipeline unless the owner explicitly requests a deployment architecture change.
- Do **not** commit secrets, private bridge configuration, credentials, or home-network details.

The owner specifically stopped the earlier site-building workflow and established local files + GitHub + Cloudflare as the permanent approach.

## Product intent

Tengen.me is intended to grow into the owner's personal site and private utility surface. The full long-term feature set is intentionally undecided.

Established goals:

- A personal homepage and identity rather than a World of Warcraft guild-management site.
- A protected owner login/admin area.
- Public, privacy-limited status widgets for self-hosted game servers.
- Palworld as the first live server integration.
- An architecture that can support more game or home-server integrations later.
- Graceful handling when a home server, bridge, or integration is unavailable.

Do not invent a large feature roadmap without asking. Add reusable building blocks when they directly support a requested feature.

## Visual and interaction decisions

The current design direction was chosen by the owner:

- Primary palette: a deep Roman-style maroon/red and white.
- Light mode is the default for new visitors. A saved dark-mode choice still loads before the page becomes visible.
- Dark mode: deep red background with white text, borders, and interface details.
- Light mode: the colors are reversed—white background with deep red text, borders, and interface details.
- Avoid gradient page backgrounds.
- Avoid a nearly black background; the red should remain visually apparent.
- The `T` mark at the upper left is the light/dark theme control.
- Theme choice is stored in browser local storage under `tengen-theme`.

Requested removals that have already been implemented:

- The homepage's “Now building” section was removed.
- The footer copy referring to “personal assistance, game services, and projects in the Pacific Northwest” was removed.
- The homepage's internal-facing “Public status,” “Owner access,” and “Built to grow” strip was removed.
- The Servers page's connection-plan and public-data-boundary explanations were removed.
- Public copy on Home, Servers, Status, Projects, and About was rewritten to read as a visitor-facing personal site rather than an implementation handoff.

Do not restore those elements unless the owner asks.

The shared Palworld status card now uses a locally hosted, tightly cropped white Palworld logo on the homepage and Servers page. The banner asset is `public/palworld-logo-banner.png` on the site's existing Roman-red background; the uncropped source, crop details, and trademark note are recorded in `docs/ASSET-SOURCES.md`.

The current shared shell and theme toggle are implemented in:

- `app/components/site-shell.tsx`
- `app/globals.css`

## Current application structure

The project is a TypeScript/React application built with vinext/Vite for the Cloudflare Workers runtime.

Current routes include:

- `/` — personal homepage, owner sign-in link, and Palworld status card.
- `/about` — about page.
- `/projects` — projects page.
- `/servers` — public server overview and privacy boundary explanation.
- `/status` — public service/status summary.
- `/admin` — owner surface designed for Cloudflare Access.
- `GET /api/server-status` — public sanitized server-status response.
- `POST /api/server-status/ingest` — authenticated bridge ingestion endpoint.

Important implementation files:

- `app/page.tsx`
- `app/components/site-shell.tsx`
- `app/components/server-status-card.tsx`
- `app/lib/server-status.ts`
- `app/cloudflare-access.ts`
- `app/admin/page.tsx`
- `worker/index.ts`
- `worker/server-status-api.ts`
- `vite.config.ts`
- `tests/rendered-html.test.mjs`

## Owner login and Cloudflare Access

The chosen authentication approach is Cloudflare Access, not a custom password database in the application.

The app contains:

- an “Owner login” link to `/admin`;
- logic that recognizes Cloudflare Access identity headers; and
- a safe unauthenticated admin state containing no private controls or private data.

The external Cloudflare Access application/policy for `tengen.me/admin*` must be verified before claiming the login is fully enforced in production. The intended policy allows only the owner. Do not build a parallel login system unless the owner explicitly changes this decision.

## Palworld status integration

### Requested behavior

The owner hosts a Palworld dedicated server on a Windows computer in the local network. The site should show:

- whether the server is online;
- current and maximum player counts;
- online player names; and
- the freshness of the most recent check.

The same pattern may later support other servers.

`server.tengen.me` already exists in Cloudflare DNS and identifies the Palworld server connection address. Preserve that DNS record. Do not publish the owner's raw home IP in documentation, client code, logs, or chat output.

### Implemented architecture

The website must not query or expose the Palworld admin API directly. A small PowerShell bridge runs on the Palworld Windows host:

```text
Palworld REST API on 127.0.0.1:8212
        ↓
palworld-status-bridge.ps1
        ↓ authenticated, sanitized POST
https://tengen.me/api/server-status/ingest
        ↓
Cloudflare KV
        ↓ public sanitized GET
https://tengen.me/api/server-status
        ↓
Homepage/server widget
```

Cloudflare resources already created:

- KV namespace: `tengen-me-server-status`
- Worker binding: `STATUS_KV`
- encrypted Worker secret: `PALWORLD_BRIDGE_TOKEN`

The ingest endpoint requires a bearer token and rejects unauthorized requests. Stored/public data is deliberately limited to:

- server slug and display metadata;
- online/offline state;
- current and maximum player counts;
- player display names; and
- observation/update timestamps.

It must never store or expose:

- admin passwords;
- bridge tokens;
- player IDs or account identifiers;
- player IP addresses;
- private/local network addresses;
- raw server logs; or
- remote-control/admin actions.

Snapshots expire from KV after 24 hours. The public feed marks the bridge unavailable/offline when an update is more than roughly three minutes old. The browser widget refreshes approximately every 30 seconds; the bridge publishes approximately every 60 seconds.

### Current Palworld state

The Cloudflare/site side is deployed and tested. Before the host bridge sends a valid first snapshot, the API intentionally returns a pending state and the widget shows **Bridge pending**.

The Palworld computer is not necessarily the same computer as this repository. Host-side installation must be performed on the actual Windows machine running Palworld.

Host-side files are under `bridge/`:

- `bridge/palworld-status-bridge.ps1`
- `bridge/bridge-config.example.json`
- `bridge/bridge-config.local.json` — private and ignored by Git
- `bridge/README.md`
- `bridge/CODEX-HANDOFF.md`

`bridge/CODEX-HANDOFF.md` is the authoritative execution handoff for Codex running on the Palworld host. It contains configuration, verification, scheduled-task setup, troubleshooting, and completion criteria.

The local ignored configuration on the original development computer was prepared with the Cloudflare bridge token and a placeholder for the Palworld admin password. A manual copy of the entire bridge folder can carry that private file to the Palworld machine. A Git clone will **not** include it. Never print or reveal its contents.

### Palworld security requirements

- Enable the Palworld REST API only for localhost use.
- Expected local URL: `http://127.0.0.1:8212/v1/api`.
- REST API username: `admin`.
- Keep TCP port `8212` closed to the internet and do not router-forward it.
- Use a strong `AdminPassword` in the active `PalWorldSettings.ini`.
- Preserve the file's required one-line `OptionSettings=(...)` structure when editing.
- Restart Palworld after changing its settings.

Official references:

- `https://docs.palworldgame.com/settings-and-operation/configuration/`
- `https://docs.palworldgame.com/0.4.15/api/rest-api/palwold-rest-api/`
- `https://docs.palworldgame.com/api/rest-api/metrics/`
- `https://docs.palworldgame.com/0.2.4.0/api/rest-api/players/`

## Local development and verification

From the canonical repository root:

```powershell
cd 'C:\Users\teng3\Documents\Tengen.me'
npm install
npm run lint
npm test
```

`npm test` runs the production build and the Node test suite. At the time of this context consolidation, the build passes and all seven tests pass.

The tests cover:

- server rendering of the homepage;
- the safe admin route without Cloudflare Access;
- recognition of a Cloudflare Access identity;
- the safe pending server-status response; and
- authenticated bridge ingestion with private data stripped.

For production checks after deployment:

```powershell
Invoke-RestMethod -Uri 'https://tengen.me/api/server-status' | ConvertTo-Json -Depth 6
```

An unauthenticated POST to `/api/server-status/ingest` must return HTTP 401. Never put the real bridge token directly into a command that will be logged or shown in chat.

## Git and deployment history

Key commits, oldest to newest:

| Commit | Decision/work completed |
| --- | --- |
| `5449cfa` | Built the initial Tengen.me personal site. |
| `9d23bd3` | Moved hosting and authentication architecture to Cloudflare. |
| `7807c29` | Added the Roman-red light/dark themes and requested content removals. |
| `869add7` | Connected the Palworld widget, secure ingest API, KV storage, and Windows bridge. |
| `8b74d56` | Added the host-side Codex handoff. |
| `c27f152` | Moved the Tengen.me blueprint and project artifacts into the correct repository. |
| `5d35427` | Kept migration backups out of Git. |

Cloudflare successfully deployed the Palworld integration commit. Production checks confirmed:

- `GET /api/server-status` returned HTTP 200 with the expected pending schema before first bridge contact;
- unauthenticated ingest returned HTTP 401; and
- the Worker showed the `STATUS_KV` binding connected to `tengen-me-server-status`.

The repository was later moved from the MoP Codex project into `C:\Users\teng3\Documents\Tengen.me` without changing its GitHub history or remote.

## Documentation and legacy artifacts

- `docs/tengen-me-site-blueprint.md` is the original project blueprint/reference.
- `docs/CODEX-PROJECT-CONTEXT.md` is this consolidated conversation/decision record.
- `bridge/CODEX-HANDOFF.md` is specifically for executing the Palworld host setup.
- `archive/legacy-chatgpt-site.tar.gz` is an obsolete, recoverable archive from the abandoned ChatGPT/Sites workflow. It is ignored by Git and must not be deployed or revived as the active site.
- `archive/project-migration-backups/` contains ignored, recoverable metadata from moving into the correct Codex project.

## Known unresolved or future work

1. Run and schedule the bridge on the actual Palworld host, then confirm live data on Tengen.me.
2. Verify the Cloudflare Access application and owner-only policy for `/admin*` before describing authentication as complete.
3. Decide future personal-site and admin features only as the owner requests them.
4. Generalize the server-status model when a second real server integration is requested; do not prematurely expose broader home-network telemetry.

## Instructions to future Codex tasks

When receiving a new Tengen.me request:

1. Work only from `C:\Users\teng3\Documents\Tengen.me` unless the task explicitly targets the Palworld host.
2. Read this file and any task-specific handoff before acting.
3. Inspect `git status` first and preserve unrelated changes.
4. Distinguish current deployed behavior from planned behavior.
5. Follow the local edit → lint/build/test → commit → push → Cloudflare pipeline.
6. Keep secrets and private network data out of Git, output, screenshots, and chat.
7. Never invoke the ChatGPT/OpenAI Sites workflow for this project.
8. Confirm before making a major product, authentication, DNS, or hosting architecture change.
9. For normal scoped website changes, make reasonable implementation decisions and complete the full verified workflow without repeatedly asking for permission.
10. Report the commit, tests, production state, and any remaining external dependency clearly.

## Short bootstrap prompt

If this document is being pasted into a fresh Codex project, use this instruction with it:

> Treat the attached Tengen.me project-context document as the authoritative history and workflow for this project. Work from the local Tengen.me repository, never use ChatGPT Sites, preserve secrets and unrelated changes, and complete requested website changes through local editing, local verification, Git commit/push, and the existing Cloudflare deployment pipeline.
