# `tengen.me` Site Blueprint

## Purpose

Build a new personal site for `tengen.me` that reuses the proven platform patterns from the Vitality MoP guild site, while replacing the guild-specific content with information about Tengen, dedicated servers, hosted game servers, projects, and services.

This is an architectural handoff, not a request to clone the current site's visual design or Warcraft-specific data model.

## Current Site at a Glance

The existing project is a static-first Astro and TypeScript site deployed through Cloudflare Pages from GitHub.

The main operating model is:

```text
Code and generated JSON in GitHub
        |
        v
Cloudflare Pages build (npm run build)
        |
        v
Static public site + small Cloudflare Pages Functions API
```

External data is collected by server-side scripts in GitHub Actions. Those scripts write normalized JSON into the repository. When a workflow commits changed JSON, Cloudflare automatically rebuilds and deploys the site.

This keeps normal page loads fast and inexpensive: visitors receive prebuilt pages and do not directly call Google Sheets, Warcraft Logs, or GitHub.

## Reusable Platform Pieces

### 1. Astro static-first frontend

- Astro with TypeScript.
- Pages are pre-rendered to static HTML during the build.
- Shared layout, navigation, styling, and reusable components live under `src/`.
- Structured content is stored as local JSON or TypeScript data and transformed at build time.
- The production build command is `npm run build`; output is written to `dist`.

For `tengen.me`, keep this model for the home page, personal profile, project catalog, server descriptions, game-server pages, documentation, and public status summaries.

### 2. GitHub as the source of truth

- Source code, configuration, generated public data, and deployment history live in GitHub.
- Feature work is done on a branch and merged or deployed through the branch connected to Cloudflare Pages.
- GitHub Actions runs scheduled or manually triggered maintenance jobs.
- Workflows only commit generated files when their contents actually change, preventing unnecessary deployments.
- Cloudflare Pages watches the selected GitHub branch and redeploys after relevant commits.

For the new site, use a new repository and make the production branch explicit. Do not copy the current hard-coded repository name or `feature/guild-site-mvp` branch references.

### 3. Cloudflare Pages hosting

- Cloudflare Pages is connected directly to the GitHub repository.
- Framework/build settings are Astro, `npm run build`, and output directory `dist`.
- Public content is static and served through Cloudflare's edge network.
- The repository's `functions/` directory becomes same-origin serverless endpoints under `/api/*`.
- `public/_headers` supplies baseline response security headers.
- `public/_redirects` handles retired or moved routes.
- Preview and production environments can have separate Cloudflare environment variables.

For `tengen.me`, connect the custom domain in Cloudflare after the new Pages project is working on its generated preview domain. Decide whether `www.tengen.me` redirects to the apex domain or the reverse.

### 4. Lightweight protected-area login

The current officer login uses a shared password and a signed session cookie:

1. A browser submits a password to `/api/officer-auth`.
2. A Cloudflare Pages Function compares it with either a server-side password or a SHA-256 password hash.
3. On success, the function returns an HMAC-signed, `HttpOnly`, `Secure`, `SameSite=Strict` cookie.
4. The session expires after eight hours.
5. Protected API functions validate the signed cookie before returning data or performing an action.
6. Browser `sessionStorage` is used only as a user-interface hint; the server-side cookie is the actual API authorization check.

Reusable files/patterns:

- `functions/_shared/officer-auth.ts`: password verification, cookie creation, and session validation.
- `functions/api/officer-auth.ts`: login/session endpoint.
- `src/components/OfficerGate.astro`: login form and gated-content user experience.
- Protected functions call `hasValidOfficerSession` before doing any work.

For the new site, rename the officer-specific concepts and cookie (for example, `tengen_admin_session`) so the two sites do not share branding or accidental assumptions.

Important limitation: this is a shared-password gate, not a real user-account system. Hiding pre-rendered HTML in the browser does not make that HTML secret. Only data returned by a protected server-side function is actually access-controlled by this pattern.

Use the shared-password pattern only for low-risk personal administration. For starting/stopping servers, changing configurations, viewing credentials, shell access, billing, or other sensitive operations, use Cloudflare Access or another identity provider with individual users, multi-factor authentication, explicit authorization, audit logs, and protected backend APIs.

### 5. Server-side secrets

The current project keeps secrets out of the frontend and out of Git:

