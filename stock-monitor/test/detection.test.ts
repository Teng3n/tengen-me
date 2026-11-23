import { describe, expect, it, vi } from "vitest";
import { checkAvailability, combineEvidence, inspectPurchaseButton } from "../src/detection";
import { PRODUCT } from "../src/types";

function feed(available: boolean): string {
  return JSON.stringify({
    id: Number(PRODUCT.productId),
    title: PRODUCT.name,
    handle: PRODUCT.handle,
    variants: [{
      id: Number(PRODUCT.variantId),
      sku: PRODUCT.sku,
      available,
      price: 15000,
    }],
  });
}

function page(options: { disabled: boolean; label?: string }): string {
  const disabled = options.disabled ? " disabled" : "";
  return `<!doctype html><form data-type="add-to-cart-form">
    <input type="hidden" name="id" value="${PRODUCT.variantId}"${disabled}>
    <button type="submit" name="add"${disabled}><span>${options.label ?? "Pre-order"}</span></button>
    <input type="hidden" name="product-id" value="${PRODUCT.productId}">
  </form>`;
}

describe("stock detection", () => {
  it("records both positive signals when both agree", () => {
    const result = combineEvidence(feed(true), page({ disabled: false }), "2026-09-14T12:00:00.000Z");
    expect(result.status).toBe("available");
    expect(result.evidence.price).toBe("$150.00");
    expect(result.evidence.button?.state).toBe("enabled");
    expect(result.evidence.positiveSignals).toEqual(["inventory", "purchase-button"]);
  });

  it("recognizes the current sold-out shape", () => {
    const result = combineEvidence(feed(false), page({ disabled: true }), "2026-09-14T12:00:00.000Z");
    expect(result.status).toBe("unavailable");
    expect(result.evidence.button?.state).toBe("disabled");
  });

  it("alerts on feed-only availability despite a disabled button", () => {
    const result = combineEvidence(feed(true), page({ disabled: true }), "2026-09-14T12:00:00.000Z");
    expect(result.status).toBe("available");
    expect(result.evidence.positiveSignals).toEqual(["inventory"]);
    expect(result.evidence.reasons).toContain("inventory and purchase button disagreed");
  });

  it("does not accept Notify Me as a purchase control", () => {
    expect(inspectPurchaseButton(page({ disabled: false, label: "Notify Me" })).state).toBe("conflict");
  });

  it("rejects a variant identity mismatch", () => {
    const wrong = JSON.parse(feed(true));
    wrong.variants[0].sku = "SOME-OTHER-SKU";
    expect(combineEvidence(JSON.stringify(wrong), page({ disabled: true }), "2026-09-14T12:00:00.000Z").status)
      .toBe("unknown");
  });

  it("accepts an independently matching enabled button when feed is negative or invalid", () => {
    for (const body of [feed(false), "not JSON", undefined, feed(true).replace(PRODUCT.handle, "wrong")]) {
      const result = combineEvidence(body, page({ disabled: false }), new Date().toISOString());
      expect(result.status).toBe("available");
      expect(result.evidence.positiveSignals).toEqual(["purchase-button"]);
    }
  });

  it("rejects wrong page variants, ambiguous forms, and non-purchase labels as positives", () => {
    for (const html of [page({ disabled: false }).replace(PRODUCT.variantId, "123"),
      page({ disabled: false }) + page({ disabled: true }),
      page({ disabled: false, label: "Notify Me" }), page({ disabled: false, label: "Sold Out" }), undefined]) {
      expect(combineEvidence(feed(false), html, new Date().toISOString()).status).toBe("unknown");
      expect(combineEvidence(feed(true), html, new Date().toISOString()).evidence.positiveSignals).toEqual(["inventory"]);
    }
  });

  it("does not treat duplicate matching feed variants as positive", () => {
    const wrong = JSON.parse(feed(true)); wrong.variants.push(wrong.variants[0]);
    expect(combineEvidence(JSON.stringify(wrong), page({ disabled: true }), new Date().toISOString()).status).toBe("unknown");
  });

  it.each(["feed", "page"])("preserves the other positive source when %s fails, without claiming health", async (failed) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const isFeed = new URL(String(url)).pathname.endsWith(".js");
      if (isFeed === (failed === "feed")) return new Response("blocked", { status: 429, headers: { "Retry-After": "600" } });
      return new Response(isFeed ? feed(true) : page({ disabled: false }));
    });
    const result = await checkAvailability(fetcher);
    expect(result.status).toBe("available");
    expect(result.evidence.checksHealthy).toBe(false);
    expect(result.evidence.positiveSignals).toEqual([failed === "feed" ? "purchase-button" : "inventory"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(failed === "feed" ? result.evidence.productFeed.retryAfterMs : result.evidence.productPage.retryAfterMs).toBe(600000);
  });

  it("does not rearm on one negative plus one failed source", async () => {
    const result = await checkAvailability(async (url) => new URL(String(url)).pathname.endsWith(".js")
      ? new Response(feed(false)) : new Response("", { status: 503 }));
    expect(result.status).toBe("unknown");
  });
});
