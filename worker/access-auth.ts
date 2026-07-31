import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AccessEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

export type OwnerIdentity = {
  email: string;
  subject: string;
};

export type AccessResult =
  | { ok: true; identity: OwnerIdentity }
  | { ok: false; status: 401 | 503; message: string };

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function normalizeTeamDomain(value: string) {
  return value.trim().replace(/\/$/, "");
}

export async function authenticateOwnerRequest(request: Request, env: AccessEnv): Promise<AccessResult> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    return { ok: false, status: 503, message: "Owner authentication is not configured" };
  }

  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return { ok: false, status: 401, message: "Owner authentication required" };

  const issuer = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN);
  let keySet = keySets.get(issuer);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    keySets.set(issuer, keySet);
  }

  try {
    const { payload } = await jwtVerify(token, keySet, {
      issuer,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
    });
    if (typeof payload.email !== "string" || !payload.email || typeof payload.sub !== "string") {
      return { ok: false, status: 401, message: "Owner identity is incomplete" };
    }
    return { ok: true, identity: { email: payload.email, subject: payload.sub } };
  } catch {
    return { ok: false, status: 401, message: "Owner authentication is invalid or expired" };
  }
}
