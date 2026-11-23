import { afterEach, expect, it, vi } from "vitest";
import { HelperStream, helperAuthorized, helperObservation, HELPER_PROTOCOL } from "../src/helper-stream";
import type { Env, StockResult } from "../src/types";
const env = { HELPER_TOKEN: "a".repeat(64) } as Env;
const receiverId = "1".repeat(32);
const request = (key = env.HELPER_TOKEN!, id = receiverId, generation = 1) => new Request("https://checker/helper-stream", {
  headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": `${HELPER_PROTOCOL}, key.${key}, receiver.${id}, generation.${generation}` },
});
const observation = (): StockResult => ({ status: "available", checkedAt: new Date().toISOString(), evidence: {
  inventoryAvailable: false, button: { state: "enabled", matchingForms: 1, labels: [], variantInputDisabled: [], buttonDisabled: [] },
  productFeed: { url: "private", attempts: 1, elapsedMs: 1 }, productPage: { url: "private", attempts: 1, elapsedMs: 1 }, reasons: [],
} });
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const data = new Map<string, unknown>();
  class Socket {
    readyState = 1; data: unknown;
    send = vi.fn(); close = vi.fn(() => { this.readyState = 2; });
    serializeAttachment(value: unknown) { this.data = structuredClone(value); }
    deserializeAttachment() { return structuredClone(this.data); }
  }
  const sockets: Socket[] = [];
  const ctx = { storage: { get: async (key: string) => data.get(key), put: async (key: string, value: unknown) => data.set(key, value) },
    getWebSockets: () => sockets, acceptWebSocket: (socket: typeof sockets[number]) => sockets.push(socket) } as unknown as DurableObjectState;
  vi.stubGlobal("WebSocketPair", class { 0 = {}; 1 = new Socket(); });
  const NativeResponse = Response;
  vi.stubGlobal("Response", class extends NativeResponse {
    constructor(body: BodyInit | null, init: ResponseInit) {
      super(body, init.status === 101 ? { status: 200 } : init);
    }
  });
  return { data, sockets, stream: new HelperStream(ctx, env), ctx };
}
it("requires a separate exact receiver token and protocol; no query-string key", () => {
  expect(helperAuthorized(request(), env)).toBe(true);
  expect(helperAuthorized(request("b".repeat(64)), env)).toBe(false);
  expect(helperAuthorized(request(), {} as Env)).toBe(false);
  expect(helperAuthorized(new Request("https://checker/helper-stream?key=" + env.HELPER_TOKEN), env)).toBe(false);
});
it("unauthorized requests create no sockets", async () => {
  const f = fixture(); expect((await f.stream.open(request("b".repeat(64)))).status).toBe(401);
  expect(f.sockets).toHaveLength(0);
});
it("publishes minimal observations to receiver without URLs, secrets, or raw responses", async () => {
  const f = fixture(); await f.stream.open(request()); await f.stream.publish(observation(), 7);
  const text = f.sockets[0]!.send.mock.calls.at(-1)![0] as string;
  expect(JSON.parse(text)).toMatchObject({ type: "check", epoch: 7, inventory: false, button: "enabled" });
  expect(text).not.toContain("private"); expect(text).not.toContain(env.HELPER_TOKEN);
});
it("same receiver's newer reconnect gets snapshot and supersedes only its old connection", async () => {
  const f = fixture(); await f.stream.publish(observation(), 7); await f.stream.open(request());
  expect(f.sockets[0]!.send).toHaveBeenCalledTimes(2);
  await new HelperStream(f.ctx, env).open(request(env.HELPER_TOKEN!, receiverId, 2));
  expect(f.sockets[0]!.close).toHaveBeenCalledWith(4002, "Connection superseded");
  expect(f.sockets[1]!.send).toHaveBeenCalledTimes(2);
  await f.stream.publish(observation(), 8);
  expect(f.sockets[0]!.send).toHaveBeenCalledTimes(2);
  expect(f.sockets[1]!.send).toHaveBeenCalledTimes(3);
});
it("different receiver is rejected without closing or starving the existing connection", async () => {
  const f = fixture(); await f.stream.open(request()); await f.stream.open(request(env.HELPER_TOKEN!, "2".repeat(32)));
  expect(f.sockets[0]!.close).not.toHaveBeenCalled();
  expect(f.sockets[1]!.close).toHaveBeenCalledWith(4003, "receiver_busy");
  await f.stream.publish(observation(), 7);
  expect(f.sockets[0]!.send).toHaveBeenCalledTimes(2); expect(f.sockets[1]!.send).toHaveBeenCalledTimes(1);
});
it("out-of-order or replayed handshake never evicts newer connection, including after hibernation", async () => {
  const f = fixture(); await f.stream.open(request(env.HELPER_TOKEN!, receiverId, 3));
  for (const generation of [1, 2, 3]) await new HelperStream(f.ctx, env).open(request(env.HELPER_TOKEN!, receiverId, generation));
  expect(f.sockets[0]!.close).not.toHaveBeenCalled();
  for (const socket of f.sockets.slice(1)) expect(socket.close).toHaveBeenCalledWith(4004, "receiver_outdated");
});
it("legacy clients cannot silently replace an identified receiver", async () => {
  const f = fixture(); await f.stream.open(request());
  const legacy = new Request("https://checker/helper-stream", { headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": `${HELPER_PROTOCOL}, key.${env.HELPER_TOKEN}` } });
  expect((await f.stream.open(legacy)).status).toBe(426); expect(f.sockets[0]!.close).not.toHaveBeenCalled();
});
it("closed receiver allows a new identity but idle sockets cannot later publish or reply", async () => {
  const f = fixture(); await f.stream.open(request()); f.sockets[0]!.close();
  await f.stream.open(request(env.HELPER_TOKEN!, "2".repeat(32))); expect(f.sockets[1]!.close).not.toHaveBeenCalled();
  const before = f.sockets[0]!.send.mock.calls.length;
  f.stream.message(f.sockets[0] as unknown as WebSocket, '{"type":"ping"}');
  expect(f.sockets[0]!.send).toHaveBeenCalledTimes(before);
});
it("silent stale receiver can be replaced after 90 seconds, while ping extends activity", async () => {
  const f = fixture(); await f.stream.open(request());
  const first = f.sockets[0]!;
  first.serializeAttachment({ ...(first.data as object), lastSeen: Date.now() - 91000 });
  f.stream.message(first as unknown as WebSocket, '{"type":"ping"}');
  await f.stream.open(request(env.HELPER_TOKEN!, "2".repeat(32))); expect(first.close).not.toHaveBeenCalled();
  first.serializeAttachment({ ...(first.data as object), lastSeen: Date.now() - 91000 });
  await f.stream.open(request(env.HELPER_TOKEN!, "2".repeat(32), 2));
  expect(first.close).toHaveBeenCalledWith(4002, "Connection superseded");
});
it("stale snapshots are not replayed", async () => {
  const f = fixture(); const old = observation(); old.checkedAt = new Date(Date.now() - 21000).toISOString();
  f.data.set("helperLatest", helperObservation(old, 8)); await f.stream.open(request());
  expect(f.sockets[0]!.send).toHaveBeenCalledTimes(1);
});
it("test echoes only to sender and never changes persisted stock", async () => {
  const f = fixture(); await f.stream.open(request()); const socket = f.sockets[0]!;
  f.stream.message(socket as unknown as WebSocket, JSON.stringify({ type: "test", nonce: "00000000-0000-0000-0000-000000000000" }));
  expect(JSON.parse(socket.send.mock.calls.at(-1)![0] as string).type).toBe("test");
  expect(f.data.has("helperLatest")).toBe(false);
  f.stream.message(socket as unknown as WebSocket, '{"type":"check","status":"available"}');
  expect(socket.close).toHaveBeenCalledWith(1008, "Invalid message");
});
it("pause/failure invalidation overwrites available snapshot with unknown", async () => {
  const f = fixture(); await f.stream.publish(observation(), 7); await f.stream.clear();
  expect(f.data.get("helperLatest")).toMatchObject({ status: "unknown", epoch: 0, inventory: null });
});
it("broken socket does not prevent persisting current state", async () => {
  const f = fixture(); await f.stream.open(request()); f.sockets[0]!.send.mockImplementation(() => { throw new Error("closed"); });
  await f.stream.publish(observation(), 7); expect(f.data.get("helperLatest")).toMatchObject({ epoch: 7 });
});

it("explicit checkout simulation reaches only active receiver without modifying real stock snapshot", async () => {
  const f = fixture(); await f.stream.open(request());
  const real = observation(); real.status = "unavailable"; real.evidence.inventoryAvailable = false;
  await f.stream.publish(real, 19); const snapshot = structuredClone(f.data.get("helperLatest"));
  const response = await f.stream.checkoutSimulation("a".repeat(32));
  expect(await response.json()).toMatchObject({ status: "simulation_sent", receiverAcknowledged: false });
  const payload = JSON.parse(f.sockets[0]!.send.mock.calls.at(-1)![0] as string);
  expect(payload).toMatchObject({ simulation: true, status: "available", inventory: true, button: "enabled", healthy: true });
  expect(payload.epoch).toBeGreaterThan(4_000_000_000_000);
  expect(f.data.get("helperLatest")).toEqual(snapshot);
  const sentCount = f.sockets[0]!.send.mock.calls.length;
  expect(await (await f.stream.checkoutSimulation("a".repeat(32))).json()).toMatchObject({ status: "already_attempted" });
  expect(f.sockets[0]!.send).toHaveBeenCalledTimes(sentCount);
});
it("simulation with no connected receiver does not queue for later; malformed ID is rejected", async () => {
  const f = fixture();
  expect((await f.stream.checkoutSimulation("a".repeat(32))).status).toBe(409);
  expect((await f.stream.checkoutSimulation("invalid")).status).toBe(400);
  expect(f.data.size).toBe(0);
});
it("uncertain simulation send is never repeated on retry or object restart", async () => {
  const f = fixture(); await f.stream.open(request());
  f.sockets[0]!.send.mockImplementation(() => { throw new Error("private raw error"); });
  expect((await f.stream.checkoutSimulation("a".repeat(32))).status).toBe(502);
  expect(await (await new HelperStream(f.ctx, env).checkoutSimulation("a".repeat(32))).json()).toMatchObject({ status: "already_attempted" });
  expect(f.sockets[0]!.send).toHaveBeenCalledTimes(2); // Hello + single attempted simulation.
});
