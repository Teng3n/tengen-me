import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
const files = await Promise.all(['policy.js', 'direct-policy.js', 'direct-background.js'].map(file => readFile(new URL('../' + file, import.meta.url), 'utf8')));
async function harness(saved, failPersist = false, failOpen = false, windowState = 'normal', failFocus = false) {
  let now = Date.now(), store = saved?.receiverIdentity ? structuredClone(saved) : saved ? { state: saved } : {}, tick, listener;
  const opened = [], sockets = [], focusCalls = [];
  let control = { id: 10, windowId: 1, url: 'moz-extension://test/control.html', incognito: false };
  let getHook = null, createError = null;
  class Clock extends Date { static now() { return now; } }
  class Socket {
    sent = []; closed = false;
    constructor(url, protocols) { assert.ok(url.startsWith('wss://blizzard-forever-stock-monitor.')); this.protocols = protocols; sockets.push(this); }
    send(text) { this.sent.push(JSON.parse(text)); }
    close() { this.closed = true; this.onclose?.({ code: 1000 }); }
  }
  const browser = {
    runtime: { getURL: path => 'moz-extension://test/' + path, onMessage: { addListener: fn => listener = fn } },
    storage: { local: { get: async () => structuredClone(store), set: async data => {
      if (failPersist && data.state?.attempted) throw new Error('disk failure'); store = { ...store, ...structuredClone(data) };
    } } },
    browserAction: { setBadgeText: async () => {}, onClicked: { addListener: () => {} } },
    windows: { get: async () => ({ state: windowState, type: 'normal', incognito: false }), update: async (id, options) => {
      focusCalls.push({ windowId: id, ...options });
      if (failFocus && options.focused) throw new Error('focus denied');
    } },
    tabs: { get: async id => {
      assert.equal(id, 10); if (getHook) await getHook();
      if (!control) throw new Error('No tab'); return { ...control };
    }, query: async () => [], update: async (id, options) => { focusCalls.push({ tabId: id, ...options }); }, create: async options => {
      if (options.url.startsWith('https://')) assert.equal(store.state.attempted, true);
      opened.push(options); if (createError) throw createError;
      if (failOpen) throw new Error('uncertain'); return { id: 2, windowId: options.windowId };
    } },
  };
  const context = vm.createContext({ browser, URL, Date: Clock, crypto: webcrypto, WebSocket: Socket, setInterval: fn => tick = fn });
  files.forEach(file => vm.runInContext(file, context));
  const message = msg => listener(msg, { url: 'moz-extension://test/control.html', tab: { id: 10, windowId: 1 } });
  await message({ type: 'status' });
  const receive = async payload => { await sockets.at(-1).onmessage({ data: JSON.stringify(payload) }); await message({ type: 'status' }); };
  const check = (extra = {}) => ({ type: 'check', v: 1, variant: '48891708506361', epoch: 1,
    status: 'available', checkedAt: new Date(now).toISOString(), sentAt: new Date(now).toISOString(), inventory: true, button: 'enabled', healthy: true, ...extra });
  return { message, receive, check, opened, sockets, focusCalls, tick: () => tick(), time: ms => now += ms, state: () => store.state,
    store: () => structuredClone(store),
    move: id => control.windowId = id, closeControl: () => control = null,
    invalidateControl: () => control.url = 'https://example.com/',
    onLookup: fn => getHook = fn, failCreate: text => createError = new Error(text),
    async connect() { await message({ type: 'connect', key: 'a'.repeat(64) }); await receive({ type: 'hello', v: 1 }); },
    arm: (extra = {}) => message({ type: 'arm', confirmEmpty: true, soundReady: true, ...extra }),
    webMessage: msg => listener(msg, { url: 'https://gear.blizzard.com/' }),
  };
}
test('fresh hosted positive opens the fixed checkout once, with durable latch before navigation', async () => {
  const h = await harness(); await h.connect(); await h.arm();
  await Promise.all([h.receive(h.check()), h.receive(h.check())]);
  await h.receive(h.check({ epoch: 2 }));
  assert.equal(h.opened.length, 1); assert.equal(h.opened[0].url, 'https://gear.blizzard.com/cart/48891708506361:1?payment=shop_pay');
  assert.equal(h.state().phase, 'handoff'); assert.equal(h.state().attempted, true);
});

