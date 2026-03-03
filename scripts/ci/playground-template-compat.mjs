import { OPERATION_LIST, SCENARIO_PRESETS } from "../../apps/playground/app/lib/operations.js";
import {
  ContextAssembleRequest,
  MemoryResolveRequest,
  MemoryRecallRequest,
  MemoryRecallTextRequest,
  SandboxExecuteRequest,
  SandboxRunCancelRequest,
  SandboxRunGetRequest,
  SandboxRunLogsRequest,
  SandboxSessionCreateRequest,
  MemoryWriteRequest,
  RulesEvaluateRequest,
  ToolsDecisionRequest,
  ToolsFeedbackRequest,
  ToolsRunRequest,
  ToolsSelectRequest,
} from "../../dist/memory/schemas.js";

const UUID_SAMPLE = "00000000-0000-0000-0000-000000000001";

const runtimeContext = {
  decision_id: UUID_SAMPLE,
  decision_uri: `aionis://default/default/decision/${UUID_SAMPLE}`,
  run_id: UUID_SAMPLE,
  session_id: UUID_SAMPLE,
  commit_uri: `aionis://default/default/commit/${UUID_SAMPLE}`,
};

const connection = {
  tenant_id: "default",
  scope: "default",
};

const validators = {
  write: MemoryWriteRequest,
  recall: MemoryRecallRequest,
  recall_text: MemoryRecallTextRequest,
  rules_evaluate: RulesEvaluateRequest,
  tools_select: ToolsSelectRequest,
  tools_feedback: ToolsFeedbackRequest,
  tools_decision: ToolsDecisionRequest,
  tools_run: ToolsRunRequest,
  memory_resolve: MemoryResolveRequest,
  context_assemble: ContextAssembleRequest,
  sandbox_create_session: SandboxSessionCreateRequest,
  sandbox_execute: SandboxExecuteRequest,
  sandbox_run_get: SandboxRunGetRequest,
  sandbox_run_logs: SandboxRunLogsRequest,
  sandbox_run_cancel: SandboxRunCancelRequest,
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch;
  const out = { ...(base && typeof base === "object" && !Array.isArray(base) ? base : {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function applyTenantScope(payload) {
  const next = deepClone(payload);
  const tenantId = String(connection.tenant_id || "").trim();
  const scope = String(connection.scope || "").trim();
  if (tenantId && !next.tenant_id) next.tenant_id = tenantId;
  if (scope && !next.scope) next.scope = scope;
  return next;
}

function resolveToken(token) {
  if (token === "now.iso") return new Date().toISOString();
  if (token === "now.unix_ms") return String(Date.now());
  if (token.startsWith("last.")) return String(runtimeContext[token.slice(5)] ?? "");
  if (token.startsWith("connection.")) return String(connection[token.slice(11)] ?? "");
  return "";
}

function applyRuntimeVars(value) {
  if (Array.isArray(value)) return value.map((item) => applyRuntimeVars(item));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = applyRuntimeVars(inner);
    }
    return out;
  }
  if (typeof value === "string") {
    return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, token) => resolveToken(String(token || "").trim()));
  }
  return value;
}

function normalizeOperationPayload(operation, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const next = deepClone(payload);

  if (operation === "write" && Array.isArray(next.nodes)) {
    next.nodes = next.nodes.map((node) => {
      if (!node || typeof node !== "object") return node;
      if (node.type !== "fact") return node;
      return { ...node, type: "entity" };
    });
  }

  if (operation === "rules_evaluate") {
    if ((next.context === undefined || next.context === null) && next.input && typeof next.input === "object" && !Array.isArray(next.input)) {
      next.context = deepClone(next.input);
    }
    if (next.context === undefined || next.context === null || typeof next.context !== "object" || Array.isArray(next.context)) {
      next.context = {};
    }
    delete next.input;
  }

  if (operation === "tools_select") {
    if (!Array.isArray(next.candidates) && Array.isArray(next.candidate_tools)) {
      next.candidates = [...next.candidate_tools];
    }
    if (!next.context || typeof next.context !== "object" || Array.isArray(next.context)) {
      next.context = {};
    }
    if (typeof next.goal === "string" && next.goal.trim() && !next.context.goal) {
      next.context.goal = next.goal.trim();
    }
    delete next.goal;
    delete next.candidate_tools;
  }

  if (operation === "tools_feedback") {
    if (!Array.isArray(next.candidates) && Array.isArray(next.candidate_tools)) {
      next.candidates = [...next.candidate_tools];
    }
    if (!next.context || typeof next.context !== "object" || Array.isArray(next.context)) {
      next.context = {};
    }
    if (typeof next.goal === "string" && next.goal.trim() && !next.context.goal) {
      next.context.goal = next.goal.trim();
    }
    if (typeof next.feedback_text === "string" && next.feedback_text.trim() && !next.note) {
      next.note = next.feedback_text.trim();
    }
    if (!next.input_text && !next.input_sha256) {
      next.input_text = typeof next.note === "string" && next.note.trim() ? next.note : "Playground tool feedback";
    }
    delete next.goal;
    delete next.candidate_tools;
    delete next.feedback_text;
    delete next.score;
  }

  return next;
}

function validatePayload(operation, payload) {
  const validator = validators[operation];
  if (!validator) return { ok: false, reason: `unsupported operation '${operation}'` };
  const parsed = validator.safeParse(payload);
  if (parsed.success) return { ok: true, reason: "" };
  const first = parsed.error.issues[0];
  const path = Array.isArray(first?.path) ? first.path.join(".") : "";
  return {
    ok: false,
    reason: `${first?.message ?? "validation failed"}${path ? ` (path: ${path})` : ""}`,
  };
}

function preparePayload(operation, payload) {
  const scoped = applyTenantScope(payload);
  const materialized = applyRuntimeVars(scoped);
  return normalizeOperationPayload(operation, materialized);
}

const failures = [];
let checked = 0;

for (const op of OPERATION_LIST) {
  const operation = String(op?.key ?? "");
  const prepared = preparePayload(operation, op.template ?? {});
  const result = validatePayload(operation, prepared);
  checked += 1;
  if (!result.ok) {
    failures.push({
      source: `OPERATION_LIST.${operation}`,
      reason: result.reason,
    });
  }
}

for (const scenario of SCENARIO_PRESETS) {
  const scenarioKey = String(scenario?.key ?? "unknown");
  const overrides = scenario?.payload_by_operation && typeof scenario.payload_by_operation === "object"
    ? scenario.payload_by_operation
    : {};
  for (const [operation, patch] of Object.entries(overrides)) {
    const base = OPERATION_LIST.find((item) => item.key === operation)?.template;
    if (!base) {
      failures.push({
        source: `SCENARIO_PRESETS.${scenarioKey}.${operation}`,
        reason: "unknown operation in payload_by_operation",
      });
      continue;
    }
    const merged = deepMerge(base, patch);
    const prepared = preparePayload(operation, merged);
    const result = validatePayload(operation, prepared);
    checked += 1;
    if (!result.ok) {
      failures.push({
        source: `SCENARIO_PRESETS.${scenarioKey}.${operation}`,
        reason: result.reason,
      });
    }
  }
}

const out = {
  ok: failures.length === 0,
  checked,
  failures,
};

if (out.ok) {
  process.stdout.write(`${JSON.stringify(out)}\n`);
} else {
  process.stderr.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(1);
}
