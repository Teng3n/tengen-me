import type { OwnerDatabase } from "./owner-data";
import { recordStatusHistory } from "./owner-data";
import { isAuthorizedBridgeRequest } from "./bridge-auth";
import { getRegistryPublicServers } from "./server-registry-api";

const STATUS_KEY = "server:enshrouded-home";
const HEARTBEAT_AFTER_MS = 10 * 60 * 1000;
const STALE_AFTER_MS = 15 * 60 * 1000;
const MAX_PLAYER_NAMES = 16;

export interface StatusKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface ServerStatusEnv {
  STATUS_KV?: StatusKV;
  ENSHROUDED_BRIDGE_TOKEN?: string;
  PALWORLD_BRIDGE_TOKEN?: string;
  OWNER_DB?: OwnerDatabase;
}

export type StoredStatus = {
  status: "online" | "offline";
  currentPlayers: number;
  maximumPlayers: number;
  playerNames: string[];
  observedAt: string;
  receivedAt: string;
};

type PublicServerStatus = {
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

type PublicHistoryRow = {
  day: string;
  online_samples: number;
  total_samples: number;
  peak_players: number;
  maximum_players: number;
};

type PublicHistoryDay = {
  date: string;
  onlineSamples: number;
  totalSamples: number;
  peakPlayers: number;
  maximumPlayers: number;
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      ...headers,
    },
  });
}

function pendingStatus(): PublicServerStatus {
  return {
    slug: "enshrouded-home",
    name: "Home Server",
    game: "Enshrouded",
    status: "pending",
    region: "US West",
    connectAddress: null,
    players: { current: null, maximum: 16 },
    playerNames: [],
    lastUpdated: null,
    lastUpdatedLabel: "Awaiting first check",
    sourceLabel: "Bridge pending",
  };
}

function cleanInteger(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < minimum || value > maximum) return null;
  return value;
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40);
  return cleaned || null;
}

function parseStoredStatus(raw: string | null): StoredStatus | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredStatus>;
    if (value.status !== "online" && value.status !== "offline") return null;
    const currentPlayers = cleanInteger(value.currentPlayers, 0, 128);
    const maximumPlayers = cleanInteger(value.maximumPlayers, 1, 128);
    if (currentPlayers === null || maximumPlayers === null || currentPlayers > maximumPlayers) return null;
    if (!Array.isArray(value.playerNames)) return null;
    const playerNames = value.playerNames.map(cleanName).filter((name): name is string => Boolean(name)).slice(0, MAX_PLAYER_NAMES);
    const observedAt = typeof value.observedAt === "string" ? value.observedAt : "";
    const receivedAt = typeof value.receivedAt === "string" ? value.receivedAt : "";
    if (!Number.isFinite(Date.parse(observedAt)) || !Number.isFinite(Date.parse(receivedAt))) return null;
    return { status: value.status, currentPlayers, maximumPlayers, playerNames, observedAt, receivedAt };
  } catch {
    return null;
  }
}

function formatAge(iso: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function toPublicStatus(stored: StoredStatus, now: number): PublicServerStatus {
  const stale = now - Date.parse(stored.receivedAt) > STALE_AFTER_MS;
  const status = stale ? "offline" : stored.status;
  return {
    slug: "enshrouded-home",
    name: "Home Server",
    game: "Enshrouded",
    status,
    region: "US West",
    connectAddress: null,
    players: { current: status === "online" ? stored.currentPlayers : 0, maximum: stored.maximumPlayers },
    playerNames: status === "online" ? stored.playerNames : [],
    lastUpdated: stored.observedAt,
    lastUpdatedLabel: formatAge(stored.observedAt, now),
    sourceLabel: stale ? "Feed timed out" : "Live feed",
  };
}

export { isAuthorizedBridgeRequest } from "./bridge-auth";

export async function getStoredServerStatus(env: ServerStatusEnv): Promise<StoredStatus | null> {
  if (!env.STATUS_KV) return null;
  return parseStoredStatus(await env.STATUS_KV.get(STATUS_KEY));
}

function statusChanged(previous: StoredStatus, next: StoredStatus): boolean {
  if (
    previous.status !== next.status
    || previous.currentPlayers !== next.currentPlayers
    || previous.maximumPlayers !== next.maximumPlayers
    || previous.playerNames.length !== next.playerNames.length
  ) {
    return true;
  }
  return previous.playerNames.some((name, index) => name !== next.playerNames[index]);
}

async function getPublicServerHistory(db: OwnerDatabase | undefined, serverSlug: string): Promise<PublicHistoryDay[]> {
  if (!db) return [];
  const result = await db.prepare(
    `SELECT substr(observed_at, 1, 10) AS day,
            SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) AS online_samples,
            COUNT(*) AS total_samples,
            MAX(current_players) AS peak_players,
            MAX(maximum_players) AS maximum_players
     FROM server_status_history
     WHERE server_slug = ?
       AND julianday(received_at) >= julianday('now', '-29 days', 'start of day')
     GROUP BY substr(observed_at, 1, 10)
     ORDER BY day`,
  ).bind(serverSlug).all<PublicHistoryRow>();

  return result.results.flatMap((row) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.day)) return [];
    const onlineSamples = cleanInteger(row.online_samples, 0, 10_000);
    const totalSamples = cleanInteger(row.total_samples, 1, 10_000);
    const peakPlayers = cleanInteger(row.peak_players, 0, 128);
    const maximumPlayers = cleanInteger(row.maximum_players, 1, 128);
    if (onlineSamples === null || totalSamples === null || peakPlayers === null || maximumPlayers === null || onlineSamples > totalSamples || peakPlayers > maximumPlayers) return [];
    return [{ date: row.day, onlineSamples, totalSamples, peakPlayers, maximumPlayers }];
  });
}

