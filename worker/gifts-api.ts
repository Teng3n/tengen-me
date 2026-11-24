import type { OwnerDatabase } from "./owner-data";
import type { OwnerIdentity } from "./owner-network-auth";
import { writeAudit } from "./owner-data";
import { inspectProductPage } from "./product-inspector";

export interface GiftApiEnv {
  OWNER_DB?: OwnerDatabase;
  PRODUCT_METADATA_FETCHER?: typeof fetch;
}

type GiftRow = {
  id: string;
  title: string;
  url: string;
  image_url: string | null;
  price_cents: number | null;
  priority: number;
  note: string;
  active: number;
  created_at: string;
  updated_at: string;
};

type PublicGiftRow = Omit<GiftRow, "active" | "updated_at"> & {
  reserved: number;
};

type GiftInput = {
  title: string;
  url: string;
  imageUrl: string | null;
  priceCents: number | null;
  priority: number;
  note: string;
  active: boolean;
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function serializeGift(row: GiftRow) {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    imageUrl: row.image_url,
    priceCents: row.price_cents,
    priority: row.priority,
    note: row.note,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializePublicGift(row: PublicGiftRow) {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    imageUrl: row.image_url,
    priceCents: row.price_cents,
    priority: row.priority,
    note: row.note,
    reserved: row.reserved === 1,
    createdAt: row.created_at,
  };
}

function parsePriceCents(value: unknown) {
  if (value === null) return null;
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100_000_000
    ? Number(value)
    : undefined;
}

function parseOptionalWebUrl(value: unknown) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2_048) return undefined;
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function parseGiftInput(value: unknown): GiftInput | { error: string } {
  if (!value || typeof value !== "object") return { error: "Gift details are required" };
  const body = value as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const priceCents = parsePriceCents(body.priceCents);
  const imageUrl = parseOptionalWebUrl(body.imageUrl);

  if (title.length < 2 || title.length > 120) return { error: "Title must be between 2 and 120 characters" };
  if (typeof body.url !== "string" || body.url.length > 2_048) return { error: "A valid retailer link is required" };
  let url: URL;
  try {
    url = new URL(body.url.trim());
  } catch {
    return { error: "A valid retailer link is required" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "Retailer links must use HTTP or HTTPS" };
  if (priceCents === undefined) return { error: "Price must be blank or a positive dollar amount" };
  if (imageUrl === undefined) return { error: "Image must be blank or a valid HTTP or HTTPS link" };
  if (!Number.isInteger(body.priority) || Number(body.priority) < 1 || Number(body.priority) > 3) {
    return { error: "Priority must be nice-to-have, would-love, or most-wanted" };
  }
  if (note.length > 500) return { error: "Notes must be 500 characters or fewer" };
  if (typeof body.active !== "boolean") return { error: "Visibility is required" };

  return {
    title,
    url: url.toString(),
    imageUrl,
    priceCents,
    priority: Number(body.priority),
    note,
    active: body.active,
  };
}

async function tokenHash(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function handlePublicGiftsGet(env: GiftApiEnv) {
  if (!env.OWNER_DB) return json({ error: "Gift ideas are unavailable" }, 503);
  try {
    const result = await env.OWNER_DB.prepare(
      `SELECT gifts.id, gifts.title, gifts.url, gifts.image_url, gifts.price_cents, gifts.priority,
        gifts.note, gifts.created_at,
        CASE WHEN reservations.gift_id IS NULL THEN 0 ELSE 1 END AS reserved
       FROM gift_ideas AS gifts
       LEFT JOIN gift_reservations AS reservations ON reservations.gift_id = gifts.id
       WHERE gifts.active = 1
       ORDER BY gifts.priority DESC, gifts.created_at DESC`,
    ).all<PublicGiftRow>();
    return json({ gifts: result.results.map(serializePublicGift) });
  } catch {
    return json({ error: "Gift ideas could not be loaded" }, 503);
  }
}

export async function handleGiftReservationCreate(request: Request, env: GiftApiEnv, giftId: string) {
  if (!isSameOrigin(request)) return json({ error: "Cross-origin requests are not allowed" }, 403);
  if (!env.OWNER_DB) return json({ error: "Gift reservations are unavailable" }, 503);

  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const hash = await tokenHash(token);
  try {
    const result = await env.OWNER_DB.prepare(
      `INSERT INTO gift_reservations (gift_id, token_hash, created_at)
       SELECT id, ?, CURRENT_TIMESTAMP FROM gift_ideas
       WHERE id = ? AND active = 1
       ON CONFLICT(gift_id) DO NOTHING`,
    ).bind(hash, giftId).run();

    if (!result.meta?.changes) {
      const gift = await env.OWNER_DB.prepare(
        "SELECT id FROM gift_ideas WHERE id = ? AND active = 1",
      ).bind(giftId).first<{ id: string }>();
      return gift
        ? json({ error: "Someone has already reserved this gift" }, 409)
        : json({ error: "Gift not found" }, 404);
    }
    return json({ ok: true, token }, 201);
  } catch {
    return json({ error: "This gift could not be reserved" }, 503);
  }
}

export async function handleGiftReservationDelete(request: Request, env: GiftApiEnv, giftId: string) {
  if (!isSameOrigin(request)) return json({ error: "Cross-origin requests are not allowed" }, 403);
  if (!env.OWNER_DB) return json({ error: "Gift reservations are unavailable" }, 503);
  let body: { token?: unknown };
  try {
    body = await request.json() as { token?: unknown };
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (typeof body.token !== "string" || body.token.length > 200) return json({ error: "Reservation token is required" }, 400);

  try {
    const result = await env.OWNER_DB.prepare(
      "DELETE FROM gift_reservations WHERE gift_id = ? AND token_hash = ?",
    ).bind(giftId, await tokenHash(body.token)).run();
    if (!result.meta?.changes) return json({ error: "This reservation belongs to another browser" }, 403);
    return json({ ok: true });
  } catch {
    return json({ error: "The reservation could not be released" }, 503);
  }
}

export async function handleAdminGiftsGet(env: GiftApiEnv) {
  if (!env.OWNER_DB) return json({ error: "Gift storage is unavailable" }, 503);
  try {
    const result = await env.OWNER_DB.prepare(
      `SELECT id, title, url, image_url, price_cents, priority, note, active, created_at, updated_at
       FROM gift_ideas
       ORDER BY active DESC, priority DESC, created_at DESC`,
    ).all<GiftRow>();
    return json({ gifts: result.results.map(serializeGift) });
  } catch {
    return json({ error: "Gift ideas could not be loaded" }, 503);
  }
}

export async function handleAdminGiftCreate(request: Request, env: GiftApiEnv, identity: OwnerIdentity) {
  if (!isSameOrigin(request)) return json({ error: "Cross-origin requests are not allowed" }, 403);
  if (!env.OWNER_DB) return json({ error: "Gift storage is unavailable" }, 503);
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const input = parseGiftInput(value);
  if ("error" in input) return json(input, 400);

  const id = crypto.randomUUID();
  try {
    await env.OWNER_DB.batch([
      env.OWNER_DB.prepare(
        `INSERT INTO gift_ideas
         (id, title, url, image_url, price_cents, priority, note, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      ).bind(id, input.title, input.url, input.imageUrl, input.priceCents, input.priority, input.note, input.active ? 1 : 0),
      env.OWNER_DB.prepare(
        `INSERT INTO owner_audit_log (actor, event_type, target, outcome, detail, created_at)
         VALUES (?, 'gift.created', ?, 'completed', ?, CURRENT_TIMESTAMP)`,
      ).bind(identity.label, id, input.title),
    ]);
    const gift = await env.OWNER_DB.prepare(
      `SELECT id, title, url, image_url, price_cents, priority, note, active, created_at, updated_at
       FROM gift_ideas WHERE id = ?`,
    ).bind(id).first<GiftRow>();
    return gift ? json({ gift: serializeGift(gift) }, 201) : json({ ok: true, id }, 201);
  } catch {
    return json({ error: "Gift idea could not be created" }, 503);
  }
}

export async function handleAdminGiftUpdate(
  request: Request,
  env: GiftApiEnv,
  identity: OwnerIdentity,
  giftId: string,
) {
  if (!isSameOrigin(request)) return json({ error: "Cross-origin requests are not allowed" }, 403);
  if (!env.OWNER_DB) return json({ error: "Gift storage is unavailable" }, 503);
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const input = parseGiftInput(value);
  if ("error" in input) return json(input, 400);

  try {
    const result = await env.OWNER_DB.prepare(
      `UPDATE gift_ideas SET title = ?, url = ?, image_url = ?, price_cents = ?, priority = ?, note = ?,
       active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).bind(
      input.title,
      input.url,
      input.imageUrl,
      input.priceCents,
      input.priority,
      input.note,
      input.active ? 1 : 0,
      giftId,
    ).run();
    if (!result.meta?.changes) return json({ error: "Gift not found" }, 404);
    await writeAudit(env.OWNER_DB, identity.label, "gift.updated", giftId, "completed", input.title);
    return json({ ok: true, id: giftId });
  } catch {
    return json({ error: "Gift idea could not be updated" }, 503);
  }
}

export async function handleAdminGiftLinkInspect(request: Request, env: GiftApiEnv) {
  if (!isSameOrigin(request)) return json({ error: "Cross-origin requests are not allowed" }, 403);
  let body: { url?: unknown };
  try {
    body = await request.json() as { url?: unknown };
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (typeof body.url !== "string" || !body.url.trim() || body.url.length > 2_048) {
    return json({ error: "Enter a retailer link first" }, 400);
  }
  try {
    const inspection = await inspectProductPage(body.url, env.PRODUCT_METADATA_FETCHER ?? fetch);
    return json({ inspection });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The product page could not be inspected";
    return json({ error: `${message}. You can still enter the details manually.` }, 422);
  }
}
