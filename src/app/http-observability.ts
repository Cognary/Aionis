import type { Env } from "../config.js";

type CorsPolicy = {
  allow_origins: string[];
  allow_methods: string;
  allow_headers: string;
  expose_headers: string;
};

type TelemetryEndpoint = "write" | "recall" | "recall_text" | "planning_context" | "context_assemble";
type ContextAssemblyEndpoint = "planning_context" | "context_assemble";

type ContextAssemblyLayerTelemetryRow = {
  layer_name: "facts" | "episodes" | "rules" | "decisions" | "tools" | "citations";
  source_count: number;
  kept_count: number;
  dropped_count: number;
  budget_chars: number;
  used_chars: number;
  max_items: number;
};

function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function routePath(req: any): string {
  const raw = String(req?.routeOptions?.url ?? req?.routerPath ?? req?.url ?? "");
  return raw.split("?")[0] ?? raw;
}

function requestHeader(req: any, name: string): string | null {
  const raw = req?.headers?.[name];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string") return raw[0];
  return null;
}

function parseNonNegativeNumber(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

function collectLayeredContextTelemetryRows(layeredContext: any): ContextAssemblyLayerTelemetryRow[] {
  if (!layeredContext || typeof layeredContext !== "object") return [];
  const layers = layeredContext.layers;
  if (!layers || typeof layers !== "object" || Array.isArray(layers)) return [];
  const validLayers = ["facts", "episodes", "rules", "decisions", "tools", "citations"] as const;
  const out: ContextAssemblyLayerTelemetryRow[] = [];
  for (const layerName of validLayers) {
    const layer = (layers as any)[layerName];
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) continue;
    out.push({
      layer_name: layerName,
      source_count: parseNonNegativeNumber(layer.source_count),
      kept_count: parseNonNegativeNumber(layer.kept_count),
      dropped_count: parseNonNegativeNumber(layer.dropped_count),
      budget_chars: parseNonNegativeNumber(layer.budget_chars),
      used_chars: parseNonNegativeNumber(layer.used_chars),
      max_items: parseNonNegativeNumber(layer.max_items),
    });
  }
  return out;
}

