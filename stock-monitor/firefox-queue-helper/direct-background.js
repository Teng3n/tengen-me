/* Direct receiver only. No Gear Store fetching, page inspection, or payment code. */
const D = DirectPolicy;
const controlURL = browser.runtime.getURL('control.html');
let state = { phase: 'idle', attempted: false, consumedEpochs: [], reason: 'Load pairing file, connect, test sound, then arm.' };
let key = '', socket, connected = false, reconnectAt = 0, failures = 0;
let receiverIdentity;
let lastMessage = 0, lastPing = 0, lastPanel = 0, lastTick = Date.now(), latest = null, pendingTest = null;
let serial = Promise.resolve();
const diagnosticCodes = ['opened', 'focus_failed', 'control_missing', 'control_invalid', 'window_missing', 'window_invalid', 'permission_denied', 'invalid_argument', 'tab_create_failed', 'evidence_expired'];
function safeDiagnostic(value) {
  return value && diagnosticCodes.includes(value.code) && ['test', 'checkout'].includes(value.kind)
    && Number.isFinite(value.at) ? { code: value.code, kind: value.kind, at: value.at } : null;
}
function openingCode(error) {
  // Classify locally; never return/store/log raw browser errors (which can contain URLs).
  if (diagnosticCodes.includes(error?.safeCode)) return error.safeCode;
  const message = typeof error?.message === 'string' ? error.message.slice(0, 2048) : '';
  if (/invalid window|no window|window.*not found/i.test(message)) return 'window_missing';
  if (/permission|access denied|not allowed/i.test(message)) return 'permission_denied';
  if (/invalid.*argument|incorrect argument|type error|typeerror/i.test(message)) return 'invalid_argument';
  return 'tab_create_failed';
}
function fault(safeCode) { return Object.assign(new Error('Opening preflight failed'), { safeCode }); }
async function currentControlWindow(tabId) {
  let tab;
  try { tab = await browser.tabs.get(tabId); } catch { throw fault('control_missing'); }
  if (tab.url !== controlURL || tab.incognito || !Number.isInteger(tab.windowId)) throw fault('control_invalid');
  let window;
  try { window = await browser.windows.get(tab.windowId); } catch { throw fault('window_missing'); }
  if (window.incognito || window.type !== 'normal') throw fault('window_invalid');
  return tab.windowId;
}
async function openOnce(kind, controlTabId, stillValid = () => true) {
  // Resolve the ORIGINAL control tab's current window, never an arbitrary other tab.
  let code;
  try {
    const windowId = await currentControlWindow(controlTabId);
    if (!stillValid()) throw fault('evidence_expired');
    const tab = await browser.tabs.create({ url: kind === 'test' ? browser.runtime.getURL('test.html') : QueuePolicy.checkoutURL,
      active: true, windowId });
    code = await foreground(tab) ? 'opened' : 'focus_failed';
  } catch (error) { code = openingCode(error); }
  const diagnostic = { kind, code, at: Date.now() };
  state.lastOpen = diagnostic;
  if (kind === 'checkout') state.lastCheckout = diagnostic;
  return code;
}
function enqueue(fn) { const result = serial.then(fn); serial = result.catch(() => {}); return result; }
async function save() {
  await browser.storage.local.set({ state }); // Never includes the pairing key or full payload.
  await browser.browserAction.setBadgeText({ text: state.phase === 'watching' ? 'ON' : state.attempted ? 'STOP' : '' });
}
const initialized = browser.storage.local.get(['state', 'receiverIdentity']).then(async stored => {
  const identity = stored.receiverIdentity;
  receiverIdentity = identity && /^[a-f0-9]{32}$/.test(identity.id) && Number.isSafeInteger(identity.generation) && identity.generation >= 0
    ? identity : { id: crypto.randomUUID().replaceAll('-', ''), generation: 0 };
  await browser.storage.local.set({ receiverIdentity });
  state = { ...state, attempted: stored.state?.attempted === true,
    lastOpen: safeDiagnostic(stored.state?.lastOpen), lastCheckout: safeDiagnostic(stored.state?.lastCheckout),
    consumedEpochs: Array.isArray(stored.state?.consumedEpochs) ? stored.state.consumedEpochs.slice(-64) : [],
    reason: 'Not armed. Restarts never resume automatically; load the pairing file to connect.' };
  await save();
});
async function stop(reason, alarm = true) {
  state = { ...state, phase: 'stopped', reason, alarm: alarm ? Date.now() : 0 };
  await save();
}
function disconnect() { const old = socket; socket = undefined; connected = false; latest = null; if (old) old.close(); }
async function foreground(tab) {
  // Selecting a tab alone does not bring a background Firefox window forward.
  try {
    const window = await browser.windows.get(tab.windowId);
    if (window.state === 'minimized') await browser.windows.update(tab.windowId, { state: 'normal' });
    await browser.tabs.update(tab.id, { active: true });
    await browser.windows.update(tab.windowId, { focused: true });
    return true;
  } catch {
    // Never repeat navigation just because foregrounding failed.
    try { await browser.windows.update(tab.windowId, { drawAttention: true }); } catch {}
    return false;
  }
}
async function connect() {
  if (!key || socket) return;
  // Persist attempt order BEFORE initiating a handshake, including across restarts.
  if (!Number.isSafeInteger(receiverIdentity.generation + 1)) throw new Error('Receiver sequence exhausted.');
  receiverIdentity = { ...receiverIdentity, generation: receiverIdentity.generation + 1 };
  await browser.storage.local.set({ receiverIdentity });
  let current;
  try { current = new WebSocket(D.endpoint, [D.protocol, `key.${key}`, `receiver.${receiverIdentity.id}`, `generation.${receiverIdentity.generation}`]); }
  catch { reconnectAt = Date.now() + 60000; return; }
  socket = current; lastMessage = Date.now();
  current.onmessage = event => enqueue(async () => {
    await initialized;
    if (socket !== current) return;
    if (typeof event.data !== 'string' || event.data.length > 2048) return;
    let message; try { message = JSON.parse(event.data); } catch { return; }
    if (message.v !== 1) return;
    lastMessage = Date.now();
    if (message.type === 'receiver_busy' || message.type === 'receiver_outdated') {
      key = ''; disconnect();
      state.connectionIssue = message.type;
      await stop(message.type === 'receiver_busy' ? 'Connection rejected: a different receiver is active. Existing receiver was not disconnected. Close it before reconnecting here.'
        : 'Connection rejected: this handshake is older than an accepted attempt. Reconnect this helper manually.');
      return;
    }
    if (message.type === 'hello') { connected = true; failures = 0; state.connectionIssue = ''; return; }
    if (!connected) return;
    if (message.type === 'pong') return;
    if (message.type === 'test' && pendingTest && message.nonce === pendingTest.nonce
        && Date.now() <= pendingTest.until && state.phase !== 'watching' && state.phase !== 'attempting') {
      const testControlTabId = pendingTest.controlTabId;
      pendingTest = null; // Consume before opening; never opens the actual store.
      state = { ...state, alarm: Date.now(), reason: '[TEST] Hosted round trip received. Opening harmless test tab.' };
      await save();
      const code = await openOnce('test', testControlTabId);
      state.reason = code === 'opened' ? '[TEST] Test tab opened and foreground requested. No stock or checkout action.'
        : `[TEST] ${code}: check Firefox manually. No store action or automatic retry.`;
      await save();
      return;
    }
    if (!D.validCheck(message)) {
      if (message.type === 'check') { latest = null; state.signal = 'Stale/invalid check ignored; verify Windows date/time if repeated.'; }
      return;
    }
    if (latest && Date.parse(message.checkedAt) < Date.parse(latest.checkedAt)) return;
    latest = message;
    state.lastCheck = Date.parse(message.checkedAt);
    state.signal = `Inventory: ${message.inventory === null ? 'Unknown' : message.inventory ? 'Yes' : 'No'} · Button: ${message.button}`;
    await maybeOpen();
  }).catch(() => enqueue(() => stop('Receiver failed. Inspect your tabs/cart; no automatic retry.')).catch(() => {}));
  current.onerror = () => {}; // Never log token-bearing protocols or raw network errors.
  current.onclose = event => {
    if (socket !== current) return;
    socket = undefined; connected = false; latest = null;
    if (event.code === 4001) {
      key = ''; enqueue(() => stop('Another receiver connected. This helper is disarmed; only use one receiver.')).catch(() => {}); return;
    }
    if (event.code === 4003 || event.code === 4004) {
      key = ''; state.connectionIssue = event.code === 4003 ? 'receiver_busy' : 'receiver_outdated';
      enqueue(() => stop('Connection rejected (' + state.connectionIssue + '). Existing receiver was not disconnected; reconnect manually after checking other instances.')).catch(() => {}); return;
    }
    state.connectionIssue = event.code === 4002 ? 'connection_superseded_reconnecting' : 'transport_reconnecting';
    failures++; reconnectAt = Date.now() + Math.min(2000 * 2 ** Math.min(failures - 1, 5), 60000);
  };
}
async function maybeOpen() {
  if (state.phase !== 'watching' || state.attempted || !connected || !D.positive(latest)
      || state.consumedEpochs.includes(latest.epoch)) return;
  if (Date.now() - lastPanel > 12000 || Date.now() - lastTick > 30000) {
    await stop('Sound/control tab stalled or computer slept. Recheck and rearm manually.'); return;
  }
  state = { ...state, phase: 'attempting', attempted: true, alarm: Date.now(),
    consumedEpochs: [...state.consumedEpochs, latest.epoch].slice(-64),
    reason: 'Fresh hosted stock signal received — opening one-copy checkout once.' };
  await save(); // Durable latch BEFORE external action. Disk failure means no tab.
  const code = await openOnce('checkout', state.controlTabId,
    () => connected && D.positive(latest) && Date.now() - lastPanel <= 12000);
  state = { ...state, phase: 'handoff', reason: code === 'opened'
    ? 'Checkout tab selected; Firefox foreground requested. Verify one copy and final total; payment is manual. Queue/stock not guaranteed.'
    : code === 'focus_failed' ? 'Checkout opened, but foregrounding failed; check Firefox manually. No automatic retry.'
    : `Checkout opening stopped: ${code}. Inspect tabs/cart; no automatic retry. See opening diagnostics below.` };
  await save();
}
browser.browserAction.onClicked.addListener(async () => {
  const tab = (await browser.tabs.query({})).find(t => t.url === controlURL);
  if (tab) await browser.tabs.update(tab.id, { active: true });
  else await browser.tabs.create({ url: controlURL });
});
browser.runtime.onMessage.addListener((msg, sender) => {
  if (sender.url !== controlURL) return undefined;
  return enqueue(async () => {
    await initialized;
    if (msg.type === 'status') {
      lastPanel = Date.now();
      return { ...state, connection: connected ? 'Connected' : key ? 'Disconnected / reconnecting' : 'Not connected',
        fresh: !!latest && D.validCheck(latest) };
    }
    if (msg.type === 'connect') {
      if (['watching', 'attempting'].includes(state.phase)) throw new Error('Pause before changing the connection.');
      if (!/^[a-f0-9]{64}$/.test(msg.key || '')) throw new Error('Pairing key format is invalid.');
      disconnect(); key = msg.key; failures = 0; await connect(); return;
    }
    if (msg.type === 'stop') { await stop('Paused by you. No checkout will open until explicitly rearmed.', false); return; }
    if (msg.type === 'silence') { state.alarm = 0; await save(); return; }
    if (msg.type === 'test') {
      if (!connected) throw new Error('Connect first.');
      if (['watching', 'attempting'].includes(state.phase)) throw new Error('Pause before testing.');
      if (!Number.isInteger(sender.tab?.id) || sender.tab?.incognito) throw new Error('Use a normal Firefox control tab.');
      pendingTest = { nonce: crypto.randomUUID(), until: Date.now() + 10000, controlTabId: sender.tab.id };
      socket.send(JSON.stringify({ type: 'test', nonce: pendingTest.nonce })); return;
    }
    if (msg.type === 'arm') {
      if (['watching', 'attempting'].includes(state.phase)) throw new Error('Pause before rearming.');
      if (!connected) throw new Error('Wait for Connected before arming.');
      if (!msg.confirmEmpty || !msg.soundReady) throw new Error('Check your cart and test sound first.');
      if (state.attempted && !msg.confirmRearm) throw new Error('Previous attempt locked. Inspect cart/order history and acknowledge rearming.');
      if (!Number.isInteger(sender.tab?.id) || sender.tab?.incognito) throw new Error('Use a normal Firefox control tab.');
      await currentControlWindow(sender.tab.id);
      pendingTest = null;
      state = { ...state, phase: 'watching', attempted: false, alarm: 0, controlTabId: sender.tab.id,
        reason: 'Armed: waiting for inventory Yes AND button Enabled in the same healthy check. No product-page refreshing.' };
      lastPanel = lastTick = Date.now(); await save(); await maybeOpen(); return;
    }
  });
});
setInterval(() => enqueue(async () => {
  await initialized;
  const now = Date.now(), gap = now - lastTick; lastTick = now;
  if (state.phase === 'watching' && (gap > 30000 || now - lastPanel > 12000)) {
    await stop('Computer slept or sound/control tab stalled. Rearm manually.');
  }
  if (pendingTest && now > pendingTest.until) {
    pendingTest = null; state.reason = '[TEST] No round-trip response within 10 seconds. Test not confirmed.'; await save();
  }
  if (socket && now - lastMessage > 40000) {
    disconnect(); failures++; reconnectAt = now + Math.min(2000 * 2 ** Math.min(failures - 1, 5), 60000);
  }
  if (!socket && key && now >= reconnectAt) await connect();
  if (connected && now - lastPing > 15000) {
    lastPing = now; try { socket.send(JSON.stringify({ type: 'ping' })); } catch { disconnect(); reconnectAt = now + 2000; }
  }
}).catch(() => {}), 1000);
