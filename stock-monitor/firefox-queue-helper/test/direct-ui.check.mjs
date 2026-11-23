// Offline Firefox UI + real receiver code. All remote traffic is blocked.
import { firefox } from '../../local-firefox/node_modules/playwright/index.mjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const html = (await readFile(new URL('control.html', root), 'utf8')).replace('<script src="control.js"></script>', '');
const browser = await firefox.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/*', route => route.request().url() === 'https://fixture.test/control.html'
    ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  await page.goto('https://fixture.test/control.html');
  await page.evaluate(() => {
    window.opened = []; window.store = {}; window.socket = null; window.controlWindowId = 1;
    // Headless audio devices may suspend themselves; actual audibility is a user test.
    window.AudioContext = class {
      state = 'suspended'; currentTime = 0; destination = {};
      async resume() { this.state = 'running'; }
      createOscillator() { return { frequency: {}, connect() {}, start() {}, stop() {} }; }
      createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} }; }
    };
    window.browser = {
      runtime: { getURL: path => 'https://fixture.test/' + path,
        onMessage: { addListener: fn => window.handler = fn },
        sendMessage: msg => window.handler(msg, { url: location.href, tab: { id: 10, windowId: window.controlWindowId } }) },
      storage: { local: { get: async () => window.store, set: async data => window.store = { ...window.store, ...structuredClone(data) } } },
      browserAction: { setBadgeText: async () => {}, onClicked: { addListener: () => {} } },
      windows: { get: async () => ({ state: 'normal', type: 'normal', incognito: false }), update: async () => {} },
      tabs: { get: async () => ({ id: 10, windowId: window.controlWindowId, url: location.href, incognito: false }), create: async options => { window.opened.push(options); return { id: 2, windowId: options.windowId }; }, update: async () => {}, query: async () => [] },
    };
    window.WebSocket = class {
      constructor() { window.socket = this; setTimeout(() => this.onmessage({ data: JSON.stringify({ type: 'hello', v: 1 }) }), 50); }
      send(text) { const msg = JSON.parse(text); setTimeout(() => this.onmessage({ data: JSON.stringify({ ...msg, type: msg.type === 'ping' ? 'pong' : msg.type, v: 1 }) }), 20); }
      close() {}
    };
  });
  for (const file of ['policy.js', 'direct-policy.js', 'direct-background.js', 'control.js']) await page.addScriptTag({ path: fileURLToPath(new URL(file, root)) });
  await page.locator('#pairFile').setInputFiles({ name: '.helper.env', mimeType: 'text/plain', buffer: Buffer.from('HELPER_TOKEN=' + 'a'.repeat(64) + '\r\n') });
  await page.waitForFunction(() => document.querySelector('#connection').textContent === 'Connected', null, { timeout: 5000 }).catch(async error => {
    console.log('Fixture UI error:', await page.locator('#error').textContent());
    console.log('Fixture connection:', await page.locator('#connection').textContent());
    throw error;
  });
  await page.locator('#sound').click(); await page.locator('#test').click();
  await page.waitForFunction(() => window.opened.length === 1);
  assert.equal(await page.evaluate(() => window.opened[0].url), 'https://fixture.test/test.html');
  await page.locator('#silence').click(); await page.locator('#empty').check(); await page.locator('#arm').click();
  await page.waitForFunction(() => document.querySelector('#phase').textContent === 'WATCHING', null, { timeout: 5000 }).catch(async error => {
    console.log('Fixture arm error:', await page.locator('#error').textContent());
    console.log('Fixture state:', await page.locator('#phase').textContent());
    console.log('Fixture sound:', await page.locator('#soundStatus').textContent());
    throw error;
  });
  await page.evaluate(async () => {
    window.controlWindowId = 99; // Simulate detaching the armed control tab into a new window.
    const signal = { type: 'check', v: 1, status: 'available', epoch: 99, variant: '48891708506361',
      inventory: true, button: 'enabled', healthy: true, checkedAt: new Date().toISOString(), sentAt: new Date().toISOString() };
    await window.socket.onmessage({ data: JSON.stringify(signal) });
    await window.socket.onmessage({ data: JSON.stringify(signal) });
  });
  await page.waitForFunction(() => document.querySelector('#phase').textContent === 'HANDOFF');
  const opened = await page.evaluate(() => window.opened);
  assert.equal(opened.length, 2); assert.equal(opened[1].url, 'https://gear.blizzard.com/cart/48891708506361:1?payment=shop_pay');
  assert.equal(opened[1].windowId, 99);
  assert.match(await page.locator('#diagnostic').textContent(), /Last checkout attempt: .*opened/);
  assert.equal(await page.locator('#pairKey').inputValue(), '');
  assert.equal(await page.evaluate(() => JSON.stringify(window.store).includes('a'.repeat(64))), false);
  console.log('PASS: offline Firefox pairing-file load, connect, hosted-test UI, arming, simulated one-shot checkout, deduplication, and secret non-persistence. No live requests.');
} finally { await browser.close(); }
