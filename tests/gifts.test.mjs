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
    image_url: "https://images.example.com/gift.jpg",
    price_cents: 12999,
    priority: 3,
    note: "Black, please.",
    active: 1,
    created_at: "2026-11-22 12:00:00",
    updated_at: "2026-11-22 12:00:00",
  };
  let reservationHash = null;
  let giftExists = true;

  return {
    prepare(query) {
      let bindings = [];
      const statement = {
        bind(...values) { bindings = values; return statement; },
        async first() {
          if (query.includes("FROM owner_network_access")) {
            return { ipv4_cidr: "172.115.212.10/32", last_seen_at: new Date().toISOString() };
          }
          if (query.includes("SELECT title FROM gift_ideas")) return giftExists ? { title: gift.title } : null;
          if (query.includes("SELECT id FROM gift_ideas")) return giftExists && gift.active ? { id: gift.id } : null;
          return null;
        },
        async all() {
          if (query.includes("FROM gift_ideas AS gifts")) {
            return { success: true, results: giftExists ? [{ ...gift, reserved: reservationHash ? 1 : 0 }] : [] };
          }
          if (query.includes("FROM gift_ideas")) return { success: true, results: giftExists ? [gift] : [] };
          return { success: true, results: [] };
        },
        async run() {
          if (query.includes("INSERT INTO gift_reservations")) {
            if (reservationHash) return { success: true, meta: { changes: 0 } };
            reservationHash = bindings[0];
            return { success: true, meta: { changes: 1 } };
          }
          if (query.includes("DELETE FROM gift_reservations")) {
            if (bindings.length === 1 && bindings[0] === gift.id) {
              const existed = Boolean(reservationHash);
              reservationHash = null;
              return { success: true, meta: { changes: existed ? 1 : 0 } };
            }
            const matches = reservationHash && bindings[1] === reservationHash;
            if (matches) reservationHash = null;
            return { success: true, meta: { changes: matches ? 1 : 0 } };
          }
          if (query.includes("DELETE FROM gift_ideas")) {
            const existed = giftExists && bindings[0] === gift.id;
            if (existed) giftExists = false;
            return { success: true, meta: { changes: existed ? 1 : 0 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };
}

test("gift registry page and protected editor render", async () => {
  const publicResponse = await callWorker("/gifts", { headers: { accept: "text/html" } });
  assert.equal(publicResponse.status, 200);
  const publicHtml = await publicResponse.text();
  assert.match(publicHtml, /A few gift ideas/);
  assert.match(publicHtml, /tengen<em>\.me<\/em>/);
  assert.doesNotMatch(publicHtml, /Primary navigation/i);
  assert.doesNotMatch(publicHtml, /Owner login/i);
  assert.doesNotMatch(publicHtml, /System status/i);
  assert.doesNotMatch(publicHtml, /© 2026 Tengen/i);
  assert.doesNotMatch(publicHtml, /Pick from any retailer/i);
  assert.doesNotMatch(publicHtml, /Choose something that feels right/i);
  assert.doesNotMatch(publicHtml, /Reservations are anonymous/i);

  const deniedResponse = await callWorker("/admin/gifts", { headers: { accept: "text/html" } });
  assert.equal(deniedResponse.status, 200);
  assert.match(await deniedResponse.text(), /Gift editing is limited to the home network/);

  const allowedResponse = await callWorker("/admin/gifts", {
    headers: { accept: "text/html", "cf-connecting-ip": "172.115.212.10" },
  }, { OWNER_DB: createGiftDb() });
  assert.equal(allowedResponse.status, 200);
  const allowedHtml = await allowedResponse.text();
  assert.match(allowedHtml, /Add New/);
  assert.match(allowedHtml, /Your current list/);
  assert.match(allowedHtml, /href="\/admin\/gifts"[^>]*aria-current="page"/);
});

test("public gift reservations are anonymous and can be released only with their browser token", async () => {
  const db = createGiftDb();
  const giftId = "11111111-1111-4111-8111-111111111111";

  const initial = await callWorker("/api/gifts", {}, { OWNER_DB: db });
  assert.equal(initial.status, 200);
  const initialGift = (await initial.json()).gifts[0];
  assert.equal(initialGift.reserved, false);
  assert.equal(initialGift.imageUrl, "https://images.example.com/gift.jpg");

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

test("owner can permanently delete a gift and its reservation", async () => {
  const db = createGiftDb();
  const giftId = "11111111-1111-4111-8111-111111111111";

  const reserved = await callWorker(`/api/gifts/${giftId}/reservation`, { method: "POST" }, { OWNER_DB: db });
  assert.equal(reserved.status, 201);

  const deleted = await callWorker(`/admin/api/gifts/${giftId}`, {
    method: "DELETE",
    headers: { "cf-connecting-ip": "172.115.212.10" },
  }, { OWNER_DB: db });
  assert.equal(deleted.status, 200);

  const adminList = await callWorker("/admin/api/gifts", {
    headers: { "cf-connecting-ip": "172.115.212.10" },
  }, { OWNER_DB: db });
  assert.deepEqual((await adminList.json()).gifts, []);

  const deletedAgain = await callWorker(`/admin/api/gifts/${giftId}`, {
    method: "DELETE",
    headers: { "cf-connecting-ip": "172.115.212.10" },
  }, { OWNER_DB: db });
  assert.equal(deletedAgain.status, 404);
});

test("gift editor accepts priorities one through five and rejects values outside the scale", async () => {
  const gift = {
    title: "Priority test gift",
    url: "https://retailer.example.com/gift",
    imageUrl: null,
    priceCents: 2500,
    priority: 5,
    note: "",
    active: true,
  };
  const accepted = await callWorker("/admin/api/gifts", {
    method: "POST",
    headers: {
      "cf-connecting-ip": "172.115.212.10",
      "content-type": "application/json",
    },
    body: JSON.stringify(gift),
  }, { OWNER_DB: createGiftDb() });
  assert.equal(accepted.status, 201);

  const rejected = await callWorker("/admin/api/gifts", {
    method: "POST",
    headers: {
      "cf-connecting-ip": "172.115.212.10",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...gift, priority: 6 }),
  }, { OWNER_DB: createGiftDb() });
  assert.equal(rejected.status, 400);
  assert.match((await rejected.json()).error, /1 to 5/);
});

test("owner can inspect structured retailer metadata and choose among suggestions", async () => {
  const productHtml = `<!doctype html><html><head>
    <meta property="og:title" content="Maxwell 2 ANC Wireless Gaming Headset">
    <meta property="og:image" content="/images/maxwell-front.jpg">
    <script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Maxwell 2 ANC Wireless Gaming Headset",
      image: [
        "https://cdn.audeze.example/maxwell-side.jpg",
        "https://cdn.audeze.example/maxwell-case.jpg",
      ],
      offers: [
        { "@type": "Offer", name: "PlayStation", price: "349.00", priceCurrency: "USD" },
        { "@type": "Offer", name: "Xbox", price: "399.00", priceCurrency: "USD" },
      ],
    })}</script>
  </head><body></body></html>`;
  const metadataFetcher = async () => new Response(productHtml, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });

  const response = await callWorker("/admin/api/gifts/inspect-link", {
    method: "POST",
    headers: {
      "cf-connecting-ip": "172.115.212.10",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      url: "https://www.audeze.com/products/maxwell-2-anc-wireless-gaming-headset?variant=43222579118158",
    }),
  }, { OWNER_DB: createGiftDb(), PRODUCT_METADATA_FETCHER: metadataFetcher });

  assert.equal(response.status, 200);
  const { inspection } = await response.json();
  assert.equal(inspection.retailer, "audeze.com");
  assert.equal(inspection.titles[0].value, "Maxwell 2 ANC Wireless Gaming Headset");
  assert.equal(inspection.images.length, 3);
  assert.deepEqual(inspection.prices.map((price) => price.priceCents), [34900, 39900]);
});

test("product inspection rejects local and IP-literal destinations", async () => {
  let fetched = false;
  const metadataFetcher = async () => {
    fetched = true;
    return new Response("<html></html>", { headers: { "content-type": "text/html" } });
  };
  const response = await callWorker("/admin/api/gifts/inspect-link", {
    method: "POST",
    headers: {
      "cf-connecting-ip": "172.115.212.10",
      "content-type": "application/json",
    },
    body: JSON.stringify({ url: "http://127.0.0.1/admin" }),
  }, { OWNER_DB: createGiftDb(), PRODUCT_METADATA_FETCHER: metadataFetcher });

  assert.equal(response.status, 422);
  assert.equal(fetched, false);
  assert.match((await response.json()).error, /cannot be inspected/i);
});

test("product inspection recognizes Amazon-style gallery images and displayed prices", async () => {
  const productHtml = `<!doctype html><html><head><title>Amazon.com: Cooling earpads : Electronics</title></head><body>
    <h1><span id="productTitle">WC Freeze Maxwell 2 Cooling Earpads</span></h1>
    <script>const gallery = {"hiRes":"https://m.media-amazon.com/images/I/front._AC_SL1500_.jpg","large":"https://m.media-amazon.com/images/I/side._AC_.jpg"};</script>
    <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">$30.95</span></span></div>
    <span class="a-offscreen">$29.95</span>
  </body></html>`;
  const response = await callWorker("/admin/api/gifts/inspect-link", {
    method: "POST",
    headers: {
      "cf-connecting-ip": "172.115.212.10",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      url: "https://www.amazon.com/WC-Freeze-Maxwell-Cooling-Replacement/dp/B0GV4YPPFW?th=1",
    }),
  }, {
    OWNER_DB: createGiftDb(),
    PRODUCT_METADATA_FETCHER: async () => new Response(productHtml, { headers: { "content-type": "text/html" } }),
  });

  assert.equal(response.status, 200);
  const { inspection } = await response.json();
  assert.equal(inspection.titles[0].value, "WC Freeze Maxwell 2 Cooling Earpads");
  assert.equal(inspection.images.length, 2);
  assert.deepEqual(inspection.prices.map((price) => price.priceCents), [3095, 2995]);
});