- GitHub Actions secrets hold credentials used by sync scripts.
- Cloudflare Pages environment variables hold credentials used by runtime Functions.
- `.env.example` documents variable names but contains no secret values.
- Local secrets belong in an ignored local environment file.
- Browser code never receives GitHub tokens, service-account credentials, API client secrets, or password hashes.

Apply the same separation to infrastructure API tokens, game-panel credentials, monitoring keys, and webhooks on `tengen.me`.

### 6. Automated data pipeline

The current pattern is:

```text
External source
    -> TypeScript sync script
    -> validated/normalized JSON in src/data
    -> GitHub Actions commit when changed
    -> Cloudflare Pages rebuild
```

There are separate workflows for frequent data, slower external data, a combined manual refresh, and auditing. Concurrency groups prevent overlapping runs, and the workflows retry pushes after rebasing.

For `tengen.me`, the same pattern can publish non-sensitive server inventory and summaries such as:

- Server name, purpose, region, and hardware summary.
- Public game-server name, game, version, connection address, and player count.
- Service availability and last-updated time.
- Project/repository metadata intended for public display.
- Sanitized monitoring summaries and uptime history.

Do not commit private IP addresses, management addresses, access tokens, player-private data, raw logs, or credentials into public JSON.

### 7. Manual admin actions through GitHub Actions

The current site has a protected Cloudflare Function that can dispatch selected GitHub Actions workflows:

```text
Admin page
    -> authenticated /api function
    -> GitHub workflow_dispatch API
    -> GitHub Action
    -> generated data commit
    -> Cloudflare redeploy
```

The GitHub token stays in Cloudflare's server-side environment. The function uses a small allowlist of known workflow files and a cooldown rather than accepting an arbitrary workflow or command from the browser.

This can be reused for safe actions such as “refresh public server status” or “rebuild project data.” It should not become a general remote-command proxy. Infrastructure changes should use narrowly scoped APIs, strict allowlists, stronger authentication, authorization checks, rate limits, and audit logging.

## What to Reuse and What to Replace

| Area | Reuse | Replace for `tengen.me` |
| --- | --- | --- |
| Framework | Astro, TypeScript, static output | Guild routes and Warcraft components |
| Hosting | Cloudflare Pages and Pages Functions | Existing Pages project and guild domain |
| Source control | GitHub repo, Actions, change-only commits | Repository, production branch, workflow names |
| Login | Signed-cookie helper and same-origin auth flow | Officer naming, cookie name, password/environment names |
| Automation | Scheduled/manual Actions and normalized JSON | Google Sheets/WCL-specific sync scripts |
| Admin actions | Authenticated function with an action allowlist | Hard-coded Vitality repo, branch, and workflow mapping |
| Content | Component/layout conventions | Roster, loot, bench, raid, and progression content |
| Secrets | GitHub/Cloudflare separation | All current secret values; create new scoped credentials |
| Branding | General responsive/accessibility approach | Name, logo, colors, metadata, favicon, copy, and social cards |

## Suggested `tengen.me` Information Architecture

- `/` — personal overview and featured services/projects.
- `/about` — biography, interests, skills, and links.
- `/infrastructure` — high-level dedicated-server and network overview.
- `/servers` — public server/service directory.
- `/servers/[slug]` — individual machine or hosted-service details.
- `/games` — game servers currently hosted or previously run.
- `/games/[slug]` — connection details, rules, status, and community links.
- `/projects` — software, automation, homelab, and community projects.
- `/status` — sanitized public health and last-refresh information.
- `/admin` — authenticated controls and private operational views.

Public pages should be useful even if the dynamic status source is unavailable. Show the last successful update and degrade to “status unavailable” rather than failing the whole build or page.

## Suggested Data Boundary

Use a deliberately small public schema rather than exposing raw monitoring or orchestration responses. For example:

```json
{
  "slug": "example-game-server",
  "name": "Example Game Server",
  "kind": "game",
  "game": "Example Game",
  "status": "online",
  "region": "US West",
  "connectAddress": "play.example.tengen.me",
  "players": { "current": 8, "maximum": 32 },
  "lastUpdated": "2026-07-17T12:00:00Z"
}
```

Keep management identifiers, provider account IDs, internal hostnames, private addresses, ports that are not meant for players, and raw error output on the protected side.

