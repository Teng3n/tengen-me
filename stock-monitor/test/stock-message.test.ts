import { expect, it } from "vitest";
import { stockMessage } from "../src/stock-message";
import type { StockResult, ButtonEvidence } from "../src/types";

function observation(inventory: boolean | undefined, button: ButtonEvidence["state"]): StockResult {
  return { status: "available", checkedAt: "2026-09-17T20:04:14.487Z", evidence: {
    ...(inventory === undefined ? {} : { inventoryAvailable: inventory }), price: "$150.00",
    button: { state: button, matchingForms: 1, labels: [], buttonDisabled: [], variantInputDisabled: [] },
    productFeed: { url: "feed", attempts: 1, elapsedMs: 0 },
    productPage: { url: "page", attempts: 1, elapsedMs: 0 }, reasons: [],
  } };
}

it("renders a compact button-only alert with a short Pacific check time", () => {
  expect(stockMessage(observation(false, "enabled"))).toEqual({
    title: "Possible stock",
    body: "Warcraft Forever Edition · 1:04:14 PM PDT\n🔴 Inventory: No\n🟢 Button: Enabled",
  });
});
it("labels inventory-only signals without calling the disabled button positive", () => {
  expect(stockMessage(observation(true, "disabled"), true)).toEqual({
    title: "Possible stock reminder",
    body: "Warcraft Forever Edition · 1:04:14 PM PDT\n🟢 Inventory: Yes\n🔴 Button: Disabled",
  });
});
it("uses the available heading only when both signals agree", () => {
  expect(stockMessage(observation(true, "enabled"), true).title).toBe("Stock available reminder");
});
it.each(["missing", "conflict"] as const)("does not label %s button evidence as a negative", (button) => {
  expect(stockMessage(observation(true, button)).body).toContain("🟡 Button: Unknown");
});
it("does not label invalid or failed inventory as a negative", () => {
  expect(stockMessage(observation(undefined, "enabled")).body).toContain("🟡 Inventory: Unknown");
});
