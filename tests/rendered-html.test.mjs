import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const diagramSource = readFileSync(
  new URL("../office_room_diagram.html", import.meta.url),
  "utf8",
);

function diagramConfig() {
  const configScript = diagramSource.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(configScript, "drawing configuration script should exist");
  return vm.runInNewContext(`${configScript}; DRAWING_CONFIG`);
}

function resolveAxis(axisOrResolver, light) {
  return typeof axisOrResolver === "function"
    ? axisOrResolver(light)
    : axisOrResolver;
}

function sampledFanCoverage(config, drop, fixture, axis) {
  const slope = (config.ceiling.highHeight - config.ceiling.lowHeight) / config.ceiling.slopeAcross;
  const ceilingHeight = (x) => config.ceiling.highHeight - slope * x;
  const fanCeiling = ceilingHeight(config.fan.center.x);
  const z = fanCeiling - drop;
  let samples = 0;
  let mainSamples = 0;

  for (let y = 36; y <= 96; y += 0.5) {
    for (let x = 42; x <= 102; x += 0.5) {
      if (Math.hypot(x - 72, y - 66) > 30) continue;
      samples += 1;
      const inMain = config.lights.centers.some((light) => {
        const lightAxis = resolveAxis(axis, light);
        const dx = x - light.x;
        const dy = y - light.y;
        const dz = z - ceilingHeight(light.x);
        const length = Math.hypot(dx, dy, dz);
        const angle = Math.acos(
          (dx * lightAxis.x + dy * lightAxis.y + dz * lightAxis.z) / length,
        ) * 180 / Math.PI;
        return angle <= fixture.beamAngleDegrees / 2;
      });
      if (inMain) mainSamples += 1;
    }
  }
  return 100 * mainSamples / samples;
}

function sampledRoomCoverage(config, fixture, axis, z = 0, cell = 2) {
  const slope = (config.ceiling.highHeight - config.ceiling.lowHeight) / config.ceiling.slopeAcross;
  const ceilingHeight = (x) => config.ceiling.highHeight - slope * x;
  let samples = 0;
  let mainSamples = 0;
  let fieldSamples = 0;

  for (let y = 0; y < config.room.length; y += cell) {
    for (let x = 0; x < config.room.width; x += cell) {
      samples += 1;
      let main = 0;
      let field = 0;
      for (const light of config.lights.centers) {
        const lightAxis = resolveAxis(axis, light);
        const dx = x + cell / 2 - light.x;
        const dy = y + cell / 2 - light.y;
        const dz = z - ceilingHeight(light.x);
        const length = Math.hypot(dx, dy, dz);
        const angle = Math.acos(
          (dx * lightAxis.x + dy * lightAxis.y + dz * lightAxis.z) / length,
        ) * 180 / Math.PI;
        if (angle <= fixture.beamAngleDegrees / 2) main += 1;
        if (angle <= fixture.fieldAngleDegrees / 2) field += 1;
      }
      if (main > 0) mainSamples += 1;
      if (field > 0) fieldSamples += 1;
    }
  }

  return {
    mainPercent: 100 * mainSamples / samples,
    fieldPercent: 100 * fieldSamples / samples,
  };
}

function sampledWindowWallCoverage(config, fixture, axis, cell = 2) {
  const slope = (config.ceiling.highHeight - config.ceiling.lowHeight) / config.ceiling.slopeAcross;
  const ceilingHeight = (x) => config.ceiling.highHeight - slope * x;
  let samples = 0;
  let mainSamples = 0;
  let fieldSamples = 0;

  for (let y = 0; y < config.room.length; y += cell) {
    for (let z = 0; z < config.ceiling.lowHeight; z += cell) {
      const width = Math.min(cell, config.room.length - y);
      const height = Math.min(cell, config.ceiling.lowHeight - z);
      const point = {
        x: config.room.width,
        y: y + width / 2,
        z: z + height / 2,
      };
      const insideWindow =
        point.y >= config.window.y1 && point.y <= config.window.y2 &&
        point.z >= config.window.sillHeight && point.z <= config.window.headHeight;
      if (insideWindow) continue;

      samples += 1;
      let main = 0;
      let field = 0;
      for (const light of config.lights.centers) {
        const lightAxis = resolveAxis(axis, light);
        const dx = point.x - light.x;
        const dy = point.y - light.y;
        const dz = point.z - ceilingHeight(light.x);
        const length = Math.hypot(dx, dy, dz);
        const angle = Math.acos(
          (dx * lightAxis.x + dy * lightAxis.y + dz * lightAxis.z) / length,
        ) * 180 / Math.PI;
        if (angle <= fixture.beamAngleDegrees / 2) main += 1;
        if (angle <= fixture.fieldAngleDegrees / 2) field += 1;
      }
      if (main > 0) mainSamples += 1;
      if (field > 0) fieldSamples += 1;
    }
  }

  return {
    mainPercent: 100 * mainSamples / samples,
    fieldPercent: 100 * fieldSamples / samples,
  };
}

