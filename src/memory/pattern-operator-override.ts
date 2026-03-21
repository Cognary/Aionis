import type { LiteWriteStore } from "../store/lite-write-store.js";
import { HttpError } from "../util/http.js";
import {
  PatternOperatorOverrideSchema,
  PatternSuppressRequest,
  PatternSuppressResponseSchema,
  PatternUnsuppressRequest,
  type PatternOperatorOverride,
} from "./schemas.js";
import { resolveTenantScope } from "./tenant.js";
import { buildAionisUri } from "./uri.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const next = typeof value === "string" ? value.trim() : "";
    if (next) return next;
  }
  return null;
}

function buildOperatorOverride(args: {
  suppressed: boolean;
  reason: string | null;
  mode: "shadow_learn" | "hard_freeze";
  until: string | null;
  updatedAt: string;
  updatedBy: string | null;
  lastAction: "suppress" | "unsuppress";
}): PatternOperatorOverride {
  return PatternOperatorOverrideSchema.parse({
    schema_version: "operator_override_v1",
    suppressed: args.suppressed,
    reason: args.reason,
    mode: args.mode,
    until: args.until,
    updated_at: args.updatedAt,
    updated_by: args.updatedBy,
    last_action: args.lastAction,
  });
}

export function readPatternOperatorOverride(slots: Record<string, unknown>): PatternOperatorOverride | null {
  const parsed = PatternOperatorOverrideSchema.safeParse(slots.operator_override_v1);
  return parsed.success ? parsed.data : null;
}

export function isPatternSuppressed(override: PatternOperatorOverride | null, now = Date.now()): boolean {
  if (!override || override.suppressed !== true) return false;
  if (!override.until) return true;
  const untilMs = Date.parse(override.until);
  return Number.isFinite(untilMs) && untilMs > now;
}

function derivePatternIdentity(slots: Record<string, unknown>) {
  const execution = asRecord(slots.execution_native_v1);
  const anchor = asRecord(slots.anchor_v1);
  return {
    anchorKind: firstString(execution.anchor_kind, anchor.anchor_kind),
    selectedTool: firstString(execution.selected_tool, anchor.selected_tool),
    patternState: firstString(execution.pattern_state, anchor.pattern_state),
    credibilityState: firstString(execution.credibility_state, anchor.credibility_state, asRecord(execution.promotion ?? anchor.promotion).credibility_state),
  };
}

async function loadPatternAnchorNode(args: {
  liteWriteStore: Pick<LiteWriteStore, "findNodes">;
  scope: string;
  anchorId: string;
  actor: string | null;
}) {
  const { rows } = await args.liteWriteStore.findNodes({
    scope: args.scope,
    id: args.anchorId,
    consumerAgentId: args.actor,
    consumerTeamId: null,
    limit: 1,
    offset: 0,
  });
  const row = rows[0] ?? null;
  if (!row) {
    throw new HttpError(404, "pattern_anchor_not_found", "pattern anchor not found", {
      anchor_id: args.anchorId,
    });
  }
  const identity = derivePatternIdentity(asRecord(row.slots));
  if (row.type !== "concept" || identity.anchorKind !== "pattern") {
    throw new HttpError(400, "pattern_anchor_required", "target node is not a pattern anchor", {
      anchor_id: args.anchorId,
      node_type: row.type,
    });
  }
  return { row, identity };
}

async function updatePatternOperatorOverride(args: {
  liteWriteStore: Pick<LiteWriteStore, "findNodes" | "updateNodeAnchorState">;
  scope: string;
  tenantId: string;
  actor: string | null;
  anchorId: string;
  nextOverride: PatternOperatorOverride;
}) {
  const { row, identity } = await loadPatternAnchorNode({
    liteWriteStore: args.liteWriteStore,
    scope: args.scope,
    anchorId: args.anchorId,
    actor: args.actor,
  });
  const nextSlots = {
    ...asRecord(row.slots),
    operator_override_v1: args.nextOverride,
  };
  await args.liteWriteStore.updateNodeAnchorState({
    scope: args.scope,
    id: row.id,
    slots: nextSlots,
    textSummary: row.text_summary ?? "",
    salience: row.salience,
    importance: row.importance,
    confidence: row.confidence,
    commitId: row.commit_id ?? null,
  });
  return PatternSuppressResponseSchema.parse({
    tenant_id: args.tenantId,
    scope: args.scope,
    anchor_id: row.id,
    anchor_uri: buildAionisUri({
      tenant_id: args.tenantId,
      scope: args.scope,
      type: row.type,
      id: row.id,
    }),
    selected_tool: identity.selectedTool,
    pattern_state: identity.patternState,
    credibility_state: identity.credibilityState,
    operator_override: args.nextOverride,
  });
}

export async function suppressPatternAnchorLite(args: {
  body: unknown;
  defaultScope: string;
  defaultTenantId: string;
  liteWriteStore: Pick<LiteWriteStore, "findNodes" | "updateNodeAnchorState">;
}) {
  const parsed = PatternSuppressRequest.parse(args.body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope: args.defaultScope, defaultTenantId: args.defaultTenantId },
  );
  const now = new Date().toISOString();
  return updatePatternOperatorOverride({
    liteWriteStore: args.liteWriteStore,
    scope: tenancy.scope_key,
    tenantId: tenancy.tenant_id,
    actor: parsed.actor ?? null,
    anchorId: parsed.anchor_id,
    nextOverride: buildOperatorOverride({
      suppressed: true,
      reason: parsed.reason,
      mode: parsed.mode,
      until: parsed.until ?? null,
      updatedAt: now,
      updatedBy: parsed.actor ?? null,
      lastAction: "suppress",
    }),
  });
}

export async function unsuppressPatternAnchorLite(args: {
  body: unknown;
  defaultScope: string;
  defaultTenantId: string;
  liteWriteStore: Pick<LiteWriteStore, "findNodes" | "updateNodeAnchorState">;
}) {
  const parsed = PatternUnsuppressRequest.parse(args.body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope: args.defaultScope, defaultTenantId: args.defaultTenantId },
  );
  const now = new Date().toISOString();
  return updatePatternOperatorOverride({
    liteWriteStore: args.liteWriteStore,
    scope: tenancy.scope_key,
    tenantId: tenancy.tenant_id,
    actor: parsed.actor ?? null,
    anchorId: parsed.anchor_id,
    nextOverride: buildOperatorOverride({
      suppressed: false,
      reason: parsed.reason ?? null,
      mode: "shadow_learn",
      until: null,
      updatedAt: now,
      updatedBy: parsed.actor ?? null,
      lastAction: "unsuppress",
    }),
  });
}
