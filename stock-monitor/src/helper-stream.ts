import { PRODUCT, type Env, type StockResult } from "./types";

export const HELPER_PROTOCOL = "forever-monitor-v1";
export const HELPER_MAX_AGE_MS = 20_000;
const RECEIVER_IDLE_MS = 90_000;
interface ReceiverAttachment { id: string; generation: number; lastSeen: number; active: boolean }
function attachment(socket: WebSocket): ReceiverAttachment | undefined {
  try { return socket.deserializeAttachment() as ReceiverAttachment | undefined; } catch { return undefined; }
}
export interface HelperObservation {
  type: "check"; v: 1; variant: string; status: string; epoch: number;
  checkedAt: string; sentAt: string; inventory: boolean | null; button: string; healthy: boolean;
}
export function helperAuthorized(request: Request, env: Env): boolean {
  const protocols = request.headers.get("Sec-WebSocket-Protocol")?.split(",").map(x => x.trim()) ?? [];
  const supplied = protocols.find(x => x.startsWith("key."))?.slice(4) ?? "";
  const expected = env.HELPER_TOKEN ?? "";
  if (!/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(supplied)
      || !protocols.includes(HELPER_PROTOCOL)) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  return difference === 0;
}
export function helperObservation(result: StockResult, epoch: number): HelperObservation {
  return { type: "check", v: 1, variant: PRODUCT.variantId, status: result.status, epoch,
    checkedAt: result.checkedAt, sentAt: new Date().toISOString(),
    inventory: result.evidence.inventoryAvailable ?? null,
    button: result.evidence.button?.state ?? "missing", healthy: result.evidence.checksHealthy !== false };
}
// Only the existing checker publishes. Clients cannot inject stock, URLs, or commands.
export class HelperStream {
  constructor(private readonly ctx: DurableObjectState, private readonly env: Env) {}
  // Explicit admin-requested end-to-end TEST. Sends only to the current receiver;
  // never changes real check evidence, monitor epochs, notifications, or replay snapshot.
  async checkoutSimulation(testId: string): Promise<Response> {
    if (!/^[a-f0-9]{32}$/.test(testId)) return Response.json({ error: "invalid_test_id" }, { status: 400 });
    const storageKey = `helperCheckoutTest:${testId}`;
    const prior = await this.ctx.storage.get(storageKey);
    if (prior) return Response.json({ status: "already_attempted", testId, prior });
    const candidates = this.ctx.getWebSockets().filter(socket => {
      const data = attachment(socket);
      return socket.readyState === 1 && data?.active && Date.now() - data.lastSeen <= RECEIVER_IDLE_MS;
    });
    if (candidates.length !== 1) return Response.json({ error: "one_connected_receiver_required", receivers: candidates.length }, { status: 409 });
    const now = Date.now();
    // Reserved high test epoch cannot consume the next real sequential stock epoch.
    const epoch = 4_000_000_000_000 + now;
    const message = { type: "check", v: 1, variant: PRODUCT.variantId, status: "available", epoch,
      checkedAt: new Date(now).toISOString(), sentAt: new Date(now).toISOString(),
      inventory: true, button: "enabled", healthy: true, simulation: true, testId };
    // Persist before send. An ambiguous failure must not resend on the same test ID.
    await this.ctx.storage.put(storageKey, { status: "attempted", at: message.sentAt, epoch });
    try { candidates[0]!.send(JSON.stringify(message)); }
    catch { return Response.json({ status: "delivery_uncertain", testId, automaticRetry: false }, { status: 502 }); }
    console.log(JSON.stringify({ event: "helper_checkout_SIMULATION_sent", testId, at: message.sentAt, epoch }));
    return Response.json({ status: "simulation_sent", testId, at: message.sentAt,
      receiverAcknowledged: false, checkoutOpened: "not_verified", paymentSubmitted: false });
  }
  async open(request: Request): Promise<Response> {
    if (!helperAuthorized(request, this.env)) return new Response("Unauthorized", { status: 401 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket required", { status: 426 });
    const protocols = request.headers.get("Sec-WebSocket-Protocol")?.split(",").map(x => x.trim()) ?? [];
    const ids = protocols.filter(x => x.startsWith("receiver."));
    const generations = protocols.filter(x => x.startsWith("generation."));
    const id = ids[0]?.slice(9) ?? "", generation = Number(generations[0]?.slice(11));
    if (ids.length !== 1 || generations.length !== 1 || !/^[a-f0-9]{32}$/.test(id)
        || !Number.isSafeInteger(generation) || generation < 1) return new Response("Update helper to 0.2.4", { status: 426 });
    const existing = this.ctx.getWebSockets().filter(socket => {
      if (socket.readyState !== 1) return false;
      const data = attachment(socket);
      return !data || (data.active && Date.now() - data.lastSeen <= RECEIVER_IDLE_MS);
    });
    const owner = await this.ctx.storage.get<{ id: string; generation: number }>("helperOwner");
    const busy = existing.some(socket => attachment(socket)?.id !== id);
    const outdated = owner?.id === id && generation <= owner.generation;
    const pair = new WebSocketPair(); const client = pair[0]; const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, generation, lastSeen: Date.now(), active: false } satisfies ReceiverAttachment);
    if (busy || outdated) {
      // Reject only the newcomer. Never eject a healthy competing receiver.
      const type = busy ? "receiver_busy" : "receiver_outdated";
      server.send(JSON.stringify({ type, v: 1 })); server.close(busy ? 4003 : 4004, type);
      console.log(JSON.stringify({ event: "helper_connection", outcome: type }));
      return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": HELPER_PROTOCOL } });
    }
    await this.ctx.storage.put("helperOwner", { id, generation });
    // Newest attempt for this installation wins; mark old sockets inactive BEFORE closing.
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === server) continue;
      const data = attachment(socket);
      if (data) socket.serializeAttachment({ ...data, active: false });
      try { socket.close(4002, "Connection superseded"); } catch {}
    }
    server.serializeAttachment({ id, generation, lastSeen: Date.now(), active: true } satisfies ReceiverAttachment);
    console.log(JSON.stringify({ event: "helper_connection", outcome: owner?.id === id ? "reconnected" : "connected" }));
    server.send(JSON.stringify({ type: "hello", v: 1 }));
    const latest = await this.ctx.storage.get<HelperObservation>("helperLatest");
    if (latest && Date.now() - Date.parse(latest.checkedAt) <= HELPER_MAX_AGE_MS) {
      try { server.send(JSON.stringify({ ...latest, sentAt: new Date().toISOString() })); } catch { /* disconnected */ }
    }
    return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": HELPER_PROTOCOL } });
  }
  async publish(result: StockResult, epoch: number): Promise<void> {
    const observation = helperObservation(result, epoch);
    const text = JSON.stringify(observation);
    for (const socket of this.ctx.getWebSockets()) {
      const data = attachment(socket);
      if (socket.readyState !== 1 || (data && (!data.active || Date.now() - data.lastSeen > RECEIVER_IDLE_MS))) continue;
      try { socket.send(text); } catch { /* Delivery to Telegram must not depend on a PC. */ }
    }
    await this.ctx.storage.put("helperLatest", observation);
  }
  async clear(): Promise<void> {
    await this.publish({ status: "unknown", checkedAt: new Date().toISOString(), evidence: {
      checksHealthy: false, reasons: ["Checking paused or failed"],
      productFeed: { url: PRODUCT.url, attempts: 0, elapsedMs: 0 },
      productPage: { url: PRODUCT.url, attempts: 0, elapsedMs: 0 },
    } }, 0);
  }
  message(socket: WebSocket, message: string | ArrayBuffer): void {
    const receiver = attachment(socket);
    if (receiver && !receiver.active) return;
    if (typeof message !== "string" || message.length > 256) { socket.close(1008, "Invalid message"); return; }
    try {
      const data = JSON.parse(message) as { type?: string; nonce?: string };
      if (receiver) socket.serializeAttachment({ ...receiver, lastSeen: Date.now() });
      if (data.type === "ping") socket.send(JSON.stringify({ type: "pong", v: 1 }));
      else if (data.type === "test" && /^[a-f0-9-]{36}$/.test(data.nonce ?? "")) {
        // Echo ONLY a test marker to this receiver. Never generates a live check/event.
        socket.send(JSON.stringify({ type: "test", v: 1, nonce: data.nonce }));
      } else socket.close(1008, "Invalid message");
    } catch { socket.close(1008, "Invalid message"); }
  }
}
