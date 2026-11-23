import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
const policySource = await readFile(new URL('../policy.js', import.meta.url), 'utf8');
const backgroundSource = await readFile(new URL('../background.js', import.meta.url), 'utf8');
const ctx = vm.createContext({ URL }); vm.runInContext(policySource, ctx);
const P = ctx.QueuePolicy;
test('exact origin, product path, and selected variant only', () => {
  assert.equal(P.productURL(P.url), true);
  for (const url of ['https://evil.test' + P.path, P.url + '0', 'https://gear.blizzard.com/checkouts/a', 'https://gear.blizzard.com' + P.path + '-other', 'bad']) assert.equal(P.productURL(url), false);
});
test('checkout is the fixed one-copy Telegram shortcut', () => {
  assert.equal(P.checkoutURL, 'https://gear.blizzard.com/cart/48891708506361:1?payment=shop_pay');
});
test('one-attempt claim rejects stale tabs/documents and previous attempts', () => {
  const state = { phase: 'watching', attempted: false, tabId: 1, documentId: 'doc' };
  assert.equal(P.mayClaim(state, 1, 'doc'), true);
  for (const changed of [{ attempted: true }, { phase: 'handoff' }, { tabId: 2 }, { documentId: 'other' }]) assert.equal(P.mayClaim({ ...state, ...changed }, 1, 'doc'), false);
});
async function harness(saved, failPersist = false) {
  const handlers = {};
  let storage = saved ? { state: saved } : {};
  let attempts = 0;
  let reloads = 0;
  let now = 100000;
  let sample = { kind: 'enabled', ready: true, stable: true, documentId: 'doc' };
  let tabUrl = P.url;
  let confirmed = true;
  let createFails = false;
  let onConfirm = async () => {};
  const opened = [];
  const browser = {
    runtime: { getURL: file => 'moz-extension://test/' + file, onMessage: { addListener: fn => handlers.message = fn } },
    storage: { local: { get: async () => storage, set: async data => {
      if (failPersist && data.state.attempted) throw new Error('Disk failure');
      storage = structuredClone(data);
    } } },
    browserAction: { setBadgeText: async () => {}, onClicked: { addListener: () => {} } },
    tabs: { get: async () => ({ id: 1, url: tabUrl, windowId: 7 }), query: async () => [], onRemoved: { addListener: () => {} },
      sendMessage: async (id, msg) => {
        if (msg.type === 'sample') return sample;
        if (msg.type === 'confirm') {
          await onConfirm();
          return { confirmed, documentId: sample.documentId };
        }
      }, create: async options => {
        assert.equal(storage.state.attempted, true, 'persist latch before opening');
        attempts++; opened.push(options);
        if (createFails) throw new Error('Uncertain tab creation');
        return { id: 2 };
      }, reload: async () => reloads++ },
    webRequest: { onCompleted: { addListener: fn => handlers.http = fn } }
  };
  const context = vm.createContext({ browser, URL, crypto: webcrypto, Date: { now: () => now }, setInterval: fn => handlers.tick = fn });
  vm.runInContext(policySource, context); vm.runInContext(backgroundSource, context);
  const message = msg => handlers.message(msg, { url: 'moz-extension://test/control.html' });
  await message({ type: 'status' });
  return { message, handlers, opened, confirm: value => confirmed = value,
    createFails: value => createFails = value, onConfirm: fn => onConfirm = fn, storage: () => storage, attempts: () => attempts, reloads: () => reloads,
    time: ms => now += ms, sample: value => sample = value, url: value => tabUrl = value,
    arm: () => message({ type: 'arm', tabId: 1, soundReady: true, confirmEmpty: true }) };
}
test('concurrent triggers issue one command, persist latch, ignore later signals', async () => {
  const h = await harness(); await h.arm();
  await Promise.all([h.handlers.tick(), h.handlers.tick()]); await h.handlers.tick();
  assert.equal(h.attempts(), 1); assert.equal(h.storage().state.phase, 'handoff');
  assert.equal(h.reloads(), 0);
  assert.equal(h.opened[0].url, P.checkoutURL);
  assert.equal(h.opened[0].active, true);
  assert.equal(h.opened[0].windowId, 7);
});
test('restart disarms, preserves latch, requires explicit acknowledgement', async () => {
  const h = await harness({ phase: 'attempting', attempted: true, tabId: 1, token: 'old' });
  assert.equal(h.storage().state.phase, 'idle');
  await assert.rejects(h.arm(), /Previous attempt/);
  await h.handlers.tick(); assert.equal(h.attempts(), 0);
});
test('failure persisting lock never opens checkout', async () => {
  const h = await harness(undefined, true); await h.arm(); await h.handlers.tick();
  assert.equal(h.attempts(), 0);
});
test('unavailable refreshes after five seconds, never refreshes navigation', async () => {
  const h = await harness(); h.sample({ kind: 'unavailable', ready: true, documentId: 'doc' });
  await h.arm(); await h.handlers.tick(); h.time(5000); await h.handlers.tick();
  assert.equal(h.reloads(), 1); assert.equal(h.attempts(), 0);
  h.url('https://gear.blizzard.com/checkouts/fixture'); h.time(5000); await h.handlers.tick();
  assert.equal(h.reloads(), 1); assert.equal(h.storage().state.phase, 'stopped');
});
test('sleep and missing sound dashboard fail closed', async () => {
  for (const gap of [11000, 31000]) {
    const h = await harness(); await h.arm(); h.time(gap); await h.handlers.tick();
    assert.equal(h.attempts(), 0); assert.equal(h.storage().state.phase, 'stopped');
  }
});
test('pause stops opening and does not retry', async () => {
  const h = await harness(); await h.arm(); await h.message({ type: 'stop' }); await h.handlers.tick();
  const permit = await h.handlers.message({ type: 'permit', token: 'x', documentId: 'doc' }, { tab: { id: 1 }, frameId: 0, url: P.url });
  assert.equal(permit, undefined); assert.equal(h.attempts(), 0);
});
test('HTTP 429 stops without retry and manual actions stop refresh', async () => {
  const h = await harness(); await h.arm();
  h.handlers.http({ tabId: 1, statusCode: 429, type: 'xmlhttprequest', url: 'https://gear.blizzard.com/apps/widget' });
  await h.message({ type: 'silence' }); // Wait for the serialized stop.
  await h.handlers.tick(); assert.equal(h.attempts(), 0); assert.equal(h.storage().state.phase, 'stopped');
  const manual = await harness(); await manual.arm();
  await manual.handlers.message({ type: 'manual-action', documentId: 'doc' }, { url: P.url, frameId: 0, tab: { id: 1 } });
  await manual.handlers.tick(); assert.equal(manual.attempts(), 0); assert.equal(manual.storage().state.phase, 'stopped');
});
test('web page messages cannot arm or reset extension', async () => {
  const h = await harness();
  await h.handlers.message({ type: 'arm', tabId: 1, soundReady: true, confirmEmpty: true }, { url: P.url, tab: { id: 1 } });
  assert.equal(h.storage().state.phase, 'idle');
});
test('changed final controls or document veto opening but retain latch', async () => {
  for (const mode of ['disabled', 'document']) {
    const h = await harness(); await h.arm();
    if (mode === 'disabled') h.confirm(false);
    else h.onConfirm(async () => h.sample({ kind: 'enabled', ready: true, stable: true, documentId: 'new' }));
    await h.handlers.tick(); await h.handlers.tick();
    assert.equal(h.attempts(), 0); assert.equal(h.storage().state.attempted, true);
  }
});
test('uncertain tab creation never retries', async () => {
  const h = await harness(); await h.arm(); h.createFails(true);
  await h.handlers.tick(); await h.handlers.tick();
  assert.equal(h.attempts(), 1); assert.equal(h.storage().state.phase, 'handoff');
  await assert.rejects(h.arm(), /Previous attempt/);
});
test('pause or manual action during final confirmation prevents tab opening', async () => {
  for (const manual of [false, true]) {
    const h = await harness(); await h.arm();
    h.onConfirm(async () => manual
      ? h.handlers.message({ type: 'manual-action', documentId: 'doc' }, { url: P.url, frameId: 0, tab: { id: 1 } })
      : h.message({ type: 'stop' }));
    await h.handlers.tick();
    assert.equal(h.attempts(), 0); assert.equal(h.storage().state.phase, 'stopped');
  }
});

