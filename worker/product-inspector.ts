export type ProductTitleCandidate = {
  value: string;
  source: string;
};

export type ProductImageCandidate = {
  url: string;
  source: string;
  label?: string;
};

export type ProductPriceCandidate = {
  amount: string;
  currency: string;
  priceCents: number | null;
  source: string;
  label: string;
};

export type ProductInspection = {
  requestedUrl: string;
  finalUrl: string;
  retailer: string;
  titles: ProductTitleCandidate[];
  images: ProductImageCandidate[];
  prices: ProductPriceCandidate[];
  warning?: string;
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const maximumHtmlBytes = 1_500_000;
const maximumRedirects = 3;
const blockedHostnameSuffixes = [
  ".internal",
  ".invalid",
  ".lan",
  ".local",
  ".localhost",
  ".onion",
  ".test",
];

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return named[code.toLowerCase()] ?? entity;
  });
}

function cleanText(value: unknown) {
  return typeof value === "string"
    ? decodeHtml(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

function parseAttributes(tag: string) {
  const attributes: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "").trim();
  }
  return attributes;
}

function validateRetailerUrl(value: string, base?: URL) {
  let url: URL;
  try {
    url = base ? new URL(value, base) : new URL(value);
  } catch {
    throw new Error("Enter a valid retailer link");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Retailer links must use HTTP or HTTPS");
  }
  if (url.username || url.password) throw new Error("Retailer links cannot include credentials");
  if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) {
    throw new Error("Retailer links must use a standard web port");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const looksLikeIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
  if (
    hostname === "localhost"
    || !hostname.includes(".")
    || hostname.includes(":")
    || looksLikeIpv4
    || blockedHostnameSuffixes.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new Error("That retailer address cannot be inspected");
  }

  url.hash = "";
  return url;
}

async function fetchHtml(startUrl: URL, fetcher: Fetcher) {
  let currentUrl = startUrl;
  for (let redirectCount = 0; redirectCount <= maximumRedirects; redirectCount += 1) {
    const response = await fetcher(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9",
        "User-Agent": "TengenGiftList/1.0 (+https://tengen.me/gifts)",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The retailer returned an incomplete redirect");
      if (redirectCount === maximumRedirects) throw new Error("The retailer redirected too many times");
      currentUrl = validateRetailerUrl(location, currentUrl);
      continue;
    }
    if (!response.ok) throw new Error(`The retailer returned ${response.status}`);

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error("That link did not return a product page");
    }
    if (!response.body) return { html: "", finalUrl: currentUrl };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let html = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (total > maximumHtmlBytes) {
        await reader.cancel();
        return { html, finalUrl: currentUrl };
      }
    }
    html += decoder.decode();
    return { html, finalUrl: currentUrl };
  }
  throw new Error("The retailer redirected too many times");
}

