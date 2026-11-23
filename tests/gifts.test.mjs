import assert from "node:assert/strict";
import test from "node:test";

async function callWorker(path, init = {}, env = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("gift-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, init),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      ...env,
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

function createGiftDb() {
  const gift = {
    id: "11111111-1111-4111-8111-111111111111",
    title: "A very good gift",
    url: "https://example.com/gift",
    price_cents: 12999,
    priority: 3,
    note: "Black, please.",
    active: 1,
    created_at: "2026-11-22 12:00:00",
    updated_at: "2026-11-22 12:00:00",
  };
  let reservationHash = null;

  return {
    prepare(query) {
      let bindings = [];
      const statement = {
        bind(...values) { bindings = values; return statement; },
        async first() {
          if (query.includes("FROM owner_network_access")) {
            return { ipv4_cidr: "172.115.212.10/32", last_seen_at: new Date().toISOString() };
          }
          if (query.includes("SELECT id FROM gift_ideas")) return gift.active ? { id: gift.id } : null;
          return null;
        },
        async all() {
          if (query.includes("FROM gift_ideas AS gifts")) {
            return { success: true, results: [{ ...gift, reserved: reservationHash ? 1 : 0 }] };
          }
          if (query.includes("FROM gift_ideas")) return { success: true, results: [gift] };
          return { success: true, results: [] };
        },
        async run() {
          if (query.includes("INSERT INTO gift_reservations")) {
            if (reservationHash) return { success: true, meta: { changes: 0 } };
            reservationHash = bindings[0];
            return { success: true, meta: { changes: 1 } };
          }
          if (query.includes("DELETE FROM gift_reservations")) {
            const matches = reservationHash && bindings[1] === reservationHash;
            if (matches) reservationHash = null;
            return { success: true, meta: { changes: matches ? 1 : 0 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements) {
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
}

test("gift registry page and protected editor render", async () => {
  const publicResponse = await callWorker("/gifts", { headers: { accept: "text/html" } });
  assert.equal(publicResponse.status, 200);
  const publicHtml = await publicResponse.text();
  assert.match(publicHtml, /A few things I&#x27;d genuinely love/);
  assert.match(publicHtml, /reserve it/i);

  const deniedResponse = await callWorker("/admin/gifts", { headers: { accept: "text/html" } });
  assert.equal(deniedResponse.status, 200);
  assert.match(await deniedResponse.text(), /Gift editing is limited to the home network/);
});

test("public gift reservations are anonymous and can be released only with their browser token", async () => {
  const db = createGiftDb();
  const giftId = "11111111-1111-4111-8111-111111111111";

  const initial = await callWorker("/api/gifts", {}, { OWNER_DB: db });
  assert.equal(initial.status, 200);
  assert.equal((await initial.json()).gifts[0].reserved, false);

  const reserved = await callWorker(`/api/gifts/${giftId}/reservation`, { method: "POST" }, { OWNER_DB: db });
  assert.equal(reserved.status, 201);
  const { token } = await reserved.json();
  assert.equal(typeof token, "string");

  const publicAfter = await callWorker("/api/gifts", {}, { OWNER_DB: db });
  assert.equal((await publicAfter.json()).gifts[0].reserved, true);

  const wrongRelease = await callWorker(`/api/gifts/${giftId}/reservation`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "not-the-token" }),
  }, { OWNER_DB: db });
  assert.equal(wrongRelease.status, 403);

  const released = await callWorker(`/api/gifts/${giftId}/reservation`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  }, { OWNER_DB: db });
  assert.equal(released.status, 200);
});

test("owner gift API requires the approved network and omits reservation state", async () => {
  const db = createGiftDb();
  const denied = await callWorker("/admin/api/gifts", {}, { OWNER_DB: db });
  assert.equal(denied.status, 401);

  const allowed = await callWorker("/admin/api/gifts", {
    headers: { "cf-connecting-ip": "172.115.212.10" },
  }, { OWNER_DB: db });
  assert.equal(allowed.status, 200);
  const payload = await allowed.json();
  assert.equal(payload.gifts[0].title, "A very good gift");
  assert.equal("reserved" in payload.gifts[0], false);
});

test("gift mutations reject cross-origin requests", async () => {
  const response = await callWorker("/api/gifts/11111111-1111-4111-8111-111111111111/reservation", {
    method: "POST",
    headers: { origin: "https://attacker.example" },
  }, { OWNER_DB: createGiftDb() });
  assert.equal(response.status, 403);
});
