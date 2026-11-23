// Offline Firefox fixtures. Every network request is intercepted; no live store actions.
import { firefox } from '../../local-firefox/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const product = 'https://gear.blizzard.com/products/wowccl0012-world-of-warcraft-forever-collectors-edition';
const variant = '48891708506361';
const fixture = `<section class="product__info-container"><form method="post" action="/cart/add" data-type="add-to-cart-form" id="product-form"><input name="id" value="${variant}" type="hidden"><input name="product-id" value="10220685590777" type="hidden"><button name="add">Pre-order</button></form><input type="number" name="quantity" value="3" form="product-form"></section>
<form id="CartDrawer-Form" method="post" action="/cart"></form><button id="CartDrawer-Checkout" name="checkout" form="CartDrawer-Form" hidden>Checkout</button>
<button id="pay">Pay now</button><script>
window.adds=0;window.checkouts=0;window.payments=0;
document.querySelector('#product-form').addEventListener('submit',e=>{e.preventDefault();window.adds++;window.quantity=new FormData(e.target).get('quantity');document.querySelector('#CartDrawer-Checkout').hidden=false;});
document.querySelector('#CartDrawer-Form').addEventListener('submit',e=>{e.preventDefault();window.checkouts++;});
document.querySelector('#pay').onclick=()=>window.payments++;
</script>`;
const browser = await firefox.launch({ headless: true });
let assertions = 0;
try {
  const context = await browser.newContext();
  let sourceReads = 0;
  let sourceMode = 'positive';
  let sourceDelay = 0;
  await context.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.searchParams.has('queue_helper_nonce')) {
      sourceReads++;
      assert.equal(route.request().headers()['cache-control'], 'no-cache, no-store');
      if (sourceDelay) await new Promise(resolve => setTimeout(resolve, sourceDelay));
      if (sourceMode === 'error') return route.fulfill({ status: 503, body: 'Unavailable' });
      if (sourceMode === 'feed404' && u.pathname.endsWith('.js')) return route.fulfill({ status: 404, body: 'PRIVATE response' });
      if (sourceMode === 'html404' && !u.pathname.endsWith('.js')) return route.fulfill({ status: 404, body: 'PRIVATE response' });
      if (sourceMode === 'network' && u.pathname.endsWith('.js')) return route.abort();
      if (u.pathname.endsWith('.js')) return route.fulfill({ json: {
        id: sourceMode === 'wrong' ? 99 : '10220685590777', title: "World of Warcraft: Forever Collector's Edition",
        handle: product.split('/').pop(), variants: [{ id: variant, sku: 'WOWCCL001200', available: !['negative', 'button-only'].includes(sourceMode) }]
      } });
      return route.fulfill({ contentType: 'text/html', body: ['negative', 'inventory-only'].includes(sourceMode)
        ? fixture.replace('<button name="add">', '<button name="add" disabled>') : fixture });
    }
    if (route.request().resourceType() === 'document' && u.href.startsWith(product)) return route.fulfill({ contentType: 'text/html', body: fixture });
    throw new Error('Unexpected network request blocked: ' + u.origin + u.pathname);
  });
  const page = await context.newPage();
  async function setup() {
    sourceReads = 0; sourceMode = 'positive'; sourceDelay = 0;
    await page.goto(product);
    await page.evaluate(() => {
      window.testPermit = true;
      window.browser = { runtime: { onMessage: { addListener: fn => window.handler = fn }, sendMessage: async () => window.testPermit } };
    });
    for (const file of ['policy.js', 'signals.js', 'content.js']) await page.addScriptTag({ path: fileURLToPath(new URL(file, root)) });
  }
  async function sample() { return page.evaluate(() => window.handler({ type: 'sample' })); }
  async function confirmation() {
    let s = await sample();
    if (s.kind === 'enabled' && !s.stable) { await page.waitForTimeout(1600); s = await sample(); }
    return page.evaluate(doc => window.handler({ type: 'confirm', documentId: doc }), s.documentId);
  }
  async function counts() { return page.evaluate(() => [window.adds, window.checkouts, window.payments]); }
  await setup(); assert.equal((await sample()).stable, false); await page.waitForTimeout(1600); assert.equal((await sample()).stable, true); assertions += 2;
  assert.equal((await confirmation()).confirmed, true); assert.deepEqual(await counts(), [0, 0, 0]); assertions += 2;
  assert.equal(await page.evaluate(() => window.handler({ type: 'confirm', documentId: 'stale' }).then(r => r.confirmed)), false); assertions++;
  await page.evaluate(() => window.handler({ type: 'attempt', documentId: 'anything' }));
  assert.deepEqual(await counts(), [0, 0, 0]); assertions++;
  for (const edit of [
    () => document.querySelector('[name=add]').disabled = true,
    () => document.querySelector('[name=add]').setAttribute('aria-disabled', 'true'),
    () => document.querySelector('[name=add]').textContent = 'Notify Me',
    () => document.querySelector('[name=id]').value = 'wrong',
    () => document.querySelector('[name=add]').hidden = true,
    () => document.querySelector('[name=id]').disabled = true,
    () => document.querySelector('[data-type]').action = 'https://evil.test/cart/add',
    () => document.body.append(document.createTextNode('Verify you are human')),
    () => document.body.append(document.createTextNode("You're in line")),
    () => document.querySelector('[name=quantity]').disabled = true
  ]) {
    await setup(); await page.evaluate(edit); assert.notEqual((await sample()).kind, 'enabled'); assert.equal((await confirmation()).confirmed, false); assert.deepEqual(await counts(), [0, 0, 0]); assertions += 3;
  }
  await setup(); await page.locator('button[name="add"]').click(); assert.equal((await sample()).kind, 'stop'); assertions++;
  // Regression: initial enabled button replaced by Notify Me after complete/load.
  await setup(); await sample(); await page.waitForTimeout(500);
  await page.evaluate(() => { document.querySelector('[name="add"]').textContent = 'Notify Me'; });
  await page.waitForTimeout(1200); assert.equal((await sample()).kind, 'unavailable');
  await confirmation(); assert.deepEqual(await counts(), [0, 0, 0]); assert.equal(sourceReads, 0); assertions += 3;
  // A visible sibling replacement vetoes an underlying still-enabled button.
  await setup(); await page.evaluate(() => {
    const notify = document.createElement('button'); notify.textContent = 'Notify Me';
    document.querySelector('.product__info-container').append(notify);
  });
  await confirmation(); assert.equal((await sample()).kind, 'unavailable'); assert.deepEqual(await counts(), [0, 0, 0]); assertions += 2;
  // Ancestor opacity must not count as a visible actionable button.
  await setup(); await page.evaluate(() => document.querySelector('#product-form').style.opacity = '0');
  await confirmation(); assert.deepEqual(await counts(), [0, 0, 0]); assertions++;
  // Brief flip entirely between samples resets the stable window.
  await setup(); await sample(); await page.waitForTimeout(1600);
  await page.evaluate(() => { const b = document.querySelector('[name="add"]'); b.disabled = true; b.disabled = false; });
  assert.equal((await sample()).stable, false); assert.equal(sourceReads, 0); assertions += 2;
  await page.waitForTimeout(1600); assert.equal((await sample()).stable, true); assertions++;
  // Public negatives reject a stale enabled DOM; no repeated network burst per document.
  await setup(); sourceMode = 'negative'; await confirmation();
  assert.equal((await sample()).kind, 'unavailable'); assert.deepEqual(await counts(), [0, 0, 0]);
  await sample(); await sample(); assert.equal(sourceReads, 2); assertions += 3;
  for (const mode of ['error', 'wrong']) {
    await setup(); sourceMode = mode; await confirmation(); assert.equal((await sample()).kind, 'stop');
    assert.deepEqual(await counts(), [0, 0, 0]); assertions += 2;
  }
  for (const [mode, diagnostic] of [
    ['feed404', 'Public inventory feed returned HTTP 404.'],
    ['html404', 'Product HTML / availability check returned HTTP 404.'],
    ['network', 'Public inventory feed request failed or timed out.'],
  ]) {
    await setup(); sourceMode = mode;
    assert.equal((await confirmation()).confirmed, false);
    const result = await sample();
    assert.equal(result.kind, 'stop'); assert.ok(result.reason.startsWith(diagnostic));
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
    assert.deepEqual(await counts(), [0, 0, 0]); assertions += 5;
  }
  // Match the alert's OR-positive rule, while still requiring settled rendered UI.
  for (const mode of ['inventory-only', 'button-only']) {
    await setup(); sourceMode = mode; assert.equal((await confirmation()).confirmed, true); assert.deepEqual(await counts(), [0, 0, 0]); assertions += 2;
  }
  // Notify Me arriving during public confirmation must invalidate the result.
  await setup(); await sample(); await page.waitForTimeout(1600); sourceDelay = 350;
  const pending = sample();
  await page.waitForTimeout(80);
  await page.evaluate(() => document.querySelector('[name="add"]').textContent = 'Notify Me');
  assert.equal((await pending).stable, false); await confirmation(); assert.deepEqual(await counts(), [0, 0, 0]); assertions += 2;
  // Expired evidence cannot authorize a late click.
  await setup(); await sample(); await page.waitForTimeout(1600); await sample();
  await page.waitForTimeout(5100); assert.equal((await confirmation()).confirmed, false); assert.deepEqual(await counts(), [0, 0, 0]); assertions += 2;
  // Full load is mandatory, followed by the post-load settle interval.
  await setup();
  await page.evaluate(() => {
    window.fixtureReadyState = 'interactive';
    Object.defineProperty(document, 'readyState', { configurable: true, get: () => window.fixtureReadyState });
  });
  await sample(); await page.waitForTimeout(1600); assert.equal((await sample()).stable, false); assert.equal(sourceReads, 0); assertions += 2;
  await page.evaluate(() => window.fixtureReadyState = 'complete'); await sample();
  await page.waitForTimeout(800); assert.equal((await sample()).stable, false); assertions++;
  await page.waitForTimeout(800); assert.equal((await sample()).stable, true); assertions++;
  // Final confirmation rechecks the DOM even after a positive sample.
  await setup(); await confirmation();
  await page.evaluate(() => document.querySelector('[name="add"]').textContent = 'Notify Me');
  const doc = (await sample()).documentId;
  assert.equal(await page.evaluate(documentId => window.handler({ type: 'confirm', documentId }).then(r => r.confirmed), doc), false);
  assert.deepEqual(await counts(), [0, 0, 0]); assertions += 2;
  console.log(`PASS: ${assertions} offline Firefox assertions; no payment controls clicked, no live requests.`);
} finally { await browser.close(); }
