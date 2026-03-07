import { loadEnv } from "../config.js";
import {
  AionisApiError,
  AionisClient,
  isBackendCapabilityUnsupportedError,
  parseBackendCapabilityErrorDetails,
} from "../sdk/index.js";

function inferApiKeyFromEnv(): string | undefined {
  const explicit = process.env.API_KEY?.trim() || process.env.PERF_API_KEY?.trim();
  if (explicit) return explicit;
  const raw = process.env.MEMORY_API_KEYS_JSON?.trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const first = Object.keys(parsed)[0];
    return first ? first.trim() : undefined;
  } catch {
    return undefined;
  }
}

const env = loadEnv();
const port = env.PORT;
const scope = env.MEMORY_SCOPE;
const baseUrl = process.env.AIONIS_BASE_URL?.trim() || `http://localhost:${port}`;
const apiKey = inferApiKeyFromEnv();
const authBearer = process.env.AUTH_BEARER?.trim() || process.env.PERF_AUTH_BEARER?.trim() || undefined;

const client = new AionisClient({
  base_url: baseUrl,
  timeout_ms: 10_000,
  retry: { max_retries: 2 },
  admin_token: process.env.ADMIN_TOKEN || undefined,
  api_key: apiKey,
  auth_bearer: authBearer,
});