export function createHttpObservabilityHelpers(args: {
  env: Env;
  db: any;
  recordMemoryContextAssemblyTelemetry: (db: any, row: any) => Promise<void>;
}) {
  const { env, db, recordMemoryContextAssemblyTelemetry } = args;

  const corsMemoryAllowOrigins = parseCorsOrigins(process.env.CORS_ALLOW_ORIGINS ?? (env.APP_ENV === "prod" ? "" : "*"));
  const corsAdminAllowOrigins = parseCorsOrigins(process.env.CORS_ADMIN_ALLOW_ORIGINS ?? "");
  const corsMemoryAllowHeaders = "content-type,x-api-key,x-tenant-id,authorization,x-request-id";
  const corsMemoryAllowMethods = "GET,POST,OPTIONS";
  const corsAdminAllowHeaders = "content-type,authorization,x-admin-token,x-request-id";
  const corsAdminAllowMethods = "GET,POST,PUT,DELETE,OPTIONS";
  const corsAdminRouteMethods = new Set(["GET", "POST", "PUT", "DELETE"]);

  const telemetryMemoryRouteToEndpoint = new Map<string, TelemetryEndpoint>([
    ["/v1/memory/write", "write"],
    ["/v1/memory/sessions", "write"],
    ["/v1/memory/events", "write"],
    ["/v1/memory/packs/import", "write"],
    ["/v1/handoff/store", "write"],
    ["/v1/memory/find", "recall"],
    ["/v1/memory/packs/export", "recall"],
    ["/v1/memory/recall", "recall"],
    ["/v1/memory/recall_text", "recall_text"],
    ["/v1/handoff/recover", "recall"],
    ["/v1/memory/planning/context", "planning_context"],
    ["/v1/memory/context/assemble", "context_assemble"],
    ["/v1/memory/tools/decision", "recall"],
    ["/v1/memory/replay/run/start", "write"],
    ["/v1/memory/replay/step/before", "write"],
    ["/v1/memory/replay/step/after", "write"],
    ["/v1/memory/replay/run/end", "write"],
    ["/v1/memory/replay/runs/get", "recall"],
    ["/v1/memory/replay/playbooks/compile_from_run", "write"],
    ["/v1/memory/replay/playbooks/get", "recall"],
    ["/v1/memory/replay/playbooks/candidate", "recall"],
    ["/v1/memory/replay/playbooks/promote", "write"],
    ["/v1/memory/replay/playbooks/repair", "write"],
    ["/v1/memory/replay/playbooks/repair/review", "write"],
    ["/v1/memory/replay/playbooks/run", "recall"],
    ["/v1/memory/replay/playbooks/dispatch", "write"],
  ]);

  function resolveCorsAllowOrigin(origin: string | null, allowOrigins: string[]): string | null {
    if (allowOrigins.includes("*")) return "*";
    if (!origin) return null;
    return allowOrigins.includes(origin) ? origin : null;
  }

  function resolveCorsPolicy(req: any): CorsPolicy | null {
    const path = routePath(req);
    const method = String(req?.method ?? "").toUpperCase();
    const preflightMethod = String(requestHeader(req, "access-control-request-method") ?? "").trim().toUpperCase();

    if (path.startsWith("/v1/memory/") || path.startsWith("/v1/handoff/")) {
      const isMemoryCorsMethod = method === "POST" || (method === "OPTIONS" && preflightMethod === "POST");
      if (!isMemoryCorsMethod) return null;
      return {
        allow_origins: corsMemoryAllowOrigins,
        allow_methods: corsMemoryAllowMethods,
        allow_headers: corsMemoryAllowHeaders,
        expose_headers: "x-request-id",
      };
    }

    if (path.startsWith("/v1/admin/")) {
      if (corsAdminAllowOrigins.length === 0) return null;
      const isAdminCorsMethod = corsAdminRouteMethods.has(method);
      const isAdminPreflight = method === "OPTIONS" && corsAdminRouteMethods.has(preflightMethod);
      if (!isAdminCorsMethod && !isAdminPreflight) return null;
      return {
        allow_origins: corsAdminAllowOrigins,
        allow_methods: corsAdminAllowMethods,
        allow_headers: corsAdminAllowHeaders,
        expose_headers: "x-request-id",
      };
    }

    return null;
  }

  function telemetryEndpointFromRequest(req: any): TelemetryEndpoint | null {
    if (String(req?.method ?? "").toUpperCase() !== "POST") return null;
    const p = routePath(req);
    return telemetryMemoryRouteToEndpoint.get(p) ?? null;
  }

  function resolveRequestScopeForTelemetry(req: any): string {
    if (typeof req?.aionis_scope === "string" && req.aionis_scope.trim().length > 0) return req.aionis_scope.trim();
    const body = req?.body;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const s = (body as any).scope;
      if (typeof s === "string" && s.trim().length > 0) return s.trim();
    }
    return env.MEMORY_SCOPE;
  }

  function resolveRequestTenantForTelemetry(req: any): string {
    if (typeof req?.aionis_tenant_id === "string" && req.aionis_tenant_id.trim().length > 0) return req.aionis_tenant_id.trim();
    const body = req?.body;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const t = (body as any).tenant_id;
      if (typeof t === "string" && t.trim().length > 0) return t.trim();
    }
    const headerTenant = typeof req?.headers?.["x-tenant-id"] === "string" ? String(req.headers["x-tenant-id"]).trim() : "";
    if (headerTenant) return headerTenant;
    return env.MEMORY_TENANT_ID;
  }

  function resolveRequestApiKeyPrefixForTelemetry(req: any): string | null {
    const tagged = (req as any)?.aionis_api_key_prefix;
    if (typeof tagged === "string" && tagged.trim().length > 0) return tagged.trim();
    return null;
  }

  async function recordContextAssemblyTelemetryBestEffort(args: {
    req: any;
    tenant_id: string;
    scope: string;
    endpoint: ContextAssemblyEndpoint;
    latency_ms: number;
    layered_output: boolean;
    layered_context: any;
    selected_memory_layers?: string[];
    selection_policy?: {
      name?: string | null;
      source?: string | null;
      trust_anchor_layers?: string[];
      requested_allowed_layers?: string[];
    } | null;
  }) {
    if (!db) return;
    const isLayeredOutput = args.layered_output === true;
    const layerRows = isLayeredOutput ? collectLayeredContextTelemetryRows(args.layered_context) : [];
    await recordMemoryContextAssemblyTelemetry(db, {
      tenant_id: args.tenant_id,
      scope: args.scope,
      endpoint: args.endpoint,
      layered_output: isLayeredOutput,
      latency_ms: parseNonNegativeNumber(args.latency_ms),
      request_id: String(args.req?.id ?? ""),
      total_budget_chars: isLayeredOutput ? parseNonNegativeNumber(args.layered_context?.budget?.total_chars) : 0,
      used_chars: isLayeredOutput ? parseNonNegativeNumber(args.layered_context?.budget?.used_chars) : 0,
      remaining_chars: isLayeredOutput ? parseNonNegativeNumber(args.layered_context?.budget?.remaining_chars) : 0,
      source_items: isLayeredOutput ? parseNonNegativeNumber(args.layered_context?.stats?.source_items) : 0,
      kept_items: isLayeredOutput ? parseNonNegativeNumber(args.layered_context?.stats?.kept_items) : 0,
      dropped_items: isLayeredOutput ? parseNonNegativeNumber(args.layered_context?.stats?.dropped_items) : 0,
      layers_with_content: isLayeredOutput ? parseNonNegativeNumber(args.layered_context?.stats?.layers_with_content) : 0,
      merge_trace_included: isLayeredOutput ? Array.isArray(args.layered_context?.merge_trace) : false,
      selection_policy_name:
        args.selection_policy && typeof args.selection_policy.name === "string" ? args.selection_policy.name : null,
      selection_policy_source:
        args.selection_policy && typeof args.selection_policy.source === "string" ? args.selection_policy.source : null,
      selected_memory_layers: Array.isArray(args.selected_memory_layers)
        ? args.selected_memory_layers.map((entry) => String(entry ?? "").trim()).filter(Boolean)
        : [],
      trust_anchor_layers:
        args.selection_policy && Array.isArray(args.selection_policy.trust_anchor_layers)
          ? args.selection_policy.trust_anchor_layers.map((entry) => String(entry ?? "").trim()).filter(Boolean)
          : [],
      requested_allowed_layers:
        args.selection_policy && Array.isArray(args.selection_policy.requested_allowed_layers)
          ? args.selection_policy.requested_allowed_layers.map((entry) => String(entry ?? "").trim()).filter(Boolean)
          : [],
      layers: layerRows,
    });
  }

  return {
    corsMemoryAllowOrigins,
    corsAdminAllowOrigins,
    resolveCorsAllowOrigin,
    resolveCorsPolicy,
    telemetryEndpointFromRequest,
    resolveRequestScopeForTelemetry,
    resolveRequestTenantForTelemetry,
    resolveRequestApiKeyPrefixForTelemetry,
    recordContextAssemblyTelemetryBestEffort,
  };
}
