import type { FastifyInstance, FastifyRequest } from "fastify";
import { buildLiteUnsupportedDetails, HttpError } from "../util/http.js";

export const LITE_SERVER_ONLY_ROUTE_GROUPS = {
  admin_control: {
    prefixes: ["/v1/admin/control", "/v1/admin/control/*"],
    reason: "admin control routes are unavailable in lite edition",
  },
  memory_lifecycle: {
    prefixes: [
      "/v1/memory/archive/rehydrate",
      "/v1/memory/archive/rehydrate/*",
      "/v1/memory/nodes/activate",
      "/v1/memory/nodes/activate/*",
    ],
    reason: "memory lifecycle routes are unavailable in lite edition",
  },
} as const;

export function buildLiteRouteMatrix() {
  return {
    kernel_required_routes: [
      "memory-write",
      "memory-context-runtime",
      "memory-access-partial",
      "memory-feedback-tools",
    ],
    optional_routes: ["memory-replay-governed-partial"],
    server_only_route_groups: Object.entries(LITE_SERVER_ONLY_ROUTE_GROUPS).map(([group, value]) => ({
      group,
      prefixes: value.prefixes,
      reason: value.reason,
    })),
  };
}

export function registerLiteServerOnlyRoutes(app: FastifyInstance) {
  const handler = async (req: FastifyRequest) => {
    const path = String(req.url ?? req.routeOptions?.url ?? "");
    const matchedGroup = Object.entries(LITE_SERVER_ONLY_ROUTE_GROUPS).find(([, value]) =>
      value.prefixes.some((prefix) => {
        const normalized = prefix.endsWith("/*") ? prefix.slice(0, -2) : prefix;
        return path === normalized || path.startsWith(`${normalized}/`);
      }),
    );
    const group = matchedGroup?.[0] ?? "server_only";
    const reason = matchedGroup?.[1].reason ?? "route is unavailable in lite edition";
    throw new HttpError(501, "server_only_in_lite", reason, {
      ...buildLiteUnsupportedDetails({
        route: path,
        surface: "server_only_route_group",
        routeGroup: group,
        reason,
      }),
      fallback_applied: false,
    });
  };

  for (const { prefixes } of Object.values(LITE_SERVER_ONLY_ROUTE_GROUPS)) {
    for (const prefix of prefixes) {
      app.all(prefix, handler);
    }
  }
}
