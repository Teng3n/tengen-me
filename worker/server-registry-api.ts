import type { OwnerDatabase } from "./owner-data";
import { recordStatusHistory } from "./owner-data";
import { isAuthorizedBridgeRequest, type BridgeTokenEnv } from "./bridge-auth";

const MAX_SERVERS_PER_HOST = 32;
const MONITORING_STALE_AFTER_MS = 7 * 60 * 60 * 1000;

type RegistryServerInput = {
  slug: string;
  name: string;
  game: string;
  steamAppId: string | null;
  region: string;
  status: "online" | "offline";
  current: boolean;
  retired: boolean;
  currentPlayers: number | null;
  maximumPlayers: number | null;
  playerNames: string[];
};

type RegistryRow = {
  slug: string;
  name: string;
  game: string;
  region: string;
  lifecycle: "active" | "inactive" | "retired";
  status: "online" | "offline";
  current_players: number | null;
  maximum_players: number | null;
  player_names_json: string;
  observed_at: string;
  received_at: string;
};

export type RegistryPublicServer = {
  slug: string;
  name: string;
  game: string;
  status: "online" | "offline" | "pending";
  region: string;
  connectAddress: null;
  players: { current: number | null; maximum: number | null };
  playerNames: string[];
  lastUpdated: string | null;
  lastUpdatedLabel: string;
  sourceLabel: string;
};

type RegistryEnv = BridgeTokenEnv & { OWNER_DB?: OwnerDatabase };

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    },
  });
}

function cleanText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maximumLength);
  return cleaned || null;
}

function cleanIdentifier(value: unknown): string | null {
  const cleaned = cleanText(value, 64);
  return cleaned && /^[a-z0-9][a-z0-9-]{1,63}$/.test(cleaned) ? cleaned : null;
}

function cleanPlayerCount(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 128) return undefined;
  return value;
}

function cleanPlayerNames(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 32) return null;
  return value.flatMap((name) => {
    const cleaned = cleanText(name, 40);
    return cleaned ? [cleaned] : [];
  });
}

function parseServer(value: unknown): RegistryServerInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const slug = cleanIdentifier(input.slug);
  const name = cleanText(input.name, 60);
  const game = cleanText(input.game, 60);
  const region = cleanText(input.region, 40) ?? "US West";
  const steamAppId = input.steamAppId === null || input.steamAppId === undefined
    ? null
    : cleanText(input.steamAppId, 16);
  const status = input.status === "online" || input.status === "offline" ? input.status : null;
  const currentPlayers = cleanPlayerCount(input.currentPlayers);
  const maximumPlayers = cleanPlayerCount(input.maximumPlayers);
  const playerNames = cleanPlayerNames(input.playerNames ?? []);
  if (!slug || !name || !game || !status || currentPlayers === undefined || maximumPlayers === undefined || !playerNames) return null;
  if (steamAppId !== null && !/^\d{3,16}$/.test(steamAppId)) return null;
  if (maximumPlayers === 0 || (currentPlayers !== null && maximumPlayers !== null && currentPlayers > maximumPlayers)) return null;
  return {
    slug,
    name,
    game,
    steamAppId,
    region,
    status,
    current: input.current === true,
    retired: input.retired === true,
    currentPlayers,
    maximumPlayers,
    playerNames,
  };
}

function formatAge(iso: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function parseNames(raw: string): string[] {
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.flatMap((name) => cleanText(name, 40) ?? []) : [];
  } catch {
    return [];
  }
}

export async function getRegistryPublicServers(db: OwnerDatabase | undefined): Promise<RegistryPublicServer[]> {
  if (!db) return [];
  const result = await db.prepare(
    `SELECT slug, name, game, region, lifecycle, status, current_players,
            maximum_players, player_names_json, observed_at, received_at
     FROM game_server_registry
     WHERE lifecycle = 'active'
     ORDER BY is_current DESC,
              CASE status WHEN 'online' THEN 0 ELSE 1 END,
              received_at DESC
     LIMIT 8`,
  ).all<RegistryRow>();
  const now = Date.now();
  return result.results.flatMap((row) => {
    if (!Number.isFinite(Date.parse(row.observed_at)) || !Number.isFinite(Date.parse(row.received_at))) return [];
    const monitoringStale = now - Date.parse(row.received_at) > MONITORING_STALE_AFTER_MS;
    return [{
      slug: row.slug,
      name: row.name,
      game: row.game,
      status: monitoringStale ? "offline" : row.status,
      region: row.region,
      connectAddress: null,
      players: {
        current: monitoringStale || row.status === "offline" ? 0 : row.current_players,
        maximum: row.maximum_players,
      },
      playerNames: monitoringStale || row.status === "offline" ? [] : parseNames(row.player_names_json),
      lastUpdated: row.observed_at,
      lastUpdatedLabel: formatAge(row.observed_at, now),
      sourceLabel: monitoringStale ? "Monitoring unavailable" : "Host report",
    } satisfies RegistryPublicServer];
  });
}

