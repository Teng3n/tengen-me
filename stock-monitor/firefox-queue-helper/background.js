/* MV2 persistent background owns timing and the durable one-attempt latch. */
const P = QueuePolicy;
let state = { phase: 'idle', attempted: false, reason: 'Not armed.' };
let busy = false;
let serial = Promise.resolve();
let lastTick = Date.now();
let lastPanel = 0;
let nextReload = 0;
let unknownSince = 0;
let readySample = null;
const controlURL = browser.runtime.getURL('control.html');
const initialized = browser.storage.local.get('state').then(async stored => {
  state = { ...state, ...stored.state, phase: 'idle', reason: 'Not armed. Inspect cart before arming; restarting never resumes automatically.' };
  delete state.token;
  await save();
});
async function save() {
  await browser.storage.local.set({ state });
  await browser.browserAction.setBadgeText({ text: state.phase === 'watching' ? 'ON' : state.attempted ? 'STOP' : '' });
}
function enqueue(fn) {
  const result = serial.then(fn);
  serial = result.catch(() => {});
  return result;
}
async function stop(reason, alarm = true) {
  state = { ...state, phase: 'stopped', reason, token: null, alarm: alarm ? Date.now() : 0 };
  await save();
}
function isControl(sender) { return sender.url === controlURL; }
browser.browserAction.onClicked.addListener(async () => {
  const existing = (await browser.tabs.query({})).find(t => t.url === controlURL);
  if (existing) await browser.tabs.update(existing.id, { active: true });
  else await browser.tabs.create({ url: controlURL });
});
browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'manual-action' && sender.frameId === 0 && P.productURL(sender.url)) {
    return enqueue(async () => {
      await initialized;
      if (['watching', 'attempting'].includes(state.phase) && state.tabId === sender.tab?.id) await stop('You clicked a cart control — automatic watching stopped. Take over.');
    });
  }
  if (!isControl(sender)) return undefined;
  if (msg.type === 'status') return initialized.then(() => { lastPanel = Date.now(); return state; });
  return enqueue(async () => {
    await initialized;
    if (msg.type === 'stop') { await stop('Paused by you. Inspect the cart before rearming.', false); return state; }
    if (msg.type === 'silence') { state.alarm = 0; await save(); return state; }
    if (msg.type === 'arm') {
      if (state.phase === 'watching' || state.phase === 'attempting') throw new Error('Pause before rearming.');
      if (msg.confirmEmpty !== true || msg.soundReady !== true) throw new Error('Confirm an empty cart and enable sound first.');
      if (state.attempted && msg.confirmRearm !== true) throw new Error('Previous attempt locked. Inspect cart/order history before explicitly rearming.');
      const tab = await browser.tabs.get(msg.tabId);
      if (!P.productURL(tab.url)) throw new Error('Select the Collector’s Edition product tab.');
      const result = await browser.tabs.sendMessage(tab.id, { type: 'sample' });
      if (!result || result.kind === 'stop' || result.kind === 'unknown') throw new Error(result?.reason || 'Reload the product tab and try again.');
      state = { phase: 'watching', attempted: false, tabId: tab.id, reason: 'Watching settled button + fresh public confirmation; target refresh every 5 seconds.',
        documentId: result.documentId, alarm: 0, armedAt: Date.now(), lastCheck: Date.now() };
      lastPanel = lastTick = Date.now(); nextReload = Date.now() + 5000; unknownSince = 0; readySample = null;
      await save();
      return state;
    }
  });
});
async function tick() {
  if (busy) return;
  busy = true;
  try {
    await initialized;
    const now = Date.now();
    const elapsed = now - lastTick; lastTick = now;
    if (state.phase !== 'watching') return;
    if (elapsed > 30000) return await enqueue(() => stop('Computer/browser paused for over 30 seconds. Recheck and rearm manually.'));
    if (now - lastPanel > 10000) return await enqueue(() => stop('Control/sound tab is closed or stalled. Reopen it to rearm.'));
    const tabId = state.tabId;
    const tab = await browser.tabs.get(tabId);
    if (!P.productURL(tab.url)) return await enqueue(() => stop('Product tab navigated away — take over. No refresh or further clicks.'));
    let result;
    try { result = await browser.tabs.sendMessage(tabId, { type: 'sample' }); } catch { /* loading or content script unavailable */ }
    if (state.phase !== 'watching' || state.tabId !== tabId) return;
    if (!result || !result.ready) {
      unknownSince ||= now;
      if (now - unknownSince > 30000) await enqueue(() => stop('Product page failed to load within 30 seconds. No automatic retry.'));
      return;
    }
    state.lastCheck = now;
    state.documentId = result.documentId;
    if (result.kind === 'stop') return await enqueue(() => stop(result.reason));
    if (result.kind === 'unknown') {
      unknownSince ||= now;
      if (now - unknownSince > 10000) await enqueue(() => stop(result.reason));
      return;
    }
    unknownSince = 0;
    if (result.kind === 'enabled' && result.stable) {
      let claimed;
      await enqueue(async () => {
        if (!P.mayClaim(state, tabId, result.documentId)) return;
        state = { ...state, phase: 'attempting', attempted: true, token: crypto.randomUUID(), alarm: now,
          reason: 'Settled button and public availability confirmed — one attempt only. Take over when checkout opens.' };
        await save(); // Persist before opening a cart permalink. Failure means no navigation.
        claimed = { ...state };
      });
      if (!claimed) return;
      let reason = 'Availability changed or attempt stopped — no checkout tab opened. Inspect manually; no retry.';
      try {
        const latest = await browser.tabs.get(tabId);
        const confirmation = P.productURL(latest.url)
          && await browser.tabs.sendMessage(tabId, { type: 'confirm', documentId: claimed.documentId });
        if (confirmation?.confirmed === true && confirmation.documentId === claimed.documentId
            && state.phase === 'attempting' && state.token === claimed.token) {
          // No payment script, no product/cart button clicks, no queue refreshes.
          // A successful tabs.create is NOT proof of queue admission or inventory.
          await browser.tabs.create({ url: P.checkoutURL, active: true, windowId: latest.windowId, openerTabId: tabId });
          reason = 'One-copy checkout shortcut opened once in a new tab — take over. Queue admission and stock are not confirmed.';
        }
      } catch { reason = 'Checkout tab opening could not be confirmed — inspect your tabs and cart. No automatic retry.'; }
      await enqueue(async () => {
        if (state.token !== claimed.token) return;
        state = { ...state, phase: 'handoff', token: null, reason, alarm: Date.now() };
        await save();
      });
      return;
    }
    // Give each newly loaded document at least one second to settle before a reload.
    if (readySample?.documentId !== result.documentId) readySample = { documentId: result.documentId, at: now };
    if (result.kind === 'enabled') return; // Don't interrupt the short enabled-state confirmation.
    if (now >= nextReload && now - readySample.at >= 1000) {
      await enqueue(async () => {
        if (state.phase !== 'watching' || state.tabId !== tabId) return;
        const latest = await browser.tabs.get(tabId);
        if (!P.productURL(latest.url)) return stop('Navigation detected — no refresh.');
        // Last page check closes most timing races before reload.
        const final = await browser.tabs.sendMessage(tabId, { type: 'sample' });
        if (final.kind === 'stop') return stop(final.reason);
        if (final.kind !== 'unavailable') return;
        nextReload = Date.now() + 5000; unknownSince = Date.now(); readySample = null;
        await browser.tabs.reload(tabId, { bypassCache: true });
      });
    }
  } catch {
    await enqueue(() => stop('Watcher or browser failed — stopped. No automatic retry.')).catch(() => {});
  } finally { busy = false; }
}
browser.tabs.onRemoved.addListener(id => {
  if (id === state.tabId) enqueue(() => stop('Watched tab closed.')).catch(() => {});
});
browser.webRequest.onCompleted.addListener(details => {
  if (details.tabId !== state.tabId || !['watching', 'attempting'].includes(state.phase)) return;
  const failure = P.httpFailure(details);
  if (!failure) return;
  const armedAt = state.armedAt;
  enqueue(async () => {
    if (details.tabId !== state.tabId || state.armedAt !== armedAt
        || !['watching', 'attempting'].includes(state.phase)) return;
    if (failure.ignored) {
      // Per-arm diagnostic only: never store the URL, query, response, or headers.
      state.ignoredBackground404s = (state.ignoredBackground404s || 0) + 1;
      return;
    }
    await stop(`${failure.category} returned HTTP ${failure.status}. Stopped; inspect manually before retrying.`);
  }).catch(() => {});
}, { urls: ['https://gear.blizzard.com/*'], types: ['main_frame', 'xmlhttprequest'] });
setInterval(tick, 250);
