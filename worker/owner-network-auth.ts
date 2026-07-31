import type { OwnerDatabase } from "./owner-data";

export interface OwnerNetworkEnv {
  OWNER_DB?: OwnerDatabase;
  HOME_ACCESS_UPDATE_TOKEN?: string;
}

export type OwnerIdentity = {
  label: string;
  subject: string;
};

export type OwnerAccessResult =
  | { ok: true; identity: OwnerIdentity }
  | { ok: false; status: 401 | 503; message: string };

type NetworkAccessRow = {
  ipv4_cidr: string;
  last_seen_at?: string;
};

const OWNER_AUTHORIZATION_HEADER = "x-tengen-owner-authorized";
const HOME_ACCESS_ID = "home";
const OWNER_IDENTITY: OwnerIdentity = { label: "Home network", subject: "home-ip" };
const LAST_SEEN_WRITE_INTERVAL_MS = 6 * 60 * 60 * 1000;

function parseIpv4(value: string) {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^(0|[1-9]\d{0,2})$/.test(part) ? Number(part) : -1));
  if (octets.some((part) => part < 0 || part > 255)) return null;
  return octets;
}

export function isGlobalIpv4(value: string) {
  const octets = parseIpv4(value);
  if (!octets) return false;
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function getConnectingIpv4(request: Request) {
  const value = request.headers.get("cf-connecting-ip")?.trim() ?? "";
  return isGlobalIpv4(value) ? value : null;
}

async function secureTokenMatches(provided: string, expected: string) {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

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

export async function authorizeOwnerNetworkRequest(
  request: Request,
  env: OwnerNetworkEnv,
): Promise<OwnerAccessResult> {
  if (!env.OWNER_DB) {
    return { ok: false, status: 503, message: "Owner network authorization is unavailable" };
  }
  const ipv4 = getConnectingIpv4(request);
  if (!ipv4) return { ok: false, status: 401, message: "Approved home network required" };

  try {
    const row = await env.OWNER_DB.prepare(
      "SELECT ipv4_cidr FROM owner_network_access WHERE id = ?",
    ).bind(HOME_ACCESS_ID).first<NetworkAccessRow>();
    if (row?.ipv4_cidr !== `${ipv4}/32`) {
      return { ok: false, status: 401, message: "Approved home network required" };
    }
    return { ok: true, identity: OWNER_IDENTITY };
  } catch {
    return { ok: false, status: 503, message: "Owner network authorization is unavailable" };
  }
}

export function withOwnerAuthorization(request: Request, authorized: boolean) {
  const headers = new Headers(request.headers);
  headers.delete(OWNER_AUTHORIZATION_HEADER);
  if (authorized) headers.set(OWNER_AUTHORIZATION_HEADER, "1");
  return new Request(request, { headers });
}

export async function handleHomeAccessHeartbeat(request: Request, env: OwnerNetworkEnv) {
  if (!env.OWNER_DB || !env.HOME_ACCESS_UPDATE_TOKEN) {
    return json({ error: "Home access updater is not configured" }, 503);
  }
  const authorization = request.headers.get("authorization") ?? "";
  const providedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!providedToken || !(await secureTokenMatches(providedToken, env.HOME_ACCESS_UPDATE_TOKEN))) {
    return json({ error: "Unauthorized" }, 401);
  }
  const ipv4 = getConnectingIpv4(request);
  if (!ipv4) return json({ error: "A public IPv4 connection is required" }, 400);

  try {
    const existing = await env.OWNER_DB.prepare(
      "SELECT ipv4_cidr, last_seen_at FROM owner_network_access WHERE id = ?",
    ).bind(HOME_ACCESS_ID).first<NetworkAccessRow>();
    const desiredCidr = `${ipv4}/32`;
    const changed = existing?.ipv4_cidr !== desiredCidr;
    const lastSeenAge = existing?.last_seen_at ? Date.now() - Date.parse(existing.last_seen_at) : Number.POSITIVE_INFINITY;

    if (changed) {
      await env.OWNER_DB.batch([
        env.OWNER_DB.prepare(
          `INSERT INTO owner_network_access (id, ipv4_cidr, updated_at, updated_by, last_seen_at)
           VALUES (?, ?, CURRENT_TIMESTAMP, 'home-updater', CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO UPDATE SET ipv4_cidr = excluded.ipv4_cidr,
             updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by,
             last_seen_at = CURRENT_TIMESTAMP`,
        ).bind(HOME_ACCESS_ID, desiredCidr),
        env.OWNER_DB.prepare(
          `INSERT INTO owner_audit_log (actor, event_type, target, outcome, detail, created_at)
           VALUES ('home-updater', 'owner.network.updated', 'home', 'completed',
             'Approved home IPv4 address updated', CURRENT_TIMESTAMP)`,
        ),
      ]);
    } else if (!Number.isFinite(lastSeenAge) || lastSeenAge >= LAST_SEEN_WRITE_INTERVAL_MS) {
      await env.OWNER_DB.prepare(
        "UPDATE owner_network_access SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(HOME_ACCESS_ID).run();
    }

    return json({ ok: true, changed, cidr: desiredCidr });
  } catch {
    return json({ error: "Home access could not be updated" }, 503);
  }
}
