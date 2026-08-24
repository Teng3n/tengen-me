import vinext from "vinext";
import { defineConfig } from "vite";

const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const cloudflareConfig = {
  name: "tengen-me",
  main: "./worker/index.ts",
  compatibility_date: "2026-05-15",
  compatibility_flags: ["nodejs_compat"],
  kv_namespaces: [
    {
      binding: "STATUS_KV",
      id: "3b824e89a8d64c0cbc900174cc7b0a56",
    },
  ],
  d1_databases: [
    {
      binding: "OWNER_DB",
      database_name: "tengen-me-owner",
      database_id: "8bbbf3fd-90f6-492e-9610-a091a1beaf4e",
    },
    {
      binding: "HOUSEHOLD_DB",
      database_name: "household-hub",
      database_id: "5321e9d2-d92a-4e93-84e9-198476be5b88",
    },
  ],
};

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: cloudflareConfig,
      }),
    ],
  };
});
