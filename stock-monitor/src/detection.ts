import { PRODUCT, type ButtonEvidence, type EndpointEvidence, type StockResult } from "./types";

const PURCHASE_LABEL = /\b(add to cart|pre[ -]?order|buy now)\b/i;
const UNAVAILABLE_LABEL = /\b(sold out|notify me|unavailable)\b/i;

type FetchLike = typeof fetch;

interface FetchTextResult {
  text: string;
  evidence: EndpointEvidence;
}

function freshUrl(baseUrl: string, attempt: number): string {
  const url = new URL(baseUrl);
  url.searchParams.set("monitor_nonce", `${Date.now()}-${attempt}-${crypto.randomUUID()}`);
  return url.toString();
}

async function fetchFreshText(
  baseUrl: string,
  fetcher: FetchLike,
): Promise<FetchTextResult> {
  const started = Date.now();
  let lastStatus: number | undefined;
  let lastError = "request failed";
  let attempts = 0;
  let retryAfterMs: number | undefined;

  // One request per endpoint per check. Persistent coordinator handles backoff.
  for (const attempt of [1]) {
    attempts = attempt;
    let response: Response | undefined;
    try {
      response = await fetcher(freshUrl(baseUrl, attempt), {
        method: "GET",
        headers: {
          Accept: baseUrl.endsWith(".js") ? "application/json" : "text/html",
          "Cache-Control": "no-cache, no-store, max-age=0",
          Pragma: "no-cache",
          "User-Agent": "BlizzardForeverStockMonitor/1.0 (availability-check; no-purchase)",
        },
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      lastStatus = response.status;
      const rawRetry = response.headers.get("retry-after");
      if (rawRetry) {
        const parsed = /^\d+(?:\.\d+)?$/.test(rawRetry.trim())
          ? Number(rawRetry) * 1000 : Date.parse(rawRetry) - Date.now();
        if (Number.isFinite(parsed) && parsed > 0) retryAfterMs = parsed;
      }
      if (response.ok) {
        return {
          text: await response.text(),
          evidence: {
            url: baseUrl,
            httpStatus: response.status,
            attempts: attempt,
            elapsedMs: Date.now() - started,
            ...(response.headers.get("date")
              ? { responseDate: response.headers.get("date")! }
              : {}),
          },
        };
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.name : "network error";
    }

  }

  throw new FetchFailure(lastError, {
    url: baseUrl,
    ...(lastStatus === undefined ? {} : { httpStatus: lastStatus }),
    attempts,
    elapsedMs: Date.now() - started,
    error: lastError,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
}

class FetchFailure extends Error {
  constructor(message: string, readonly evidence: EndpointEvidence) {
    super(message);
  }
}

function attr(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(
    new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function hasAttr(tag: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s*=|\\s|>)`, "i").test(tag);
}

function decodeText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function inspectPurchaseButton(html: string): ButtonEvidence {
  const forms = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)]
    .map((match) => match[0])
    .filter((form) => {
      const opening = form.match(/^<form\b[^>]*>/i)?.[0] ?? "";
      if (attr(opening, "data-type") !== "add-to-cart-form") return false;
      const inputs = [...form.matchAll(/<input\b[^>]*>/gi)].map((match) => match[0]);
      const productId = inputs.find((tag) => attr(tag, "name") === "product-id");
      const variantId = inputs.find((tag) => attr(tag, "name") === "id");
      return attr(productId ?? "", "value") === PRODUCT.productId
        && attr(variantId ?? "", "value") === PRODUCT.variantId;
    });

  if (forms.length === 0) {
    return {
      matchingForms: 0,
      state: "missing",
      labels: [],
      variantInputDisabled: [],
      buttonDisabled: [],
    };
  }

  const candidates = forms.map((form) => {
    const inputs = [...form.matchAll(/<input\b[^>]*>/gi)].map((match) => match[0]);
    const variantInput = inputs.find((tag) => attr(tag, "name") === "id") ?? "";
    const buttonMatch = [...form.matchAll(/(<button\b[^>]*>)([\s\S]*?)<\/button>/gi)]
      .find((match) => attr(match[1] ?? "", "name") === "add");
    const buttonTag = buttonMatch?.[1] ?? "";
    const label = decodeText(buttonMatch?.[2] ?? "");
    const variantDisabled = hasAttr(variantInput, "disabled");
    const buttonDisabled = !buttonMatch || hasAttr(buttonTag, "disabled")
      || attr(buttonTag, "aria-disabled") === "true";
    const labelIsPurchase = PURCHASE_LABEL.test(label) && !UNAVAILABLE_LABEL.test(label);
    return {
      label,
      variantDisabled,
      buttonDisabled,
      enabled: labelIsPurchase && !variantDisabled && !buttonDisabled,
      disabled: Boolean(buttonMatch) && (variantDisabled || buttonDisabled)
        && (labelIsPurchase || UNAVAILABLE_LABEL.test(label)),
    };
  });

  const allEnabled = candidates.every((candidate) => candidate.enabled);
  const allDisabled = candidates.every((candidate) => candidate.disabled);
  return {
    matchingForms: forms.length,
    state: allEnabled ? "enabled" : allDisabled ? "disabled" : "conflict",
    labels: candidates.map((candidate) => candidate.label),
    variantInputDisabled: candidates.map((candidate) => candidate.variantDisabled),
    buttonDisabled: candidates.map((candidate) => candidate.buttonDisabled),
  };
}

function formatPrice(cents: unknown): string | undefined {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return undefined;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function combineEvidence(feedText: string | undefined, pageHtml: string | undefined, checkedAt: string): StockResult {
  const reasons: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(feedText ?? "");
  } catch {
    reasons.push("product feed was not valid JSON");
  }

  const product = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : undefined;
  const productId = product?.id === undefined ? undefined : String(product.id);
  const productName = typeof product?.title === "string" ? product.title : undefined;
  const handle = typeof product?.handle === "string" ? product.handle : undefined;
  const variants = Array.isArray(product?.variants)
    ? product.variants.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
    : [];
  const matchingVariants = variants.filter((variant) =>
    String(variant.id) === PRODUCT.variantId && variant.sku === PRODUCT.sku,
  );
  const variant = matchingVariants[0];
  const variantId = variant?.id === undefined ? undefined : String(variant.id);
  const sku = typeof variant?.sku === "string" ? variant.sku : undefined;
  const inventoryAvailable = typeof variant?.available === "boolean" ? variant.available : undefined;
  const button = inspectPurchaseButton(pageHtml ?? "");

  if (productId !== PRODUCT.productId) reasons.push("product ID mismatch");
  if (handle !== PRODUCT.handle) reasons.push("product handle mismatch");
  if (productName !== PRODUCT.name) reasons.push("product name mismatch");
  if (matchingVariants.length !== 1) reasons.push("expected exactly one matching variant ID and SKU");
  if (inventoryAvailable === undefined) reasons.push("inventory availability was missing or invalid");
  if (button.state === "missing") reasons.push("matching add-to-cart form was not found");
  if (button.state === "conflict") reasons.push("purchase button signals conflicted");

  const identityValid = productId === PRODUCT.productId && handle === PRODUCT.handle
    && productName === PRODUCT.name && matchingVariants.length === 1;
  const feedValid = identityValid && inventoryAvailable !== undefined;
  const buttonValid = button.state === "enabled" || button.state === "disabled";
  const positiveSignals: Array<"inventory" | "purchase-button"> = [];
  if (feedValid && inventoryAvailable) positiveSignals.push("inventory");
  if (button.state === "enabled") positiveSignals.push("purchase-button");
  let status: StockResult["status"] = "unknown";
  if (positiveSignals.length > 0) {
    status = "available";
  } else if (feedValid && inventoryAvailable === false && button.state === "disabled") {
    status = "unavailable";
  }
  if (feedValid && buttonValid && inventoryAvailable !== (button.state === "enabled")) {
    reasons.push("inventory and purchase button disagreed");
  }

  return {
    status,
    checkedAt,
    evidence: {
      alertRule: "any-positive",
      positiveSignals,
      checksHealthy: feedValid && buttonValid,
      ...(productId ? { productId } : {}),
      ...(variantId ? { variantId } : {}),
      ...(sku ? { sku } : {}),
      ...(productName ? { productName } : {}),
      ...(identityValid && formatPrice(variant?.price) ? { price: formatPrice(variant?.price)! } : {}),
      ...(feedValid ? { inventoryAvailable } : {}),
      button,
      productFeed: { url: `${PRODUCT.url}.js`, attempts: 0, elapsedMs: 0 },
      productPage: { url: PRODUCT.url, attempts: 0, elapsedMs: 0 },
      reasons,
    },
  };
}

export async function checkAvailability(
  fetcher: FetchLike = fetch,
  now: Date = new Date(),
): Promise<StockResult> {
  const checkedAt = now.toISOString();
  const [feed, page] = await Promise.allSettled([
    fetchFreshText(`${PRODUCT.url}.js`, fetcher),
    fetchFreshText(PRODUCT.url, fetcher),
  ]);

  const result = combineEvidence(
    feed.status === "fulfilled" ? feed.value.text : undefined,
    page.status === "fulfilled" ? page.value.text : undefined,
    checkedAt,
  );
  const feedEvidence = feed.status === "fulfilled"
      ? feed.value.evidence
      : feed.reason instanceof FetchFailure
        ? feed.reason.evidence
        : { url: `${PRODUCT.url}.js`, attempts: 1, elapsedMs: 0, error: "unexpected fetch failure" };
  const pageEvidence = page.status === "fulfilled"
      ? page.value.evidence
      : page.reason instanceof FetchFailure
        ? page.reason.evidence
        : { url: PRODUCT.url, attempts: 1, elapsedMs: 0, error: "unexpected fetch failure" };
  result.evidence.productFeed = feedEvidence;
  result.evidence.productPage = pageEvidence;
  if (feed.status === "rejected" || page.status === "rejected") {
    result.evidence.reasons.push("one or more fresh source checks failed");
  }
  return result;
}
