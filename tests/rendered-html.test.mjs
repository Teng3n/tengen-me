import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/", headers = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html", ...headers },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function callWorker(path, init = {}, env = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("api-test", `${process.pid}-${Date.now()}-${Math.random()}`);
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

test("server-renders the tengen.me home page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>tengen\.me · Servers, systems, and projects<\/title>/i);
  assert.match(html, /A home for the things I run, build, and keep online/);
  assert.match(html, /Palworld/);
  assert.match(html, /Checking status/);
  assert.match(html, /class="wordmark-block theme-toggle"/);
  assert.match(html, /Switch to dark mode/);
  assert.match(html, /data-theme="light"/);
  const primaryNav = html.match(/<nav class="primary-nav"[^>]*>(.*?)<\/nav>/)?.[1] ?? "";
  assert.doesNotMatch(primaryNav, /href="\/status"/);
  assert.doesNotMatch(html, /Now building|Pacific Northwest|Public status|Owner access|Built to grow|A graceful status layer/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|ChatGPT/i);
});

test("servers page presents the Palworld card without implementation notes", async () => {
  const response = await render("/servers");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /The machines behind the worlds/);
  assert.match(html, /palworld-logo-banner\.png/);
  assert.doesNotMatch(html, /Connection plan|Public data boundary|Public-safe availability|control plane/i);
});

test("status page reads as a visitor-facing availability summary", async () => {
  const response = await render("/status");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /A quick look at what/);
  assert.doesNotMatch(html, /status bridge|status API|integration|paired/i);
});

test("about and projects pages render their presentation details", async () => {
  const aboutResponse = await render("/about");
  assert.equal(aboutResponse.status, 200);
  const aboutHtml = await aboutResponse.text();
  assert.match(aboutHtml, /class="about-monogram">TEN<br\/><span>GEN<\/span>/);

  const projectsResponse = await render("/projects");
  assert.equal(projectsResponse.status, 200);
  const projectsHtml = await projectsResponse.text();
  assert.match(projectsHtml, /project-status project-status-active/);
});

test("admin route reveals no private surface without Cloudflare Access", async () => {
  const response = await render("/admin");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Owner access is being connected/);
  assert.match(html, /contains no private data or controls/);
});

test("admin route recognizes a Cloudflare Access identity", async () => {
  const response = await render("/admin", {
    "cf-access-authenticated-user-email": "owner@example.com",
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /owner@example\.com/);
  assert.match(html, /Welcome back/);
});

test("public status endpoint falls back safely before the first bridge update", async () => {
  const response = await callWorker("/api/server-status");
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.servers[0].status, "pending");
  assert.equal(payload.servers[0].connectAddress, null);
});

test("bridge ingestion requires its secret and stores only the public snapshot", async () => {
  const values = new Map();
  let putCount = 0;
  const kv = {
    async get(key) { return values.get(key) ?? null; },
    async put(key, value) { putCount += 1; values.set(key, value); },
  };
  const body = JSON.stringify({
    slug: "palworld-home",
    status: "online",
    currentPlayers: 2,
    maximumPlayers: 32,
    playerNames: ["Tengen", "Friend"],
    observedAt: new Date().toISOString(),
    privateIp: "192.168.1.20",
    adminPassword: "must-not-be-stored",
  });

  const denied = await callWorker("/api/server-status/ingest", {
    method: "POST", headers: { "content-type": "application/json" }, body,
  }, { STATUS_KV: kv, PALWORLD_BRIDGE_TOKEN: "correct-token" });
  assert.equal(denied.status, 401);

  const accepted = await callWorker("/api/server-status/ingest", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
    body,
  }, { STATUS_KV: kv, PALWORLD_BRIDGE_TOKEN: "correct-token" });
  assert.equal(accepted.status, 204);
  assert.equal(putCount, 1);

  const stored = values.get("server:palworld-home");
  assert.match(stored, /Tengen/);
  assert.doesNotMatch(stored, /192\.168|must-not-be-stored/);

  const publicResponse = await callWorker("/api/server-status", {}, { STATUS_KV: kv });
  const publicPayload = await publicResponse.json();
  assert.equal(publicPayload.servers[0].status, "online");
  assert.equal(publicPayload.servers[0].players.current, 2);
  assert.deepEqual(publicPayload.servers[0].playerNames, ["Tengen", "Friend"]);
});