## Implementation Order for the New Project

1. Create a new GitHub repository for `tengen.me` rather than forking deployment settings in place.
2. Scaffold Astro with TypeScript and static output.
3. Build the public layout, navigation, personal content, project pages, and server catalog using local sample data.
4. Create the Cloudflare Pages project and connect it to the chosen production branch.
5. Configure the generated Pages domain first, then attach `tengen.me` and the chosen `www` redirect.
6. Port and rename the shared-password session only if a low-risk admin gate is still desired.
7. Put genuinely private data behind protected Functions; never embed it in statically generated HTML or public JSON.
8. Choose the source for public server status and write a sanitizer/normalizer that emits only the public schema.
9. Add scheduled and manual GitHub Actions that update generated JSON only when data changes.
10. Add an allowlisted manual refresh endpoint if useful.
11. Configure new GitHub Actions secrets and Cloudflare environment variables; do not reuse broadly scoped credentials.
12. Add security headers, redirects, error states, metadata, favicon, and social preview assets.
13. Validate production and preview authentication separately, including cookie behavior on the custom domain.
14. Document recovery steps: rotating credentials, disabling admin actions, and performing a manual rebuild.

## Decisions the New Project Must Make

- Is the site only informational, or will it control real infrastructure?
- Which server details are safe for the public internet?
- Does the admin area need one shared owner password, or individual identity with MFA?
- Where does server status originate: a game query, monitoring platform, orchestration panel, custom agent, or manual file?
- Should status be near-real-time through protected runtime APIs, or periodically published through GitHub?
- Which branch is production, and should pull requests receive Cloudflare preview deployments?
- Which actions are permitted from the web UI, and how will each action be audited and reversed?

## Copy/Paste Brief for a New Codex Project

> Create a new personal website for `tengen.me`. Use the existing Vitality MoP site only as an architectural reference, not as a content or visual clone. Build it with Astro and TypeScript using static output, GitHub as the source of truth, Cloudflare Pages for hosting and preview deployments, and Cloudflare Pages Functions for the small amount of same-origin server-side behavior. The site should focus on Tengen, dedicated hardware, hosted game servers, infrastructure projects, public status information, and a protected admin area.
>
> Preserve these patterns from the reference project: static-first pages; normalized local JSON for public data; server-side sync scripts; scheduled and manually triggered GitHub Actions; commits only when generated data changes; automatic Cloudflare deployment from the production branch; secrets split between GitHub Actions and Cloudflare runtime environments; security headers and redirects; and an allowlisted server-side endpoint for safe manual refresh actions.
>
> Rebuild and rename the current shared-password signed-cookie flow if it is used. Treat it only as a low-risk owner gate. Do not place private data in pre-rendered HTML, browser storage, or public JSON. If the site will start or stop servers, change configuration, expose logs, or perform other sensitive operations, use individual identity with MFA and strict authorization (such as Cloudflare Access) in front of narrowly scoped backend APIs. Never expose infrastructure credentials or turn a web endpoint into an arbitrary command runner.
>
> Start with public routes for Home, About, Infrastructure, Servers, Games, Projects, and Status, plus a protected Admin area. Use realistic sample data first. Keep public server status sanitized and resilient, with a visible last-updated time and graceful unavailable states. Create a new repository, new Cloudflare Pages project, new scoped secrets, new cookie names, and explicit production-branch settings; do not carry over hard-coded Vitality repository, branch, workflow, domain, or Warcraft-specific configuration.

## Reference Files in the Existing Project

- `astro.config.mjs` — static Astro output.
- `package.json` — local development, build, validation, and sync commands.
- `src/layouts/Layout.astro` — shared site shell and navigation.
- `src/components/OfficerGate.astro` — shared-password gate user experience.
- `functions/_shared/officer-auth.ts` — signed session implementation.
- `functions/api/officer-auth.ts` — login/session endpoint.
- `functions/api/trigger-sync.ts` — protected, allowlisted GitHub workflow dispatch.
- `.github/workflows/sync-data.yml` — frequent scheduled data refresh.
- `.github/workflows/sync-wcl.yml` — separate external-data refresh.
- `.github/workflows/sync-all.yml` — combined manual refresh.
- `.env.example` — local configuration contract.
- `public/_headers` and `public/_redirects` — Cloudflare response behavior.

