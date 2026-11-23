/* Public, read-only corroboration. Does not execute fetched HTML. */
(() => {
  const P = QueuePolicy;
  function inventory(product) {
    if (!product || String(product.id) !== P.productId || product.title !== P.name
        || product.handle !== P.path.split('/').pop() || !Array.isArray(product.variants)) return null;
    const variants = product.variants.filter(v => String(v.id) === P.variant && v.sku === P.sku);
    return variants.length === 1 && typeof variants[0].available === 'boolean' ? variants[0].available : null;
  }
  function serverButton(html) {
    const template = document.createElement('template');
    template.innerHTML = html; // Inert, detached template: no scripts or asset loading.
    const doc = template.content;
    const forms = [...doc.querySelectorAll('form[data-type="add-to-cart-form"]')].filter(f =>
      f.querySelector('input[name="id"]')?.value === P.variant
      && f.querySelector('input[name="product-id"]')?.value === P.productId);
    if (!forms.length) return null;
    const states = forms.map(f => {
      const buttons = f.querySelectorAll('button[name="add"]');
      if (buttons.length !== 1) return null;
      const button = buttons[0];
      const label = button.textContent.replace(/\s+/g, ' ').trim();
      const purchase = /\b(add to cart|pre[ -]?order|buy now)\b/i.test(label)
        && !/\b(sold out|notify me|unavailable)\b/i.test(label);
      const disabled = button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true'
        || f.querySelector('input[name="id"]').hasAttribute('disabled');
      if (purchase && !disabled) return true;
      if (disabled && (purchase || /\b(sold out|notify me|unavailable)\b/i.test(label))) return false;
      return null;
    });
    return states.every(v => v === true) ? true : states.every(v => v === false) ? false : null;
  }
  async function fresh(url, json) {
    const category = json ? 'Public inventory feed' : 'Product HTML / availability check';
    try {
      const target = new URL(url);
      target.searchParams.set('queue_helper_nonce', crypto.randomUUID());
      const response = await fetch(target.href, { credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { Accept: json ? 'application/json' : 'text/html', 'Cache-Control': 'no-cache, no-store' },
        signal: AbortSignal.timeout(8000) });
      if (!response.ok) return { problem: `${category} returned HTTP ${response.status}.` };
      try { return { value: json ? await response.json() : await response.text() }; }
      catch { return { problem: `${category} response could not be read.` }; }
    } catch { return { problem: `${category} request failed or timed out.` }; }
  }
  async function corroborate() {
    try {
      const [feed, html] = await Promise.all([fresh(`https://gear.blizzard.com${P.path}.js`, true), fresh(`https://gear.blizzard.com${P.path}`, false)]);
      if (feed.problem || html.problem) return { kind: 'unknown', reason: feed.problem || html.problem };
      const feedAvailable = inventory(feed.value);
      const buttonAvailable = serverButton(html.value);
      // Same positive rule as alerts, with an extra fail-closed requirement here:
      // both public sources must be valid before a cart action is permitted.
      if (feedAvailable === null) return { kind: 'unknown', reason: 'Public inventory feed did not validate the expected product/variant.' };
      if (buttonAvailable === null) return { kind: 'unknown', reason: 'Product HTML / availability check did not validate the expected controls.' };
      return { kind: feedAvailable || buttonAvailable ? 'positive' : 'negative', checkedAt: Date.now() };
    } catch { return { kind: 'unknown' }; }
  }
  globalThis.QueueSignals = { inventory, serverButton, corroborate };
})();