test("unchanged bridge snapshots do not create repeated KV writes", async () => {
  const values = new Map();
  let putCount = 0;
  const kv = {
    async get(key) { return values.get(key) ?? null; },
    async put(key, value) { putCount += 1; values.set(key, value); },
  };
  const ingest = (overrides = {}) => callWorker("/api/server-status/ingest", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
    body: JSON.stringify({
      slug: "palworld-home",
      status: "online",
      currentPlayers: 2,
      maximumPlayers: 32,
      playerNames: ["Tengen", "Friend"],
      observedAt: new Date().toISOString(),
      ...overrides,
    }),
  }, { STATUS_KV: kv, PALWORLD_BRIDGE_TOKEN: "correct-token" });

  assert.equal((await ingest()).status, 204);
  assert.equal((await ingest()).status, 204);
  assert.equal((await ingest()).status, 204);
  assert.equal(putCount, 1);

  assert.equal((await ingest({ currentPlayers: 3 })).status, 204);
  assert.equal(putCount, 2);

  assert.equal((await ingest({ currentPlayers: 3, playerNames: ["Tengen", "Friend", "New Player"] })).status, 204);
  assert.equal(putCount, 3);
});

test("unchanged bridge snapshots write a heartbeat after ten minutes", async () => {
  const statusKey = "server:palworld-home";
  const values = new Map([[statusKey, JSON.stringify({
    status: "online",
    currentPlayers: 2,
    maximumPlayers: 32,
    playerNames: ["Tengen", "Friend"],
    observedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
    receivedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
  })]]);
  let putCount = 0;
  const kv = {
    async get(key) { return values.get(key) ?? null; },
    async put(key, value) { putCount += 1; values.set(key, value); },
  };
  const response = await callWorker("/api/server-status/ingest", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
    body: JSON.stringify({
      slug: "palworld-home",
      status: "online",
      currentPlayers: 2,
      maximumPlayers: 32,
      playerNames: ["Tengen", "Friend"],
      observedAt: new Date().toISOString(),
    }),
  }, { STATUS_KV: kv, PALWORLD_BRIDGE_TOKEN: "correct-token" });

  assert.equal(response.status, 204);
  assert.equal(putCount, 1);
  assert.ok(Date.parse(JSON.parse(values.get(statusKey)).receivedAt) > Date.now() - 60_000);
});

test("status feed remains live between heartbeats and times out after fifteen minutes", async () => {
  const makeKv = (ageMinutes) => ({
    async get() {
      return JSON.stringify({
        status: "online",
        currentPlayers: 2,
        maximumPlayers: 32,
        playerNames: ["Tengen", "Friend"],
        observedAt: new Date(Date.now() - ageMinutes * 60 * 1000).toISOString(),
        receivedAt: new Date(Date.now() - ageMinutes * 60 * 1000).toISOString(),
      });
    },
    async put() {},
  });

  const livePayload = await (await callWorker("/api/server-status", {}, { STATUS_KV: makeKv(11) })).json();
  assert.equal(livePayload.servers[0].status, "online");
  assert.equal(livePayload.servers[0].sourceLabel, "Live feed");

  const stalePayload = await (await callWorker("/api/server-status", {}, { STATUS_KV: makeKv(16) })).json();
  assert.equal(stalePayload.servers[0].status, "offline");
  assert.equal(stalePayload.servers[0].sourceLabel, "Feed timed out");
});
