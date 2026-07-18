const STATUS_KEY = "server:palworld-home";
const HEARTBEAT_AFTER_MS = 10 * 60 * 1000;
const STALE_AFTER_MS = 15 * 60 * 1000;
const MAX_PLAYER_NAMES = 32;

export interface StatusKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface ServerStatusEnv {
  STATUS_KV?: StatusKV;
  PALWORLD_BRIDGE_TOKEN?: string;
}

type StoredStatus = {
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
  players: { current: number | null; maximum: number };
  playerNames: string[];
  lastUpdated: string | null;
  lastUpdatedLabel: string;
  sourceLabel: string;
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
    slug: "palworld-home",
    name: "Home Server",
    game: "Palworld",
    status: "pending",
    region: "US West",
    connectAddress: null,
    players: { current: null, maximum: 32 },
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
    slug: "palworld-home",
    name: "Home Server",
    game: "Palworld",
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

function safeTokenEqual(provided: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(provided);
  const right = encoder.encode(expected);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
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

export async function handleServerStatusGet(env: ServerStatusEnv): Promise<Response> {
  if (!env.STATUS_KV) return json({ servers: [pendingStatus()], generatedAt: new Date().toISOString() });
  const stored = parseStoredStatus(await env.STATUS_KV.get(STATUS_KEY));
  const server = stored ? toPublicStatus(stored, Date.now()) : pendingStatus();
  return json({ servers: [server], generatedAt: new Date().toISOString() });
}

export async function handleServerStatusIngest(request: Request, env: ServerStatusEnv): Promise<Response> {
  const expectedToken = env.PALWORLD_BRIDGE_TOKEN;
  const authorization = request.headers.get("authorization") ?? "";
  const providedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!expectedToken || !providedToken || !safeTokenEqual(providedToken, expectedToken)) {
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

  if (body.slug !== "palworld-home" || (body.status !== "online" && body.status !== "offline")) {
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
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
