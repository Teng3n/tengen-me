import type { StockResult } from "./types";

// The two rows describe the observation, not whether checkout will succeed.
export function stockMessage(result: StockResult, reminder = false): { title: string; body: string } {
  const { inventoryAvailable, button } = result.evidence;
  const both = inventoryAvailable === true && button?.state === "enabled";
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit",
    second: "2-digit", timeZoneName: "short",
  }).format(new Date(result.checkedAt));
  const inventory = inventoryAvailable === true ? "🟢 Inventory: Yes"
    : inventoryAvailable === false ? "🔴 Inventory: No" : "🟡 Inventory: Unknown";
  const purchaseButton = button?.state === "enabled" ? "🟢 Button: Enabled"
    : button?.state === "disabled" ? "🔴 Button: Disabled" : "🟡 Button: Unknown";
  return {
    title: `${both ? "Stock available" : "Possible stock"}${reminder ? " reminder" : ""}`,
    body: `Warcraft Forever Edition · ${time}\n${inventory}\n${purchaseButton}`,
  };
}
