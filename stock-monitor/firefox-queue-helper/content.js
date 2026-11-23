(() => {
  const P = QueuePolicy;
  const documentId = crypto.randomUUID();
  let manualAction = false;
  let enabledSince = 0;
  let completeSince = document.readyState === 'complete' ? performance.now() : null;
  let lastControlMutation = performance.now();
  let lastButton = null;
  let publicCheck;
  let publicEvidence;
  const visible = el => {
    if (!el || el.getClientRects().length === 0) return false;
    for (let node = el; node instanceof Element; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hidden || node.getAttribute('aria-hidden') === 'true' || style.visibility === 'hidden'
          || style.display === 'none' || Number(style.opacity) === 0) return false;
    }
    return true;
  };
  const enabled = el => visible(el) && !el.matches(':disabled')
    && el.getAttribute('aria-disabled') !== 'true' && !el.closest('[inert]')
    && getComputedStyle(el).pointerEvents !== 'none';
  const formSelector = 'form[data-type="add-to-cart-form"]';
  function purchaseRegion(form) { return form.closest('product-info, .product__info-container, [id^="ProductInfo-"]') || form.parentElement; }
  function hasNotify(region) {
    return [...region.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]')]
      .some(el => visible(el) && /\b(notify me|notify when available|email me when available|sold out)\b/i.test(el.textContent || el.value || ''));
  }
  function obstacle() {
    const text = document.body?.innerText || '';
    if (/verify (?:you are|you're) human|captcha failed|access denied|too many requests|unusual traffic|complete the security check/i.test(text)) return 'Security check or access restriction — handle manually.';
    if (/you(?:'re| are) (?:in (?:a |the )?(?:queue|line)|next in line)|estimated wait|do not (?:refresh|close) this page/i.test(text)) return 'Queue detected — leave this tab alone and take over.';
    if ([...document.querySelectorAll('iframe[title*="captcha" i], iframe[title*="challenge" i]')].some(visible)) return 'Visible security challenge — handle manually.';
    return null;
  }
  function inspect() {
    if (manualAction) return { kind: 'stop', reason: 'You started a cart action — automatic refreshing stopped. Take over.' };
    if (!P.productURL(location.href)) return { kind: 'stop', reason: 'Left product page — take over.' };
    const blocked = obstacle();
    if (blocked) return { kind: 'stop', reason: blocked };
    const forms = [...document.querySelectorAll('form[data-type="add-to-cart-form"]')].filter(f =>
      f.querySelector('input[name="id"]')?.value === P.variant);
    if (forms.length !== 1) return { kind: 'unknown', reason: 'Matching product form missing or ambiguous.' };
    const form = forms[0];
    if (hasNotify(purchaseRegion(form))) return { kind: 'unavailable', reason: 'Notify Me / Sold Out replacement is visible.' };
    const action = new URL(form.action, location.href);
    if (action.origin !== location.origin || action.pathname !== '/cart/add' || form.method.toLowerCase() !== 'post') return { kind: 'stop', reason: 'Product form changed — manual review needed.' };
    const buttons = form.querySelectorAll('button[name="add"]');
    const button = buttons[0];
    const quantity = form.elements.namedItem('quantity');
    if (buttons.length !== 1 || !quantity || quantity.tagName !== 'INPUT' || quantity.disabled) return { kind: 'unknown', reason: 'Purchase controls missing or ambiguous.' };
    if (new FormData(form).get('selling_plan')) return { kind: 'stop', reason: 'Selling plan requires manual checkout.' };
    const label = button.textContent.trim().replace(/\s+/g, ' ');
    if (/\b(notify me|sold out|unavailable)\b/i.test(label)) return { kind: 'unavailable' };
    if (!enabled(button) || form.querySelector('input[name="id"]').disabled) return { kind: 'unavailable' };
    if (!/^(pre[ -]?order|add to cart)$/i.test(label)) return { kind: 'unknown', reason: 'Enabled control is not a recognized purchase button.' };
    return { kind: 'enabled', form, button, quantity };
  }
  function settled() {
    const result = inspect();
    const now = performance.now();
    if (document.readyState !== 'complete') completeSince = null;
    else completeSince ??= now;
    if (result.kind !== 'enabled' || document.readyState !== 'complete') { enabledSince = 0; lastButton = null; }
    else if (!enabledSince || lastButton !== result.button) { enabledSince = now; lastButton = result.button; }
    return { result, stable: enabledSince > 0 && completeSince !== null
      && now - Math.max(enabledSince, completeSince, lastControlMutation) >= P.settleMs };
  }
  async function sample() {
    let current = settled();
    if (current.result.kind === 'enabled' && current.stable) {
      // At most one public confirmation pair per document; negative evidence waits
      // for the next ordinary refresh. No request burst on every 250-ms sample.
      publicCheck ||= QueueSignals.corroborate().then(value => (publicEvidence = value));
      await publicCheck;
      current = settled(); // Late widget updates while the network was pending veto the result.
    }
    let kind = current.result.kind;
    let reason = current.result.reason;
    if (kind === 'enabled' && current.stable && publicEvidence?.kind === 'negative') kind = 'unavailable';
    if (kind === 'enabled' && current.stable && publicEvidence?.kind === 'unknown') {
      kind = 'stop'; reason = `${publicEvidence.reason || 'Public availability confirmation failed.'} No checkout opened. Inspect manually.`;
    }
    const corroborated = publicEvidence?.kind === 'positive' && Date.now() - publicEvidence.checkedAt <= P.evidenceMaxAgeMs;
    if (kind === 'enabled' && current.stable && publicEvidence?.kind === 'positive' && !corroborated) {
      kind = 'stop'; reason = 'Availability evidence expired — no checkout opened. Inspect manually.';
    }
    return { kind, reason, documentId,
      ready: document.readyState === 'complete', stable: kind === 'enabled' && current.stable && corroborated };
  }
  function confirmedNow() {
    const current = settled();
    return current.stable && current.result.kind === 'enabled' && publicEvidence?.kind === 'positive'
      && Date.now() - publicEvidence.checkedAt <= P.evidenceMaxAgeMs ? current.result : null;
  }
  // Watch relevant DOM changes even if an enabled -> disabled -> enabled flash
  // happens entirely between background samples. Ignore unrelated page animations.
  new MutationObserver(records => {
    const form = [...document.querySelectorAll(formSelector)].find(f => f.querySelector('input[name="id"]')?.value === P.variant);
    if (!form) { enabledSince = 0; lastControlMutation = performance.now(); return; }
    const region = purchaseRegion(form);
    if (records.some(record => {
      const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      return target && (region.contains(target) || (record.type === 'attributes' && target.contains(region))
        || [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && (node.contains(form) || node.matches(formSelector))));
    })) lastControlMutation = performance.now();
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true,
    attributeFilter: ['disabled', 'aria-disabled', 'aria-hidden', 'hidden', 'inert', 'class', 'style', 'value'] });
  browser.runtime.onMessage.addListener(async msg => {
    if (msg.type === 'sample') return sample();
    if (msg.type === 'confirm') return {
      documentId, confirmed: msg.documentId === documentId && !!confirmedNow()
    };
  });
  document.addEventListener('click', event => {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const button = event.target.closest('button[name="add"], #CartDrawer-Checkout');
    if (!button) return;
    manualAction = true; // Synchronous guard also protects a pending reload sample.
    browser.runtime.sendMessage({ type: 'manual-action', documentId }).catch(() => {});
  }, true);
})();