function sampledBathroomWallCoverage(config, fixture, axis, cell = 2) {
  const slope = (config.ceiling.highHeight - config.ceiling.lowHeight) / config.ceiling.slopeAcross;
  const ceilingHeight = (x) => config.ceiling.highHeight - slope * x;
  const monitorY1 = config.monitor.centerAlongWall - config.monitor.widthAlongWall / 2;
  const monitorY2 = config.monitor.centerAlongWall + config.monitor.widthAlongWall / 2;
  const monitorZ1 = config.desk.finishedHeight + config.monitor.bottomAboveDesktop;
  const monitorZ2 = monitorZ1 + config.monitor.height;
  let samples = 0;
  let mainSamples = 0;
  let fieldSamples = 0;

  for (let y = 0; y < config.room.length; y += cell) {
    for (let z = 0; z < config.ceiling.highHeight; z += cell) {
      const point = { x: 0, y: y + cell / 2, z: z + cell / 2 };
      const insideMonitor =
        point.y >= monitorY1 && point.y <= monitorY2 &&
        point.z >= monitorZ1 && point.z <= monitorZ2;
      if (insideMonitor) continue;

      samples += 1;
      let main = 0;
      let field = 0;
      for (const light of config.lights.centers) {
        const lightAxis = resolveAxis(axis, light);
        const dx = point.x - light.x;
        const dy = point.y - light.y;
        const dz = point.z - ceilingHeight(light.x);
        const length = Math.hypot(dx, dy, dz);
        const angle = Math.acos(
          (dx * lightAxis.x + dy * lightAxis.y + dz * lightAxis.z) / length,
        ) * 180 / Math.PI;
        if (angle <= fixture.beamAngleDegrees / 2) main += 1;
        if (angle <= fixture.fieldAngleDegrees / 2) field += 1;
      }
      if (main > 0) mainSamples += 1;
      if (field > 0) fieldSamples += 1;
    }
  }

  return {
    mainPercent: 100 * mainSamples / samples,
    fieldPercent: 100 * fieldSamples / samples,
  };
}

function sampledMonitorCoverage(config, fixture, axis, cell = 1) {
  const slope = (config.ceiling.highHeight - config.ceiling.lowHeight) / config.ceiling.slopeAcross;
  const ceilingHeight = (x) => config.ceiling.highHeight - slope * x;
  const y1 = config.monitor.centerAlongWall - config.monitor.widthAlongWall / 2;
  const y2 = config.monitor.centerAlongWall + config.monitor.widthAlongWall / 2;
  const z1 = config.desk.finishedHeight + config.monitor.bottomAboveDesktop;
  const z2 = z1 + config.monitor.height;
  let samples = 0;
  let mainSamples = 0;
  let fieldSamples = 0;

  for (let y = y1; y < y2; y += cell) {
    for (let z = z1; z < z2; z += cell) {
      const width = Math.min(cell, y2 - y);
      const height = Math.min(cell, z2 - z);
      const sampleY = y + width / 2;
      const localY = sampleY - config.monitor.centerAlongWall;
      const radius = config.monitor.curveRadius;
      const point = {
        x: radius - Math.sqrt(Math.max(0, radius ** 2 - localY ** 2)),
        y: sampleY,
        z: z + height / 2,
      };
      samples += 1;
      let main = 0;
      let field = 0;
      for (const light of config.lights.centers) {
        const lightAxis = resolveAxis(axis, light);
        const dx = point.x - light.x;
        const dy = point.y - light.y;
        const dz = point.z - ceilingHeight(light.x);
        const length = Math.hypot(dx, dy, dz);
        const angle = Math.acos(
          (dx * lightAxis.x + dy * lightAxis.y + dz * lightAxis.z) / length,
        ) * 180 / Math.PI;
        if (angle <= fixture.beamAngleDegrees / 2) main += 1;
        if (angle <= fixture.fieldAngleDegrees / 2) field += 1;
      }
      if (main > 0) mainSamples += 1;
      if (field > 0) fieldSamples += 1;
    }
  }

  return {
    mainPercent: 100 * mainSamples / samples,
    fieldPercent: 100 * fieldSamples / samples,
  };
}

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

