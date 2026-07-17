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

test("server-renders the tengen.me home page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>tengen\.me · Servers, systems, and projects<\/title>/i);
  assert.match(html, /A home for the things I run, build, and keep online/);
  assert.match(html, /Palworld/);
  assert.match(html, /Bridge pending/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|ChatGPT/i);
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