export async function handleServerStatusGet(env: ServerStatusEnv): Promise<Response> {
  const [stored, registryServers] = await Promise.all([
    env.STATUS_KV ? env.STATUS_KV.get(STATUS_KEY).then(parseStoredStatus) : Promise.resolve(null),
    getRegistryPublicServers(env.OWNER_DB).catch(() => []),
  ]);
  const now = Date.now();
  let servers: PublicServerStatus[] = registryServers;
  if (registryServers.length) {
    if (stored && registryServers[0].slug === "enshrouded-home") {
      const live = toPublicStatus(stored, now);
      servers = [{ ...registryServers[0], ...live, name: registryServers[0].name, game: registryServers[0].game, region: registryServers[0].region }, ...registryServers.slice(1)];
    }
  } else {
    servers = [stored ? toPublicStatus(stored, now) : pendingStatus()];
  }
  const history = await getPublicServerHistory(env.OWNER_DB, servers[0].slug).catch(() => []);
  return json({ servers, currentSlug: servers[0].slug, history, generatedAt: new Date().toISOString() });
}

export async function handleServerStatusIngest(request: Request, env: ServerStatusEnv): Promise<Response> {
  if (!isAuthorizedBridgeRequest(request, env)) {
    return json({ error: "Unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });
  }
  if (!env.STATUS_KV) return json({ error: "Status storage is unavailable" }, 503);
  if (Number(request.headers.get("content-length") ?? 0) > 16_384) return json({ error: "Payload too large" }, 413);

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (body.slug !== "enshrouded-home" || (body.status !== "online" && body.status !== "offline")) {
    return json({ error: "Invalid server status" }, 400);
  }
  const currentPlayers = cleanInteger(body.currentPlayers, 0, 128);
  const maximumPlayers = cleanInteger(body.maximumPlayers, 1, 128);
  if (currentPlayers === null || maximumPlayers === null || currentPlayers > maximumPlayers) {
    return json({ error: "Invalid player counts" }, 400);
  }
  if (!Array.isArray(body.playerNames)) return json({ error: "Invalid player list" }, 400);
  const observedAt = typeof body.observedAt === "string" ? body.observedAt : "";
  const observedTime = Date.parse(observedAt);
  if (!Number.isFinite(observedTime) || Math.abs(Date.now() - observedTime) > 10 * 60 * 1000) {
    return json({ error: "Invalid observation time" }, 400);
  }

  const playerNames = body.playerNames.map(cleanName).filter((name): name is string => Boolean(name)).slice(0, MAX_PLAYER_NAMES);
  const stored: StoredStatus = {
    status: body.status,
    currentPlayers,
    maximumPlayers,
    playerNames,
    observedAt: new Date(observedTime).toISOString(),
    receivedAt: new Date().toISOString(),
  };
  const previous = parseStoredStatus(await env.STATUS_KV.get(STATUS_KEY));
  const heartbeatDue = !previous || Date.now() - Date.parse(previous.receivedAt) >= HEARTBEAT_AFTER_MS;
  if (!previous || statusChanged(previous, stored) || heartbeatDue) {
    await env.STATUS_KV.put(STATUS_KEY, JSON.stringify(stored), { expirationTtl: 86_400 });
  }
  try {
    await recordStatusHistory(env.OWNER_DB, {
      serverSlug: "enshrouded-home",
      status: stored.status,
      currentPlayers: stored.currentPlayers,
      maximumPlayers: stored.maximumPlayers,
      observedAt: stored.observedAt,
      receivedAt: stored.receivedAt,
    });
  } catch {
    // Public status ingestion remains available if private history storage is temporarily unavailable.
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
