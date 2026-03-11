import { HttpError } from "../util/http.js";

export const LITE_SERVER_ONLY_ROUTE_GROUPS = {
  admin_control: {
    prefixes: ["/v1/admin/control", "/v1/admin/control/*"],
    reason: "multi-tenant control plane remains server-only",
  },
  automations: {
    prefixes: ["/v1/automations", "/v1/automations/*"],
    reason: "automation orchestration remains server-only in lite phase 1",
  },
} as const;

export function buildLiteRouteMatrix() {
  return {
    kernel_required_routes: [
      "memory-write",
      "memory-recall",
      "memory-context-runtime",
      "memory-access-partial",
      "memory-replay-core",
      "memory-feedback-tools",
    ],
    optional_routes: ["memory-sandbox", "memory-replay-governed-partial"],
    server_only_route_groups: Object.entries(LITE_SERVER_ONLY_ROUTE_GROUPS).map(([group, value]) => ({
      group,
      prefixes: value.prefixes,
      reason: value.reason,
    })),
  };
}

export function registerLiteServerOnlyRoutes(app: any) {
  const handler = async (req: any) => {
    const path = String(req.routerPath ?? req.routeOptions?.url ?? req.url ?? "");
    const matchedGroup = Object.entries(LITE_SERVER_ONLY_ROUTE_GROUPS).find(([, value]) =>
      value.prefixes.some((prefix) => {
        const normalized = prefix.endsWith("/*") ? prefix.slice(0, -2) : prefix;
        return path === normalized || path.startsWith(`${normalized}/`);
      }),
    );
    const group = matchedGroup?.[0] ?? "server_only";
    const reason = matchedGroup?.[1].reason ?? "server-only route is unavailable in lite edition";
    throw new HttpError(501, "server_only_in_lite", reason, {
      edition: "lite",
      route_group: group,
      route: path,
      fallback_applied: false,
    });
  };

  for (const { prefixes } of Object.values(LITE_SERVER_ONLY_ROUTE_GROUPS)) {
    for (const prefix of prefixes) {
      app.all(prefix, handler);
    }
  }
}