test('explicit synthetic check uses the actual opening path once and cannot consume the next real epoch', async () => {
  const h = await harness(); await h.connect(); await h.arm();
  const simulated = h.check({ epoch: 4_000_000_000_000 + Date.now(), simulation: true, testId: 'a'.repeat(32) });
  await h.receive(simulated); await h.receive(simulated);
  assert.equal(h.opened.length, 1); assert.equal(h.state().lastCheckout.code, 'opened');
  await h.receive(h.check({ status: 'unavailable', inventory: false, button: 'disabled' }));
  await h.arm({ confirmRearm: true }); await h.receive(h.check({ epoch: 20 }));
  assert.equal(h.opened.length, 2); assert.equal(h.opened[0].url, h.opened[1].url);
});
test('fresh already-available snapshot triggers at arming, not merely connecting', async () => {
  const h = await harness(); await h.connect(); await h.receive(h.check()); assert.equal(h.opened.length, 0);
  await h.arm(); assert.equal(h.opened.length, 1);
});

test('moving control tab after arming targets its current window, not the saved sender window', async () => {
  const h = await harness(); await h.connect(); await h.arm(); h.move(99);
  await h.receive(h.check()); await h.receive(h.check({ epoch: 2 }));
  assert.equal(h.opened.length, 1); assert.equal(h.opened[0].windowId, 99);
  assert.deepEqual(h.focusCalls.at(-1), { windowId: 99, focused: true });
  assert.equal(h.state().lastCheckout.code, 'opened');
});

test('missing or navigated original control tab stops without opening in another window', async () => {
  for (const action of ['closeControl', 'invalidateControl']) {
    const h = await harness(); await h.connect(); await h.arm(); h[action]();
    await h.receive(h.check()); await h.receive(h.check({ epoch: 2 }));
    assert.equal(h.opened.length, 0); assert.equal(h.state().attempted, true);
    assert.equal(h.state().lastCheckout.code, action === 'closeControl' ? 'control_missing' : 'control_invalid');
  }
});

test('browser error codes are specific but never expose raw messages or repeat navigation', async () => {
  for (const [message, code] of [['Invalid window ID: 1 private-session', 'window_missing'],
    ['Permission denied private-session', 'permission_denied'], ['Invalid argument private-session', 'invalid_argument'],
    ['https://secret.example/private-session', 'tab_create_failed']]) {
    const h = await harness(); await h.connect(); await h.arm(); h.failCreate(message);
    await h.receive(h.check()); await h.receive(h.check());
    assert.equal(h.opened.length, 1); assert.equal(h.state().lastCheckout.code, code);
    assert.equal(JSON.stringify(h.state()).includes('private-session'), false);
  }
});

test('freshness is rechecked after asynchronous window lookup', async () => {
  const h = await harness(); await h.connect(); await h.arm(); h.onLookup(() => h.time(25000));
  await h.receive(h.check()); assert.equal(h.opened.length, 0);
  assert.equal(h.state().lastCheckout.code, 'evidence_expired');
});

test('test uses moved control window and preserves last checkout diagnostic across tests/restarts', async () => {
  const h = await harness(); await h.connect(); await h.arm(); h.failCreate('Invalid window ID: 1');
  await h.receive(h.check());
  const next = await harness(h.state()); await next.connect();
  await next.message({ type: 'test' }); next.move(77);
  await next.receive({ ...next.sockets[0].sent.at(-1), v: 1 });
  assert.equal(next.opened[0].windowId, 77); assert.equal(next.state().lastOpen.code, 'opened');
  assert.equal(next.state().lastCheckout.code, 'window_missing'); assert.equal(next.state().attempted, true);
});