test("unlinked office diagram serves the expanded four-view fixture study", async () => {
  const response = await render("/office-room-diagram");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/i);

  const html = await response.text();
  assert.match(html, /Revision 08/);
  assert.match(html, /pitchPositionsDegrees: \{ 1: 27, 2: 18, 3: 18, 4: 18 \}/);
  assert.match(html, /29\.1″ overall height/);
  assert.match(html, /HLBSL609FS5/);
  assert.match(html, /A1-HLBSL/);
  assert.match(html, /A2-HLBSL/);
  assert.match(html, /A1-RLS6/);
  assert.match(html, /A2-RLS6/);
  assert.match(html, /B-HLBSL/);
  assert.match(html, /B-RLS6/);
  assert.match(html, /C-HLBSL/);
  assert.match(html, /C-RLS6/);
  assert.match(html, /D-HLBSL/);
  assert.match(html, /D-RLS6/);
  assert.match(html, /id="installer-plan-heading"/);
  assert.match(html, /80″ LIGHT–LIGHT/);
  assert.match(html, /72″ LIGHT–LIGHT/);
  assert.match(html, /33\.7″ from each side wall/);
  assert.equal((html.match(/data-diagram-legend=/g) ?? []).length, 10);
  for (const diagram of [
    "A1-HLBSL", "A2-HLBSL", "A1-RLS6", "A2-RLS6",
    "B-HLBSL", "B-RLS6", "C-HLBSL", "C-RLS6",
    "D-HLBSL", "D-RLS6",
  ]) {
    assert.match(html, new RegExp(`data-diagram-legend="${diagram}"`));
  }
  assert.match(html, />COORDINATES</);
  assert.doesNotMatch(html, /FLOOR-PLANE FOOTPRINTS/);
  assert.doesNotMatch(html, /Yellow = main beam · blue = outer field/);
  assert.doesNotMatch(html, /<section class="legend main-page-only"/);
  assert.match(html, /href="\/office-room-diagram-details"/);
  assert.match(html, /mounting plane flush and parallel to the Bathroom wall/);
  assert.match(html, /How the corrected fan drop changes the wafer-light result/);
  assert.doesNotMatch(html, /MONITOR — PROVISIONAL/);
  assert.doesNotMatch(html, /Desktop projection above floor/);
  assert.doesNotMatch(html, /80″ run · starts at X=25″/);
  assert.doesNotMatch(html, /href=["']\/office-room-diagram["']/i);
});

test("office diagram detailed analysis is served on its own hidden route", async () => {
  const response = await render("/office-room-diagram-details");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/i);

  const html = await response.text();
  assert.match(html, /<body class="details-page">/);
  assert.match(html, /Office Room — Detailed Lighting Analysis/);
  assert.match(html, /E · How the corrected fan drop/);
  assert.match(html, /F · Fixture comparison/);
});

