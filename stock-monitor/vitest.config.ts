import { defineConfig } from "vitest/config";

export default defineConfig({
  // Firefox helper suites use node:test / Playwright and run separately.
  test: { include: ["test/**/*.test.ts"] },
});