test('checkout selects its tab and foregrounds its own window, restoring only minimized windows', async () => {
  for (const windowState of ['normal', 'maximized', 'minimized']) {
    const h = await harness(undefined, false, false, windowState);
    await h.connect(); await h.arm(); await h.receive(h.check());
    assert.equal(h.opened[0].active, true); assert.equal(h.opened[0].windowId, 1);
    assert.deepEqual(h.focusCalls, [
      ...(windowState === 'minimized' ? [{ windowId: 1, state: 'normal' }] : []),
      { tabId: 2, active: true }, { windowId: 1, focused: true },
    ]);
  }
});

test('foreground failure requests attention without opening a second checkout or unlocking', async () => {
  const h = await harness(undefined, false, false, 'normal', true);
  await h.connect(); await h.arm(); await h.receive(h.check()); await h.receive(h.check({ epoch: 2 }));
  assert.equal(h.opened.length, 1); assert.equal(h.state().attempted, true);
  assert.match(h.state().reason, /foregrounding failed/);
  assert.deepEqual(h.focusCalls.at(-1), { windowId: 1, drawAttention: true });
});
test('partial positives do not consume the attempt; both healthy positives in the same check trigger', async () => {
  for (const signals of [{ inventory: false, button: 'enabled' }, { inventory: true, button: 'disabled' },
    { healthy: false }, { healthy: undefined }, { inventory: null }]) {
    const h = await harness(); await h.connect(); await h.arm(); await h.receive(h.check(signals));
    assert.equal(h.opened.length, 0); assert.equal(h.state().attempted, false);
    await h.receive(h.check()); assert.equal(h.opened.length, 1);
  }
});

test('alternating positive signals are never combined across checks', async () => {
  const h = await harness(); await h.connect(); await h.arm();
  await h.receive(h.check({ inventory: true, button: 'disabled' }));
  await h.receive(h.check({ inventory: false, button: 'enabled' }));
  assert.equal(h.opened.length, 0);
});
test('stale, wrong-product, negative, malformed, future, and unknown checks never trigger', async () => {
  const h = await harness(); await h.connect(); await h.arm();
  for (const changes of [
    { variant: 'wrong' }, { status: 'unknown' }, { inventory: false, button: 'disabled' }, { epoch: 0 },
    { checkedAt: 'invalid' }, { checkedAt: new Date(Date.now() - 60000).toISOString() },
    { checkedAt: new Date(Date.now() + 60000).toISOString(), sentAt: new Date(Date.now() + 60000).toISOString() },
  ]) await h.receive(h.check(changes));
  await h.receive({ type: 'test', v: 1, nonce: webcrypto.randomUUID() }); assert.equal(h.opened.length, 0);
});
test('restart preserves latch, disarms, and cannot reuse a consumed epoch', async () => {
  const h = await harness(); await h.connect(); await h.arm(); await h.receive(h.check());
  const next = await harness(h.state()); await next.connect(); await next.receive(next.check());
  await assert.rejects(next.arm(), /Previous attempt/); assert.equal(next.opened.length, 0);
  await next.arm({ confirmRearm: true }); assert.equal(next.opened.length, 0);
  await next.receive(next.check({ epoch: 2 })); assert.equal(next.opened.length, 1);
});
test('failed persistence never opens; uncertain tab creation never retries', async () => {
  const failed = await harness(undefined, true); await failed.connect(); await failed.arm(); await failed.receive(failed.check());
  assert.equal(failed.opened.length, 0);
  const uncertain = await harness(undefined, false, true); await uncertain.connect(); await uncertain.arm();
  await uncertain.receive(uncertain.check()); await uncertain.receive(uncertain.check({ epoch: 2 }));
  assert.equal(uncertain.opened.length, 1); assert.equal(uncertain.state().phase, 'handoff');
});
test('disconnect backs off then accepts a fresh snapshot without duplicates', async () => {
  const h = await harness(); await h.connect(); await h.arm(); h.sockets[0].close();
  await h.tick(); assert.equal(h.sockets.length, 1);
  h.time(2000); await h.tick(); assert.equal(h.sockets.length, 2);
  await h.receive({ type: 'hello', v: 1 }); await h.receive(h.check());
  assert.equal(h.opened.length, 1);
});