async function main() {
  const stamp = Date.now();
  const clientId = `sdk_smoke_evt_${stamp}`;

  const write = await client.write({
    scope,
    input_text: "sdk smoke write",
    auto_embed: false,
    memory_lane: "shared",
    nodes: [{ client_id: clientId, type: "event", text_summary: "sdk smoke event for typed client" }],
    edges: [],
  });

  const rules = await client.rulesEvaluate({
    scope,
    context: { intent: "json", provider: "minimax", tool: { name: "curl" } },
    include_shadow: true,
    limit: 50,
  });

  const tools = await client.toolsSelect({
    scope,
    context: { intent: "json", provider: "minimax", tool: { name: "curl" } },
    candidates: ["psql", "curl", "bash"],
    strict: false,
    include_shadow: false,
    rules_limit: 50,
  });

  const health = await client.health();
  const capabilityContract = await client.getCapabilityContract();
  const featureCaps = health.data.memory_store_feature_capabilities ?? {};
  const contractFromHealth = health.data.memory_store_capability_contract ?? {};

  if (JSON.stringify(capabilityContract.data) !== JSON.stringify(contractFromHealth)) {
    throw new Error("getCapabilityContract does not match /health.memory_store_capability_contract");
  }

  const effectiveTenant = typeof write.data.tenant_id === "string" && write.data.tenant_id.trim() ? write.data.tenant_id : "default";

  let packExport:
    | { ok: true; status: number; request_id: string | null; manifest_sha256: string | null }
    | {
        ok: true;
        status: number;
        request_id: string | null;
        capability_error: {
          capability: string;
          failure_mode: string | null;
          degraded_mode: string | null;
          fallback_applied: boolean | null;
        };
      }
    | { ok: false; reason: string };
  let exportedPackForImport: Record<string, unknown> | null = null;
  let exportedManifestShaForImport: string | null = null;

  if (featureCaps.packs_export === false) {
    try {
      await client.packExport({
        scope,
        include_nodes: false,
        include_edges: false,
        include_commits: false,
        include_decisions: false,
        include_meta: false,
        max_rows: 1,
      });
      throw new Error("packExport must fail when packs_export capability is disabled");
    } catch (err) {
      if (!isBackendCapabilityUnsupportedError(err)) throw err;
      const details = parseBackendCapabilityErrorDetails(err.details);
      if (!details || details.capability !== "packs_export") {
        throw new Error("packExport capability error details missing capability=packs_export");
      }
      packExport = {
        ok: true,
        status: err.status,
        request_id: err.request_id,
        capability_error: {
          capability: details.capability,
          failure_mode: details.failure_mode ?? null,
          degraded_mode: details.degraded_mode ?? null,
          fallback_applied: typeof details.fallback_applied === "boolean" ? details.fallback_applied : null,
        },
      };
    }
  } else if (featureCaps.packs_export === true) {
    const packOut = await client.packExport({
      scope,
      include_nodes: false,
      include_edges: false,
      include_commits: false,
      include_decisions: false,
      include_meta: false,
      max_rows: 1,
    });
    const manifestSha = packOut.data.manifest?.sha256 ?? null;
    exportedPackForImport = (packOut.data.pack as Record<string, unknown> | undefined) ?? null;
    exportedManifestShaForImport = manifestSha;
    packExport = {
      ok: true,
      status: packOut.status,
      request_id: packOut.request_id,
      manifest_sha256: manifestSha,
    };
  } else {
    packExport = { ok: false, reason: "packs_export capability missing in /health response" };
  }

  let sessionsGraph:
    | {
        ok: true;
        create_status: number;
        create_request_id: string | null;
        write_event_status: number;
        write_event_request_id: string | null;
        list_status: number;
        list_request_id: string | null;
        session_id: string;
        event_id: string | null;
        events_returned: number;
      }
    | {
        ok: true;
        status: number;
        request_id: string | null;
        capability_error: {
          capability: string;
          failure_mode: string | null;
          degraded_mode: string | null;
          fallback_applied: boolean | null;
        };
      }
    | { ok: false; reason: string };

  if (featureCaps.sessions_graph === false) {
    try {
      await client.createSession({
        scope,
        actor: "sdk_smoke",
        session_id: `sdk_smoke_session_${stamp}`,
        input_text: "sdk smoke session should fail when capability disabled",
        auto_embed: false,
      });
      throw new Error("createSession must fail when sessions_graph capability is disabled");
    } catch (err) {
      if (!isBackendCapabilityUnsupportedError(err)) throw err;
      const details = parseBackendCapabilityErrorDetails(err.details);
      if (!details || details.capability !== "sessions_graph") {
        throw new Error("createSession capability error details missing capability=sessions_graph");
      }
      sessionsGraph = {
        ok: true,
        status: err.status,
        request_id: err.request_id,
        capability_error: {
          capability: details.capability,
          failure_mode: details.failure_mode ?? null,
          degraded_mode: details.degraded_mode ?? null,
          fallback_applied: typeof details.fallback_applied === "boolean" ? details.fallback_applied : null,
        },
      };
    }
  } else if (featureCaps.sessions_graph === true) {
    const sessionId = `sdk_smoke_session_${stamp}`;
    const created = await client.createSession({
      scope,
      actor: "sdk_smoke",
      session_id: sessionId,
      title: "sdk smoke session",
      input_text: "sdk smoke create session",
      auto_embed: false,
      memory_lane: "shared",
    });
    const event = await client.writeEvent({
      scope,
      actor: "sdk_smoke",
      session_id: sessionId,
      event_id: `sdk_smoke_event_${stamp}`,
      input_text: "sdk smoke session event",
      auto_embed: false,
      memory_lane: "shared",
    });
    const events = await client.listSessionEvents(sessionId, {
      scope,
      include_meta: false,
      include_slots: false,
      include_slots_preview: false,
      limit: 20,
      offset: 0,
    });
    sessionsGraph = {
      ok: true,
      create_status: created.status,
      create_request_id: created.request_id,
      write_event_status: event.status,
      write_event_request_id: event.request_id,
      list_status: events.status,
      list_request_id: events.request_id,
      session_id: sessionId,
      event_id: typeof event.data.event_id === "string" ? event.data.event_id : null,
      events_returned: Array.isArray(events.data.events) ? events.data.events.length : 0,
    };
  } else {
    sessionsGraph = { ok: false, reason: "sessions_graph capability missing in /health response" };
  }

  let packImport:
    | { ok: true; status: number; request_id: string | null; verified: boolean; imported: boolean; planned_nodes: number | null }
    | {
        ok: true;
        status: number;
        request_id: string | null;
        capability_error: {
          capability: string;
          failure_mode: string | null;
          degraded_mode: string | null;
          fallback_applied: boolean | null;
        };
      }
    | { ok: false; reason: string };

  if (featureCaps.packs_import === false) {
    try {
      await client.packImport({
        scope,
        actor: "sdk_smoke",
        verify_only: true,
        auto_embed: false,
        pack: {
          version: "aionis_pack_v1",
          tenant_id: effectiveTenant,
          scope,
          nodes: [],
          edges: [],
          commits: [],
          decisions: [],
        },
      });
      throw new Error("packImport must fail when packs_import capability is disabled");
    } catch (err) {
      if (!isBackendCapabilityUnsupportedError(err)) throw err;
      const details = parseBackendCapabilityErrorDetails(err.details);
      if (!details || details.capability !== "packs_import") {
        throw new Error("packImport capability error details missing capability=packs_import");
      }
      packImport = {
        ok: true,
        status: err.status,
        request_id: err.request_id,
        capability_error: {
          capability: details.capability,
          failure_mode: details.failure_mode ?? null,
          degraded_mode: details.degraded_mode ?? null,
          fallback_applied: typeof details.fallback_applied === "boolean" ? details.fallback_applied : null,
        },
      };
    }
  } else if (featureCaps.packs_import === true) {
    const payload = {
      scope,
      actor: "sdk_smoke",
      verify_only: true,
      auto_embed: false,
      ...(exportedManifestShaForImport ? { manifest_sha256: exportedManifestShaForImport } : {}),
      pack:
        exportedPackForImport ?? {
          version: "aionis_pack_v1",
          tenant_id: effectiveTenant,
          scope,
          nodes: [],
          edges: [],
          commits: [],
          decisions: [],
        },
    };
    const imported = await client.packImport(payload as any);
    packImport = {
      ok: true,
      status: imported.status,
      request_id: imported.request_id,
      verified: imported.data.verified === true,
      imported: imported.data.imported === true,
      planned_nodes:
        imported.data.planned && typeof imported.data.planned.nodes === "number" ? imported.data.planned.nodes : null,
    };
  } else {
    packImport = { ok: false, reason: "packs_import capability missing in /health response" };
  }

  let recallText: { ok: boolean; status: number; request_id: string | null; seeds: number } | { ok: false; reason: string };
  try {
    const recall = await client.recallText({
      scope,
      query_text: "memory graph",
      limit: 10,
      return_debug: false,
      include_embeddings: false,
      include_meta: false,
      include_slots: false,
      include_slots_preview: false,
      slots_preview_keys: 10,
      max_nodes: 30,
      max_edges: 60,
      ranked_limit: 100,
      neighborhood_hops: 2,
      min_edge_weight: 0,
      min_edge_confidence: 0,
      rules_include_shadow: false,
      rules_limit: 50,
    });
    recallText = {
      ok: true,
      status: recall.status,
      request_id: recall.request_id,
      seeds: Array.isArray(recall.data.seeds) ? recall.data.seeds.length : 0,
    };
  } catch (err) {
    if (err instanceof AionisApiError && err.code === "no_embedding_provider") {
      recallText = { ok: false, reason: "recall_text skipped: no embedding provider configured" };
    } else {
      throw err;
    }
  }

  let contextAssemble:
    | {
        ok: true;
        status: number;
        request_id: string | null;
        layer_order: string[];
        dropped_reasons: number;
        merged_chars: number;
      }
    | { ok: false; reason: string };
  try {
    const assembled = await client.contextAssemble({
      scope,
      query_text: "Assemble context for sdk smoke",
      context: { intent: "json", provider: "minimax", tool: { name: "curl" } },
      include_rules: true,
      include_shadow: false,
      rules_limit: 50,
      tool_candidates: ["psql", "curl", "bash"],
      tool_strict: false,
      neighborhood_hops: 2,
      return_debug: false,
      include_embeddings: false,
      include_meta: false,
      include_slots: false,
      include_slots_preview: false,
      slots_preview_keys: 10,
      max_nodes: 30,
      max_edges: 60,
      ranked_limit: 100,
      min_edge_weight: 0,
      min_edge_confidence: 0,
      return_layered_context: true,
      context_layers: {
        enabled: ["facts", "rules", "tools", "citations"],
        char_budget_total: 1200,
        include_merge_trace: true,
      },
      limit: 10,
    });
    const layered = (assembled.data as any)?.layered_context;
    contextAssemble = {
      ok: true,
      status: assembled.status,
      request_id: assembled.request_id,
      layer_order: Array.isArray(layered?.order) ? layered.order : [],
      dropped_reasons: Array.isArray(layered?.dropped_reasons) ? layered.dropped_reasons.length : 0,
      merged_chars: typeof layered?.merged_text === "string" ? layered.merged_text.length : 0,
    };
  } catch (err) {
    if (err instanceof AionisApiError && err.code === "no_embedding_provider") {
      contextAssemble = { ok: false, reason: "context_assemble skipped: no embedding provider configured" };
    } else {
      throw err;
    }
  }

  const automationId = `sdk_smoke_automation_${stamp}`;
  const automationCreated = await client.automationCreate({
    scope,
    actor: "sdk_smoke",
    automation_id: automationId,
    name: "SDK Smoke Approval Automation",
    status: "draft",
    graph: {
      nodes: [
        {
          node_id: "approval_gate",
          kind: "approval",
          name: "Approval Gate",
        },
      ],
      edges: [],
    },
    metadata: {
      source: "sdk_smoke",
    },
  });
  const automationRunPaused = await client.automationRun({
    scope,
    actor: "sdk_smoke",
    automation_id: automationId,
    params: {
      smoke: true,
    },
  });
  const pausedRunId = String((automationRunPaused.data as any)?.run?.run_id ?? "");
  const automationRunGetPaused = await client.automationRunGet({
    scope,
    run_id: pausedRunId,
    include_nodes: true,
  });
  const automationRunResumed = await client.automationRunResume({
    scope,
    actor: "sdk_smoke",
    run_id: pausedRunId,
    reason: "sdk smoke approval",
  });
  const automationRunPaused2 = await client.automationRun({
    scope,
    actor: "sdk_smoke",
    automation_id: automationId,
    params: {
      smoke: true,
      second_run: true,
    },
  });
  const pausedRunId2 = String((automationRunPaused2.data as any)?.run?.run_id ?? "");
  const automationRunCancelled = await client.automationRunCancel({
    scope,
    actor: "sdk_smoke",
    run_id: pausedRunId2,
    reason: "sdk smoke cancel",
  });
  const automationPromoted = await client.automationPromote({
    scope,
    actor: "sdk_smoke",
    automation_id: automationId,
    from_version: Number((automationCreated.data as any)?.automation?.version ?? 1),
    target_status: "shadow",
    note: "sdk smoke promote to shadow",
  });
  const shadowVersion = Number((automationPromoted.data as any)?.to_version ?? 0);
  let shadowDefaultRunError:
    | {
        status: number | null;
        request_id: string | null;
        code: string | null;
      }
    | null = null;
  try {
    await client.automationRun({
      scope,
      actor: "sdk_smoke",
      automation_id: automationId,
      version: shadowVersion,
      params: {
        smoke: true,
        shadow_attempt: "default",
      },
    });
    throw new Error("default run on shadow version must fail");
  } catch (err) {
    if (!(err instanceof AionisApiError) || err.code !== "automation_version_shadow_not_runnable") throw err;
    shadowDefaultRunError = {
      status: err.status ?? null,
      request_id: err.request_id ?? null,
      code: err.code ?? null,
    };
  }
  const automationShadowRun = await client.automationRun({
    scope,
    actor: "sdk_smoke",
    automation_id: automationId,
    version: shadowVersion,
    params: {
      smoke: true,
      shadow_attempt: "explicit",
    },
    options: {
      execution_mode: "shadow",
    },
  });
  if ((automationShadowRun.data as any)?.run?.terminal_outcome !== "succeeded") {
    throw new Error("shadow automation run must succeed for approval-only sdk smoke DAG");
  }
  if ((automationShadowRun.data as any)?.run?.execution_mode !== "shadow") {
    throw new Error("shadow automation run must report execution_mode=shadow");
  }
  if ((automationRunCancelled.data as any)?.run?.terminal_outcome !== "cancelled") {
    throw new Error("cancelled automation run must retain terminal_outcome=cancelled");
  }
  const automationShadowValidateEnqueue = await client.automationShadowValidate({
    scope,
    actor: "sdk_smoke",
    automation_id: automationId,
    shadow_version: shadowVersion,
    mode: "enqueue",
    note: "sdk smoke queued shadow validation",
  });
  const automationShadowValidateInline = await client.automationShadowValidate({
    scope,
    actor: "sdk_smoke",
    automation_id: automationId,
    shadow_version: shadowVersion,
    mode: "inline",
    note: "sdk smoke inline shadow validation",
  });
  const automationShadowReportBeforeReview = await client.automationShadowReport({
    scope,
    automation_id: automationId,
    shadow_version: shadowVersion,
  });
  let shadowPromoteWithoutReviewError:
    | {
        status: number | null;
        request_id: string | null;
        code: string | null;
      }
    | null = null;
  try {
    await client.automationPromote({
      scope,
      actor: "sdk_smoke",
      automation_id: automationId,
      from_version: shadowVersion,
      target_status: "active",
      note: "sdk smoke promote to active without review",
    });
    throw new Error("shadow promotion to active must fail before approved review");
  } catch (err) {
    if (!(err instanceof AionisApiError) || err.code !== "automation_shadow_review_required") throw err;
    shadowPromoteWithoutReviewError = {
      status: err.status ?? null,
      request_id: err.request_id ?? null,
      code: err.code ?? null,
    };
  }
  const automationShadowReviewed = await client.automationShadowReview({
    scope,
    actor: "sdk_smoke_reviewer",
    automation_id: automationId,
    shadow_version: shadowVersion,
    verdict: "approved",
    note: "sdk smoke approved shadow review",
  });
  const automationShadowReportAfterReview = await client.automationShadowReport({
    scope,
    automation_id: automationId,
    shadow_version: shadowVersion,
  });
  const automationActivated = await client.automationPromote({
    scope,
    actor: "sdk_smoke",
    automation_id: automationId,
    from_version: shadowVersion,
    target_status: "active",
    note: "sdk smoke promote to active",
  });

  const out = {
    ok: true,
    base_url: baseUrl,
    scope,
    calls: {
      write: {
        status: write.status,
        request_id: write.request_id,
        commit_id: write.data.commit_id,
        node_id: write.data.nodes?.[0]?.id ?? null,
      },
      rules_evaluate: {
        status: rules.status,
        request_id: rules.request_id,
        considered: Number((rules.data as any).considered ?? 0),
        matched: Number((rules.data as any).matched ?? 0),
      },
      tools_select: {
        status: tools.status,
        request_id: tools.request_id,
        selected: tools.data.selection?.selected ?? null,
        ordered: tools.data.selection?.ordered ?? [],
      },
      health: {
        status: health.status,
        request_id: health.request_id,
        backend: health.data.memory_store_backend ?? null,
        recall_capabilities: health.data.memory_store_recall_capabilities ?? {},
        write_capabilities: health.data.memory_store_write_capabilities ?? {},
        feature_capabilities: featureCaps,
        capability_contract_keys: Object.keys(capabilityContract.data ?? {}),
      },
      pack_export: packExport,
      sessions_graph: sessionsGraph,
      pack_import: packImport,
      recall_text: recallText,
      context_assemble: contextAssemble,
      automation: {
        create: {
          status: automationCreated.status,
          request_id: automationCreated.request_id,
          automation_id: (automationCreated.data as any)?.automation?.automation_id ?? null,
          version: (automationCreated.data as any)?.automation?.version ?? null,
        },
        promote: {
          status: automationPromoted.status,
          request_id: automationPromoted.request_id,
          from_version: (automationPromoted.data as any)?.from_version ?? null,
          to_version: (automationPromoted.data as any)?.to_version ?? null,
          promoted_status: (automationPromoted.data as any)?.automation?.status ?? null,
        },
        shadow_report_before_review: {
          status: automationShadowReportBeforeReview.status,
          request_id: automationShadowReportBeforeReview.request_id,
          readiness: (automationShadowReportBeforeReview.data as any)?.comparison?.readiness?.status ?? null,
          verdict: (automationShadowReportBeforeReview.data as any)?.notes?.shadow_review_verdict ?? null,
          validation_status: (automationShadowReportBeforeReview.data as any)?.notes?.shadow_validation_status ?? null,
        },
        shadow_validate_enqueue: {
          status: automationShadowValidateEnqueue.status,
          request_id: automationShadowValidateEnqueue.request_id,
          queued: (automationShadowValidateEnqueue.data as any)?.queued ?? null,
          validation_status: (automationShadowValidateEnqueue.data as any)?.validation_request?.status ?? null,
        },
        shadow_validate_inline: {
          status: automationShadowValidateInline.status,
          request_id: automationShadowValidateInline.request_id,
          queued: (automationShadowValidateInline.data as any)?.queued ?? null,
          validation_status: (automationShadowValidateInline.data as any)?.validation_request?.status ?? null,
          validation_run_id: (automationShadowValidateInline.data as any)?.run?.run_id ?? null,
        },
        shadow_promote_without_review_error: shadowPromoteWithoutReviewError,
        shadow_review: {
          status: automationShadowReviewed.status,
          request_id: automationShadowReviewed.request_id,
          verdict: (automationShadowReviewed.data as any)?.notes?.shadow_review_verdict ?? null,
          note: (automationShadowReviewed.data as any)?.notes?.shadow_review_note ?? null,
        },
        shadow_report_after_review: {
          status: automationShadowReportAfterReview.status,
          request_id: automationShadowReportAfterReview.request_id,
          readiness: (automationShadowReportAfterReview.data as any)?.comparison?.readiness?.status ?? null,
          verdict: (automationShadowReportAfterReview.data as any)?.notes?.shadow_review_verdict ?? null,
          validation_status: (automationShadowReportAfterReview.data as any)?.notes?.shadow_validation_status ?? null,
          review_count: Array.isArray((automationShadowReportAfterReview.data as any)?.history?.shadow_reviews)
            ? (automationShadowReportAfterReview.data as any).history.shadow_reviews.length
            : 0,
          validation_count: Array.isArray((automationShadowReportAfterReview.data as any)?.history?.shadow_validations)
            ? (automationShadowReportAfterReview.data as any).history.shadow_validations.length
            : 0,
        },
        activate: {
          status: automationActivated.status,
          request_id: automationActivated.request_id,
          from_version: (automationActivated.data as any)?.from_version ?? null,
          to_version: (automationActivated.data as any)?.to_version ?? null,
          promoted_status: (automationActivated.data as any)?.automation?.status ?? null,
        },
        shadow_default_run_error: shadowDefaultRunError,
        shadow_run: {
          status: automationShadowRun.status,
          request_id: automationShadowRun.request_id,
          run_id: (automationShadowRun.data as any)?.run?.run_id ?? null,
          execution_mode: (automationShadowRun.data as any)?.run?.execution_mode ?? null,
          lifecycle_state: (automationShadowRun.data as any)?.run?.lifecycle_state ?? null,
          terminal_outcome: (automationShadowRun.data as any)?.run?.terminal_outcome ?? null,
        },
        run_paused: {
          status: automationRunPaused.status,
          request_id: automationRunPaused.request_id,
          run_id: (automationRunPaused.data as any)?.run?.run_id ?? null,
          lifecycle_state: (automationRunPaused.data as any)?.run?.lifecycle_state ?? null,
          pause_reason: (automationRunPaused.data as any)?.run?.pause_reason ?? null,
        },
        get_paused: {
          status: automationRunGetPaused.status,
          request_id: automationRunGetPaused.request_id,
          node_count: Array.isArray((automationRunGetPaused.data as any)?.nodes) ? (automationRunGetPaused.data as any).nodes.length : 0,
        },
        resume: {
          status: automationRunResumed.status,
          request_id: automationRunResumed.request_id,
          lifecycle_state: (automationRunResumed.data as any)?.run?.lifecycle_state ?? null,
          terminal_outcome: (automationRunResumed.data as any)?.run?.terminal_outcome ?? null,
        },
        cancel: {
          status: automationRunCancelled.status,
          request_id: automationRunCancelled.request_id,
          lifecycle_state: (automationRunCancelled.data as any)?.run?.lifecycle_state ?? null,
          terminal_outcome: (automationRunCancelled.data as any)?.run?.terminal_outcome ?? null,
        },
      },
    },
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

main().catch((err) => {
  const out = {
    ok: false,
    error: String((err as any)?.code ?? (err as any)?.name ?? "error"),
    message: String((err as any)?.message ?? err),
    status: (err as any)?.status ?? null,
    request_id: (err as any)?.request_id ?? null,
    details: (err as any)?.details ?? null,
    issues: (err as any)?.issues ?? null,
  };
  process.stderr.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(1);
});
