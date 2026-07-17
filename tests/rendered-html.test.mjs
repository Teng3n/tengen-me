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
  assert.doesNotMatch(html, /Now building|Pacific Northwest|Public status|Owner access|Built to grow|A graceful status layer/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|ChatGPT/i);
});

test("servers page presents the Palworld card without implementation notes", async () => {
  const response = await render("/servers");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /The machines behind the worlds/);
  assert.match(html, /palworld-logo\.png/);
  assert.doesNotMatch(html, /Connection plan|Public data boundary|Public-safe availability|control plane/i);
});

test("status page reads as a visitor-facing availability summary", async () => {
  const response = await render("/status");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /A quick look at what/);
  assert.doesNotMatch(html, /status bridge|status API|integration|paired/i);
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
  const kv = {
    async get(key) { return values.get(key) ?? null; },
    async put(key, value) { values.set(key, value); },
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

  const stored = values.get("server:palworld-home");
  assert.match(stored, /Tengen/);
  assert.doesNotMatch(stored, /192\.168|must-not-be-stored/);

  const publicResponse = await callWorker("/api/server-status", {}, { STATUS_KV: kv });
  const publicPayload = await publicResponse.json();
  assert.equal(publicPayload.servers[0].status, "online");
  assert.equal(publicPayload.servers[0].players.current, 2);
  assert.deepEqual(publicPayload.servers[0].playerNames, ["Tengen", "Friend"]);
});
