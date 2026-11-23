// Transport-only verification; refuses older takeover-prone server versions.
import { readFileSync } from 'node:fs';
const key = /^HELPER_TOKEN=([a-f0-9]{64})\r?$/m.exec(readFileSync(new URL('../.helper.env', import.meta.url), 'utf8'))?.[1];
if (!key) { console.error('Pairing file missing/invalid.'); process.exit(1); }
const admin = /^ADMIN_TOKEN=(.+)\r?$/m.exec(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8'))?.[1]?.trim();
const origin = 'https://blizzard-forever-stock-monitor.teng3n.workers.dev';
const sockets = [];
function receive(id, generation, expectReject) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(origin.replace('https:', 'wss:') + '/helper-stream',
      ['forever-monitor-v1', `key.${key}`, `receiver.${id}`, `generation.${generation}`]);
    sockets.push(socket);
    let hello = false, test = false, check = false;
    const nonce = crypto.randomUUID();
    const timer = setTimeout(() => { socket.close(); reject(new Error('timeout')); }, 25000);
    const rejected = type => {
      clearTimeout(timer);
      if (type === expectReject) resolve(socket); else reject(new Error('active_receiver'));
    };
    socket.onmessage = event => {
      let msg; try { msg = JSON.parse(event.data); } catch { return; }
      if (['receiver_busy', 'receiver_outdated'].includes(msg.type)) { rejected(msg.type); return; }
      if (msg.type === 'hello') { hello = true; socket.send(JSON.stringify({ type: 'test', nonce })); }
      if (msg.type === 'test' && msg.nonce === nonce) test = true;
      if (msg.type === 'check') check = true;
      if (hello && test && check) { clearTimeout(timer); resolve(socket); }
    };
    socket.onerror = () => { clearTimeout(timer); reject(new Error('connection_error')); };
    socket.onclose = event => {
      if (event.code === 4003 || event.code === 4004) rejected(event.code === 4003 ? 'receiver_busy' : 'receiver_outdated');
    };
  });
}
try {
  const response = await fetch(origin + '/checker-state', { headers: { Authorization: `Bearer ${admin}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok || (await response.json()).helperConnectionPolicy !== 'identified-receiver-v2') throw new Error('policy_not_active');
  const id = crypto.randomUUID().replaceAll('-', '');
  const first = await receive(id, 1);
  const closed = new Promise(resolve => first.addEventListener('close', event => resolve(event.code), { once: true }));
  const second = await receive(id, 2);
  const code = await Promise.race([closed, new Promise(resolve => { const timer = setTimeout(() => resolve(0), 5000); timer.unref(); })]);
  if (code !== 4002) throw new Error('reconnect_not_verified');
  await receive(crypto.randomUUID().replaceAll('-', ''), 1, 'receiver_busy');
  await receive(id, 1, 'receiver_outdated');
  if (second.readyState !== WebSocket.OPEN) throw new Error('active_connection_lost');
  console.log(JSON.stringify({ verified: true, sameReceiverReconnect: true, competingReceiverRejected: true,
    oldHandshakeRejected: true, activeConnectionPreserved: true, browserActions: 0 }));
} catch (error) {
  const allowed = ['timeout', 'active_receiver', 'connection_error', 'policy_not_active', 'reconnect_not_verified', 'active_connection_lost'];
  console.error(JSON.stringify({ verified: false, reason: allowed.includes(error?.message) ? error.message : 'verification_error',
    browserActions: 0 })); process.exitCode = 1;
} finally {
  for (const socket of sockets) { try { socket.close(); } catch {} }
  setTimeout(() => process.exit(process.exitCode ?? 0), 1000).unref();
}
