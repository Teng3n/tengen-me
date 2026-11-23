import { expect, it, vi } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types";
function fixture() {
  const forward = vi.fn().mockResolvedValue(Response.json({ status: "simulation_sent" }));
  return { forward, env: { ADMIN_TOKEN: "test-admin", HELPER_TOKEN: "a".repeat(64), DB: {},
    CHECKER: { idFromName: () => "id", get: () => ({ fetch: forward }) } } as unknown as Env };
}
it("checkout simulation rejects missing/admin-invalid authentication including receiver-only key", async () => {
  const f = fixture();
  for (const token of ["", "a".repeat(64)]) {
    const response = await worker.fetch(new Request("https://monitor/helper-checkout-test", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "X-Checkout-Test-Confirm": "OPEN_ONE_COPY_NO_PAYMENT" },
    }), f.env);
    expect(response.status).toBe(401);
  }
  expect(f.forward).not.toHaveBeenCalled();
});
it("checkout simulation requires explicit confirmation header", async () => {
  const f = fixture();
  const response = await worker.fetch(new Request("https://monitor/helper-checkout-test", {
    method: "POST", headers: { Authorization: "Bearer test-admin" },
  }), f.env);
  expect(response.status).toBe(400); expect(f.forward).not.toHaveBeenCalled();
});
it("confirmed admin simulation forwards only the test ID to coordinator", async () => {
  const f = fixture(); const id = "b".repeat(32);
  await worker.fetch(new Request("https://monitor/helper-checkout-test", { method: "POST", headers: {
    Authorization: "Bearer test-admin", "X-Checkout-Test-Confirm": "OPEN_ONE_COPY_NO_PAYMENT", "X-Checkout-Test-Id": id,
  } }), f.env);
  expect(f.forward).toHaveBeenCalledWith("https://checker/helper-checkout-test", {
    method: "POST", headers: { "X-Checkout-Test-Id": id },
  });
});