test('persistent identity survives restart; each handshake increases durable generation', async () => {
  const h = await harness(); await h.connect();
  const first = h.sockets[0].protocols;
  assert.match(first[2], /^receiver\.[a-f0-9]{32}$/); assert.equal(first[3], 'generation.1');
  h.sockets[0].close(); h.time(2000); await h.tick();
  assert.equal(h.sockets[1].protocols[2], first[2]); assert.equal(h.sockets[1].protocols[3], 'generation.2');
  const next = await harness(h.store()); await next.connect();
  assert.equal(next.sockets[0].protocols[2], first[2]); assert.equal(next.sockets[0].protocols[3], 'generation.3');
});

test('delayed old close cannot disarm newest connection, and superseding close reconnects safely', async () => {
  const h = await harness(); await h.connect(); await h.arm();
  const old = h.sockets[0]; old.onclose({ code: 4002 });
  await h.message({ type: 'status' }); assert.equal(h.state().phase, 'watching');
  h.time(2000); await h.tick(); await h.receive({ type: 'hello', v: 1 });
  old.onclose({ code: 4001 }); await h.message({ type: 'status' });
  assert.equal(h.state().phase, 'watching');
  await h.receive(h.check()); await h.receive(h.check()); assert.equal(h.opened.length, 1);
});

test('busy/outdated newcomer stops rather than competing in a reconnect loop', async () => {
  for (const type of ['receiver_busy', 'receiver_outdated']) {
    const h = await harness(); await h.connect();
    await h.receive({ type, v: 1 }); assert.equal(h.state().phase, 'stopped');
    h.time(60000); await h.tick(); assert.equal(h.sockets.length, 1); assert.equal(h.opened.length, 0);
  }
});
test('sleep and stale control panel disarm before opening', async () => {
  for (const gap of [13000, 31000]) {
    const h = await harness(); await h.connect(); await h.arm(); h.time(gap); await h.tick();
    await h.receive(h.check()); assert.equal(h.opened.length, 0); assert.equal(h.state().phase, 'stopped');
  }
});
test('pause stops a subsequent signal and web pages cannot arm', async () => {
  const h = await harness(); await h.connect(); await h.arm(); await h.message({ type: 'stop' });
  await h.webMessage({ type: 'arm', confirmEmpty: true, soundReady: true });
  await h.receive(h.check()); assert.equal(h.opened.length, 0);
});
test('replaced receiver disarms and does not reconnect in a loop', async () => {
  const h = await harness(); await h.connect(); await h.arm(); h.sockets[0].onclose({ code: 4001 });
  await h.message({ type: 'status' }); h.time(60000); await h.tick();
  assert.equal(h.sockets.length, 1); assert.equal(h.state().phase, 'stopped');
});
test('explicit test opens only internal test page, consumes nonce once, and preserves attempt latch', async () => {
  const h = await harness({ attempted: true, consumedEpochs: [1] }); await h.connect();
  await h.message({ type: 'test' }); const request = h.sockets[0].sent.at(-1);
  await h.receive({ ...request, v: 1 }); await h.receive({ ...request, v: 1 });
  assert.equal(h.opened.length, 1); assert.equal(h.opened[0].url, 'moz-extension://test/test.html');
  assert.equal(h.opened[0].windowId, 1);
  assert.deepEqual(h.focusCalls, [{ tabId: 2, active: true }, { windowId: 1, focused: true }]);
  assert.equal(h.state().attempted, true);
});
test('no key is persisted or returned in status', async () => {
  const h = await harness(); await h.connect();
  assert.equal(JSON.stringify(await h.message({ type: 'status' })).includes('a'.repeat(64)), false);
  assert.equal(JSON.stringify(h.state()).includes('a'.repeat(64)), false);
});
test('direct manifest cannot inject on the store or read its requests/cookies', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.permissions.includes('webRequest'), false);
  assert.equal(manifest.permissions.includes('cookies'), false);
  assert.ok(manifest.background.scripts.includes('direct-background.js'));
});