function resolveImage(value: unknown, base: URL) {
  const source = typeof value === "string" ? value.trim() : "";
  if (!source || source.includes("${") || source.includes("{{") || source.startsWith("data:") || source.startsWith("blob:")) return null;
  try {
    const url = new URL(source, base);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function imageFingerprint(value: string) {
  const url = new URL(value);
  for (const parameter of ["height", "quality", "width"]) url.searchParams.delete(parameter);
  url.pathname = url.pathname
    .replace(/_(?:\d+x\d+|\d+x|x\d+)(?=\.[a-z0-9]+$)/i, "")
    .replace(/\._[A-Z0-9_,]+_\.(?=[a-z0-9]+$)/i, ".");
  return url.toString();
}

function parsePrice(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return null;
  return {
    amount: amount.toFixed(2),
    priceCents: Math.round(amount * 100),
  };
}

function productTypes(value: unknown) {
  const types = Array.isArray(value) ? value : [value];
  return types.some((type) => typeof type === "string" && type.toLowerCase().split(/[/#:]/).pop() === "product");
}

function objectValues(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function extractProductMetadata(html: string, requestedUrl: URL, finalUrl = requestedUrl): ProductInspection {
  const titles: ProductTitleCandidate[] = [];
  const images: ProductImageCandidate[] = [];
  const prices: ProductPriceCandidate[] = [];
  const titleKeys = new Set<string>();
  const imageKeys = new Set<string>();
  const priceKeys = new Set<string>();

  const addTitle = (value: unknown, source: string) => {
    const title = cleanText(value).slice(0, 300);
    const key = title.toLowerCase();
    if (!title || titleKeys.has(key) || titles.length >= 8) return;
    titleKeys.add(key);
    titles.push({ value: title, source });
  };
  const addImage = (value: unknown, source: string, label?: string) => {
    const imageUrl = resolveImage(value, finalUrl);
    const cleanLabel = cleanText(label).slice(0, 120);
    if (!imageUrl || /^(new|sale)$/i.test(cleanLabel) || images.length >= 12) return;
    const fingerprint = imageFingerprint(imageUrl);
    if (imageKeys.has(fingerprint)) return;
    imageKeys.add(fingerprint);
    images.push({ url: imageUrl, source, ...(cleanLabel ? { label: cleanLabel } : {}) });
  };
  const addPrice = (value: unknown, currencyValue: unknown, source: string, label?: string) => {
    const parsed = parsePrice(value);
    if (!parsed || prices.length >= 10) return;
    const rawValue = String(value);
    const inferredCurrency = rawValue.includes("€") ? "EUR" : rawValue.includes("£") ? "GBP" : "USD";
    const currency = (cleanText(currencyValue) || inferredCurrency).toUpperCase().slice(0, 8);
    const key = `${currency}:${parsed.amount}`;
    if (priceKeys.has(key)) return;
    priceKeys.add(key);
    prices.push({ ...parsed, currency, source, label: cleanText(label) || source });
  };

  for (const script of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try {
      const data: unknown = JSON.parse(decodeHtml(script[1]).trim());
      const visit = (value: unknown) => {
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        const object = objectValues(value);
        if (!object) return;
        if (productTypes(object["@type"])) {
          addTitle(object.name, "Product data");
          const productImages = Array.isArray(object.image) ? object.image : [object.image];
          for (const image of productImages) {
            const imageObject = objectValues(image);
            addImage(imageObject?.url ?? imageObject?.contentUrl ?? image, "Product data", object.name as string | undefined);
          }
          const offers = Array.isArray(object.offers) ? object.offers : [object.offers];
          for (const offerValue of offers) {
            const offer = objectValues(offerValue);
            if (!offer) continue;
            const currency = offer.priceCurrency ?? object.priceCurrency;
            addPrice(offer.price, currency, "Product offer", offer.name as string | undefined);
            addPrice(offer.lowPrice, currency, "Offer range", "Low price");
            addPrice(offer.highPrice, currency, "Offer range", "High price");
            const specification = objectValues(offer.priceSpecification);
            if (specification) addPrice(specification.price, specification.priceCurrency ?? currency, "Price specification");
          }
        }
        Object.values(object).forEach(visit);
      };
      visit(data);
    } catch {
      // Many storefronts include malformed JSON-LD. Other metadata may still be usable.
    }
  }

  const metaValues = new Map<string, string[]>();
  for (const meta of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseAttributes(meta[0]);
    const key = (attributes.property || attributes.name || attributes.itemprop || "").toLowerCase();
    const value = attributes.content || attributes.value;
    if (!key || !value) continue;
    metaValues.set(key, [...(metaValues.get(key) ?? []), value]);
  }
  const valuesFor = (...keys: string[]) => keys.flatMap((key) => metaValues.get(key) ?? []);
  valuesFor("og:title", "twitter:title", "name").forEach((value) => addTitle(value, "Page metadata"));
  valuesFor("og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src", "image")
    .forEach((value) => addImage(value, "Page metadata"));
  const metaCurrency = valuesFor("product:price:currency", "og:price:currency", "pricecurrency")[0];
  valuesFor("product:price:amount", "og:price:amount", "price").forEach((value) => addPrice(value, metaCurrency, "Page metadata"));

  for (const imageMatch of html.matchAll(/["'](?:hiRes|large)["']\s*:\s*["'](https?(?:\\\/|[^"'])+)["']/gi)) {
    addImage(imageMatch[1].replace(/\\\//g, "/").replace(/\\u0026/gi, "&"), "Product gallery");
  }

  for (const priceMatch of html.matchAll(/<span\b[^>]*class\s*=\s*["'][^"']*(?:a-offscreen|price)[^"']*["'][^>]*>\s*([$€£]\s?[\d,]+(?:\.\d{2})?)\s*<\/span\s*>/gi)) {
    if (parsePrice(priceMatch[1])?.priceCents) addPrice(priceMatch[1], undefined, "Displayed price");
  }

  const productHeading = html.match(/<(?:span|h1)\b[^>]*(?:id\s*=\s*["']productTitle["']|itemprop\s*=\s*["']name["'])[^>]*>([\s\S]*?)<\/(?:span|h1)\s*>/i);
  if (productHeading) addTitle(productHeading[1], "Product heading");

  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  if (titleMatch) addTitle(titleMatch[1], "Page title");

  for (const image of html.matchAll(/<img\b[^>]*>/gi)) {
    const attributes = parseAttributes(image[0]);
    const context = `${attributes.id ?? ""} ${attributes.class ?? ""} ${attributes.itemprop ?? ""} ${attributes.alt ?? ""}`.toLowerCase();
    if (!/(product|gallery|hero|main|primary|zoom|pdp)/.test(context)) continue;
    if (/(logo|icon|sprite|swatch|spinner|placeholder|avatar)/.test(context)) continue;
    let source = attributes.src || attributes["data-src"] || attributes["data-original"];
    if (!source && attributes.srcset) source = attributes.srcset.split(",").at(-1)?.trim().split(/\s+/)[0];
    addImage(source, "Product gallery", attributes.alt);
  }

  const warning = titles.length || images.length || prices.length
    ? undefined
    : "The retailer did not expose product details. You can still enter them manually.";

  return {
    requestedUrl: requestedUrl.toString(),
    finalUrl: finalUrl.toString(),
    retailer: finalUrl.hostname.replace(/^www\./, ""),
    titles,
    images,
    prices,
    ...(warning ? { warning } : {}),
  };
}

export async function inspectProductPage(value: string, fetcher: Fetcher = fetch) {
  const requestedUrl = validateRetailerUrl(value);
  const { html, finalUrl } = await fetchHtml(requestedUrl, fetcher);
  return extractProductMetadata(html, requestedUrl, finalUrl);
}
