import type { OwnerDatabase } from "./owner-data";
import { writeAudit } from "./owner-data";
import type { OwnerIdentity } from "./owner-network-auth";
import { getStoredServerStatus, type StatusKV } from "./server-status-api";
import { getElectricityAnalytics } from "./electricity-analytics";

export interface OwnerDashboardEnv {
  OWNER_DB?: OwnerDatabase;
  HOUSEHOLD_DB?: OwnerDatabase;
  STATUS_KV?: StatusKV;
}

type ChecklistRow = {
  id: string;
  title: string;
  detail: string;
  completed: number;
  updated_at: string;
};

type HistoryRow = {
  id: number;
  status: "online" | "offline";
  current_players: number;
  maximum_players: number;
  observed_at: string;
  received_at: string;
};

type ActionRow = {
  id: string;
  action: "refresh-status" | "save-world";
  status: "queued" | "running" | "completed" | "failed" | "expired";
  requested_at: string;
  completed_at: string | null;
  result: string | null;
};

type AuditRow = {
  id: number;
  actor: string;
  event_type: string;
  target: string;
  outcome: string;
  detail: string;
  created_at: string;
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

function requireDatabase(env: OwnerDashboardEnv) {
  return env.OWNER_DB ?? null;
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function timestampToIso(value: string | null) {
  if (!value) return value;
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
}

export async function handleOwnerDashboardGet(env: OwnerDashboardEnv, identity: OwnerIdentity) {
  const db = requireDatabase(env);
  if (!db) return json({ error: "Owner storage is unavailable" }, 503);

  try {
    const [historyResult, checklistResult, actionResult, auditResult, storedStatus, electricity] = await Promise.all([
      db.prepare(
        `SELECT id, status, current_players, maximum_players, observed_at, received_at
         FROM server_status_history WHERE server_slug = 'palworld-home'
         ORDER BY received_at DESC LIMIT 42`,
      ).all<HistoryRow>(),
      db.prepare(
        `SELECT id, title, detail, completed, updated_at
         FROM owner_checklist ORDER BY position`,
      ).all<ChecklistRow>(),
      db.prepare(
        `SELECT id, action, status, requested_at, completed_at, result
         FROM owner_actions ORDER BY requested_at DESC LIMIT 12`,
      ).all<ActionRow>(),
      db.prepare(
        `SELECT id, actor, event_type, target, outcome, detail, created_at
         FROM owner_audit_log ORDER BY created_at DESC LIMIT 20`,
      ).all<AuditRow>(),
      getStoredServerStatus(env),
      getElectricityAnalytics(env.HOUSEHOLD_DB, db).catch(() => null),
    ]);

    const now = Date.now();
    const bridgeAgeSeconds = storedStatus
      ? Math.max(0, Math.floor((now - Date.parse(storedStatus.receivedAt)) / 1000))
      : null;
    const bridgeFresh = bridgeAgeSeconds !== null && bridgeAgeSeconds <= 15 * 60;

    return json({
      generatedAt: new Date(now).toISOString(),
      owner: { label: identity.label },
      services: {
        access: { state: "operational", detail: "This request came through the approved home network." },
        website: { state: "operational", detail: "This authenticated request reached the production Worker." },
        database: { state: "operational", detail: "Owner history and controls are available." },
        bridge: {
          state: storedStatus ? (bridgeFresh ? "operational" : "stale") : "pending",
          detail: storedStatus
            ? (bridgeFresh ? "The Palworld host is reporting normally." : "The last Palworld report is too old.")
            : "The Palworld host has not published its first snapshot.",
        },
      },
      server: storedStatus ? {
        status: bridgeFresh ? storedStatus.status : "offline",
        currentPlayers: bridgeFresh ? storedStatus.currentPlayers : 0,
        maximumPlayers: storedStatus.maximumPlayers,
        playerNames: bridgeFresh ? storedStatus.playerNames : [],
        observedAt: storedStatus.observedAt,
        receivedAt: storedStatus.receivedAt,
        bridgeAgeSeconds,
      } : null,
      history: historyResult.results.reverse(),
      checklist: checklistResult.results.map((item) => ({
        ...item,
        completed: item.completed === 1,
        updated_at: timestampToIso(item.updated_at),
      })),
      actions: actionResult.results.map((action) => ({
        ...action,
        requested_at: timestampToIso(action.requested_at),
        completed_at: timestampToIso(action.completed_at),
      })),
      audit: auditResult.results.map((event) => ({ ...event, created_at: timestampToIso(event.created_at) })),
      electricity,
      tools: [
        { href: "/office-room-diagram", label: "Office lighting plan", detail: "Installer and beam-coverage views" },
        { href: "/office-room-diagram-details", label: "Office lighting analysis", detail: "Detailed calculations and comparisons" },
        { href: "/master-room-diagram", label: "Primary room lighting plan", detail: "Vaulted-ceiling layout and coordinates" },
      ],
    });
  } catch {
    return json({ error: "Owner dashboard data could not be loaded" }, 503);
  }
}

export async function handleChecklistUpdate(
  request: Request,
  env: OwnerDashboardEnv,
  identity: OwnerIdentity,
  checklistId: string,
) {
  if (!isSameOrigin(request)) return json({ error: "Cross-origin requests are not allowed" }, 403);
  const db = requireDatabase(env);
  if (!db) return json({ error: "Owner storage is unavailable" }, 503);
  let body: { completed?: unknown };
  try {
    body = await request.json() as { completed?: unknown };
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (typeof body.completed !== "boolean") return json({ error: "Completed must be a boolean" }, 400);

  const result = await db.prepare(
    "UPDATE owner_checklist SET completed = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(body.completed ? 1 : 0, checklistId).run();
  if (!result.meta?.changes) return json({ error: "Checklist item not found" }, 404);
  await writeAudit(
    db,
    identity.label,
    "checklist.updated",
    checklistId,
    "completed",
    body.completed ? "Marked complete" : "Marked incomplete",
  );
  return json({ ok: true, id: checklistId, completed: body.completed });
}

const allowedActions = new Set(["refresh-status", "save-world"]);

export async function handleOwnerActionCreate(request: Request, env: OwnerDashboardEnv, identity: OwnerIdentity) {
  if (!isSameOrigin(request)) return json({ error: "Cross-origin requests are not allowed" }, 403);
  const db = requireDatabase(env);
  if (!db) return json({ error: "Owner storage is unavailable" }, 503);
  let body: { action?: unknown };
  try {
    body = await request.json() as { action?: unknown };
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (typeof body.action !== "string" || !allowedActions.has(body.action)) {
    return json({ error: "Action is not allowed" }, 400);
  }

  const pending = await db.prepare(
    `SELECT id FROM owner_actions
     WHERE action = ? AND status IN ('queued', 'running')
     AND requested_at > datetime('now', '-10 minutes') LIMIT 1`,
  ).bind(body.action).first<{ id: string }>();
  if (pending) return json({ error: "That action is already pending", actionId: pending.id }, 409);

  const actionId = crypto.randomUUID();
  await db.batch([
    db.prepare(
      `INSERT INTO owner_actions (id, action, status, requested_by, requested_at)
       VALUES (?, ?, 'queued', ?, CURRENT_TIMESTAMP)`,
    ).bind(actionId, body.action, identity.label),
    db.prepare(
      `INSERT INTO owner_audit_log (actor, event_type, target, outcome, detail, created_at)
       VALUES (?, 'server.action.requested', ?, 'queued', ?, CURRENT_TIMESTAMP)`,
    ).bind(identity.label, actionId, body.action),
  ]);
  return json({ ok: true, actionId, status: "queued" }, 202);
}

export async function handleBridgeNextAction(env: OwnerDashboardEnv) {
  const db = requireDatabase(env);
  if (!db) return json({ error: "Owner storage is unavailable" }, 503);
  await db.prepare(
    "UPDATE owner_actions SET status = 'expired', completed_at = CURRENT_TIMESTAMP, result = 'Host did not collect the action in time' WHERE status = 'queued' AND requested_at < datetime('now', '-10 minutes')",
  ).run();
  const action = await db.prepare(
    `SELECT id, action FROM owner_actions
     WHERE status = 'queued' ORDER BY requested_at LIMIT 1`,
  ).first<{ id: string; action: "refresh-status" | "save-world" }>();
  if (!action) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

  await db.batch([
    db.prepare("UPDATE owner_actions SET status = 'running', started_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'queued'").bind(action.id),
    db.prepare(
      `INSERT INTO owner_audit_log (actor, event_type, target, outcome, detail, created_at)
       VALUES ('palworld-bridge', 'server.action.started', ?, 'running', ?, CURRENT_TIMESTAMP)`,
    ).bind(action.id, action.action),
  ]);
  return json(action);
}

export async function handleBridgeActionComplete(request: Request, env: OwnerDashboardEnv, actionId: string) {
  const db = requireDatabase(env);
  if (!db) return json({ error: "Owner storage is unavailable" }, 503);
  let body: { status?: unknown; message?: unknown };
  try {
    body = await request.json() as { status?: unknown; message?: unknown };
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (body.status !== "completed" && body.status !== "failed") return json({ error: "Invalid action status" }, 400);
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 300) : "";
  const result = await db.prepare(
    `UPDATE owner_actions SET status = ?, completed_at = CURRENT_TIMESTAMP, result = ?
     WHERE id = ? AND status = 'running'`,
  ).bind(body.status, message, actionId).run();
  if (!result.meta?.changes) return json({ error: "Running action not found" }, 404);
  await writeAudit(db, "palworld-bridge", "server.action.completed", actionId, body.status, message || body.status);
  return json({ ok: true });
}