test('unrelated background 404 does not stop, trigger, or expose a private URL', async () => {
  const h = await harness(); h.sample({ kind: 'unavailable', ready: true, documentId: 'doc' });
  await h.arm();
  h.handlers.http({ tabId: 1, statusCode: 404, type: 'xmlhttprequest', url: 'https://gear.blizzard.com/apps/widget?token=PRIVATE' });
  await h.message({ type: 'silence' });
  await h.handlers.tick(); h.time(5000); await h.handlers.tick();
  const state = await h.message({ type: 'status' });
  assert.equal(state.phase, 'watching'); assert.equal(state.ignoredBackground404s, 1);
  assert.equal(state.alarm, 0); assert.equal(h.attempts(), 0); assert.equal(h.reloads(), 1);
  assert.equal(JSON.stringify(state).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(state).includes('/apps/widget'), false);
});

test('critical 404s stop with a safe category and no checkout or retry', async () => {
  for (const [url, type, category] of [
    [P.url, 'main_frame', 'Product page'],
    ['https://gear.blizzard.com/checkouts/private?token=PRIVATE', 'main_frame', 'Store navigation'],
    ['https://gear.blizzard.com' + P.path + '.js?nonce=PRIVATE', 'xmlhttprequest', 'Public inventory feed'],
    ['https://gear.blizzard.com' + P.path + '.json', 'xmlhttprequest', 'Public inventory feed'],
    [P.url, 'xmlhttprequest', 'Product HTML / availability check'],
  ]) {
    const h = await harness(); await h.arm();
    h.handlers.http({ tabId: 1, statusCode: 404, type, url });
    await h.message({ type: 'silence' }); await h.handlers.tick();
    const state = await h.message({ type: 'status' });
    assert.equal(state.phase, 'stopped'); assert.ok(state.reason.startsWith(category + ' returned HTTP 404.'));
    assert.equal(JSON.stringify(state).includes('PRIVATE'), false);
    assert.equal(h.attempts(), 0); assert.equal(h.reloads(), 0);
  }
});