test("unlinked master room diagram serves the vaulted-ceiling lighting study", async () => {
  const response = await render("/master-room-diagram");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/i);

  const html = await response.text();
  assert.match(html, /Master Room/);
  assert.match(html, /Vaulted-Ceiling Lighting and Fan Study/);
  assert.match(html, /LEDR6XT\/HO\/NL\/5CCTCA/);
  assert.match(html, /Haiku L/);
  assert.match(html, /id="blade-plan-heading"/);
  assert.match(html, /id="floor-plan-heading"/);
  assert.match(html, /id="section-heading"/);
  assert.match(html, /id="night-heading"/);
  assert.match(html, /id="tv-wall-heading"/);
  assert.match(html, /id="installer-plan-heading"/);
  assert.match(html, /id="analysis-heading"/);
  assert.match(html, /22\.84/);
  assert.match(html, /18\.52/);
  assert.match(html, /exposed beam underside 131/);
  assert.match(html, /beam top is concealed/i);
  assert.match(html, /130″ LIGHT–LIGHT/);
  assert.match(html, /22⅞″/);
  assert.match(html, /Low likelihood/);
  assert.match(html, /reflects only the wall behind the bed/i);
  assert.doesNotMatch(html, /href=["']\/master-room-diagram["']/i);
});

test("office diagram geometry reflects the corrected fan drop", () => {
  const config = diagramConfig();
  const slope = (config.ceiling.highHeight - config.ceiling.lowHeight) / config.ceiling.slopeAcross;
  const fanCeiling = config.ceiling.highHeight - slope * config.fan.center.x;
  const axisLength = Math.hypot(slope, 1);
  const waferAxis = { x: -slope / axisLength, y: 0, z: -1 / axisLength };
  const slopeAngle = Math.atan(slope) * 180 / Math.PI;
  const rlsAxis = (light) => {
    const angle = (
      config.baselineLights.pitchPositionsDegrees[light.number] - slopeAngle
    ) * Math.PI / 180;
    return { x: Math.sin(angle), y: 0, z: -Math.cos(angle) };
  };

  assert.equal(fanCeiling, 120.25);
  assert.equal(fanCeiling - config.fan.analysisDropFromCeiling, 91.15);
  assert.equal(fanCeiling - config.fan.previousAssumedBladeDrop, 98.25);

  const oldWaferOverlap = sampledFanCoverage(
    config,
    config.fan.previousAssumedBladeDrop,
    config.lights,
    waferAxis,
  );
  const correctedWaferOverlap = sampledFanCoverage(
    config,
    config.fan.analysisDropFromCeiling,
    config.lights,
    waferAxis,
  );
  const correctedRlsOverlap = sampledFanCoverage(
    config,
    config.fan.analysisDropFromCeiling,
    config.baselineLights,
    rlsAxis,
  );

  assert.ok(oldWaferOverlap > 13 && oldWaferOverlap < 15);
  assert.ok(correctedWaferOverlap > 66 && correctedWaferOverlap < 68);
  assert.equal(correctedRlsOverlap, 0);

  const waferFloor = sampledRoomCoverage(config, config.lights, waferAxis);
  const rlsFloor = sampledRoomCoverage(config, config.baselineLights, rlsAxis);
  assert.equal(waferFloor.mainPercent, 100);
  assert.equal(waferFloor.fieldPercent, 100);
  assert.ok(rlsFloor.mainPercent > 99 && rlsFloor.mainPercent < 100);
  assert.equal(rlsFloor.fieldPercent, 100);

  const waferWindowWall = sampledWindowWallCoverage(
    config, config.lights, waferAxis,
  );
  const rlsWindowWall = sampledWindowWallCoverage(
    config, config.baselineLights, rlsAxis,
  );
  assert.ok(waferWindowWall.mainPercent > 66 && waferWindowWall.mainPercent < 68);
  assert.ok(waferWindowWall.fieldPercent > 87 && waferWindowWall.fieldPercent < 89);
  assert.ok(rlsWindowWall.mainPercent > 21 && rlsWindowWall.mainPercent < 23);
  assert.ok(rlsWindowWall.fieldPercent > 61 && rlsWindowWall.fieldPercent < 63);

  const waferBathroomWall = sampledBathroomWallCoverage(
    config, config.lights, waferAxis,
  );
  const rlsBathroomWall = sampledBathroomWallCoverage(
    config, config.baselineLights, rlsAxis,
  );
  assert.ok(waferBathroomWall.mainPercent > 82 && waferBathroomWall.mainPercent < 84);
  assert.ok(waferBathroomWall.fieldPercent > 94 && waferBathroomWall.fieldPercent < 96);
  assert.ok(rlsBathroomWall.mainPercent > 16 && rlsBathroomWall.mainPercent < 18);
  assert.ok(rlsBathroomWall.fieldPercent > 46 && rlsBathroomWall.fieldPercent < 48);

  const waferMonitor = sampledMonitorCoverage(
    config, config.lights, waferAxis,
  );
  const rlsMonitor = sampledMonitorCoverage(
    config, config.baselineLights, rlsAxis,
  );
  assert.equal(waferMonitor.mainPercent, 100);
  assert.equal(waferMonitor.fieldPercent, 100);
  assert.ok(rlsMonitor.mainPercent > 0 && rlsMonitor.mainPercent < 2);
  assert.equal(rlsMonitor.fieldPercent, 100);
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
