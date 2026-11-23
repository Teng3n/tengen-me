export const PRODUCT = Object.freeze({
  name: "World of Warcraft: Forever Collector's Edition",
  id: "10220685590777",
  variant: "48891708506361",
  sku: "WOWCCL001200",
  handle: "wowccl0012-world-of-warcraft-forever-collectors-edition",
  url: "https://gear.blizzard.com/products/wowccl0012-world-of-warcraft-forever-collectors-edition",
});
// Conservative $150 ITEM-subtotal ceiling for the one-copy supervised dry run.
// No final shipping/tax payment budget has been authorized for an automatic buyer.
export const INTENT = Object.freeze({ quantity: 1, currency: "USD", maxTotalCents: 15000, paymentEnabled: false });
export const TEST_PRODUCT = Object.freeze({
  name: "Heroes of the Storm Orphea White T-Shirt",
  id: "10227949076729",
  variant: "48909166280953",
  sku: "HEROMT001202",
  handle: "heromt0012-heroes-of-the-storm-orphea-t-shirt",
  url: "https://gear.blizzard.com/products/heromt0012-heroes-of-the-storm-orphea-t-shirt",
  size: "S",
});
export const COLLECTOR_PLAN = Object.freeze({ mode: "dry-run", product: PRODUCT, intent: INTENT, cartPhrase: "ONE ONLY" });
export const SHIRT_TEST_PLAN = Object.freeze({ mode: "test-shirt", product: TEST_PRODUCT,
  intent: Object.freeze({ quantity: 1, currency: "USD", maxTotalCents: 4000, paymentEnabled: false }),
  cartPhrase: "ONE TEST SHIRT" });

export function getPlan(mode) {
  if (mode === "dry-run") return COLLECTOR_PLAN;
  if (mode === "test-shirt") return SHIRT_TEST_PLAN;
  throw new SafeStop("unsupported_mode");
}

export class SafeStop extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function assertProductUrl(value, product = PRODUCT) {
  const url = new URL(value);
  if (url.origin !== "https://gear.blizzard.com" || url.pathname !== `/products/${product.handle}`
      || (url.searchParams.has("variant") && url.searchParams.get("variant") !== product.variant)
      || url.username || url.password) throw new SafeStop("unexpected_product_page");
}

export function verifyProduct(feed, forms, plan = COLLECTOR_PLAN) {
  const { product, intent } = plan;
  if (String(feed?.id) !== product.id || feed?.handle !== product.handle || feed?.title !== product.name)
    throw new SafeStop("product_identity_mismatch");
  const variants = feed.variants?.filter(v => String(v.id) === product.variant && v.sku === product.sku) ?? [];
  if (variants.length !== 1 || typeof variants[0].available !== "boolean") throw new SafeStop("variant_identity_mismatch");
  const variant = variants[0];
  if (!Number.isSafeInteger(variant.price) || variant.price <= 0) throw new SafeStop("invalid_item_price");
  if (variant.price * intent.quantity > intent.maxTotalCents) throw new SafeStop("subtotal_exceeds_budget");
  if (product.size && variant.title !== product.size) throw new SafeStop("variant_size_mismatch");
  const matches = forms.filter(f => f.productId === product.id && f.variantId === product.variant);
  if (matches.length !== 1) throw new SafeStop("ambiguous_purchase_form");
  const form = matches[0];
  const purchaseLabel = /\b(pre[ -]?order|add to cart)\b/i.test(form.label)
    && !/sold out|notify me|unavailable/i.test(form.label);
  const enabled = purchaseLabel && form.visible && !form.buttonDisabled && !form.variantDisabled;
  if (variant.available === false && (form.buttonDisabled || form.variantDisabled))
    throw new SafeStop("currently_unavailable");
  if (variant.available !== true || !enabled) throw new SafeStop("availability_unknown");
  return { unitPriceCents: variant.price, subtotalCents: variant.price * intent.quantity };
}

export function verifyCart(cart, unitPriceCents, plan = COLLECTOR_PLAN) {
  if (cart.currency !== "USD" || cart.items?.length !== 1) throw new SafeStop("cart_contains_other_items_or_currency");
  const item = cart.items[0];
  if (String(item.variantId) !== plan.product.variant || item.quantity !== plan.intent.quantity
      || item.unitPriceCents !== unitPriceCents) throw new SafeStop("cart_does_not_match_intent");
}

// This list deliberately excludes payment buttons and form submission methods.
export function assertAction(action) {
  if (!["set_quantity", "add_to_cart", "open_checkout"].includes(action)) throw new SafeStop("payment_or_unknown_action_disabled");
}

export function isCheckoutDestination(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password
      && ["gear.blizzard.com", "blizzardgearstore.myshopify.com", "shop.app"].includes(u.hostname)
      && /^\/(?:checkout|checkouts)(?:\/|$)/.test(u.pathname);
  } catch { return false; }
}