test('background access restrictions, rate limits, and server errors still stop', async () => {
  for (const statusCode of [401, 403, 429, 500, 503]) {
    const h = await harness(); await h.arm();
    h.handlers.http({ tabId: 1, statusCode, type: 'xmlhttprequest', url: 'https://gear.blizzard.com/apps/widget' });
    await h.message({ type: 'silence' }); await h.handlers.tick();
    assert.equal(h.storage().state.phase, 'stopped'); assert.equal(h.attempts(), 0);
    assert.ok(h.storage().state.reason.includes(`HTTP ${statusCode}`));
  }
});

test('other tabs, origins, successful requests, and post-handoff errors do not stop watcher', async () => {
  const h = await harness(); await h.arm();
  for (const details of [
    { tabId: 2, statusCode: 404, type: 'main_frame', url: P.url },
    { tabId: 1, statusCode: 404, type: 'xmlhttprequest', url: 'https://elsewhere.test/private' },
    { tabId: 1, statusCode: 200, type: 'main_frame', url: P.url },
  ]) h.handlers.http(details);
  await h.message({ type: 'silence' }); assert.equal(h.storage().state.phase, 'watching');
  await h.handlers.tick(); assert.equal(h.attempts(), 1);
  h.handlers.http({ tabId: 1, statusCode: 404, type: 'main_frame', url: P.url });
  await h.message({ type: 'silence' }); assert.equal(h.storage().state.phase, 'handoff');
});
