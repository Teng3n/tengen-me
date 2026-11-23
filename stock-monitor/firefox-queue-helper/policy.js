/* Shared pure guards: no payment or checkout-session access. */
(() => {
  const variant = '48891708506361';
  const productId = '10220685590777';
  const name = "World of Warcraft: Forever Collector's Edition";
  const sku = 'WOWCCL001200';
  const path = '/products/wowccl0012-world-of-warcraft-forever-collectors-edition';
  const url = `https://gear.blizzard.com${path}?variant=${variant}`;
  function productURL(value) {
    try {
      const u = new URL(value);
      return u.origin === 'https://gear.blizzard.com' && u.pathname.replace(/\/$/, '') === path
        && (!u.searchParams.has('variant') || u.searchParams.get('variant') === variant);
    } catch { return false; }
  }
  const checkoutURL = `https://gear.blizzard.com/cart/${variant}:1?payment=shop_pay`;
  function mayClaim(state, tabId, documentId) {
    return state.phase === 'watching' && !state.attempted && state.tabId === tabId
      && state.documentId === documentId;
  }
  function httpFailure(details) {
    if (!Number.isInteger(details.statusCode) || details.statusCode < 400) return null;
    let request;
    try { request = new URL(details.url); } catch { return null; }
    if (request.origin !== 'https://gear.blizzard.com') return null;
    if (!['main_frame', 'xmlhttprequest'].includes(details.type)) return null;
    const requestPath = request.pathname.replace(/\/$/, '');
    const category = details.type === 'main_frame'
      ? (requestPath === path ? 'Product page' : 'Store navigation')
      : requestPath === `${path}.js` || requestPath === `${path}.json` ? 'Public inventory feed'
      : requestPath === path ? 'Product HTML / availability check'
      : 'Other store background request';
    // Only unrelated background 404s are nonfatal. In particular, never ignore
    // access restrictions (401/403), rate limits (429), or server failures.
    return { category, status: details.statusCode,
      ignored: category === 'Other store background request' && details.statusCode === 404 };
  }
  globalThis.QueuePolicy = { variant, productId, name, sku, path, url, checkoutURL, productURL, mayClaim, httpFailure,
    settleMs: 1500, evidenceMaxAgeMs: 5000 };
})();
