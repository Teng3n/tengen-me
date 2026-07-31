/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { authenticateOwnerRequest } from "./access-auth";
import {
  handleBridgeActionComplete,
  handleBridgeNextAction,
  handleChecklistUpdate,
  handleOwnerActionCreate,
  handleOwnerDashboardGet,
} from "./owner-dashboard-api";
import type { OwnerDatabase } from "./owner-data";
import {
  handleServerStatusGet,
  handleServerStatusIngest,
  isAuthorizedBridgeRequest,
  type StatusKV,
} from "./server-status-api";

interface Env {
  ASSETS: Fetcher;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  STATUS_KV?: StatusKV;
  OWNER_DB?: OwnerDatabase;
  PALWORLD_BRIDGE_TOKEN?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/admin/api/")) {
      const access = await authenticateOwnerRequest(request, env);
      if (!access.ok) {
        return Response.json({ error: access.message }, {
          status: access.status,
          headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" },
        });
      }

      if (url.pathname === "/admin/api/dashboard" && request.method === "GET") {
        return handleOwnerDashboardGet(env, access.identity);
      }
      if (url.pathname === "/admin/api/actions" && request.method === "POST") {
        return handleOwnerActionCreate(request, env, access.identity);
      }
      const checklistMatch = url.pathname.match(/^\/admin\/api\/checklist\/([a-z0-9-]+)$/);
      if (checklistMatch && request.method === "PATCH") {
        return handleChecklistUpdate(request, env, access.identity, checklistMatch[1]);
      }
      return new Response("Not found", { status: 404 });
    }

    if (url.pathname === "/api/server-status/actions/next" && request.method === "GET") {
      if (!isAuthorizedBridgeRequest(request, env)) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
      }
      return handleBridgeNextAction(env);
    }

    const actionCompleteMatch = url.pathname.match(/^\/api\/server-status\/actions\/([0-9a-f-]+)\/complete$/);
    if (actionCompleteMatch && request.method === "POST") {
      if (!isAuthorizedBridgeRequest(request, env)) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
      }
      return handleBridgeActionComplete(request, env, actionCompleteMatch[1]);
    }

    if (url.pathname === "/api/server-status" && request.method === "GET") {
      return handleServerStatusGet(env);
    }

    if (url.pathname === "/api/server-status/ingest" && request.method === "POST") {
      return handleServerStatusIngest(request, env);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