export async function handleServerRegistrySync(request: Request, env: RegistryEnv): Promise<Response> {
  if (!isAuthorizedBridgeRequest(request, env)) return json({ error: "Unauthorized" }, 401);
  if (!env.OWNER_DB) return json({ error: "Registry storage is unavailable" }, 503);
  if (Number(request.headers.get("content-length") ?? 0) > 65_536) return json({ error: "Payload too large" }, 413);

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const hostId = cleanIdentifier(body.hostId);
  const hostName = cleanText(body.hostName, 80);
  const agentVersion = cleanText(body.agentVersion, 20);
  const observedAt = typeof body.observedAt === "string" ? body.observedAt : "";
  const observedTime = Date.parse(observedAt);
  if (!hostId || !hostName || !agentVersion || !Number.isFinite(observedTime) || Math.abs(Date.now() - observedTime) > 15 * 60 * 1000) {
    return json({ error: "Invalid host report" }, 400);
  }
  if (!Array.isArray(body.servers) || body.servers.length > MAX_SERVERS_PER_HOST) return json({ error: "Invalid server inventory" }, 400);
  const servers = body.servers.map(parseServer);
  if (servers.some((server) => server === null)) return json({ error: "Invalid server inventory" }, 400);
  const inventory = servers as RegistryServerInput[];
  if (new Set(inventory.map((server) => server.slug)).size !== inventory.length) return json({ error: "Duplicate server slug" }, 400);
  if (inventory.filter((server) => server.current && !server.retired).length > 1) return json({ error: "Only one current server is allowed per host" }, 400);

  const receivedAt = new Date().toISOString();
  const normalizedObservedAt = new Date(observedTime).toISOString();
  const statements = [
    env.OWNER_DB.prepare(
      `INSERT INTO server_hosts (host_id, display_name, agent_version, last_report_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(host_id) DO UPDATE SET
         display_name = excluded.display_name,
         agent_version = excluded.agent_version,
         last_report_at = excluded.last_report_at,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(hostId, hostName, agentVersion, receivedAt),
    env.OWNER_DB.prepare("UPDATE game_server_registry SET is_current = 0, updated_at = CURRENT_TIMESTAMP WHERE host_id = ?").bind(hostId),
  ];

  for (const server of inventory) {
    const lifecycle = server.retired ? "retired" : "active";
    statements.push(env.OWNER_DB.prepare(
      `INSERT INTO game_server_registry
       (slug, host_id, name, game, steam_app_id, region, lifecycle, status, is_current,
        current_players, maximum_players, player_names_json, observed_at, received_at,
        first_seen_at, last_seen_at, absent_since, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(slug) DO UPDATE SET
         host_id = excluded.host_id,
         name = excluded.name,
         game = excluded.game,
         steam_app_id = excluded.steam_app_id,
         region = excluded.region,
         lifecycle = excluded.lifecycle,
         status = excluded.status,
         is_current = excluded.is_current,
         current_players = excluded.current_players,
         maximum_players = excluded.maximum_players,
         player_names_json = excluded.player_names_json,
         observed_at = excluded.observed_at,
         received_at = excluded.received_at,
         last_seen_at = excluded.last_seen_at,
         absent_since = NULL,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      server.slug,
      hostId,
      server.name,
      server.game,
      server.steamAppId,
      server.region,
      lifecycle,
      server.status,
      server.current && !server.retired ? 1 : 0,
      server.currentPlayers,
      server.maximumPlayers,
      JSON.stringify(server.playerNames),
      normalizedObservedAt,
      receivedAt,
      receivedAt,
      receivedAt,
    ));
  }

  if (inventory.length) {
    const placeholders = inventory.map(() => "?").join(", ");
    statements.push(env.OWNER_DB.prepare(
      `UPDATE game_server_registry
       SET absent_since = COALESCE(absent_since, ?),
           lifecycle = CASE
             WHEN julianday(COALESCE(absent_since, ?)) <= julianday(?, '-30 days') THEN 'retired'
             WHEN julianday(COALESCE(absent_since, ?)) <= julianday(?, '-7 days') THEN 'inactive'
             ELSE lifecycle
           END,
           is_current = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE host_id = ? AND slug NOT IN (${placeholders}) AND lifecycle != 'retired'`,
    ).bind(receivedAt, receivedAt, receivedAt, receivedAt, receivedAt, hostId, ...inventory.map((server) => server.slug)));
  } else {
    statements.push(env.OWNER_DB.prepare(
      `UPDATE game_server_registry
       SET absent_since = COALESCE(absent_since, ?),
           lifecycle = CASE
             WHEN julianday(COALESCE(absent_since, ?)) <= julianday(?, '-30 days') THEN 'retired'
             WHEN julianday(COALESCE(absent_since, ?)) <= julianday(?, '-7 days') THEN 'inactive'
             ELSE lifecycle
           END,
           is_current = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE host_id = ? AND lifecycle != 'retired'`,
    ).bind(receivedAt, receivedAt, receivedAt, receivedAt, receivedAt, hostId));
  }

  await env.OWNER_DB.batch(statements);
  await Promise.all(inventory.filter((server) => !server.retired).map((server) => recordStatusHistory(env.OWNER_DB, {
    serverSlug: server.slug,
    status: server.status,
    currentPlayers: server.currentPlayers ?? 0,
    maximumPlayers: server.maximumPlayers ?? 1,
    observedAt: normalizedObservedAt,
    receivedAt,
  }).catch(() => undefined)));

  return json({ accepted: true, hostId, serverCount: inventory.length, receivedAt });
}
