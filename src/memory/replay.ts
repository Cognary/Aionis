import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, constants as fsConstants } from "node:fs";
import net from "node:net";
import type pg from "pg";
import type { EmbeddingProvider } from "../embeddings/types.js";
import { assertEmbeddingSurfaceForbidden } from "../embeddings/surface-policy.js";
import type { EmbeddedMemoryRuntime } from "../store/embedded-memory-runtime.js";
import {
  createPostgresReplayStoreAccess,
  type ReplayNodeRow,
  type ReplayVisibilityArgs,
  type ReplayStoreAccess,
} from "../store/replay-access.js";
import type { WriteStoreAccess } from "../store/write-access.js";
import { sha256Hex } from "../util/crypto.js";
import { HttpError } from "../util/http.js";
import {
  applyReplayLearningProjection,
  enqueueReplayLearningProjectionOutbox,
  type ReplayLearningProjectionResolvedConfig,
  type ReplayLearningProjectionResult,
} from "./replay-learning.js";
import { buildReplayCostSignals } from "./cost-signals.js";
import {
  ReplayPlaybookDispatchRequest,
  ReplayPlaybookCandidateRequest,
  ReplayPlaybookCompileRequest,
  ReplayPlaybookGetRequest,
  ReplayPlaybookPromoteRequest,
  ReplayPlaybookRepairRequest,
  ReplayPlaybookRepairReviewRequest,
  ReplayPlaybookRunRequest,
  ReplayRunEndRequest,
  ReplayRunGetRequest,
  ReplayRunStartRequest,
  ReplayStepAfterRequest,
  ReplayStepBeforeRequest,
  type ReplayPlaybookDispatchInput,
  type ReplayPlaybookCandidateInput,
  type ReplayPlaybookCompileInput,
  type ReplayPlaybookGetInput,
  type ReplayPlaybookPromoteInput,
  type ReplayPlaybookRepairInput,
  type ReplayPlaybookRepairReviewInput,
  type ReplayPlaybookRunInput,
  type ReplayRunEndInput,
  type ReplayRunGetInput,
  type ReplayRunStartInput,
  type ReplayStepAfterInput,
  type ReplayStepBeforeInput,
} from "./schemas.js";
import { resolveTenantScope } from "./tenant.js";
import { summarizeToolResult } from "./tool-result-summary.js";
import { buildAionisUri } from "./uri.js";
import { applyReplayMemoryWrite } from "./replay-write.js";

type ReplayWriteOptions = {
  defaultScope: string;
  defaultTenantId: string;
  maxTextLen: number;
  piiRedaction: boolean;
  allowCrossScopeEdges: boolean;
  shadowDualWriteEnabled: boolean;
  shadowDualWriteStrict: boolean;
  writeAccessShadowMirrorV2: boolean;
  embedder: EmbeddingProvider | null;
  embeddedRuntime?: EmbeddedMemoryRuntime | null;
  replayAccess?: ReplayStoreAccess | null;
  replayMirror?: import("./replay-write.js").ReplayWriteMirror | null;
  writeAccess?: WriteStoreAccess | null;
};

type ReplayReadOptions = {
  defaultScope: string;
  defaultTenantId: string;
  embeddedRuntime?: EmbeddedMemoryRuntime | null;
  replayAccess?: ReplayStoreAccess | null;
};

type ReplayLocalExecutorOptions = {
  enabled: boolean;
  mode: "disabled" | "local_process";
  allowedCommands: Set<string>;
  workdir: string;
  timeoutMs: number;
  stdioMaxBytes: number;
};

type ReplayGuidedRepairStrategy = "deterministic_skip" | "heuristic_patch" | "http_synth" | "builtin_llm";

type ReplayGuidedRepairOptions = {
  strategy: ReplayGuidedRepairStrategy;
  allowRequestBuiltinLlm: boolean;
  maxErrorChars: number;
  httpEndpoint?: string | null;
  httpTimeoutMs?: number;
  httpAuthToken?: string | null;
  llmBaseUrl?: string | null;
  llmApiKey?: string | null;
  llmModel?: string | null;
  llmTimeoutMs?: number;
  llmMaxTokens?: number;
  llmTemperature?: number;
};

type ReplayShadowValidationPolicyOptions = {
  executeTimeoutMs: number;
  executeStopOnFailure: boolean;
  sandboxTimeoutMs: number;
  sandboxStopOnFailure: boolean;
};

type ReplayPlaybookRunOptions = ReplayReadOptions & {
  writeOptions?: ReplayWriteOptions;
  localExecutor?: ReplayLocalExecutorOptions;
  guidedRepair?: ReplayGuidedRepairOptions;
  sandboxExecutor?: (input: {
    tenant_id: string;
    scope: string;
    project_id: string | null;
    argv: string[];
    timeout_ms: number;
    mode: "sync" | "async";
    metadata?: Record<string, unknown>;
  }) => Promise<{
    ok: boolean;
    status: string;
    stdout: string;
    stderr: string;
    exit_code: number | null;
    error: string | null;
    run_id?: string | null;
  }>;
  sandboxBudgetGuard?: (input: {
    tenant_id: string;
    scope: string;
    project_id: string | null;
  }) => Promise<void>;
};

type ReplayPlaybookReviewOptions = ReplayWriteOptions & {
  localExecutor?: ReplayLocalExecutorOptions;
  shadowValidationPolicy?: ReplayShadowValidationPolicyOptions;
  learningProjectionDefaults?: ReplayLearningProjectionResolvedConfig;
  sandboxValidationExecutor?: (input: {
    tenant_id: string;
    scope: string;
    argv: string[];
    timeout_ms: number;
    mode?: "sync" | "async";
    metadata?: Record<string, unknown>;
  }) => Promise<{
    ok: boolean;
    status: string;
    stdout: string;
    stderr: string;
    exit_code: number | null;
    error: string | null;
    run_id?: string | null;
  }>;
};

type ReplayDeterministicGateResolved = {
  enabled: boolean;
  preferDeterministicExecution: boolean;
  onMismatch: "fallback" | "reject";
  requiredStatuses: string[];
  requestMatchers: Record<string, unknown> | null;
  requestPolicyConstraints: Record<string, unknown> | null;
};

type ReplayDeterministicGateEvaluation = {
  enabled: boolean;
  requested_mode: "simulate" | "strict" | "guided";
  effective_mode: "simulate" | "strict" | "guided";
  decision: "disabled" | "matched" | "promoted_to_strict" | "fallback_to_requested_mode" | "rejected";
  mismatch_reasons: string[];
  inference_skipped: boolean;
  playbook_status: string;
  required_statuses: string[];
  status_match: boolean;
  matchers_match: boolean;
  policy_constraints_match: boolean;
  matched: boolean;
  request_matcher_fingerprint: string | null;
  playbook_matcher_fingerprint: string | null;
  request_policy_fingerprint: string | null;
  playbook_policy_fingerprint: string | null;
};

function runClientId(runId: string): string {
  return `replay:run:${runId}`;
}

function stepClientId(runId: string, stepId: string): string {
  return `replay:step:${runId}:${stepId}`;
}

function stepResultClientId(runId: string, stepId: string | null, status: string): string {
  return `replay:step_result:${runId}:${stepId ?? "na"}:${status}`;
}

function runEndClientId(runId: string): string {
  return `replay:run_end:${runId}`;
}

function playbookClientId(playbookId: string, version: number): string {
  return `replay:playbook:${playbookId}:v${version}`;
}

function parseRunStartInput(body: unknown): ReplayRunStartInput {
  return ReplayRunStartRequest.parse(body);
}

function parseStepBeforeInput(body: unknown): ReplayStepBeforeInput {
  return ReplayStepBeforeRequest.parse(body);
}

function parseStepAfterInput(body: unknown): ReplayStepAfterInput {
  return ReplayStepAfterRequest.parse(body);
}

function parseRunEndInput(body: unknown): ReplayRunEndInput {
  return ReplayRunEndRequest.parse(body);
}

function parseRunGetInput(body: unknown): ReplayRunGetInput {
  return ReplayRunGetRequest.parse(body);
}

function parsePlaybookCompileInput(body: unknown): ReplayPlaybookCompileInput {
  return ReplayPlaybookCompileRequest.parse(body);
}

function parsePlaybookGetInput(body: unknown): ReplayPlaybookGetInput {
  return ReplayPlaybookGetRequest.parse(body);
}

function parsePlaybookCandidateInput(body: unknown): ReplayPlaybookCandidateInput {
  return ReplayPlaybookCandidateRequest.parse(body);
}

function parsePlaybookDispatchInput(body: unknown): ReplayPlaybookDispatchInput {
  return ReplayPlaybookDispatchRequest.parse(body);
}

function parsePlaybookPromoteInput(body: unknown): ReplayPlaybookPromoteInput {
  return ReplayPlaybookPromoteRequest.parse(body);
}

function parsePlaybookRunInput(body: unknown): ReplayPlaybookRunInput {
  return ReplayPlaybookRunRequest.parse(body);
}

function parsePlaybookRepairInput(body: unknown): ReplayPlaybookRepairInput {
  return ReplayPlaybookRepairRequest.parse(body);
}

function parsePlaybookRepairReviewInput(body: unknown): ReplayPlaybookRepairReviewInput {
  return ReplayPlaybookRepairReviewRequest.parse(body);
}

type ReplayWriteIdentity = {
  memory_lane?: "private" | "shared";
  producer_agent_id?: string;
  owner_agent_id?: string;
  owner_team_id?: string;
};

function replayVisibilityFromInput(input: {
  consumer_agent_id?: string | null;
  consumer_team_id?: string | null;
}): ReplayVisibilityArgs {
  return {
    consumerAgentId: toStringOrNull(input.consumer_agent_id) ?? null,
    consumerTeamId: toStringOrNull(input.consumer_team_id) ?? null,
  };
}

function replayWriteIdentityFromInput(
  input: {
    memory_lane?: string | null;
    producer_agent_id?: string | null;
    owner_agent_id?: string | null;
    owner_team_id?: string | null;
  },
  fallback?: ReplayWriteIdentity,
): ReplayWriteIdentity {
  const memoryLane = toStringOrNull(input.memory_lane);
  const producerAgentId = toStringOrNull(input.producer_agent_id);
  const ownerAgentId = toStringOrNull(input.owner_agent_id);
  const ownerTeamId = toStringOrNull(input.owner_team_id);
  return {
    memory_lane: memoryLane === "shared" || memoryLane === "private" ? memoryLane : fallback?.memory_lane,
    producer_agent_id: producerAgentId ?? fallback?.producer_agent_id,
    owner_agent_id: ownerAgentId ?? fallback?.owner_agent_id,
    owner_team_id: ownerTeamId ?? fallback?.owner_team_id,
  };
}

function replayWriteIdentityFromRow(row: ReplayNodeRow): ReplayWriteIdentity {
  return {
    memory_lane: row.memory_lane,
    producer_agent_id: row.producer_agent_id ?? undefined,
    owner_agent_id: row.owner_agent_id ?? undefined,
    owner_team_id: row.owner_team_id ?? undefined,
  };
}

function asObject(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function toStringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function estimateTokenCountFromUnknown(v: unknown): number {
  let text = "";
  try {
    text = JSON.stringify(v ?? {});
  } catch {
    text = String(v ?? "");
  }
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function replayKindOf(row: ReplayNodeRow): string {
  const slotsObj = asObject(row.slots);
  const kind = slotsObj ? toStringOrNull(slotsObj.replay_kind) : null;
  return kind ?? "";
}

function requireReplayReadAccess(opts: ReplayReadOptions | ReplayWriteOptions) {
  if (opts.embeddedRuntime && !opts.replayAccess) {
    throw new HttpError(
      501,
      "replay_read_not_supported_in_embedded",
      "Replay read/compile endpoints currently require postgres backend.",
    );
  }
}

function replayAccessForClient(client: pg.PoolClient, opts?: ReplayReadOptions | ReplayWriteOptions): ReplayStoreAccess {
  return opts?.replayAccess ?? createPostgresReplayStoreAccess(client);
}

type PreconditionResult = {
  kind: string;
  state: "pass" | "fail" | "unknown";
  ok: boolean;
  message: string;
  input: Record<string, unknown>;
};

type LocalCommandOutcome = {
  ok: boolean;
  status: "success" | "failed" | "timeout";
  command: string;
  argv: string[];
  stdout: string;
  stderr: string;
  exit_code: number | null;
  duration_ms: number;
  timed_out: boolean;
  error: string | null;
};

type SignatureCheck = {
  check: string;
  ok: boolean;
  message: string;
};

const UUID_V4_OR_VX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type ReplayExecutionBackend = "local_process" | "sandbox_sync" | "sandbox_async";
type ReplaySensitiveReviewMode = "block" | "warn";

const SENSITIVE_COMMANDS = new Set<string>([
  "rm",
  "mv",
  "cp",
  "chmod",
  "chown",
  "chgrp",
  "dd",
  "mkfs",
  "fdisk",
  "parted",
  "truncate",
  "reboot",
  "shutdown",
  "kill",
  "killall",
  "pkill",
  "useradd",
  "userdel",
  "usermod",
  "groupadd",
  "groupdel",
  "ln",
  "mount",
  "umount",
  "sed",
  "perl",
]);

function normalizeReplayExecutionBackend(raw: string | null): ReplayExecutionBackend {
  if (raw === "sandbox_sync" || raw === "sandbox_async" || raw === "local_process") return raw;
  return "local_process";
}

function normalizeReplaySensitiveReviewMode(raw: string | null): ReplaySensitiveReviewMode {
  if (raw === "warn") return "warn";
  return "block";
}

function detectSensitiveCommand(command: string, argv: string[]): {
  sensitive: boolean;
  reason: string | null;
  risk_level: "low" | "medium" | "high";
} {
  const cmd = command.trim();
  if (!cmd) return { sensitive: false, reason: null, risk_level: "low" };
  const lower = cmd.toLowerCase();
  if (!SENSITIVE_COMMANDS.has(lower)) return { sensitive: false, reason: null, risk_level: "low" };

  if (lower === "rm") {
    const joined = argv.join(" ");
    if (/\s-rf(\s|$)/.test(joined) || /\s-fr(\s|$)/.test(joined)) {
      return { sensitive: true, reason: "destructive_delete_recursive", risk_level: "high" };
    }
    return { sensitive: true, reason: "delete_operation", risk_level: "high" };
  }
  if (lower === "dd" || lower === "mkfs" || lower === "fdisk" || lower === "parted") {
    return { sensitive: true, reason: "disk_mutation_operation", risk_level: "high" };
  }
  if (lower === "chmod" || lower === "chown" || lower === "chgrp" || lower === "usermod" || lower === "useradd" || lower === "userdel") {
    return { sensitive: true, reason: "permission_or_identity_mutation", risk_level: "high" };
  }
  if (lower === "sed" || lower === "perl") {
    const joined = argv.join(" ");
    if (/\s-i(\s|$)/.test(joined) || /\s-i[^ ]+/.test(joined)) {
      return { sensitive: true, reason: "in_place_file_mutation", risk_level: "medium" };
    }
    return { sensitive: true, reason: "shell_mutation_tool", risk_level: "medium" };
  }
  return { sensitive: true, reason: "mutation_operation", risk_level: "medium" };
}

async function isPortFree(host: string, port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host, port }, () => {
      server.close(() => resolve(true));
    });
  });
}

function isSafeCommandName(raw: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(raw);
}

async function evaluatePrecondition(raw: unknown): Promise<PreconditionResult> {
  const obj = asObject(raw) ?? {};
  const kind = toStringOrNull(obj.kind) ?? "unknown";
  try {
    if (kind === "always") {
      const value = obj.value !== false;
      return {
        kind,
        state: value ? "pass" : "fail",
        ok: value,
        message: value ? "always=true" : "always=false",
        input: obj,
      };
    }
    if (kind === "file_exists") {
      const path = toStringOrNull(obj.path);
      if (!path) return { kind, state: "unknown", ok: false, message: "path is required", input: obj };
      try {
        accessSync(path, fsConstants.F_OK);
        return { kind, state: "pass", ok: true, message: `file exists: ${path}`, input: obj };
      } catch {
        return { kind, state: "fail", ok: false, message: `file missing: ${path}`, input: obj };
      }
    }
    if (kind === "path_not_exists") {
      const path = toStringOrNull(obj.path);
      if (!path) return { kind, state: "unknown", ok: false, message: "path is required", input: obj };
      try {
        accessSync(path, fsConstants.F_OK);
        return { kind, state: "fail", ok: false, message: `path exists: ${path}`, input: obj };
      } catch {
        return { kind, state: "pass", ok: true, message: `path absent: ${path}`, input: obj };
      }
    }
    if (kind === "command_available") {
      const command = toStringOrNull(obj.command);
      if (!command) return { kind, state: "unknown", ok: false, message: "command is required", input: obj };
      if (!isSafeCommandName(command)) {
        return { kind, state: "unknown", ok: false, message: "command contains unsafe characters", input: obj };
      }
      const probe = spawnSync("which", [command], { stdio: "pipe", encoding: "utf8" });
      if ((probe.status ?? 1) === 0) {
        return { kind, state: "pass", ok: true, message: `command available: ${command}`, input: obj };
      }
      return { kind, state: "fail", ok: false, message: `command missing: ${command}`, input: obj };
    }
    if (kind === "env_exists") {
      const name = toStringOrNull(obj.name);
      if (!name) return { kind, state: "unknown", ok: false, message: "name is required", input: obj };
      const value = process.env[name];
      const ok = typeof value === "string" && value.trim().length > 0;
      return {
        kind,
        state: ok ? "pass" : "fail",
        ok,
        message: ok ? `env exists: ${name}` : `env missing: ${name}`,
        input: obj,
      };
    }
    if (kind === "env_equals") {
      const name = toStringOrNull(obj.name);
      const value = toStringOrNull(obj.value);
      if (!name || value == null) return { kind, state: "unknown", ok: false, message: "name/value are required", input: obj };
      const current = process.env[name] ?? "";
      const ok = current === value;
      return {
        kind,
        state: ok ? "pass" : "fail",
        ok,
        message: ok ? `env matched: ${name}` : `env mismatch: ${name}`,
        input: obj,
      };
    }
    if (kind === "port_free") {
      const port = Number(obj.port);
      const host = toStringOrNull(obj.host) ?? "127.0.0.1";
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        return { kind, state: "unknown", ok: false, message: "valid port is required", input: obj };
      }
      const free = await isPortFree(host, port);
      return {
        kind,
        state: free ? "pass" : "fail",
        ok: free,
        message: free ? `port free: ${host}:${port}` : `port occupied: ${host}:${port}`,
        input: obj,
      };
    }
    if (kind === "cwd_contains") {
      const token = toStringOrNull(obj.token);
      const cwd = process.cwd();
      if (!token) return { kind, state: "unknown", ok: false, message: "token is required", input: obj };
      const ok = cwd.includes(token);
      return {
        kind,
        state: ok ? "pass" : "fail",
        ok,
        message: ok ? `cwd contains token: ${token}` : `cwd missing token: ${token}`,
        input: obj,
      };
    }
    return { kind, state: "unknown", ok: false, message: `unsupported precondition kind: ${kind}`, input: obj };
  } catch (err) {
    return {
      kind,
      state: "unknown",
      ok: false,
      message: `precondition evaluation error: ${String(err)}`,
      input: obj,
    };
  }
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function resolveReplayLearningProjectionConfig(
  requestObj: Record<string, unknown> | null,
  defaults: ReplayLearningProjectionResolvedConfig | undefined,
): ReplayLearningProjectionResolvedConfig {
  const base: ReplayLearningProjectionResolvedConfig = defaults ?? {
    enabled: false,
    mode: "rule_and_episode",
    delivery: "async_outbox",
    target_rule_state: "draft",
    min_total_steps: 1,
    min_success_ratio: 1,
    max_matcher_bytes: 16384,
    max_tool_prefer: 8,
    episode_ttl_days: 30,
  };
  const modeRaw = toStringOrNull(requestObj?.mode);
  const deliveryRaw = toStringOrNull(requestObj?.delivery);
  const stateRaw = toStringOrNull(requestObj?.target_rule_state);
  return {
    enabled: requestObj?.enabled === undefined ? base.enabled : requestObj.enabled === true,
    mode: modeRaw === "episode_only" ? "episode_only" : "rule_and_episode",
    delivery: deliveryRaw === "sync_inline" ? "sync_inline" : "async_outbox",
    target_rule_state: stateRaw === "shadow" ? "shadow" : "draft",
    min_total_steps: clampInt(Number(requestObj?.min_total_steps ?? base.min_total_steps), 0, 500),
    min_success_ratio: Math.max(0, Math.min(1, Number(requestObj?.min_success_ratio ?? base.min_success_ratio))),
    max_matcher_bytes: clampInt(Number(base.max_matcher_bytes), 1, 1024 * 1024),
    max_tool_prefer: clampInt(Number(base.max_tool_prefer), 1, 64),
    episode_ttl_days: clampInt(Number(base.episode_ttl_days), 1, 3650),
  };
}

function asStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);
}

function asStringRecord(input: unknown): Record<string, string> {
  const obj = asObject(input);
  if (!obj) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = toStringOrNull(k);
    const value = toStringOrNull(v);
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
}

function extractJsonObjectFromText(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return asObject(parsed);
  } catch {
    // continue
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) {
    try {
      const parsed = JSON.parse(fenced[1].trim());
      return asObject(parsed);
    } catch {
      // continue
    }
  }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      const parsed = JSON.parse(text.slice(first, last + 1));
      return asObject(parsed);
    } catch {
      return null;
    }
  }
  return null;
}

function extractChatCompletionText(payload: unknown): string | null {
  const root = asObject(payload);
  if (!root) return null;
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const first = asObject(choices[0]);
  if (!first) return null;
  const msg = asObject(first.message);
  if (!msg) return null;
  const content = msg.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const fragments = content
      .map((item) => {
        const obj = asObject(item);
        if (!obj) return "";
        return toStringOrNull(obj.text) ?? "";
      })
      .filter((v) => v.length > 0);
    if (fragments.length > 0) return fragments.join("\n");
  }
  return null;
}

function looksLikeReplayPatchObject(obj: Record<string, unknown>): boolean {
  if (Array.isArray(obj.steps_override)) return true;
  if (Array.isArray(obj.remove_step_indices)) return true;
  if (Array.isArray(obj.step_patches)) return true;
  if (asObject(obj.matchers)) return true;
  if (asObject(obj.success_criteria)) return true;
  const riskProfile = toStringOrNull(obj.risk_profile);
  if (riskProfile === "low" || riskProfile === "medium" || riskProfile === "high") return true;
  if (asObject(obj.policy_constraints)) return true;
  return false;
}

async function synthesizeGuidedRepairWithBuiltinLLM(input: {
  stepIndex: number | null;
  toolName: string | null;
  reason: string;
  detail: string | null;
  stepObj: Record<string, unknown> | null;
  command: string | null;
  argv: string[];
  allowedCommands: Set<string>;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
}): Promise<
  | {
      strategy: string;
      patch: Record<string, unknown>;
      llm_model: string;
      llm_endpoint: string;
      llm_response_preview: string;
      reasoning: string | null;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        source: string;
      };
    }
  | { error: string }
> {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  const endpoint = `${baseUrl}/chat/completions`;
  const minimaxCompat = /minimax/i.test(baseUrl) || /minimax/i.test(input.model);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const body: Record<string, unknown> = {
      model: input.model,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      messages: [
        {
          role: "system",
          content:
            "You synthesize replay repair patches. Return strict JSON only. "
            + "Use patch schema keys from this set: steps_override, remove_step_indices, step_patches, "
            + "matchers, success_criteria, risk_profile, policy_constraints. "
            + "Prefer minimal, safe, one-step patch changes.",
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              task: "Generate replay repair patch for one failing guided step.",
              constraints: {
                step_index_required: input.stepIndex,
                tool_name: input.toolName,
                allowed_commands: [...input.allowedCommands.values()],
                reason: input.reason,
                detail: input.detail,
                command: input.command,
                argv: input.argv,
                step: input.stepObj ?? {},
              },
              output_schema: {
                strategy: "string",
                reasoning: "string (optional)",
                patch: {
                  step_patches: [
                    {
                      step_index: "number",
                      set: "object",
                    },
                  ],
                  remove_step_indices: ["number"],
                },
              },
            },
            null,
            2,
          ),
        },
      ],
    };
    if (minimaxCompat) {
      body.reasoning_split = true;
      body.response_format = { type: "json_object" };
    }
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: `builtin_llm_http_${res.status}` };
    }
    const content = extractChatCompletionText(payload);
    if (!content) return { error: "builtin_llm_empty_content" };
    const parsed = extractJsonObjectFromText(content);
    if (!parsed) return { error: "builtin_llm_invalid_json" };
    const patchObj = asObject(parsed.patch) ?? (looksLikeReplayPatchObject(parsed) ? parsed : null);
    if (!patchObj || !looksLikeReplayPatchObject(patchObj)) {
      return { error: "builtin_llm_missing_patch" };
    }
    const usageObj = asObject((payload as Record<string, unknown>).usage) ?? {};
    const promptTokens = Number(
      usageObj.prompt_tokens ?? usageObj.input_tokens ?? usageObj.promptTokens ?? usageObj.inputTokens ?? 0,
    );
    const completionTokens = Number(
      usageObj.completion_tokens ?? usageObj.output_tokens ?? usageObj.completionTokens ?? usageObj.outputTokens ?? 0,
    );
    const totalTokensRaw = Number(
      usageObj.total_tokens ?? usageObj.totalTokens ?? (Number.isFinite(promptTokens) && Number.isFinite(completionTokens)
        ? promptTokens + completionTokens
        : 0),
    );
    const usage =
      Number.isFinite(promptTokens) && Number.isFinite(completionTokens) && Number.isFinite(totalTokensRaw)
        ? {
            prompt_tokens: Math.max(0, Math.trunc(promptTokens)),
            completion_tokens: Math.max(0, Math.trunc(completionTokens)),
            total_tokens: Math.max(0, Math.trunc(totalTokensRaw)),
            source: "builtin_llm",
          }
        : undefined;
    return {
      strategy: toStringOrNull(parsed.strategy) ?? "builtin_llm_patch",
      patch: patchObj,
      llm_model: input.model,
      llm_endpoint: endpoint,
      llm_response_preview: content.slice(0, 800),
      reasoning: toStringOrNull(parsed.reasoning),
      usage,
    };
  } catch (err: any) {
    return { error: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

function mergeReplayUsage(
  target: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    source: string;
  },
  usage: unknown,
) {
  const obj = asObject(usage);
  if (!obj) return;
  const prompt = Number(obj.prompt_tokens);
  const completion = Number(obj.completion_tokens);
  const total = Number(obj.total_tokens);
  if (!Number.isFinite(prompt) || !Number.isFinite(completion) || !Number.isFinite(total)) return;
  target.prompt_tokens += Math.max(0, Math.trunc(prompt));
  target.completion_tokens += Math.max(0, Math.trunc(completion));
  target.total_tokens += Math.max(0, Math.trunc(total));
  const source = toStringOrNull(obj.source);
  if (source && target.source === "no_model_call" && target.total_tokens > 0) target.source = source;
}

function isReplayCommandTool(toolName: string | null): boolean {
  if (!toolName) return false;
  return toolName === "command" || toolName === "shell" || toolName === "exec" || toolName === "bash";
}

function parseStepArgv(stepObj: Record<string, unknown>, toolName: string | null): string[] {
  const rawTemplate = asObject(stepObj.tool_input_template) ?? asObject(stepObj.tool_input) ?? {};
  const argv = asStringArray(rawTemplate.argv);
  if (argv.length > 0) return argv;

  const command = toStringOrNull(rawTemplate.command) ?? (toolName === "bash" ? "bash" : null);
  const args = asStringArray(rawTemplate.args);
  if (!command) return [];
  return [command, ...args];
}

function runLocalCommand(
  argv: string[],
  opts: {
    cwd: string;
    timeoutMs: number;
    stdioMaxBytes: number;
  },
): LocalCommandOutcome {
  const startedAt = Date.now();
  const command = String(argv[0] ?? "").trim();
  if (!command || argv.length === 0) {
    return {
      ok: false,
      status: "failed",
      command: command || "",
      argv,
      stdout: "",
      stderr: "",
      exit_code: null,
      duration_ms: 0,
      timed_out: false,
      error: "invalid_command_argv",
    };
  }

  try {
    const out = spawnSync(command, argv.slice(1), {
      cwd: opts.cwd,
      shell: false,
      timeout: Math.max(100, opts.timeoutMs),
      maxBuffer: Math.max(1024, opts.stdioMaxBytes),
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "" },
    });
    const stdout = typeof out.stdout === "string" ? out.stdout : Buffer.from(out.stdout ?? "").toString("utf8");
    const stderr = typeof out.stderr === "string" ? out.stderr : Buffer.from(out.stderr ?? "").toString("utf8");
    const timedOut = String((out.error as any)?.code ?? "").toUpperCase() === "ETIMEDOUT";
    const exitCode = Number.isFinite(out.status ?? NaN) ? Number(out.status) : null;
    const error = out.error ? String((out.error as any)?.message ?? out.error) : null;
    const status: "success" | "failed" | "timeout" = timedOut ? "timeout" : exitCode === 0 && !error ? "success" : "failed";
    return {
      ok: status === "success",
      status,
      command,
      argv,
      stdout,
      stderr,
      exit_code: exitCode,
      duration_ms: Math.max(0, Date.now() - startedAt),
      timed_out: timedOut,
      error,
    };
  } catch (err) {
    return {
      ok: false,
      status: "failed",
      command,
      argv,
      stdout: "",
      stderr: "",
      exit_code: null,
      duration_ms: Math.max(0, Date.now() - startedAt),
      timed_out: false,
      error: String(err),
    };
  }
}

function sandboxResultToOutcome(
  input: {
    ok: boolean;
    status: string;
    stdout: string;
    stderr: string;
    exit_code: number | null;
    error: string | null;
  },
  argv: string[],
  durationMs: number,
): LocalCommandOutcome {
  const command = String(argv[0] ?? "").trim();
  const status: "success" | "failed" | "timeout" =
    input.status === "succeeded" || input.ok
      ? "success"
      : input.status === "timeout"
        ? "timeout"
        : "failed";
  return {
    ok: status === "success",
    status,
    command,
    argv,
    stdout: String(input.stdout ?? ""),
    stderr: String(input.stderr ?? ""),
    exit_code: Number.isFinite(input.exit_code ?? NaN) ? Number(input.exit_code) : null,
    duration_ms: Math.max(0, Math.trunc(durationMs)),
    timed_out: status === "timeout",
    error: input.error ? String(input.error) : null,
  };
}

type ReplayCommandExecutionResult = {
  outcome: LocalCommandOutcome | null;
  pending: boolean;
  backend: ReplayExecutionBackend;
  sandbox_run_id: string | null;
  raw_status: string | null;
  raw_error: string | null;
};

async function executeReplayCommand(args: {
  backend: ReplayExecutionBackend;
  tenant_id: string;
  scope: string;
  project_id: string | null;
  argv: string[];
  timeout_ms: number;
  local: {
    cwd: string;
    stdioMaxBytes: number;
  };
  sandboxExecutor?: ReplayPlaybookRunOptions["sandboxExecutor"];
}): Promise<ReplayCommandExecutionResult> {
  if (args.backend === "local_process") {
    const localOut = runLocalCommand(args.argv, {
      cwd: args.local.cwd,
      timeoutMs: args.timeout_ms,
      stdioMaxBytes: args.local.stdioMaxBytes,
    });
    return {
      outcome: localOut,
      pending: false,
      backend: args.backend,
      sandbox_run_id: null,
      raw_status: localOut.status,
      raw_error: localOut.error,
    };
  }

  if (!args.sandboxExecutor) {
    throw new HttpError(
      400,
      "replay_sandbox_executor_not_enabled",
      "sandbox execution backend is requested but sandbox executor is not configured",
      { backend: args.backend },
    );
  }

  const startedAt = Date.now();
  const sandboxMode: "sync" | "async" = args.backend === "sandbox_sync" ? "sync" : "async";
  const sandboxOut = await args.sandboxExecutor({
    tenant_id: args.tenant_id,
    scope: args.scope,
    project_id: args.project_id,
    argv: args.argv,
    timeout_ms: args.timeout_ms,
    mode: sandboxMode,
    metadata: {
      source: "replay_playbook_run",
      backend: args.backend,
    },
  });

  const rawStatus = toStringOrNull(sandboxOut.status) ?? "unknown";
  const pending =
    sandboxMode === "async"
    || rawStatus === "queued"
    || rawStatus === "running";
  if (pending) {
    return {
      outcome: null,
      pending: true,
      backend: args.backend,
      sandbox_run_id: toStringOrNull(sandboxOut.run_id) ?? null,
      raw_status: rawStatus,
      raw_error: toStringOrNull(sandboxOut.error),
    };
  }

  const outcome = sandboxResultToOutcome(
    {
      ok: sandboxOut.ok,
      status: rawStatus,
      stdout: String(sandboxOut.stdout ?? ""),
      stderr: String(sandboxOut.stderr ?? ""),
      exit_code: Number.isFinite(sandboxOut.exit_code ?? NaN) ? Number(sandboxOut.exit_code) : null,
      error: sandboxOut.error ? String(sandboxOut.error) : null,
    },
    args.argv,
    Date.now() - startedAt,
  );
  return {
    outcome,
    pending: false,
    backend: args.backend,
    sandbox_run_id: toStringOrNull(sandboxOut.run_id) ?? null,
    raw_status: rawStatus,
    raw_error: toStringOrNull(sandboxOut.error),
  };
}

function evaluateExpectedSignature(expected: unknown, outcome: LocalCommandOutcome): { ok: boolean; checks: SignatureCheck[] } {
  const checks: SignatureCheck[] = [];
  const spec = asObject(expected);
  if (!spec) return { ok: true, checks };

  const combinedOutput = `${outcome.stdout}\n${outcome.stderr}`;
  if (spec.exit_code !== undefined) {
    const expectedCode = Number(spec.exit_code);
    const ok = Number.isFinite(expectedCode) && outcome.exit_code === Math.trunc(expectedCode);
    checks.push({
      check: "exit_code",
      ok,
      message: ok
        ? `exit_code matched (${Math.trunc(expectedCode)})`
        : `exit_code mismatch (expected=${Math.trunc(expectedCode)}, actual=${String(outcome.exit_code)})`,
    });
  }
  if (spec.stdout_contains !== undefined) {
    const values = Array.isArray(spec.stdout_contains) ? asStringArray(spec.stdout_contains) : asStringArray([spec.stdout_contains]);
    for (const token of values) {
      const ok = outcome.stdout.includes(token);
      checks.push({
        check: "stdout_contains",
        ok,
        message: ok ? `stdout contains '${token}'` : `stdout missing '${token}'`,
      });
    }
  }
  if (spec.stderr_contains !== undefined) {
    const values = Array.isArray(spec.stderr_contains) ? asStringArray(spec.stderr_contains) : asStringArray([spec.stderr_contains]);
    for (const token of values) {
      const ok = outcome.stderr.includes(token);
      checks.push({
        check: "stderr_contains",
        ok,
        message: ok ? `stderr contains '${token}'` : `stderr missing '${token}'`,
      });
    }
  }
  if (spec.output_regex !== undefined) {
    const raw = toStringOrNull(spec.output_regex);
    if (!raw) {
      checks.push({ check: "output_regex", ok: false, message: "output_regex is empty" });
    } else {
      try {
        const re = new RegExp(raw, "m");
        const ok = re.test(combinedOutput);
        checks.push({
          check: "output_regex",
          ok,
          message: ok ? `output_regex matched /${raw}/` : `output_regex not matched /${raw}/`,
        });
      } catch {
        checks.push({ check: "output_regex", ok: false, message: "output_regex is invalid" });
      }
    }
  }

  return { ok: checks.every((c) => c.ok), checks };
}

async function evaluatePostcondition(raw: unknown, outcome: LocalCommandOutcome): Promise<PreconditionResult> {
  const obj = asObject(raw) ?? {};
  const kind = toStringOrNull(obj.kind) ?? "unknown";
  if (kind === "exit_code") {
    const expected = Number(obj.value);
    if (!Number.isFinite(expected)) {
      return { kind, state: "unknown", ok: false, message: "postcondition exit_code requires numeric value", input: obj };
    }
    const ok = outcome.exit_code === Math.trunc(expected);
    return {
      kind,
      state: ok ? "pass" : "fail",
      ok,
      message: ok
        ? `postcondition exit_code matched (${Math.trunc(expected)})`
        : `postcondition exit_code mismatch (expected=${Math.trunc(expected)}, actual=${String(outcome.exit_code)})`,
      input: obj,
    };
  }
  if (kind === "stdout_contains") {
    const token = toStringOrNull(obj.value);
    if (!token) return { kind, state: "unknown", ok: false, message: "postcondition stdout_contains requires value", input: obj };
    const ok = outcome.stdout.includes(token);
    return {
      kind,
      state: ok ? "pass" : "fail",
      ok,
      message: ok ? `stdout contains '${token}'` : `stdout missing '${token}'`,
      input: obj,
    };
  }
  if (kind === "stderr_contains") {
    const token = toStringOrNull(obj.value);
    if (!token) return { kind, state: "unknown", ok: false, message: "postcondition stderr_contains requires value", input: obj };
    const ok = outcome.stderr.includes(token);
    return {
      kind,
      state: ok ? "pass" : "fail",
      ok,
      message: ok ? `stderr contains '${token}'` : `stderr missing '${token}'`,
      input: obj,
    };
  }
  return await evaluatePrecondition(raw);
}

function truncateRepairDetail(detail: string | null | undefined, maxChars: number): string | null {
  if (!detail) return null;
  const normalized = detail.trim();
  if (!normalized) return null;
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

function buildDeterministicGuidedRepairPatch(input: {
  stepIndex: number | null;
  toolName: string | null;
  reason: string;
  detail?: string | null;
}) {
  const removeStepIndices = input.stepIndex != null ? [input.stepIndex] : [];
  return {
    strategy: "remove_step_keep_flow",
    reason: input.reason,
    detail: input.detail ?? null,
    patch: removeStepIndices.length > 0 ? { remove_step_indices: removeStepIndices } : {},
    // Keep a legacy shape for easier inspection in existing tooling.
    legacy_patch: {
      step_index: input.stepIndex,
      tool_name: input.toolName,
      action: "skip",
      reason: input.reason,
      detail: input.detail ?? null,
    },
  };
}

function pickGuidedRepairReplacementCommand(
  command: string | null,
  allowedCommands: Set<string>,
  commandAliasMap: Record<string, string>,
): string | null {
  const normalized = command ? command.trim() : "";
  if (normalized) {
    const directAlias = commandAliasMap[normalized];
    if (directAlias && allowedCommands.has(directAlias)) return directAlias;
  }
  const fallback = [...allowedCommands.values()].find((candidate) => candidate !== normalized) ?? null;
  if (fallback) return fallback;
  if (normalized && allowedCommands.has(normalized)) return normalized;
  return null;
}

function buildHeuristicGuidedRepairPatch(input: {
  stepIndex: number | null;
  toolName: string | null;
  reason: string;
  detail?: string | null;
  stepObj?: Record<string, unknown> | null;
  command?: string | null;
  argv?: string[];
  allowedCommands: Set<string>;
  commandAliasMap: Record<string, string>;
}) {
  const fallback = buildDeterministicGuidedRepairPatch(input);
  if (input.stepIndex == null) {
    return {
      ...fallback,
      strategy: "heuristic_fallback_remove_step",
      heuristic_applied: false,
    };
  }

  const stepIndex = input.stepIndex;
  const stepObj = input.stepObj ?? {};
  const currentArgv = input.argv ?? [];

  if (input.reason === "command_not_allowed_or_missing") {
    const replacement = pickGuidedRepairReplacementCommand(
      input.command ?? null,
      input.allowedCommands,
      input.commandAliasMap,
    );
    if (replacement && currentArgv.length > 0) {
      const baseToolInput = asObject(stepObj.tool_input_template) ?? asObject(stepObj.tool_input) ?? {};
      const nextArgv = [replacement, ...currentArgv.slice(1)];
      return {
        strategy: "replace_command_then_retry",
        reason: input.reason,
        detail: input.detail ?? null,
        heuristic_applied: true,
        patch: {
          step_patches: [
            {
              step_index: stepIndex,
              set: {
                tool_input_template: {
                  ...baseToolInput,
                  argv: nextArgv,
                },
                retry_policy: {
                  max_retries: 1,
                  backoff_ms: 250,
                },
              },
            },
          ],
        },
        fallback_patch: fallback.patch,
        legacy_patch: fallback.legacy_patch,
      };
    }
  }

  if (input.reason === "execution_failed_guided_skip") {
    const retryPolicy = asObject(stepObj.retry_policy) ?? {};
    const maxRetriesRaw = Number(retryPolicy.max_retries ?? 0);
    const baseMaxRetries = Number.isFinite(maxRetriesRaw) ? Math.max(0, Math.trunc(maxRetriesRaw)) : 0;
    const backoffRaw = Number(retryPolicy.backoff_ms ?? 250);
    const baseBackoff = Number.isFinite(backoffRaw) ? Math.max(0, Math.trunc(backoffRaw)) : 250;
    return {
      strategy: "increase_retry_budget_then_retry",
      reason: input.reason,
      detail: input.detail ?? null,
      heuristic_applied: true,
      patch: {
        step_patches: [
          {
            step_index: stepIndex,
            set: {
              retry_policy: {
                ...retryPolicy,
                max_retries: Math.max(1, baseMaxRetries + 1),
                backoff_ms: Math.max(250, baseBackoff),
              },
            },
          },
        ],
      },
      fallback_patch: fallback.patch,
      legacy_patch: fallback.legacy_patch,
    };
  }

  return {
    ...fallback,
    strategy: "heuristic_fallback_remove_step",
    heuristic_applied: false,
  };
}

async function makeGuidedRepairPatch(input: {
  strategy: ReplayGuidedRepairStrategy;
  stepIndex: number | null;
  toolName: string | null;
  reason: string;
  detail?: string | null;
  stepObj?: Record<string, unknown> | null;
  command?: string | null;
  argv?: string[];
  allowedCommands: Set<string>;
  commandAliasMap: Record<string, string>;
  maxErrorChars: number;
  httpEndpoint?: string | null;
  httpTimeoutMs?: number;
  httpAuthToken?: string | null;
  llmBaseUrl?: string | null;
  llmApiKey?: string | null;
  llmModel?: string | null;
  llmTimeoutMs?: number;
  llmMaxTokens?: number;
  llmTemperature?: number;
  mode: "guided";
}) {
  const detail = truncateRepairDetail(input.detail ?? null, input.maxErrorChars);
  if (input.strategy === "builtin_llm") {
    const llmBaseUrl = toStringOrNull(input.llmBaseUrl);
    const llmApiKey = toStringOrNull(input.llmApiKey);
    const llmModel = toStringOrNull(input.llmModel);
    if (llmBaseUrl && llmApiKey && llmModel) {
      const timeoutMs = clampInt(Number(input.llmTimeoutMs ?? 7000), 200, 60000);
      const maxTokens = clampInt(Number(input.llmMaxTokens ?? 500), 64, 4000);
      const temperatureRaw = Number(input.llmTemperature ?? 0.1);
      const temperature = Number.isFinite(temperatureRaw) ? Math.max(0, Math.min(1, temperatureRaw)) : 0.1;
      const llm = await synthesizeGuidedRepairWithBuiltinLLM({
        stepIndex: input.stepIndex,
        toolName: input.toolName,
        reason: input.reason,
        detail,
        stepObj: input.stepObj ?? null,
        command: input.command ?? null,
        argv: input.argv ?? [],
        allowedCommands: input.allowedCommands,
        baseUrl: llmBaseUrl,
        apiKey: llmApiKey,
        model: llmModel,
        timeoutMs,
        maxTokens,
        temperature,
      });
      if (!("error" in llm)) {
        return {
          strategy: llm.strategy,
          reason: input.reason,
          detail,
          source: "builtin_llm",
          patch: llm.patch,
          reasoning: llm.reasoning,
          llm_model: llm.llm_model,
          llm_endpoint: llm.llm_endpoint,
          llm_response_preview: llm.llm_response_preview,
          usage: llm.usage,
          fallback_patch: buildDeterministicGuidedRepairPatch({
            stepIndex: input.stepIndex,
            toolName: input.toolName,
            reason: input.reason,
            detail,
          }).patch,
        };
      }
      return {
        ...buildHeuristicGuidedRepairPatch({
          stepIndex: input.stepIndex,
          toolName: input.toolName,
          reason: input.reason,
          detail,
          stepObj: input.stepObj,
          command: input.command,
          argv: input.argv,
          allowedCommands: input.allowedCommands,
          commandAliasMap: input.commandAliasMap,
        }),
        source: "builtin_llm_fallback",
        synth_error: llm.error,
      };
    }
    return {
      ...buildHeuristicGuidedRepairPatch({
        stepIndex: input.stepIndex,
        toolName: input.toolName,
        reason: input.reason,
        detail,
        stepObj: input.stepObj,
        command: input.command,
        argv: input.argv,
        allowedCommands: input.allowedCommands,
        commandAliasMap: input.commandAliasMap,
      }),
      source: "builtin_llm_fallback",
      synth_error: "builtin_llm_not_configured",
    };
  }
  if (input.strategy === "http_synth") {
    const endpoint = toStringOrNull(input.httpEndpoint);
    if (endpoint) {
      const timeoutMs = clampInt(Number(input.httpTimeoutMs ?? 5000), 200, 60000);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(toStringOrNull(input.httpAuthToken)
              ? { authorization: `Bearer ${toStringOrNull(input.httpAuthToken)}` }
              : {}),
          },
          body: JSON.stringify({
            mode: input.mode,
            reason: input.reason,
            detail,
            step_index: input.stepIndex,
            tool_name: input.toolName,
            command: input.command ?? null,
            argv: input.argv ?? [],
            step: input.stepObj ?? {},
            allowed_commands: [...input.allowedCommands.values()],
          }),
          signal: controller.signal,
        });
        const payload = await resp.json().catch(() => ({}));
        const payloadObj = asObject(payload);
        const payloadPatch = payloadObj ? asObject(payloadObj.patch) : null;
        if (resp.ok && payloadPatch) {
          const strategy = toStringOrNull(payloadObj?.strategy) ?? "http_synth_patch";
          return {
            strategy,
            reason: input.reason,
            detail,
            source: "http_synth",
            patch: payloadPatch,
            fallback_patch: buildDeterministicGuidedRepairPatch({
              stepIndex: input.stepIndex,
              toolName: input.toolName,
              reason: input.reason,
              detail,
            }).patch,
          };
        }
        return {
          ...buildHeuristicGuidedRepairPatch({
            stepIndex: input.stepIndex,
            toolName: input.toolName,
            reason: input.reason,
            detail,
            stepObj: input.stepObj,
            command: input.command,
            argv: input.argv,
            allowedCommands: input.allowedCommands,
            commandAliasMap: input.commandAliasMap,
          }),
          source: "http_synth_fallback",
          synth_error: `http_status_${resp.status}`,
        };
      } catch (err: any) {
        return {
          ...buildHeuristicGuidedRepairPatch({
            stepIndex: input.stepIndex,
            toolName: input.toolName,
            reason: input.reason,
            detail,
            stepObj: input.stepObj,
            command: input.command,
            argv: input.argv,
            allowedCommands: input.allowedCommands,
            commandAliasMap: input.commandAliasMap,
          }),
          source: "http_synth_fallback",
          synth_error: String(err?.message ?? err),
        };
      } finally {
        clearTimeout(timer);
      }
    }
  }

  if (input.strategy === "heuristic_patch") {
    return buildHeuristicGuidedRepairPatch({
      stepIndex: input.stepIndex,
      toolName: input.toolName,
      reason: input.reason,
      detail,
      stepObj: input.stepObj,
      command: input.command,
      argv: input.argv,
      allowedCommands: input.allowedCommands,
      commandAliasMap: input.commandAliasMap,
    });
  }

  return buildDeterministicGuidedRepairPatch({
    stepIndex: input.stepIndex,
    toolName: input.toolName,
    reason: input.reason,
    detail,
  });
}

function cloneJson<T>(input: T): T {
  return JSON.parse(JSON.stringify(input)) as T;
}

function applyPlaybookRepairPatch(
  sourceSlots: Record<string, unknown>,
  patchObj: Record<string, unknown>,
): {
  nextSlots: Record<string, unknown>;
  summary: Record<string, unknown>;
} {
  const nextSlots = cloneJson(sourceSlots);
  const summary: Record<string, unknown> = {
    steps_override: false,
    step_patches_applied: 0,
    steps_removed: 0,
    top_level_updates: [] as string[],
  };

  const sourceStepsRaw = Array.isArray(nextSlots.steps_template) ? nextSlots.steps_template : [];
  let steps: Array<Record<string, unknown>> = sourceStepsRaw.map((s) => {
    const obj = asObject(s);
    return obj ? cloneJson(obj) : {};
  });

  const stepsOverride = Array.isArray(patchObj.steps_override) ? patchObj.steps_override : null;
  if (stepsOverride) {
    steps = stepsOverride.map((s) => {
      const obj = asObject(s);
      return obj ? cloneJson(obj) : {};
    });
    summary.steps_override = true;
  }

  const removeIndices = Array.isArray(patchObj.remove_step_indices)
    ? patchObj.remove_step_indices
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v))
        .map((v) => Math.trunc(v))
    : [];
  if (removeIndices.length > 0) {
    const before = steps.length;
    const deny = new Set(removeIndices);
    steps = steps.filter((step) => {
      const idx = Number(step.step_index ?? NaN);
      return !Number.isFinite(idx) || !deny.has(Math.trunc(idx));
    });
    summary.steps_removed = Math.max(0, before - steps.length);
  }

  const stepPatches = Array.isArray(patchObj.step_patches) ? patchObj.step_patches : [];
  for (const rawPatch of stepPatches) {
    const p = asObject(rawPatch);
    if (!p) continue;
    const stepIndex = Number(p.step_index ?? NaN);
    if (!Number.isFinite(stepIndex)) continue;
    const set = asObject(p.set);
    if (!set) continue;
    const idx = Math.trunc(stepIndex);
    const pos = steps.findIndex((s) => Number(s.step_index ?? NaN) === idx);
    if (pos < 0) continue;
    steps[pos] = {
      ...steps[pos],
      ...set,
    };
    summary.step_patches_applied = Number(summary.step_patches_applied ?? 0) + 1;
  }
  nextSlots.steps_template = steps;

  if (asObject(patchObj.matchers)) {
    nextSlots.matchers = cloneJson(asObject(patchObj.matchers));
    (summary.top_level_updates as string[]).push("matchers");
  }
  if (asObject(patchObj.success_criteria)) {
    nextSlots.success_criteria = cloneJson(asObject(patchObj.success_criteria));
    (summary.top_level_updates as string[]).push("success_criteria");
  }
  const riskProfile = toStringOrNull(patchObj.risk_profile);
  if (riskProfile === "low" || riskProfile === "medium" || riskProfile === "high") {
    nextSlots.risk_profile = riskProfile;
    (summary.top_level_updates as string[]).push("risk_profile");
  }
  const policyConstraints = asObject(patchObj.policy_constraints);
  if (policyConstraints) {
    nextSlots.policy_constraints = cloneJson(policyConstraints);
    (summary.top_level_updates as string[]).push("policy_constraints");
  }

  return { nextSlots, summary };
}

async function validatePlaybookShadowReadiness(
  stepsRaw: unknown[],
  localExecutor: ReplayLocalExecutorOptions | undefined,
): Promise<{
  pass: boolean;
  total_steps: number;
  ready_steps: number;
  blocked_steps: number;
  unknown_steps: number;
  checks: Array<Record<string, unknown>>;
}> {
  const checks: Array<Record<string, unknown>> = [];
  let readySteps = 0;
  let blockedSteps = 0;
  let unknownSteps = 0;

  for (const step of stepsRaw) {
    const stepObj = asObject(step) ?? {};
    const stepIndex = Number(stepObj.step_index ?? 0) || null;
    const toolName = toStringOrNull(stepObj.tool_name);
    const preconditions = Array.isArray(stepObj.preconditions) ? stepObj.preconditions : [];
    const preChecks: PreconditionResult[] = [];
    for (const cond of preconditions) preChecks.push(await evaluatePrecondition(cond));
    const preFailed = preChecks.filter((c) => c.state === "fail");
    const preUnknown = preChecks.filter((c) => c.state === "unknown");

    let commandCheck: Record<string, unknown> | null = null;
    let commandState: "pass" | "fail" | "unknown" = "pass";
    if (isReplayCommandTool(toolName)) {
      const argv = parseStepArgv(stepObj, toolName);
      const command = String(argv[0] ?? "").trim();
      if (!command || argv.length === 0 || !isSafeCommandName(command)) {
        commandState = "fail";
        commandCheck = {
          state: "fail",
          reason: "invalid_command_argv",
          command,
        };
      } else if (!localExecutor?.enabled || localExecutor.mode !== "local_process") {
        commandState = "unknown";
        commandCheck = {
          state: "unknown",
          reason: "local_executor_not_enabled",
          command,
        };
      } else if (!localExecutor.allowedCommands.has(command)) {
        commandState = "fail";
        commandCheck = {
          state: "fail",
          reason: "command_not_allowed",
          command,
        };
      } else {
        commandState = "pass";
        commandCheck = {
          state: "pass",
          reason: "allowed_command",
          command,
        };
      }
    }

    let readiness: "ready" | "blocked" | "unknown";
    if (preFailed.length > 0 || commandState === "fail") {
      readiness = "blocked";
      blockedSteps += 1;
    } else if (preUnknown.length > 0 || commandState === "unknown") {
      readiness = "unknown";
      unknownSteps += 1;
    } else {
      readiness = "ready";
      readySteps += 1;
    }

    checks.push({
      step_index: stepIndex,
      tool_name: toolName,
      readiness,
      preconditions: preChecks,
      command_check: commandCheck,
    });
  }

  return {
    pass: blockedSteps === 0,
    total_steps: stepsRaw.length,
    ready_steps: readySteps,
    blocked_steps: blockedSteps,
    unknown_steps: unknownSteps,
    checks,
  };
}

type ShadowValidationGateMetrics = {
  pass: boolean;
  total_steps: number;
  succeeded_steps: number;
  failed_steps: number;
  blocked_steps: number;
  unknown_steps: number;
  success_ratio: number;
};

function extractShadowValidationGateMetrics(validation: Record<string, unknown> | null): ShadowValidationGateMetrics | null {
  if (!validation) return null;
  const pass = Boolean(validation.pass === true);
  const summary = asObject(validation.summary);

  if (summary) {
    const total = Math.max(0, Math.trunc(Number(summary.total_steps ?? 0) || 0));
    const succeeded = Math.max(0, Math.trunc(Number(summary.succeeded_steps ?? 0) || 0));
    const failed = Math.max(0, Math.trunc(Number(summary.failed_steps ?? 0) || 0));
    const blocked = Math.max(0, Math.trunc(Number(summary.blocked_steps ?? 0) || 0));
    const unknown = Math.max(0, Math.trunc(Number(summary.unknown_steps ?? 0) || 0));
    const ratio = total > 0 ? succeeded / total : 0;
    return {
      pass,
      total_steps: total,
      succeeded_steps: succeeded,
      failed_steps: failed,
      blocked_steps: blocked,
      unknown_steps: unknown,
      success_ratio: ratio,
    };
  }

  const total = Math.max(0, Math.trunc(Number(validation.total_steps ?? 0) || 0));
  const ready = Math.max(0, Math.trunc(Number(validation.ready_steps ?? 0) || 0));
  const blocked = Math.max(0, Math.trunc(Number(validation.blocked_steps ?? 0) || 0));
  const unknown = Math.max(0, Math.trunc(Number(validation.unknown_steps ?? 0) || 0));
  const failed = blocked;
  const ratio = total > 0 ? ready / total : 0;
  return {
    pass,
    total_steps: total,
    succeeded_steps: ready,
    failed_steps: failed,
    blocked_steps: blocked,
    unknown_steps: unknown,
    success_ratio: ratio,
  };
}

function evaluateAutoPromoteGate(
  metrics: ShadowValidationGateMetrics | null,
  gate: Record<string, unknown>,
): {
  pass: boolean;
  reasons: string[];
  gate_echo: Record<string, unknown>;
  metrics: ShadowValidationGateMetrics | null;
} {
  const requireShadowPass = gate.require_shadow_pass !== false;
  const minTotalSteps = Math.max(0, Math.trunc(Number(gate.min_total_steps ?? 0) || 0));
  const maxFailedSteps = Math.max(0, Math.trunc(Number(gate.max_failed_steps ?? 0) || 0));
  const maxBlockedSteps = Math.max(0, Math.trunc(Number(gate.max_blocked_steps ?? 0) || 0));
  const maxUnknownSteps = Math.max(0, Math.trunc(Number(gate.max_unknown_steps ?? 0) || 0));
  const minSuccessRatio = Math.max(0, Math.min(1, Number(gate.min_success_ratio ?? 1)));
  const reasons: string[] = [];

  if (!metrics) {
    reasons.push("missing_shadow_validation_metrics");
  } else {
    if (requireShadowPass && !metrics.pass) reasons.push("shadow_validation_not_pass");
    if (metrics.total_steps < minTotalSteps) reasons.push("total_steps_below_threshold");
    if (metrics.failed_steps > maxFailedSteps) reasons.push("failed_steps_above_threshold");
    if (metrics.blocked_steps > maxBlockedSteps) reasons.push("blocked_steps_above_threshold");
    if (metrics.unknown_steps > maxUnknownSteps) reasons.push("unknown_steps_above_threshold");
    if (metrics.success_ratio < minSuccessRatio) reasons.push("success_ratio_below_threshold");
  }

  return {
    pass: reasons.length === 0,
    reasons,
    gate_echo: {
      require_shadow_pass: requireShadowPass,
      min_total_steps: minTotalSteps,
      max_failed_steps: maxFailedSteps,
      max_blocked_steps: maxBlockedSteps,
      max_unknown_steps: maxUnknownSteps,
      min_success_ratio: minSuccessRatio,
    },
    metrics,
  };
}

function buildCommitUri(tenantId: string, scope: string, commitId: string) {
  return buildAionisUri({
    tenant_id: tenantId,
    scope,
    type: "commit",
    id: commitId,
  });
}

type ReplayCompileVariableKind = "path" | "url" | "uuid" | "version";

type ReplayCompileVariableSummary = {
  name: string;
  kind: ReplayCompileVariableKind;
  sample: string;
  occurrences: number;
  step_indexes: number[];
  paths: string[];
};

function canonicalizeJsonForFingerprint(input: unknown): unknown {
  if (Array.isArray(input)) return input.map((item) => canonicalizeJsonForFingerprint(item));
  if (!input || typeof input !== "object") return input;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input as Record<string, unknown>).sort()) {
    out[key] = canonicalizeJsonForFingerprint((input as Record<string, unknown>)[key]);
  }
  return out;
}

function stableJsonForFingerprint(input: unknown): string {
  try {
    return JSON.stringify(canonicalizeJsonForFingerprint(input));
  } catch {
    return JSON.stringify(String(input));
  }
}

function fingerprintHexForReplay(input: unknown): string {
  return sha256Hex(stableJsonForFingerprint(input));
}

function resolveReplayDeterministicGate(input: unknown): ReplayDeterministicGateResolved {
  const obj = asObject(input);
  if (!obj) {
    return {
      enabled: false,
      preferDeterministicExecution: false,
      onMismatch: "fallback",
      requiredStatuses: ["shadow", "active"],
      requestMatchers: null,
      requestPolicyConstraints: null,
    };
  }
  const requiredStatusesRaw = Array.isArray(obj.required_statuses) ? obj.required_statuses : ["shadow", "active"];
  const requiredStatuses = requiredStatusesRaw
    .map((value) => toStringOrNull(value))
    .filter((value): value is string => Boolean(value));
  return {
    enabled: obj.enabled !== false,
    preferDeterministicExecution: obj.prefer_deterministic_execution !== false,
    onMismatch: obj.on_mismatch === "reject" ? "reject" : "fallback",
    requiredStatuses: requiredStatuses.length > 0 ? requiredStatuses : ["shadow", "active"],
    requestMatchers: asObject(obj.matchers),
    requestPolicyConstraints: asObject(obj.policy_constraints),
  };
}

function evaluateReplayDeterministicGate(args: {
  requestedMode: "simulate" | "strict" | "guided";
  gateInput: unknown;
  playbookStatus: string | null;
  playbookSlots: Record<string, unknown>;
}): ReplayDeterministicGateEvaluation {
  assertEmbeddingSurfaceForbidden("replay_deterministic_gate");
  const gate = resolveReplayDeterministicGate(args.gateInput);
  const playbookStatus = args.playbookStatus ?? "draft";
  const playbookMatchers = asObject(args.playbookSlots.matchers) ?? {};
  const playbookPolicyConstraints = asObject(args.playbookSlots.policy_constraints) ?? {};
  const requestMatcherFingerprint = gate.requestMatchers ? fingerprintHexForReplay(gate.requestMatchers) : null;
  const playbookMatcherFingerprint = fingerprintHexForReplay(playbookMatchers);
  const requestPolicyFingerprint = gate.requestPolicyConstraints ? fingerprintHexForReplay(gate.requestPolicyConstraints) : null;
  const playbookPolicyFingerprint = fingerprintHexForReplay(playbookPolicyConstraints);
  const statusMatch = gate.requiredStatuses.includes(playbookStatus);
  const matchersMatch =
    gate.requestMatchers == null || stableJsonForFingerprint(gate.requestMatchers) === stableJsonForFingerprint(playbookMatchers);
  const policyConstraintsMatch =
    gate.requestPolicyConstraints == null
      || stableJsonForFingerprint(gate.requestPolicyConstraints) === stableJsonForFingerprint(playbookPolicyConstraints);
  const matched = gate.enabled && statusMatch && matchersMatch && policyConstraintsMatch;
  const mismatchReasons: string[] = [];
  if (gate.enabled && !statusMatch) mismatchReasons.push("status_not_allowed_for_deterministic_replay");
  if (gate.enabled && !matchersMatch) mismatchReasons.push("matcher_fingerprint_mismatch");
  if (gate.enabled && !policyConstraintsMatch) mismatchReasons.push("policy_constraints_fingerprint_mismatch");
  const effectiveMode =
    matched && gate.preferDeterministicExecution && args.requestedMode === "simulate"
      ? "strict"
      : args.requestedMode;
  return {
    enabled: gate.enabled,
    requested_mode: args.requestedMode,
    effective_mode: effectiveMode,
    decision:
      !gate.enabled
        ? "disabled"
        : matched
          ? effectiveMode === "strict" && args.requestedMode === "simulate"
            ? "promoted_to_strict"
            : "matched"
          : gate.onMismatch === "reject"
            ? "rejected"
            : "fallback_to_requested_mode",
    mismatch_reasons: mismatchReasons,
    inference_skipped: matched && effectiveMode === "strict",
    playbook_status: playbookStatus,
    required_statuses: gate.requiredStatuses,
    status_match: statusMatch,
    matchers_match: matchersMatch,
    policy_constraints_match: policyConstraintsMatch,
    matched,
    request_matcher_fingerprint: requestMatcherFingerprint,
    playbook_matcher_fingerprint: playbookMatcherFingerprint,
    request_policy_fingerprint: requestPolicyFingerprint,
    playbook_policy_fingerprint: playbookPolicyFingerprint,
  };
}

function nextActionForReplayDeterministicGate(evaluation: ReplayDeterministicGateEvaluation): string {
  if (!evaluation.enabled) return "deterministic_gate_not_requested";
  if (evaluation.matched) return "safe_to_skip_primary_inference";
  if (evaluation.decision === "rejected") return "inspect_gate_mismatch_before_execution";
  if (evaluation.mismatch_reasons.includes("status_not_allowed_for_deterministic_replay")) {
    return "promote_or_select_a_replayable_playbook_version";
  }
  return "fallback_to_normal_planner_or_simulate";
}

function dedupeReplayCompileSteps(
  steps: Array<Record<string, unknown>>,
): {
  steps: Array<Record<string, unknown>>;
  removed_count: number;
  removed_step_indexes: number[];
} {
  const kept: Array<Record<string, unknown>> = [];
  const removedStepIndexes: number[] = [];
  let previousFingerprint: string | null = null;
  let previousWasRepair = false;

  for (const raw of steps) {
    const step = asObject(raw) ? cloneJson(asObject(raw)!) : {};
    const stepIndex = Number(step.step_index ?? NaN);
    const fingerprint = stableJsonForFingerprint({
      tool_name: toStringOrNull(step.tool_name),
      tool_input_template: step.tool_input_template ?? {},
      expected_output_signature: step.expected_output_signature ?? null,
      preconditions: Array.isArray(step.preconditions) ? step.preconditions : [],
      postconditions: Array.isArray(step.postconditions) ? step.postconditions : [],
      retry_policy: asObject(step.retry_policy) ?? null,
      safety_level: toStringOrNull(step.safety_level) ?? "needs_confirm",
      last_outcome: toStringOrNull(step.last_outcome) ?? "pending",
    });
    const outcome = toStringOrNull(step.last_outcome) ?? "pending";
    const isRepair = Boolean(step.repair_applied_last_run === true);
    const canDropAsDuplicate =
      previousFingerprint != null
      && previousFingerprint === fingerprint
      && outcome === "success"
      && !isRepair
      && !previousWasRepair;
    if (canDropAsDuplicate) {
      if (Number.isFinite(stepIndex)) removedStepIndexes.push(Math.trunc(stepIndex));
      continue;
    }
    kept.push(step);
    previousFingerprint = fingerprint;
    previousWasRepair = isRepair;
  }

  return {
    steps: kept,
    removed_count: Math.max(0, steps.length - kept.length),
    removed_step_indexes: removedStepIndexes,
  };
}

function detectReplayCompileVariableKind(raw: string): ReplayCompileVariableKind | null {
  const v = raw.trim();
  if (!v) return null;
  if (UUID_V4_OR_VX.test(v)) return "uuid";
  if (/^https?:\/\/[^\s]+$/i.test(v)) return "url";
  if (/^(\/|~\/|\.\.?\/)[^\s]*$/.test(v)) return "path";
  if (/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(v)) return "version";
  return null;
}

function collectReplayCompileVariableStrings(
  value: unknown,
  path: string,
  out: Array<{ path: string; value: string }>,
) {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (normalized.length > 0) out.push({ path, value: normalized });
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      collectReplayCompileVariableStrings(value[i], `${path}[${i}]`, out);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = k.trim();
    if (!key) continue;
    collectReplayCompileVariableStrings(v, `${path}.${key}`, out);
  }
}

function enrichReplayCompileStepsWithVariables(
  steps: Array<Record<string, unknown>>,
): {
  steps: Array<Record<string, unknown>>;
  summary: {
    variable_count: number;
    steps_with_variables: number;
    variables: ReplayCompileVariableSummary[];
  };
} {
  type Candidate = {
    kind: ReplayCompileVariableKind;
    sample: string;
    step_index: number;
    path: string;
  };
  const allCandidates: Candidate[] = [];
  const stepCandidates = new Map<number, Candidate[]>();
  const nextSteps = steps.map((raw) => {
    const step = asObject(raw) ? cloneJson(asObject(raw)!) : {};
    const stepIndex = Number(step.step_index ?? NaN);
    if (!Number.isFinite(stepIndex)) return step;
    const idx = Math.trunc(stepIndex);
    const rawStrings: Array<{ path: string; value: string }> = [];
    collectReplayCompileVariableStrings(step.tool_input_template ?? {}, "tool_input_template", rawStrings);
    collectReplayCompileVariableStrings(step.expected_output_signature ?? null, "expected_output_signature", rawStrings);
    collectReplayCompileVariableStrings(step.preconditions ?? [], "preconditions", rawStrings);
    collectReplayCompileVariableStrings(step.postconditions ?? [], "postconditions", rawStrings);
    for (const entry of rawStrings) {
      const kind = detectReplayCompileVariableKind(entry.value);
      if (!kind) continue;
      const candidate: Candidate = {
        kind,
        sample: entry.value.slice(0, 160),
        step_index: idx,
        path: entry.path,
      };
      allCandidates.push(candidate);
      const bucket = stepCandidates.get(idx) ?? [];
      bucket.push(candidate);
      stepCandidates.set(idx, bucket);
    }
    return step;
  });

  const grouped = new Map<string, ReplayCompileVariableSummary>();
  for (const c of allCandidates) {
    const key = `${c.kind}:${c.sample}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        name: "",
        kind: c.kind,
        sample: c.sample,
        occurrences: 1,
        step_indexes: [c.step_index],
        paths: [c.path],
      });
      continue;
    }
    existing.occurrences += 1;
    if (!existing.step_indexes.includes(c.step_index)) existing.step_indexes.push(c.step_index);
    if (!existing.paths.includes(c.path)) existing.paths.push(c.path);
  }

  const kindSeq = new Map<ReplayCompileVariableKind, number>();
  const variables = Array.from(grouped.values())
    .sort((a, b) => {
      if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return a.sample.localeCompare(b.sample);
    })
    .map((v) => {
      const seq = (kindSeq.get(v.kind) ?? 0) + 1;
      kindSeq.set(v.kind, seq);
      return {
        ...v,
        name: `${v.kind}_${seq}`,
        step_indexes: v.step_indexes.slice().sort((x, y) => x - y),
        paths: v.paths.slice(0, 12),
      };
    });

  const nameByKey = new Map<string, string>();
  for (const v of variables) nameByKey.set(`${v.kind}:${v.sample}`, v.name);

  const enriched = nextSteps.map((raw) => {
    const step = asObject(raw) ? cloneJson(asObject(raw)!) : {};
    const stepIndex = Number(step.step_index ?? NaN);
    if (!Number.isFinite(stepIndex)) return step;
    const idx = Math.trunc(stepIndex);
    const candidates = stepCandidates.get(idx) ?? [];
    const templateVars = candidates
      .map((c) => ({
        name: nameByKey.get(`${c.kind}:${c.sample}`) ?? "",
        kind: c.kind,
        sample: c.sample,
        path: c.path,
      }))
      .filter((v) => v.name.length > 0)
      .slice(0, 16);
    if (templateVars.length > 0) {
      step.template_variables = templateVars;
    }
    return step;
  });

  return {
    steps: enriched,
    summary: {
      variable_count: variables.length,
      steps_with_variables: new Set(variables.flatMap((v) => v.step_indexes)).size,
      variables: variables.slice(0, 100),
    },
  };
}

function scoreReplayCompileStep(
  step: Record<string, unknown>,
): {
  score: number;
  flags: string[];
} {
  const flags: string[] = [];
  let score = 0.25;
  const toolName = toStringOrNull(step.tool_name);
  const preconditions = Array.isArray(step.preconditions) ? step.preconditions : [];
  const postconditions = Array.isArray(step.postconditions) ? step.postconditions : [];
  const expected = step.expected_output_signature;
  const hasExpected = expected != null && (typeof expected !== "object" || Object.keys(asObject(expected) ?? {}).length > 0);
  const safety = toStringOrNull(step.safety_level) ?? "needs_confirm";
  const outcome = toStringOrNull(step.last_outcome) ?? "pending";
  const repairApplied = Boolean(step.repair_applied_last_run === true);

  if (!toolName) {
    flags.push("missing_tool_name");
    score -= 0.25;
  }
  if (preconditions.length > 0) {
    score += 0.2;
  } else {
    flags.push("missing_preconditions");
  }
  if (postconditions.length > 0) {
    score += 0.15;
  } else {
    flags.push("missing_postconditions");
  }
  if (hasExpected) {
    score += 0.15;
  } else {
    flags.push("missing_expected_signature");
  }
  if (safety === "auto_ok") score += 0.1;
  else if (safety === "needs_confirm") score += 0.05;
  else flags.push("manual_only_step");

  if (outcome === "success") score += 0.15;
  else if (outcome === "failed") {
    score -= 0.1;
    flags.push("last_outcome_failed");
  }

  if (repairApplied) {
    score -= 0.15;
    flags.push("repair_applied_last_run");
  }

  const bounded = Math.max(0, Math.min(1, score));
  if (bounded < 0.5) flags.push("low_quality");
  return { score: Number(bounded.toFixed(3)), flags };
}

function enrichReplayCompileStepsWithQuality(
  steps: Array<Record<string, unknown>>,
): {
  steps: Array<Record<string, unknown>>;
  summary: {
    average_step_quality_score: number;
    low_quality_steps: number;
    low_quality_step_indexes: number[];
    repaired_steps: number;
    recommendations: string[];
  };
} {
  let totalScore = 0;
  let totalSteps = 0;
  let lowQualitySteps = 0;
  let repairedSteps = 0;
  const lowQualityIndexes: number[] = [];
  const enriched = steps.map((raw) => {
    const step = asObject(raw) ? cloneJson(asObject(raw)!) : {};
    const scored = scoreReplayCompileStep(step);
    const idx = Number(step.step_index ?? NaN);
    step.quality_score = scored.score;
    step.quality_flags = scored.flags;
    totalSteps += 1;
    totalScore += scored.score;
    if (scored.score < 0.5) {
      lowQualitySteps += 1;
      if (Number.isFinite(idx)) lowQualityIndexes.push(Math.trunc(idx));
    }
    if (step.repair_applied_last_run === true) repairedSteps += 1;
    return step;
  });

  const recommendations: string[] = [];
  if (lowQualitySteps > 0) {
    recommendations.push("improve low-quality steps by adding preconditions, postconditions, and expected output signatures");
  }
  if (repairedSteps > 0) {
    recommendations.push("review repaired steps and keep strict safety_level for unstable tool calls");
  }

  return {
    steps: enriched,
    summary: {
      average_step_quality_score: totalSteps > 0 ? Number((totalScore / totalSteps).toFixed(3)) : 0,
      low_quality_steps: lowQualitySteps,
      low_quality_step_indexes: lowQualityIndexes.sort((a, b) => a - b),
      repaired_steps: repairedSteps,
      recommendations,
    },
  };
}

export async function replayRunStart(client: pg.PoolClient, body: unknown, opts: ReplayWriteOptions) {
  const parsed = parseRunStartInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const writeIdentity = replayWriteIdentityFromInput(parsed);
  const runId = parsed.run_id ?? randomUUID();
  const cid = runClientId(runId);
  const nowIso = new Date().toISOString();
  const writeReq = {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    actor: parsed.actor ?? "replay_api",
    input_text: parsed.goal,
    auto_embed: false,
    ...writeIdentity,
    nodes: [
      {
        client_id: cid,
        type: "event" as const,
        title: `Replay Run ${runId.slice(0, 8)}`,
        text_summary: parsed.goal,
        slots: {
          replay_kind: "run",
          run_id: runId,
          goal: parsed.goal,
          status: "started",
          started_at: nowIso,
          context_snapshot_ref: parsed.context_snapshot_ref ?? null,
          context_snapshot_hash: parsed.context_snapshot_hash ?? null,
          metadata: parsed.metadata ?? {},
        },
      },
    ],
    edges: [],
  };
  const { out } = await applyReplayMemoryWrite(client, writeReq, opts);
  const node = out.nodes.find((n) => n.client_id === cid) ?? out.nodes[0] ?? null;
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    run_id: runId,
    status: "started",
    run_node_id: node?.id ?? null,
    run_uri:
      node?.id != null
        ? buildAionisUri({
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            type: "event",
            id: node.id,
          })
        : null,
    commit_id: out.commit_id,
    commit_uri: out.commit_uri ?? buildCommitUri(tenancy.tenant_id, tenancy.scope, out.commit_id),
    commit_hash: out.commit_hash,
  };
}

export async function replayStepBefore(client: pg.PoolClient, body: unknown, opts: ReplayWriteOptions) {
  const parsed = parseStepBeforeInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const visibility = replayVisibilityFromInput(parsed);
  const writeIdentity = replayWriteIdentityFromInput(parsed);
  const replayAccess = replayAccessForClient(client, opts);
  const runNode = await replayAccess.findRunNodeByRunId(tenancy.scope_key, parsed.run_id, visibility);
  if (!runNode) {
    throw new HttpError(404, "replay_run_not_found", "run_id was not found in this scope", {
      run_id: parsed.run_id,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
    });
  }
  const stepId = parsed.step_id ?? randomUUID();
  const stepCid = stepClientId(parsed.run_id, stepId);
  const writeReq = {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    actor: parsed.actor ?? "replay_api",
    input_text: `step before ${parsed.tool_name}`,
    auto_embed: false,
    ...writeIdentity,
    nodes: [
      {
        client_id: stepCid,
        type: "procedure" as const,
        title: `Step ${parsed.step_index}: ${parsed.tool_name}`,
        text_summary: `Replay step ${parsed.step_index} prepared for ${parsed.tool_name}`,
        slots: {
          replay_kind: "step",
          phase: "before",
          run_id: parsed.run_id,
          step_id: stepId,
          decision_id: parsed.decision_id ?? null,
          step_index: parsed.step_index,
          tool_name: parsed.tool_name,
          tool_input: parsed.tool_input,
          expected_output_signature: parsed.expected_output_signature ?? null,
          preconditions: parsed.preconditions,
          retry_policy: parsed.retry_policy ?? null,
          safety_level: parsed.safety_level,
          status: "pending",
          metadata: parsed.metadata ?? {},
        },
      },
    ],
    edges: [
      {
        type: "part_of" as const,
        src: { client_id: stepCid },
        dst: { id: runNode.id },
      },
    ],
  };
  const { out } = await applyReplayMemoryWrite(client, writeReq, opts);
  const stepNode = out.nodes.find((n) => n.client_id === stepCid) ?? out.nodes[0] ?? null;
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    run_id: parsed.run_id,
    step_id: stepId,
    step_index: parsed.step_index,
    status: "pending",
    step_node_id: stepNode?.id ?? null,
    step_uri:
      stepNode?.id != null
        ? buildAionisUri({
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            type: "procedure",
            id: stepNode.id,
          })
        : null,
    commit_id: out.commit_id,
    commit_uri: out.commit_uri ?? buildCommitUri(tenancy.tenant_id, tenancy.scope, out.commit_id),
    commit_hash: out.commit_hash,
  };
}

export async function replayStepAfter(client: pg.PoolClient, body: unknown, opts: ReplayWriteOptions) {
  const parsed = parseStepAfterInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const visibility = replayVisibilityFromInput(parsed);
  const writeIdentity = replayWriteIdentityFromInput(parsed);
  const replayAccess = replayAccessForClient(client, opts);
  const runNode = await replayAccess.findRunNodeByRunId(tenancy.scope_key, parsed.run_id, visibility);
  if (!runNode) {
    throw new HttpError(404, "replay_run_not_found", "run_id was not found in this scope", {
      run_id: parsed.run_id,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
    });
  }
  let stepNode: ReplayNodeRow | null = null;
  let resolvedStepId = parsed.step_id ?? null;
  if (resolvedStepId) {
    stepNode = await replayAccess.findStepNodeById(tenancy.scope_key, resolvedStepId, visibility);
  } else if (parsed.step_index != null) {
    stepNode = await replayAccess.findLatestStepNodeByIndex(tenancy.scope_key, parsed.run_id, parsed.step_index, visibility);
    resolvedStepId =
      toStringOrNull(asObject(stepNode?.slots)?.step_id)
      ?? (stepNode?.id ?? null);
  }
  if (!stepNode && !resolvedStepId) {
    throw new HttpError(
      400,
      "replay_step_reference_required",
      "step_id or step_index is required to record step outcome",
      { run_id: parsed.run_id },
    );
  }
  const resultCid = stepResultClientId(parsed.run_id, resolvedStepId, parsed.status);
  const writeReq = {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    actor: parsed.actor ?? "replay_api",
    input_text: `step after ${parsed.status}`,
    auto_embed: false,
    ...writeIdentity,
    nodes: [
      {
        client_id: resultCid,
        type: "evidence" as const,
        title: `Step ${parsed.step_index ?? "?"} ${parsed.status}`,
        text_summary: parsed.error ?? parsed.repair_note ?? `Replay step outcome: ${parsed.status}`,
        slots: {
          replay_kind: "step_result",
          phase: "after",
          run_id: parsed.run_id,
          step_id: resolvedStepId,
          step_index: parsed.step_index ?? null,
          status: parsed.status,
          output_signature: parsed.output_signature ?? null,
          postconditions: parsed.postconditions,
          artifact_refs: parsed.artifact_refs,
          repair_applied: parsed.repair_applied,
          repair_note: parsed.repair_note ?? null,
          error: parsed.error ?? null,
          metadata: parsed.metadata ?? {},
        },
      },
    ],
    edges: [
      {
        type: "part_of" as const,
        src: { client_id: resultCid },
        dst: { id: runNode.id },
      },
      ...(stepNode
        ? [
            {
              type: "related_to" as const,
              src: { client_id: resultCid },
              dst: { id: stepNode.id },
            },
          ]
        : []),
    ],
  };
  const { out } = await applyReplayMemoryWrite(client, writeReq, opts);
  const resultNode = out.nodes.find((n) => n.client_id === resultCid) ?? out.nodes[0] ?? null;
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    run_id: parsed.run_id,
    step_id: resolvedStepId,
    status: parsed.status,
    replay_fallback_triggered: parsed.repair_applied,
    step_result_node_id: resultNode?.id ?? null,
    step_result_uri:
      resultNode?.id != null
        ? buildAionisUri({
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            type: "evidence",
            id: resultNode.id,
          })
        : null,
    commit_id: out.commit_id,
    commit_uri: out.commit_uri ?? buildCommitUri(tenancy.tenant_id, tenancy.scope, out.commit_id),
    commit_hash: out.commit_hash,
  };
}

export async function replayRunEnd(client: pg.PoolClient, body: unknown, opts: ReplayWriteOptions) {
  const parsed = parseRunEndInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const visibility = replayVisibilityFromInput(parsed);
  const writeIdentity = replayWriteIdentityFromInput(parsed);
  const replayAccess = replayAccessForClient(client, opts);
  const runNode = await replayAccess.findRunNodeByRunId(tenancy.scope_key, parsed.run_id, visibility);
  if (!runNode) {
    throw new HttpError(404, "replay_run_not_found", "run_id was not found in this scope", {
      run_id: parsed.run_id,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
    });
  }
  const endCid = runEndClientId(parsed.run_id);
  const writeReq = {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    actor: parsed.actor ?? "replay_api",
    input_text: parsed.summary ?? `run ${parsed.status}`,
    auto_embed: false,
    ...writeIdentity,
    nodes: [
      {
        client_id: endCid,
        type: "event" as const,
        title: `Replay Run End ${parsed.status}`,
        text_summary: parsed.summary ?? `Replay run ended with status=${parsed.status}`,
        slots: {
          replay_kind: "run_end",
          run_id: parsed.run_id,
          status: parsed.status,
          summary: parsed.summary ?? null,
          success_criteria: parsed.success_criteria ?? {},
          metrics: parsed.metrics ?? {},
          metadata: parsed.metadata ?? {},
          ended_at: new Date().toISOString(),
        },
      },
    ],
    edges: [
      {
        type: "part_of" as const,
        src: { client_id: endCid },
        dst: { id: runNode.id },
      },
    ],
  };
  const { out } = await applyReplayMemoryWrite(client, writeReq, opts);
  const endNode = out.nodes.find((n) => n.client_id === endCid) ?? out.nodes[0] ?? null;
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    run_id: parsed.run_id,
    status: parsed.status,
    run_end_node_id: endNode?.id ?? null,
    run_end_uri:
      endNode?.id != null
        ? buildAionisUri({
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            type: "event",
            id: endNode.id,
          })
        : null,
    commit_id: out.commit_id,
    commit_uri: out.commit_uri ?? buildCommitUri(tenancy.tenant_id, tenancy.scope, out.commit_id),
    commit_hash: out.commit_hash,
  };
}

export async function replayRunGet(client: pg.PoolClient, body: unknown, opts: ReplayReadOptions) {
  requireReplayReadAccess(opts);
  const parsed = parseRunGetInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const visibility = replayVisibilityFromInput(parsed);
  const replayAccess = replayAccessForClient(client, opts);
  const rows = await replayAccess.listReplayNodesByRunId(tenancy.scope_key, parsed.run_id, visibility);
  if (rows.length === 0) {
    throw new HttpError(404, "replay_run_not_found", "run_id was not found in this scope", {
      run_id: parsed.run_id,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
    });
  }

  const runNode = rows.find((r) => replayKindOf(r) === "run") ?? null;
  const runEndRows = rows.filter((r) => replayKindOf(r) === "run_end");
  const lastRunEnd = runEndRows.length > 0 ? runEndRows[runEndRows.length - 1] : null;
  const stepRows = rows.filter((r) => replayKindOf(r) === "step");
  const stepResultRows = rows.filter((r) => replayKindOf(r) === "step_result");
  const resultByStepId = new Map<string, ReplayNodeRow>();
  for (const row of stepResultRows) {
    const sid = toStringOrNull(asObject(row.slots)?.step_id);
    if (!sid) continue;
    resultByStepId.set(sid, row);
  }
  const timeline = rows.map((row) => ({
    uri: buildAionisUri({
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      type: row.type,
      id: row.id,
    }),
    node_id: row.id,
    type: row.type,
    replay_kind: replayKindOf(row),
    title: row.title,
    text_summary: row.text_summary,
    created_at: row.created_at,
    commit_id: row.commit_id,
    commit_uri:
      row.commit_id != null
        ? buildCommitUri(tenancy.tenant_id, tenancy.scope, row.commit_id)
        : null,
  }));

  const artifacts = stepResultRows.flatMap((row) => {
    if (!parsed.include_artifacts) return [];
    const slotsObj = asObject(row.slots);
    const refs = slotsObj?.artifact_refs;
    if (!Array.isArray(refs)) return [];
    return refs
      .map((v) => toStringOrNull(v))
      .filter((v): v is string => !!v);
  });

  const runStatus = toStringOrNull(asObject(lastRunEnd?.slots)?.status) ?? "in_progress";
  const runGoal = toStringOrNull(asObject(runNode?.slots)?.goal);

  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    run: {
      run_id: parsed.run_id,
      status: runStatus,
      goal: runGoal,
      run_node_id: runNode?.id ?? null,
      run_uri:
        runNode?.id != null
          ? buildAionisUri({
              tenant_id: tenancy.tenant_id,
              scope: tenancy.scope,
              type: runNode.type,
              id: runNode.id,
            })
          : null,
      started_at: runNode?.created_at ?? null,
      ended_at: lastRunEnd?.created_at ?? null,
    },
    steps: parsed.include_steps
      ? stepRows.map((row) => {
          const slotsObj = asObject(row.slots);
          const sid = toStringOrNull(slotsObj?.step_id) ?? row.id;
          const result = resultByStepId.get(sid) ?? null;
          const resultSlots = asObject(result?.slots);
          return {
            step_id: sid,
            step_index: Number(slotsObj?.step_index ?? 0) || null,
            tool_name: toStringOrNull(slotsObj?.tool_name),
            status: toStringOrNull(resultSlots?.status) ?? "pending",
            safety_level: toStringOrNull(slotsObj?.safety_level),
            repair_applied: Boolean(resultSlots?.repair_applied ?? false),
            preconditions: Array.isArray(slotsObj?.preconditions) ? slotsObj?.preconditions : [],
            postconditions: Array.isArray(resultSlots?.postconditions) ? resultSlots?.postconditions : [],
            artifact_refs: Array.isArray(resultSlots?.artifact_refs) ? resultSlots?.artifact_refs : [],
            step_uri: buildAionisUri({
              tenant_id: tenancy.tenant_id,
              scope: tenancy.scope,
              type: row.type,
              id: row.id,
            }),
            created_at: row.created_at,
            result_uri:
              result != null
                ? buildAionisUri({
                    tenant_id: tenancy.tenant_id,
                    scope: tenancy.scope,
                    type: result.type,
                    id: result.id,
                  })
                : null,
          };
        })
      : [],
    artifacts: parsed.include_artifacts ? artifacts : [],
    timeline,
    counters: {
      total_nodes: rows.length,
      step_nodes: stepRows.length,
      step_result_nodes: stepResultRows.length,
      artifact_refs: artifacts.length,
    },
  };
}

export async function replayPlaybookCompileFromRun(client: pg.PoolClient, body: unknown, opts: ReplayWriteOptions) {
  const parsed = parsePlaybookCompileInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const visibility = replayVisibilityFromInput(parsed);
  requireReplayReadAccess(opts);
  const replayAccess = replayAccessForClient(client, opts);
  const rows = await replayAccess.listReplayNodesByRunId(tenancy.scope_key, parsed.run_id, visibility);
  if (rows.length === 0) {
    throw new HttpError(404, "replay_run_not_found", "run_id was not found in this scope", {
      run_id: parsed.run_id,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
    });
  }
  const runNode = rows.find((r) => replayKindOf(r) === "run") ?? null;
  const runEndRows = rows.filter((r) => replayKindOf(r) === "run_end");
  const lastRunEnd = runEndRows.length > 0 ? runEndRows[runEndRows.length - 1] : null;
  const runStatus = toStringOrNull(asObject(lastRunEnd?.slots)?.status);
  if (!parsed.allow_partial && runStatus !== "success") {
    throw new HttpError(
      400,
      "replay_compile_requires_successful_run",
      "compile_from_run requires run_end status=success unless allow_partial=true",
      {
        run_id: parsed.run_id,
        run_status: runStatus ?? "in_progress",
      },
    );
  }

  const stepRows = rows
    .filter((r) => replayKindOf(r) === "step")
    .sort((a, b) => {
      const aIdx = Number(asObject(a.slots)?.step_index ?? 0);
      const bIdx = Number(asObject(b.slots)?.step_index ?? 0);
      if (aIdx !== bIdx) return aIdx - bIdx;
      return a.created_at.localeCompare(b.created_at);
    });
  if (stepRows.length === 0) {
    throw new HttpError(400, "replay_compile_no_steps", "run does not contain replay step nodes", {
      run_id: parsed.run_id,
    });
  }
  const resultByStepId = new Map<string, ReplayNodeRow>();
  for (const row of rows.filter((r) => replayKindOf(r) === "step_result")) {
    const sid = toStringOrNull(asObject(row.slots)?.step_id);
    if (!sid) continue;
    resultByStepId.set(sid, row);
  }

  const rawStepsTemplate = stepRows.map((row) => {
    const slotsObj = asObject(row.slots) ?? {};
    const stepId = toStringOrNull(slotsObj.step_id) ?? row.id;
    const result = resultByStepId.get(stepId);
    const resultSlots = asObject(result?.slots) ?? {};
    return {
      step_index: Number(slotsObj.step_index ?? 0),
      tool_name: toStringOrNull(slotsObj.tool_name),
      tool_input_template: slotsObj.tool_input ?? {},
      expected_output_signature: slotsObj.expected_output_signature ?? null,
      preconditions: Array.isArray(slotsObj.preconditions) ? slotsObj.preconditions : [],
      postconditions: Array.isArray(resultSlots.postconditions) ? resultSlots.postconditions : [],
      retry_policy: asObject(slotsObj.retry_policy) ?? null,
      safety_level: toStringOrNull(slotsObj.safety_level) ?? "needs_confirm",
      replay_mode: "replay_first_reason_if_needed",
      last_outcome: toStringOrNull(resultSlots.status) ?? "pending",
      repair_applied_last_run: Boolean(resultSlots.repair_applied ?? false),
    };
  });
  const dedupe = dedupeReplayCompileSteps(rawStepsTemplate);
  const withVariables = enrichReplayCompileStepsWithVariables(dedupe.steps);
  const withQuality = enrichReplayCompileStepsWithQuality(withVariables.steps);
  const stepsTemplate = withQuality.steps;

  const playbookId = parsed.playbook_id ?? randomUUID();
  const version = parsed.version;
  const playbookName = parsed.name?.trim() || `replay_playbook_${parsed.run_id.slice(0, 8)}`;
  const runEndSlots = asObject(lastRunEnd?.slots);
  const successCriteria =
    parsed.success_criteria
    ?? (asObject(runEndSlots?.success_criteria) ?? {});
  const summaryBase = {
    source_run_id: parsed.run_id,
    source_run_status: runStatus ?? "in_progress",
    steps_total: stepsTemplate.length,
    source_steps_total: rawStepsTemplate.length,
    steps_dedup_removed: dedupe.removed_count,
    dedup_removed_step_indexes: dedupe.removed_step_indexes,
    steps_with_last_repair: stepsTemplate.filter((s) => s.repair_applied_last_run).length,
    parameterization: withVariables.summary,
    quality: withQuality.summary,
    recommendations: Array.from(
      new Set([
        ...withQuality.summary.recommendations,
        ...(dedupe.removed_count > 0
          ? ["review duplicate removal in compiled playbook; add explicit step markers when repeated actions are required"]
          : []),
      ]),
    ),
    generated_at: new Date().toISOString(),
  };
  const usage = {
    prompt_tokens: estimateTokenCountFromUnknown({
      run_id: parsed.run_id,
      run_status: runStatus ?? "in_progress",
      allow_partial: parsed.allow_partial,
      source_steps_total: rawStepsTemplate.length,
      source_steps: rawStepsTemplate,
      matchers: parsed.matchers ?? {},
      success_criteria: successCriteria,
      risk_profile: parsed.risk_profile,
      metadata: parsed.metadata ?? {},
    }),
    completion_tokens: estimateTokenCountFromUnknown({
      playbook_id: playbookId,
      playbook_name: playbookName,
      version,
      status: "draft",
      steps_template: stepsTemplate,
      compile_summary: summaryBase,
    }),
    source: "estimated_char_based_v1" as const,
  };
  const usageOut = {
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    total_tokens: usage.prompt_tokens + usage.completion_tokens,
    source: usage.source,
  };
  const summary = {
    ...summaryBase,
    usage_estimate: usageOut,
  };
  const playbookCid = playbookClientId(playbookId, version);
  const writeIdentity = replayWriteIdentityFromInput(parsed, runNode ? replayWriteIdentityFromRow(runNode) : undefined);

  const writeReq = {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    actor: parsed.actor ?? "replay_compiler",
    input_text: `compile playbook ${playbookName}`,
    auto_embed: false,
    ...writeIdentity,
    nodes: [
      {
        client_id: playbookCid,
        type: "procedure" as const,
        title: playbookName,
        text_summary: `Replay playbook compiled from run ${parsed.run_id}`,
        slots: {
          replay_kind: "playbook",
          playbook_id: playbookId,
          name: playbookName,
          version,
          status: "draft",
          matchers: parsed.matchers ?? {},
          success_criteria: successCriteria,
          risk_profile: parsed.risk_profile,
          created_from_run_ids: [parsed.run_id],
          source_run_id: parsed.run_id,
          policy_constraints: {},
          steps_template: stepsTemplate,
          compile_summary: summary,
          metadata: parsed.metadata ?? {},
        },
      },
    ],
    edges: [
      ...(runNode
        ? [
            {
              type: "derived_from" as const,
              src: { client_id: playbookCid },
              dst: { id: runNode.id },
            },
          ]
        : []),
      ...stepRows.map((row) => ({
        type: "derived_from" as const,
        src: { client_id: playbookCid },
        dst: { id: row.id },
      })),
    ],
  };
  const { out } = await applyReplayMemoryWrite(client, writeReq, opts);
  const playbookNode = out.nodes.find((n) => n.client_id === playbookCid) ?? out.nodes[0] ?? null;
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    playbook_id: playbookId,
    version,
    status: "draft",
    source_run_id: parsed.run_id,
    playbook_node_id: playbookNode?.id ?? null,
    playbook_uri:
      playbookNode?.id != null
        ? buildAionisUri({
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            type: "procedure",
            id: playbookNode.id,
          })
        : null,
    compile_summary: summary,
    usage: usageOut,
    commit_id: out.commit_id,
    commit_uri: out.commit_uri ?? buildCommitUri(tenancy.tenant_id, tenancy.scope, out.commit_id),
    commit_hash: out.commit_hash,
  };
}

export async function replayPlaybookGet(client: pg.PoolClient, body: unknown, opts: ReplayReadOptions) {
  requireReplayReadAccess(opts);
  const parsed = parsePlaybookGetInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const visibility = replayVisibilityFromInput(parsed);
  const replayAccess = replayAccessForClient(client, opts);
  const versions = await replayAccess.listReplayPlaybookVersions(tenancy.scope_key, parsed.playbook_id, visibility);
  const row = versions[0] ?? null;
  if (!row) {
    throw new HttpError(404, "replay_playbook_not_found", "playbook_id was not found in this scope", {
      playbook_id: parsed.playbook_id,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
    });
  }
  const slotsObj = asObject(row.slots) ?? {};
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    playbook: {
      playbook_id: parsed.playbook_id,
      name: row.title,
      text_summary: row.text_summary,
      version: row.version_num,
      status: row.playbook_status ?? "draft",
      matchers: asObject(slotsObj.matchers) ?? {},
      success_criteria: asObject(slotsObj.success_criteria) ?? {},
      risk_profile: toStringOrNull(slotsObj.risk_profile) ?? "medium",
      source_run_id: toStringOrNull(slotsObj.source_run_id),
      steps_template: Array.isArray(slotsObj.steps_template) ? slotsObj.steps_template : [],
      compile_summary: asObject(slotsObj.compile_summary) ?? {},
      uri: buildAionisUri({
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        type: row.type,
        id: row.id,
      }),
      node_id: row.id,
      commit_id: row.commit_id,
      commit_uri:
        row.commit_id != null
          ? buildCommitUri(tenancy.tenant_id, tenancy.scope, row.commit_id)
          : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
  };
}

export async function replayPlaybookCandidate(client: pg.PoolClient, body: unknown, opts: ReplayReadOptions) {
  requireReplayReadAccess(opts);
  const parsed = parsePlaybookCandidateInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const visibility = replayVisibilityFromInput(parsed);
  const replayAccess = replayAccessForClient(client, opts);
  const row =
    parsed.version != null
      ? await replayAccess.getReplayPlaybookVersion(tenancy.scope_key, parsed.playbook_id, parsed.version, visibility)
      : (await replayAccess.listReplayPlaybookVersions(tenancy.scope_key, parsed.playbook_id, visibility))[0] ?? null;
  if (!row) {
    throw new HttpError(404, "replay_playbook_not_found", "playbook was not found in this scope", {
      playbook_id: parsed.playbook_id,
      version: parsed.version ?? null,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
    });
  }
  const slotsObj = asObject(row.slots) ?? {};
  const deterministicGate = evaluateReplayDeterministicGate({
    requestedMode: "simulate",
    gateInput: parsed.deterministic_gate,
    playbookStatus: row.playbook_status,
    playbookSlots: slotsObj,
  });
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    playbook: {
      playbook_id: parsed.playbook_id,
      version: row.version_num,
      status: row.playbook_status ?? "draft",
      name: row.title,
      uri: buildAionisUri({
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        type: row.type,
        id: row.id,
      }),
      node_id: row.id,
    },
    candidate: {
      eligible_for_deterministic_replay: deterministicGate.matched,
      recommended_mode: deterministicGate.effective_mode,
      next_action: nextActionForReplayDeterministicGate(deterministicGate),
      mismatch_reasons: deterministicGate.mismatch_reasons,
      rejectable: deterministicGate.enabled && deterministicGate.decision === "rejected",
    },
    deterministic_gate: deterministicGate,
    cost_signals: buildReplayCostSignals({ deterministic_gate: deterministicGate }),
  };
}

export async function replayPlaybookDispatch(client: pg.PoolClient, body: unknown, opts: ReplayPlaybookRunOptions) {
  requireReplayReadAccess(opts);
  const parsed = parsePlaybookDispatchInput(body);
  const candidate = await replayPlaybookCandidate(
    client,
    {
      tenant_id: parsed.tenant_id,
      scope: parsed.scope,
      consumer_agent_id: parsed.consumer_agent_id,
      consumer_team_id: parsed.consumer_team_id,
      playbook_id: parsed.playbook_id,
      version: parsed.version,
      deterministic_gate: parsed.deterministic_gate,
    },
    opts,
  );
  const eligible = Boolean((candidate as any).candidate?.eligible_for_deterministic_replay);
  if (eligible) {
    const replay = await replayPlaybookRun(
      client,
      {
        tenant_id: parsed.tenant_id,
        scope: parsed.scope,
        project_id: parsed.project_id,
        actor: parsed.actor,
        consumer_agent_id: parsed.consumer_agent_id,
        consumer_team_id: parsed.consumer_team_id,
        memory_lane: parsed.memory_lane,
        producer_agent_id: parsed.producer_agent_id,
        owner_agent_id: parsed.owner_agent_id,
        owner_team_id: parsed.owner_team_id,
        playbook_id: parsed.playbook_id,
        version: parsed.version,
        mode: "simulate",
        deterministic_gate: parsed.deterministic_gate,
        params: parsed.params,
        max_steps: parsed.max_steps,
      },
      opts,
    );
    return {
      tenant_id: (candidate as any).tenant_id,
      scope: (candidate as any).scope,
      dispatch: {
        decision: "deterministic_replay_executed",
        primary_inference_skipped: true,
        fallback_executed: false,
      },
      candidate,
      replay,
      cost_signals: buildReplayCostSignals({
        deterministic_gate: (replay as any)?.deterministic_gate,
        dispatch: { fallback_executed: false },
      }),
    };
  }
  if (parsed.execute_fallback === false) {
    return {
      tenant_id: (candidate as any).tenant_id,
      scope: (candidate as any).scope,
      dispatch: {
        decision: "candidate_only",
        primary_inference_skipped: false,
        fallback_executed: false,
      },
      candidate,
      replay: null,
      cost_signals: buildReplayCostSignals({
        deterministic_gate: (candidate as any)?.deterministic_gate,
        dispatch: { fallback_executed: false },
      }),
    };
  }
  const replay = await replayPlaybookRun(
    client,
    {
      tenant_id: parsed.tenant_id,
      scope: parsed.scope,
      project_id: parsed.project_id,
      actor: parsed.actor,
      consumer_agent_id: parsed.consumer_agent_id,
      consumer_team_id: parsed.consumer_team_id,
      memory_lane: parsed.memory_lane,
      producer_agent_id: parsed.producer_agent_id,
      owner_agent_id: parsed.owner_agent_id,
      owner_team_id: parsed.owner_team_id,
      playbook_id: parsed.playbook_id,
      version: parsed.version,
      mode: parsed.fallback_mode,
      params: parsed.params,
      max_steps: parsed.max_steps,
    },
    opts,
  );
  return {
    tenant_id: (candidate as any).tenant_id,
    scope: (candidate as any).scope,
    dispatch: {
      decision: "fallback_replay_executed",
      primary_inference_skipped: false,
      fallback_executed: true,
    },
    candidate,
    replay,
    cost_signals: buildReplayCostSignals({
      deterministic_gate: (replay as any)?.deterministic_gate,
      dispatch: { fallback_executed: true },
    }),
  };
}

export async function replayPlaybookPromote(client: pg.PoolClient, body: unknown, opts: ReplayWriteOptions) {
  requireReplayReadAccess(opts);
  const parsed = parsePlaybookPromoteInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const visibility = replayVisibilityFromInput(parsed);
  const replayAccess = replayAccessForClient(client, opts);
  const versions = await replayAccess.listReplayPlaybookVersions(tenancy.scope_key, parsed.playbook_id, visibility);
  const latest = versions[0] ?? null;
  if (!latest) {
    throw new HttpError(404, "replay_playbook_not_found", "playbook_id was not found in this scope", {
      playbook_id: parsed.playbook_id,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
    });
  }
  let source = latest;
  if (parsed.from_version != null) {
    const byVersion = await replayAccess.getReplayPlaybookVersion(
      tenancy.scope_key,
      parsed.playbook_id,
      parsed.from_version,
      visibility,
    );
    if (!byVersion) {
      throw new HttpError(404, "replay_playbook_version_not_found", "from_version was not found for this playbook", {
        playbook_id: parsed.playbook_id,
        from_version: parsed.from_version,
      });
    }
    source = byVersion;
  }

  const sourceSlots = asObject(source.slots) ?? {};
  const targetStatus = parsed.target_status;
  if ((source.playbook_status ?? "draft") === targetStatus && source === latest) {
    return {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      playbook_id: parsed.playbook_id,
      from_version: source.version_num,
      to_version: latest.version_num,
      status: latest.playbook_status ?? "draft",
      unchanged: true,
      reason: "already_target_status_on_latest",
      playbook_uri: buildAionisUri({
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        type: source.type,
        id: source.id,
      }),
    };
  }

  const nextVersion = latest.version_num + 1;
  const promoteCid = playbookClientId(parsed.playbook_id, nextVersion);
  const writeIdentity = replayWriteIdentityFromInput(parsed, replayWriteIdentityFromRow(source));
  const writeReq = {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    actor: parsed.actor ?? "replay_promoter",
    input_text: `promote playbook ${parsed.playbook_id} to ${targetStatus}`,
    auto_embed: false,
    ...writeIdentity,
    nodes: [
      {
        client_id: promoteCid,
        type: "procedure" as const,
        title: source.title ?? `replay_playbook_${parsed.playbook_id.slice(0, 8)}`,
        text_summary: source.text_summary ?? `Replay playbook ${parsed.playbook_id}`,
        slots: {
          ...sourceSlots,
          replay_kind: "playbook",
          playbook_id: parsed.playbook_id,
          version: nextVersion,
          status: targetStatus,
          promoted_from_version: source.version_num,
          promoted_at: new Date().toISOString(),
          promotion_note: parsed.note ?? null,
          promotion_metadata: parsed.metadata ?? {},
        },
      },
    ],
    edges: [
      {
        type: "derived_from" as const,
        src: { client_id: promoteCid },
        dst: { id: source.id },
      },
    ],
  };
  const { out } = await applyReplayMemoryWrite(client, writeReq, opts);
  const promoted = out.nodes.find((n) => n.client_id === promoteCid) ?? out.nodes[0] ?? null;
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    playbook_id: parsed.playbook_id,
    from_version: source.version_num,
    to_version: nextVersion,
    status: targetStatus,
    playbook_node_id: promoted?.id ?? null,
    playbook_uri:
      promoted?.id != null
        ? buildAionisUri({
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            type: "procedure",
            id: promoted.id,
          })
        : null,
    commit_id: out.commit_id,
    commit_uri: out.commit_uri ?? buildCommitUri(tenancy.tenant_id, tenancy.scope, out.commit_id),
    commit_hash: out.commit_hash,
  };
}

export async function replayPlaybookRepair(client: pg.PoolClient, body: unknown, opts: ReplayWriteOptions) {
  requireReplayReadAccess(opts);
  const parsed = parsePlaybookRepairInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const visibility = replayVisibilityFromInput(parsed);
  const replayAccess = replayAccessForClient(client, opts);
  const versions = await replayAccess.listReplayPlaybookVersions(tenancy.scope_key, parsed.playbook_id, visibility);
  const latest = versions[0] ?? null;
  if (!latest) {
    throw new HttpError(404, "replay_playbook_not_found", "playbook_id was not found in this scope", {
      playbook_id: parsed.playbook_id,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
    });
  }

  let source = latest;
  if (parsed.from_version != null) {
    const byVersion = await replayAccess.getReplayPlaybookVersion(
      tenancy.scope_key,
      parsed.playbook_id,
      parsed.from_version,
      visibility,
    );
    if (!byVersion) {
      throw new HttpError(404, "replay_playbook_version_not_found", "from_version was not found for this playbook", {
        playbook_id: parsed.playbook_id,
        from_version: parsed.from_version,
      });
    }
    source = byVersion;
  }

  const patchObj = asObject(parsed.patch) ?? {};
  const sourceSlots = asObject(source.slots) ?? {};
  const { nextSlots, summary } = applyPlaybookRepairPatch(sourceSlots, patchObj);
  const reviewRequired = parsed.review_required !== false;
  const emittedStatus = reviewRequired ? "draft" : parsed.target_status;
  const nextVersion = latest.version_num + 1;
  const repairCid = playbookClientId(parsed.playbook_id, nextVersion);
  const writeIdentity = replayWriteIdentityFromInput(parsed, replayWriteIdentityFromRow(source));

  const writeReq = {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    actor: parsed.actor ?? "replay_repair",
    input_text: `repair playbook ${parsed.playbook_id} v${source.version_num}->v${nextVersion}`,
    auto_embed: false,
    ...writeIdentity,
    nodes: [
      {
        client_id: repairCid,
        type: "procedure" as const,
        title: source.title ?? `replay_playbook_${parsed.playbook_id.slice(0, 8)}`,
        text_summary: source.text_summary ?? `Replay playbook ${parsed.playbook_id}`,
        slots: {
          ...nextSlots,
          replay_kind: "playbook",
          playbook_id: parsed.playbook_id,
          version: nextVersion,
          status: emittedStatus,
          repaired_from_version: source.version_num,
          repaired_at: new Date().toISOString(),
          repair_note: parsed.note ?? null,
          repair_patch: patchObj,
          repair_summary: summary,
          repair_review: {
            state: reviewRequired ? "pending_review" : "approved",
            review_required: reviewRequired,
            requested_at: new Date().toISOString(),
            requested_by: parsed.actor ?? "replay_repair",
            requested_target_status: parsed.target_status,
            note: parsed.note ?? null,
          },
          repair_metadata: parsed.metadata ?? {},
        },
      },
    ],
    edges: [
      {
        type: "derived_from" as const,
        src: { client_id: repairCid },
        dst: { id: source.id },
      },
    ],
  };
  const { out } = await applyReplayMemoryWrite(client, writeReq, opts);
  const repaired = out.nodes.find((n) => n.client_id === repairCid) ?? out.nodes[0] ?? null;
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    playbook_id: parsed.playbook_id,
    from_version: source.version_num,
    to_version: nextVersion,
    status: emittedStatus,
    review_required: reviewRequired,
    review_state: reviewRequired ? "pending_review" : "approved",
    repair_summary: summary,
    playbook_node_id: repaired?.id ?? null,
    playbook_uri:
      repaired?.id != null
        ? buildAionisUri({
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            type: "procedure",
            id: repaired.id,
          })
        : null,
    commit_id: out.commit_id,
    commit_uri: out.commit_uri ?? buildCommitUri(tenancy.tenant_id, tenancy.scope, out.commit_id),
    commit_hash: out.commit_hash,
  };
}

export async function replayPlaybookRepairReview(client: pg.PoolClient, body: unknown, opts: ReplayPlaybookReviewOptions) {
  requireReplayReadAccess(opts);
  const parsed = parsePlaybookRepairReviewInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const visibility = replayVisibilityFromInput(parsed);
  const replayAccess = replayAccessForClient(client, opts);
  const versions = await replayAccess.listReplayPlaybookVersions(tenancy.scope_key, parsed.playbook_id, visibility);
  const latest = versions[0] ?? null;
  if (!latest) {
    throw new HttpError(404, "replay_playbook_not_found", "playbook_id was not found in this scope", {
      playbook_id: parsed.playbook_id,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
    });
  }

  const source =
    parsed.version != null
      ? await replayAccess.getReplayPlaybookVersion(tenancy.scope_key, parsed.playbook_id, parsed.version, visibility)
      : latest;
  if (!source) {
    throw new HttpError(404, "replay_playbook_version_not_found", "version was not found for this playbook", {
      playbook_id: parsed.playbook_id,
      version: parsed.version ?? null,
    });
  }

  const sourceSlots = asObject(source.slots) ?? {};
  const repairPatch = asObject(sourceSlots.repair_patch);
  if (!repairPatch) {
    throw new HttpError(
      400,
      "replay_repair_patch_missing",
      "review endpoint requires a repaired playbook version (repair_patch missing).",
      {
        playbook_id: parsed.playbook_id,
        version: source.version_num,
      },
    );
  }
  const sourceReview = asObject(sourceSlots.repair_review) ?? {};
  const sourceReviewState = toStringOrNull(sourceReview.state) ?? "pending_review";
  if (sourceReviewState !== "pending_review") {
    throw new HttpError(
      409,
      "replay_repair_not_pending_review",
      "playbook version is not in pending_review state",
      {
        playbook_id: parsed.playbook_id,
        version: source.version_num,
        review_state: sourceReviewState,
      },
    );
  }

  let shadowValidation: Record<string, unknown> | null = null;
  let nextStatus: "draft" | "shadow" | "active" | "disabled";
  let reviewState: string;
  if (parsed.action === "reject") {
    nextStatus = "draft";
    reviewState = "rejected";
  } else {
    let shadowPass = true;
    if (parsed.auto_shadow_validate) {
      const stepsRaw = Array.isArray(sourceSlots.steps_template) ? sourceSlots.steps_template : [];
      const validationMode = parsed.shadow_validation_mode;
      const shadowValidationPolicy = opts.shadowValidationPolicy ?? {
        executeTimeoutMs: opts.localExecutor?.timeoutMs ?? 15000,
        executeStopOnFailure: true,
        sandboxTimeoutMs: opts.localExecutor?.timeoutMs ?? 15000,
        sandboxStopOnFailure: true,
      };
      if (validationMode === "execute") {
        const paramsObj = asObject(parsed.shadow_validation_params) ?? {};
        const executeTimeoutMs = clampInt(
          Number(paramsObj.timeout_ms ?? shadowValidationPolicy.executeTimeoutMs),
          100,
          600000,
        );
        const executeStopOnFailure =
          paramsObj.stop_on_failure === undefined
            ? shadowValidationPolicy.executeStopOnFailure
            : paramsObj.stop_on_failure !== false;
        try {
          const runOut = await replayPlaybookRun(
            client,
            {
              tenant_id: tenancy.tenant_id,
              scope: tenancy.scope,
              playbook_id: parsed.playbook_id,
              version: source.version_num,
              mode: "strict",
              max_steps: parsed.shadow_validation_max_steps,
              params: {
                ...paramsObj,
                timeout_ms: executeTimeoutMs,
                allow_local_exec: true,
                record_run: false,
                auto_confirm: true,
                stop_on_failure: executeStopOnFailure,
              },
            },
            {
              defaultScope: opts.defaultScope,
              defaultTenantId: opts.defaultTenantId,
              embeddedRuntime: opts.embeddedRuntime,
              writeOptions: opts,
              localExecutor: opts.localExecutor,
            },
          );
          const summaryObj = asObject((runOut as any).summary) ?? {};
          const failedSteps = Number(summaryObj.failed_steps ?? 0);
          shadowPass = Number.isFinite(failedSteps) && failedSteps === 0;
          const stepsOut = Array.isArray((runOut as any).steps) ? (runOut as any).steps.slice(0, 20) : [];
          shadowValidation = {
            mode: "execute",
            pass: shadowPass,
            validated_at: new Date().toISOString(),
            validator: "repair_review_auto_execute",
            timeout_ms: executeTimeoutMs,
            stop_on_failure: executeStopOnFailure,
            summary: summaryObj,
            steps_preview: stepsOut,
            max_steps: parsed.shadow_validation_max_steps,
          };
        } catch (err: any) {
          shadowPass = false;
          shadowValidation = {
            mode: "execute",
            pass: false,
            validated_at: new Date().toISOString(),
            validator: "repair_review_auto_execute",
            error: String(err?.message ?? err),
            timeout_ms: executeTimeoutMs,
            stop_on_failure: executeStopOnFailure,
            max_steps: parsed.shadow_validation_max_steps,
          };
        }
      } else if (validationMode === "execute_sandbox") {
        const paramsObj = asObject(parsed.shadow_validation_params) ?? {};
        const profileRaw = toStringOrNull(paramsObj.profile) ?? "balanced";
        const profile: "fast" | "balanced" | "thorough" =
          profileRaw === "fast" || profileRaw === "thorough" || profileRaw === "balanced" ? profileRaw : "balanced";
        const profileDefaults =
          profile === "fast"
            ? { timeoutMs: Math.min(shadowValidationPolicy.sandboxTimeoutMs, 6000), stopOnFailure: true }
            : profile === "thorough"
              ? { timeoutMs: Math.max(shadowValidationPolicy.sandboxTimeoutMs, 20000), stopOnFailure: false }
              : { timeoutMs: shadowValidationPolicy.sandboxTimeoutMs, stopOnFailure: shadowValidationPolicy.sandboxStopOnFailure };
        const executionModeRaw = toStringOrNull(paramsObj.execution_mode) ?? "sync";
        const sandboxExecMode: "sync" | "async" = executionModeRaw === "async_queue" ? "async" : "sync";
        const timeoutMs = clampInt(
          Number(paramsObj.timeout_ms ?? profileDefaults.timeoutMs),
          100,
          600000,
        );
        const stopOnFailure =
          paramsObj.stop_on_failure === undefined
            ? profileDefaults.stopOnFailure
            : paramsObj.stop_on_failure !== false;
        if (!opts.sandboxValidationExecutor) {
          shadowPass = false;
          shadowValidation = {
            mode: "execute_sandbox",
            pass: false,
            validated_at: new Date().toISOString(),
            validator: "repair_review_auto_execute_sandbox",
            error: "sandbox_validation_executor_not_configured",
          };
        } else {
          const checks: Array<Record<string, unknown>> = [];
          let succeededSteps = 0;
          let failedSteps = 0;
          let blockedSteps = 0;
          let unknownSteps = 0;
          let pendingSteps = 0;
          const stepsEval = stepsRaw.slice(0, parsed.shadow_validation_max_steps);
          for (const step of stepsEval) {
            const stepObj = asObject(step) ?? {};
            const stepIndex = Number(stepObj.step_index ?? 0) || null;
            const toolName = toStringOrNull(stepObj.tool_name);
            const preconditions = Array.isArray(stepObj.preconditions) ? stepObj.preconditions : [];
            const postconditions = Array.isArray(stepObj.postconditions) ? stepObj.postconditions : [];
            const expectedSignature = stepObj.expected_output_signature ?? null;
            const preChecks: PreconditionResult[] = [];
            for (const cond of preconditions) preChecks.push(await evaluatePrecondition(cond));
            const preFailed = preChecks.filter((c) => c.state === "fail");
            const preUnknown = preChecks.filter((c) => c.state === "unknown");
            if (preFailed.length > 0 || preUnknown.length > 0) {
              blockedSteps += 1;
              checks.push({
                step_index: stepIndex,
                tool_name: toolName,
                status: "blocked",
                reason: preFailed.length > 0 ? "preconditions_failed" : "preconditions_unknown",
                preconditions: preChecks,
              });
              if (stopOnFailure) break;
              continue;
            }
            if (!isReplayCommandTool(toolName)) {
              unknownSteps += 1;
              checks.push({
                step_index: stepIndex,
                tool_name: toolName,
                status: "unknown",
                reason: "unsupported_tool_for_sandbox_validation",
              });
              if (stopOnFailure) break;
              continue;
            }

            const argv = parseStepArgv(stepObj, toolName);
            const command = String(argv[0] ?? "").trim();
            if (argv.length === 0 || !command || !isSafeCommandName(command)) {
              blockedSteps += 1;
              checks.push({
                step_index: stepIndex,
                tool_name: toolName,
                status: "blocked",
                reason: "invalid_command_argv",
                command,
                argv,
              });
              if (stopOnFailure) break;
              continue;
            }

            const startedAt = Date.now();
            let sandboxExec:
              | {
                  ok: boolean;
                  status: string;
                  stdout: string;
                  stderr: string;
                  exit_code: number | null;
                  error: string | null;
                  run_id?: string | null;
                }
              | null = null;
            try {
              sandboxExec = await opts.sandboxValidationExecutor({
                tenant_id: tenancy.tenant_id,
                scope: tenancy.scope,
                argv,
                timeout_ms: timeoutMs,
                mode: sandboxExecMode,
                metadata: {
                  source: "replay_shadow_validation",
                  playbook_id: parsed.playbook_id,
                  playbook_version: source.version_num,
                  step_index: stepIndex,
                  review_action: parsed.action,
                },
              });
            } catch (err: any) {
              sandboxExec = {
                ok: false,
                status: "failed",
                stdout: "",
                stderr: "",
                exit_code: null,
                error: String(err?.message ?? err),
                run_id: null,
              };
            }
            if (sandboxExecMode === "async" || sandboxExec.status === "queued" || sandboxExec.status === "running") {
              pendingSteps += 1;
              checks.push({
                step_index: stepIndex,
                tool_name: toolName,
                status: "pending",
                command,
                argv,
                sandbox_run_id: sandboxExec.run_id ?? null,
                sandbox_status: sandboxExec.status ?? "queued",
              });
              if (stopOnFailure) break;
              continue;
            }
            const outcome = sandboxResultToOutcome(sandboxExec, argv, Date.now() - startedAt);
            const signature = evaluateExpectedSignature(expectedSignature, outcome);
            const postChecks: PreconditionResult[] = [];
            for (const cond of postconditions) postChecks.push(await evaluatePostcondition(cond, outcome));
            const failedPost = postChecks.filter((c) => c.state === "fail");
            const unknownPost = postChecks.filter((c) => c.state === "unknown");
            const pass = outcome.ok && signature.ok && failedPost.length === 0 && unknownPost.length === 0;
            if (pass) {
              succeededSteps += 1;
            } else {
              failedSteps += 1;
            }
            checks.push({
              step_index: stepIndex,
              tool_name: toolName,
              status: pass ? "success" : "failed",
              command,
              argv,
              sandbox_run_id: sandboxExec.run_id ?? null,
              execution: outcome,
              signature,
              postconditions: postChecks,
            });
            if (!pass && stopOnFailure) break;
          }

          shadowPass =
            sandboxExecMode === "sync"
            && pendingSteps === 0
            && failedSteps === 0
            && blockedSteps === 0
            && unknownSteps === 0;
          shadowValidation = {
            mode: "execute_sandbox",
            pass: shadowPass,
            validated_at: new Date().toISOString(),
            validator: "repair_review_auto_execute_sandbox",
            profile,
            execution_mode: sandboxExecMode === "sync" ? "sync" : "async_queue",
            max_steps: parsed.shadow_validation_max_steps,
            timeout_ms: timeoutMs,
            stop_on_failure: stopOnFailure,
            summary: {
              total_steps: Math.min(stepsRaw.length, parsed.shadow_validation_max_steps),
              succeeded_steps: succeededSteps,
              failed_steps: failedSteps,
              blocked_steps: blockedSteps,
              unknown_steps: unknownSteps,
              pending_steps: pendingSteps,
            },
            pending: pendingSteps > 0,
            pending_reason: pendingSteps > 0 ? "async_queue_pending" : null,
            steps_preview: checks.slice(0, 20),
          };
        }
      } else {
        const validation = await validatePlaybookShadowReadiness(stepsRaw, opts.localExecutor);
        shadowValidation = {
          mode: "readiness",
          ...validation,
          validated_at: new Date().toISOString(),
          validator: "repair_review_auto_readiness",
        };
        shadowPass = validation.pass;
      }
    }
    if (parsed.auto_shadow_validate && !shadowPass) {
      nextStatus = "draft";
      reviewState = "approved_shadow_blocked";
    } else {
      nextStatus = parsed.target_status_on_approve;
      reviewState = "approved";
    }
  }

  const nextVersion = latest.version_num + 1;
  const reviewCid = playbookClientId(parsed.playbook_id, nextVersion);
  const reviewedAt = new Date().toISOString();
  const writeIdentity = replayWriteIdentityFromInput(parsed, replayWriteIdentityFromRow(source));
  const reviewedSlots = {
    ...sourceSlots,
    replay_kind: "playbook",
    playbook_id: parsed.playbook_id,
    version: nextVersion,
    status: nextStatus,
    reviewed_from_version: source.version_num,
    reviewed_at: reviewedAt,
    repair_review: {
      ...sourceReview,
      state: reviewState,
      action: parsed.action,
      reviewed_at: reviewedAt,
      reviewed_by: parsed.actor ?? "replay_review",
      review_note: parsed.note ?? null,
      auto_shadow_validate: parsed.auto_shadow_validate,
      shadow_validation_mode: parsed.shadow_validation_mode,
      shadow_validation_max_steps: parsed.shadow_validation_max_steps,
      auto_promote_on_pass: parsed.auto_promote_on_pass,
      auto_promote_target_status: parsed.auto_promote_target_status,
      auto_promote_gate: parsed.auto_promote_gate,
      target_status_on_approve: parsed.target_status_on_approve,
      review_metadata: parsed.metadata ?? {},
    },
    shadow_validation_last: shadowValidation ?? sourceSlots.shadow_validation_last ?? null,
  };
  const writeReq = {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    actor: parsed.actor ?? "replay_review",
    input_text: `review playbook ${parsed.playbook_id} v${source.version_num} action=${parsed.action}`,
    auto_embed: false,
    ...writeIdentity,
    nodes: [
      {
        client_id: reviewCid,
        type: "procedure" as const,
        title: source.title ?? `replay_playbook_${parsed.playbook_id.slice(0, 8)}`,
        text_summary: source.text_summary ?? `Replay playbook ${parsed.playbook_id}`,
        slots: reviewedSlots,
      },
    ],
    edges: [
      {
        type: "derived_from" as const,
        src: { client_id: reviewCid },
        dst: { id: source.id },
      },
    ],
  };
  const { out } = await applyReplayMemoryWrite(client, writeReq, opts);
  const reviewed = out.nodes.find((n) => n.client_id === reviewCid) ?? out.nodes[0] ?? null;
  let finalStatus: "draft" | "shadow" | "active" | "disabled" = nextStatus;
  let finalVersion = nextVersion;
  let finalNodeId = reviewed?.id ?? null;
  let finalUri =
    reviewed?.id != null
      ? buildAionisUri({
          tenant_id: tenancy.tenant_id,
          scope: tenancy.scope,
          type: "procedure",
          id: reviewed.id,
        })
      : null;
  let finalCommitId = out.commit_id;
  let finalCommitUri = out.commit_uri ?? buildCommitUri(tenancy.tenant_id, tenancy.scope, out.commit_id);
  let finalCommitHash = out.commit_hash;
  let autoPromotion: Record<string, unknown> | null = null;

  const autoPromoteRequested = parsed.action === "approve" && parsed.auto_promote_on_pass === true;
  if (autoPromoteRequested) {
    const gateEval = evaluateAutoPromoteGate(
      extractShadowValidationGateMetrics(shadowValidation),
      asObject(parsed.auto_promote_gate) ?? {},
    );
    if (parsed.auto_shadow_validate !== true) {
      autoPromotion = {
        attempted: true,
        promoted: false,
        reason: "auto_shadow_validate_required",
        gate: gateEval,
      };
    } else if (nextStatus !== parsed.target_status_on_approve) {
      autoPromotion = {
        attempted: true,
        promoted: false,
        reason: "review_not_in_target_status_on_approve",
        gate: gateEval,
      };
    } else if (!gateEval.pass) {
      autoPromotion = {
        attempted: true,
        promoted: false,
        reason: "gate_not_passed",
        gate: gateEval,
      };
    } else if (parsed.auto_promote_target_status === nextStatus) {
      autoPromotion = {
        attempted: true,
        promoted: false,
        reason: "already_target_status",
        gate: gateEval,
      };
    } else {
      const promoteVersion = nextVersion + 1;
      const promoteCid = playbookClientId(parsed.playbook_id, promoteVersion);
      const promoteSlots = {
        ...reviewedSlots,
        version: promoteVersion,
        status: parsed.auto_promote_target_status,
        auto_promotion: {
          triggered: true,
          triggered_at: new Date().toISOString(),
          from_version: nextVersion,
          to_version: promoteVersion,
          from_status: nextStatus,
          to_status: parsed.auto_promote_target_status,
          gate: gateEval,
        },
      };
      const promoteReq = {
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        actor: parsed.actor ?? "replay_review",
        input_text: `auto promote playbook ${parsed.playbook_id} v${nextVersion}->v${promoteVersion}`,
        auto_embed: false,
        ...writeIdentity,
        nodes: [
          {
            client_id: promoteCid,
            type: "procedure" as const,
            title: source.title ?? `replay_playbook_${parsed.playbook_id.slice(0, 8)}`,
            text_summary: source.text_summary ?? `Replay playbook ${parsed.playbook_id}`,
            slots: promoteSlots,
          },
        ],
        edges: [
          {
            type: "derived_from" as const,
            src: { client_id: promoteCid },
            dst: { id: reviewed?.id ?? source.id },
          },
        ],
      };
      const { out: outPromote } = await applyReplayMemoryWrite(client, promoteReq, opts);
      const promotedNode = outPromote.nodes.find((n) => n.client_id === promoteCid) ?? outPromote.nodes[0] ?? null;
      finalStatus = parsed.auto_promote_target_status;
      finalVersion = promoteVersion;
      finalNodeId = promotedNode?.id ?? null;
      finalUri =
        promotedNode?.id != null
          ? buildAionisUri({
              tenant_id: tenancy.tenant_id,
              scope: tenancy.scope,
              type: "procedure",
              id: promotedNode.id,
            })
          : null;
      finalCommitId = outPromote.commit_id;
      finalCommitUri = outPromote.commit_uri ?? buildCommitUri(tenancy.tenant_id, tenancy.scope, outPromote.commit_id);
      finalCommitHash = outPromote.commit_hash;
      autoPromotion = {
        attempted: true,
        promoted: true,
        from_version: nextVersion,
        to_version: promoteVersion,
        to_status: parsed.auto_promote_target_status,
        gate: gateEval,
        playbook_node_id: finalNodeId,
        playbook_uri: finalUri,
        commit_id: outPromote.commit_id,
        commit_uri: finalCommitUri,
        commit_hash: outPromote.commit_hash,
      };
    }
  }

  const learningProjectionConfig = resolveReplayLearningProjectionConfig(
    asObject((parsed as any).learning_projection),
    opts.learningProjectionDefaults,
  );
  let learningProjectionResult: ReplayLearningProjectionResult | undefined;
  if (parsed.action !== "approve") {
    learningProjectionResult = {
      triggered: false,
      delivery: learningProjectionConfig.delivery,
      status: "skipped",
      reason: "review_action_not_approve",
    };
  } else if (reviewState !== "approved") {
    learningProjectionResult = {
      triggered: false,
      delivery: learningProjectionConfig.delivery,
      status: "skipped",
      reason: "review_not_approved",
    };
  } else if (!learningProjectionConfig.enabled) {
    learningProjectionResult = {
      triggered: false,
      delivery: learningProjectionConfig.delivery,
      status: "skipped",
      reason: "learning_projection_disabled",
    };
  } else {
    const gateMetrics = extractShadowValidationGateMetrics(shadowValidation);
    const inferredTotalSteps = Array.isArray((reviewedSlots as any).steps_template)
      ? (reviewedSlots as any).steps_template.length
      : 0;
    const projectionSource = {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      scope_key: tenancy.scope_key,
      actor: parsed.actor ?? "replay_review",
      playbook_id: parsed.playbook_id,
      playbook_version: finalVersion,
      playbook_node_id: finalNodeId ?? source.id,
      playbook_title: source.title ?? null,
      playbook_summary: source.text_summary ?? null,
      playbook_slots: reviewedSlots as Record<string, unknown>,
      source_commit_id: finalCommitId,
      metrics: {
        total_steps: gateMetrics?.total_steps ?? inferredTotalSteps,
        success_ratio: gateMetrics?.success_ratio ?? 1,
      },
    };
    if (learningProjectionConfig.delivery === "sync_inline") {
      try {
        learningProjectionResult = await applyReplayLearningProjection(client, projectionSource, learningProjectionConfig, opts);
      } catch (err: any) {
        learningProjectionResult = {
          triggered: true,
          delivery: learningProjectionConfig.delivery,
          status: "failed",
          reason: String(err?.code ?? err?.message ?? err),
        };
      }
    } else {
      try {
        const payload = {
          tenant_id: tenancy.tenant_id,
          scope: tenancy.scope,
          scope_key: tenancy.scope_key,
          actor: parsed.actor ?? "replay_review",
          playbook_id: parsed.playbook_id,
          playbook_version: finalVersion,
          source_commit_id: finalCommitId ?? null,
          config: learningProjectionConfig,
        };
        const enq = await enqueueReplayLearningProjectionOutbox(client, {
          scopeKey: tenancy.scope_key,
          commitId: finalCommitId,
          payload,
        });
        learningProjectionResult = {
          triggered: true,
          delivery: learningProjectionConfig.delivery,
          status: "queued",
          job_key: enq.job_key,
        };
      } catch (err: any) {
        learningProjectionResult = {
          triggered: true,
          delivery: learningProjectionConfig.delivery,
          status: "failed",
          reason: String(err?.code ?? err?.message ?? err),
        };
      }
    }
  }

  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    playbook_id: parsed.playbook_id,
    reviewed_version: source.version_num,
    to_version: finalVersion,
    action: parsed.action,
    status: finalStatus,
    review_state: reviewState,
    shadow_validation: shadowValidation,
    auto_promotion: autoPromotion,
    playbook_node_id: finalNodeId,
    playbook_uri: finalUri,
    commit_id: finalCommitId,
    commit_uri: finalCommitUri,
    commit_hash: finalCommitHash,
    learning_projection_result: learningProjectionResult,
  };
}

export async function replayPlaybookRun(client: pg.PoolClient, body: unknown, opts: ReplayPlaybookRunOptions) {
  requireReplayReadAccess(opts);
  const parsed = parsePlaybookRunInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const visibility = replayVisibilityFromInput(parsed);
  const replayAccess = replayAccessForClient(client, opts);
  const row =
    parsed.version != null
      ? await replayAccess.getReplayPlaybookVersion(tenancy.scope_key, parsed.playbook_id, parsed.version, visibility)
      : (await replayAccess.listReplayPlaybookVersions(tenancy.scope_key, parsed.playbook_id, visibility))[0] ?? null;
  if (!row) {
    throw new HttpError(404, "replay_playbook_not_found", "playbook was not found in this scope", {
      playbook_id: parsed.playbook_id,
      version: parsed.version ?? null,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
    });
  }

  const replayCallIdentity = {
    consumer_agent_id: parsed.consumer_agent_id ?? undefined,
    consumer_team_id: parsed.consumer_team_id ?? undefined,
    memory_lane: parsed.memory_lane ?? row.memory_lane,
    producer_agent_id: parsed.producer_agent_id ?? row.producer_agent_id ?? undefined,
    owner_agent_id: parsed.owner_agent_id ?? row.owner_agent_id ?? undefined,
    owner_team_id: parsed.owner_team_id ?? row.owner_team_id ?? undefined,
  };
  const slotsObj = asObject(row.slots) ?? {};
  const stepsRaw = Array.isArray(slotsObj.steps_template) ? slotsObj.steps_template.slice(0, parsed.max_steps) : [];
  const paramsObj = asObject(parsed.params) ?? {};
  const deterministicGate = evaluateReplayDeterministicGate({
    requestedMode: parsed.mode,
    gateInput: parsed.deterministic_gate,
    playbookStatus: row.playbook_status,
    playbookSlots: slotsObj,
  });
  if (deterministicGate.enabled && !deterministicGate.matched && deterministicGate.decision === "rejected") {
    throw new HttpError(
      409,
      "replay_deterministic_gate_mismatch",
      "deterministic replay gate did not match the selected playbook version",
      {
        playbook_id: parsed.playbook_id,
        version: row.version_num,
        requested_mode: deterministicGate.requested_mode,
        playbook_status: deterministicGate.playbook_status,
        required_statuses: deterministicGate.required_statuses,
        status_match: deterministicGate.status_match,
        matchers_match: deterministicGate.matchers_match,
        policy_constraints_match: deterministicGate.policy_constraints_match,
        request_matcher_fingerprint: deterministicGate.request_matcher_fingerprint,
        playbook_matcher_fingerprint: deterministicGate.playbook_matcher_fingerprint,
        request_policy_fingerprint: deterministicGate.request_policy_fingerprint,
        playbook_policy_fingerprint: deterministicGate.playbook_policy_fingerprint,
      },
    );
  }
  const mode = deterministicGate.effective_mode;
  const stepReports: Array<Record<string, unknown>> = [];
  const recordRun = paramsObj.record_run !== false && Boolean(opts.writeOptions);
  const requestedRunIdRaw = toStringOrNull(paramsObj.run_id);
  const replayRunId = requestedRunIdRaw && UUID_V4_OR_VX.test(requestedRunIdRaw) ? requestedRunIdRaw : randomUUID();

  if (mode === "simulate") {
    let runStartOut: Record<string, unknown> | null = null;
    let readySteps = 0;
    let blockedSteps = 0;
    let unknownSteps = 0;
    if (recordRun) {
      runStartOut = await replayRunStart(
        client,
        {
          tenant_id: tenancy.tenant_id,
          scope: tenancy.scope,
          actor: parsed.actor ?? undefined,
          ...replayCallIdentity,
          run_id: replayRunId,
          goal: `Replay playbook ${parsed.playbook_id} v${row.version_num} (simulate)`,
          context_snapshot_ref: buildAionisUri({
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            type: row.type,
            id: row.id,
          }),
          metadata: {
            replay_mode: "simulate",
            source_playbook_id: parsed.playbook_id,
            source_playbook_version: row.version_num,
          },
        },
        opts.writeOptions!,
      ) as Record<string, unknown>;
    }
    for (const step of stepsRaw) {
      const stepObj = asObject(step) ?? {};
      const stepIndex = Number(stepObj.step_index ?? 0) || null;
      const toolName = toStringOrNull(stepObj.tool_name);
      const argv = isReplayCommandTool(toolName) ? parseStepArgv(stepObj, toolName) : [];
      const command = String(argv[0] ?? "").trim();
      const sensitive = command ? detectSensitiveCommand(command, argv) : { sensitive: false, reason: null, risk_level: "low" as const };
      const preconditions = Array.isArray(stepObj.preconditions) ? stepObj.preconditions : [];
      const checks: PreconditionResult[] = [];
      for (const cond of preconditions) {
        checks.push(await evaluatePrecondition(cond));
      }
      const failed = checks.filter((c) => c.state === "fail");
      const unknown = checks.filter((c) => c.state === "unknown");
      let readiness: "ready" | "blocked" | "unknown";
      if (failed.length > 0) {
        readiness = "blocked";
        blockedSteps += 1;
      } else if (unknown.length > 0) {
        readiness = "unknown";
        unknownSteps += 1;
      } else {
        readiness = "ready";
        readySteps += 1;
      }
      let persistedStepId: string | null = null;
      if (recordRun && stepIndex != null && toolName) {
        const before = await replayStepBefore(
          client,
          {
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            actor: parsed.actor ?? undefined,
            ...replayCallIdentity,
            run_id: replayRunId,
            step_index: stepIndex,
            tool_name: toolName,
            tool_input: stepObj.tool_input_template ?? stepObj.tool_input ?? {},
            expected_output_signature: stepObj.expected_output_signature ?? null,
            preconditions: Array.isArray(stepObj.preconditions) ? stepObj.preconditions : [],
            retry_policy: asObject(stepObj.retry_policy) ?? undefined,
            safety_level: (toStringOrNull(stepObj.safety_level) ?? "needs_confirm") as "auto_ok" | "needs_confirm" | "manual_only",
            metadata: {
              replay_mode: "simulate",
              playbook_id: parsed.playbook_id,
              playbook_version: row.version_num,
            },
          },
          opts.writeOptions!,
        ) as Record<string, unknown>;
        persistedStepId = toStringOrNull(before.step_id);
        await replayStepAfter(
          client,
          {
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            actor: parsed.actor ?? undefined,
            ...replayCallIdentity,
            run_id: replayRunId,
            step_id: persistedStepId ?? undefined,
            step_index: stepIndex,
            status: readiness === "ready" ? "success" : "partial",
            output_signature: {
              readiness,
              command: command || null,
              argv,
            },
            postconditions: [],
            artifact_refs: [],
            repair_applied: false,
            error:
              readiness === "blocked"
                ? "simulate_blocked"
                : readiness === "unknown"
                  ? "simulate_unknown"
                  : undefined,
            metadata: {
              replay_mode: "simulate",
              readiness,
            },
          },
          opts.writeOptions!,
        );
      }
      stepReports.push({
        step_index: stepIndex,
        tool_name: toolName,
        safety_level: toStringOrNull(stepObj.safety_level) ?? "needs_confirm",
        readiness,
        command: command || null,
        argv,
        sensitive_review: sensitive.sensitive
          ? {
              required_override: true,
              reason: sensitive.reason,
              risk_level: sensitive.risk_level,
              default_mode: "block",
            }
          : null,
        precondition_total: checks.length,
        checks,
        notes:
          readiness === "blocked"
            ? ["One or more preconditions failed; strict replay would stop here."]
            : readiness === "unknown"
              ? ["Some preconditions are unsupported/ambiguous; guided mode may need repair."]
              : ["Preconditions passed."],
      });
    }
    const runStatus = blockedSteps > 0 || unknownSteps > 0 ? "partial" : "success";
    let runEndOut: Record<string, unknown> | null = null;
    if (recordRun) {
      runEndOut = await replayRunEnd(
        client,
        {
          tenant_id: tenancy.tenant_id,
          scope: tenancy.scope,
          actor: parsed.actor ?? undefined,
          ...replayCallIdentity,
          run_id: replayRunId,
          status: runStatus,
          summary:
            runStatus === "success"
              ? "simulate replay readiness passed"
              : "simulate replay found blocked or unknown steps",
          metrics: {
            total_steps: stepsRaw.length,
            ready_steps: readySteps,
            blocked_steps: blockedSteps,
            unknown_steps: unknownSteps,
          },
          metadata: {
            replay_mode: "simulate",
            source_playbook_id: parsed.playbook_id,
            source_playbook_version: row.version_num,
          },
        },
        opts.writeOptions!,
      ) as Record<string, unknown>;
    }
    return {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      playbook: {
        playbook_id: parsed.playbook_id,
        version: row.version_num,
        status: row.playbook_status ?? "draft",
        name: row.title,
        uri: buildAionisUri({
          tenant_id: tenancy.tenant_id,
          scope: tenancy.scope,
          type: row.type,
          id: row.id,
        }),
      },
      mode: "simulate",
      deterministic_gate: deterministicGate,
      run:
        recordRun
          ? {
              run_id: replayRunId,
              status: runStatus,
              run_uri: toStringOrNull(runStartOut?.run_uri),
              run_end_uri: toStringOrNull(runEndOut?.run_end_uri),
              commit_id_start: toStringOrNull(runStartOut?.commit_id),
              commit_id_end: toStringOrNull(runEndOut?.commit_id),
            }
          : null,
      execution_policy: {
        execution_backend: normalizeReplayExecutionBackend(toStringOrNull(paramsObj.execution_backend)),
        sensitive_review_mode: normalizeReplaySensitiveReviewMode(toStringOrNull(paramsObj.sensitive_review_mode)),
      },
      summary: {
        total_steps: stepsRaw.length,
        ready_steps: readySteps,
        blocked_steps: blockedSteps,
        unknown_steps: unknownSteps,
        replay_readiness: blockedSteps > 0 ? "blocked" : unknownSteps > 0 ? "partial" : "ready",
        next_action:
          blockedSteps > 0
            ? "Fix blocked preconditions before strict replay or use guided repair."
            : unknownSteps > 0
              ? "Define unsupported precondition kinds or run guided mode with repair."
              : "Safe to run strict replay when execution backend policy is satisfied.",
      },
      steps: stepReports,
      execution: {
        inference_skipped: deterministicGate.inference_skipped,
        deterministic_gate_matched: deterministicGate.matched,
      },
      params_echo: parsed.params ?? {},
      cost_signals: buildReplayCostSignals({ deterministic_gate: deterministicGate }),
    };
  }

  const localExecutor = opts.localExecutor;
  const executionBackend = normalizeReplayExecutionBackend(toStringOrNull(paramsObj.execution_backend));
  const sandboxProjectId = toStringOrNull(parsed.project_id) ?? toStringOrNull(paramsObj.project_id);
  const sensitiveReviewMode = normalizeReplaySensitiveReviewMode(toStringOrNull(paramsObj.sensitive_review_mode));
  const allowSensitiveExec = paramsObj.allow_sensitive_exec === true;

  if (executionBackend === "sandbox_async" && mode === "strict") {
    throw new HttpError(
      400,
      "replay_strict_async_not_supported",
      "strict replay does not support async sandbox execution; use sandbox_sync or local_process.",
      { execution_backend: executionBackend },
    );
  }
  if (executionBackend === "local_process") {
    if (!localExecutor?.enabled || localExecutor.mode !== "local_process") {
      throw new HttpError(
        400,
        "replay_executor_not_enabled",
        "strict/guided replay with local_process requires SANDBOX_ENABLED=true and SANDBOX_EXECUTOR_MODE=local_process.",
        { execution_backend: executionBackend },
      );
    }
  } else if (!opts.sandboxExecutor) {
    throw new HttpError(
      400,
      "replay_sandbox_executor_not_enabled",
      "sandbox replay backend is not configured on this deployment",
      { execution_backend: executionBackend },
    );
  }
  if (!opts.writeOptions) {
    throw new HttpError(500, "replay_run_write_options_missing", "strict/guided replay requires write options wiring.");
  }
  if (paramsObj.allow_local_exec !== true) {
    throw new HttpError(
      400,
      "replay_local_exec_consent_required",
      "strict/guided replay requires params.allow_local_exec=true as explicit execution consent.",
      { execution_backend: executionBackend },
    );
  }

  const requestedCommands = asStringArray(paramsObj.allowed_commands);
  const requestedSet = requestedCommands.length > 0 ? new Set(requestedCommands) : null;
  const allowedCommands = new Set<string>();
  for (const cmd of (localExecutor?.allowedCommands ?? new Set<string>()).values()) {
    if (requestedSet && !requestedSet.has(cmd)) continue;
    allowedCommands.add(cmd);
  }
  if (allowedCommands.size === 0) {
    throw new HttpError(
      400,
      "replay_allowed_commands_empty",
      "No allowed commands remain for replay execution after allowlist filtering.",
      {
        requested_commands: requestedCommands,
      },
    );
  }
  const defaultGuidedRepairStrategy = opts.guidedRepair?.strategy ?? "deterministic_skip";
  const allowRequestBuiltinLlm = opts.guidedRepair?.allowRequestBuiltinLlm === true;
  const requestedGuidedRepairStrategy = toStringOrNull(paramsObj.guided_repair_strategy);
  if (
    requestedGuidedRepairStrategy === "builtin_llm"
    && defaultGuidedRepairStrategy !== "builtin_llm"
    && !allowRequestBuiltinLlm
  ) {
    throw new HttpError(
      400,
      "replay_guided_repair_strategy_not_allowed",
      "params.guided_repair_strategy=builtin_llm is not allowed by server policy",
      {
        requested_strategy: requestedGuidedRepairStrategy,
        default_strategy: defaultGuidedRepairStrategy,
      },
    );
  }
  const guidedRepairStrategy: ReplayGuidedRepairStrategy =
    requestedGuidedRepairStrategy === "deterministic_skip"
      || requestedGuidedRepairStrategy === "heuristic_patch"
      || requestedGuidedRepairStrategy === "http_synth"
      || requestedGuidedRepairStrategy === "builtin_llm"
      ? requestedGuidedRepairStrategy
      : defaultGuidedRepairStrategy;
  const guidedRepairMaxErrorChars = clampInt(
    Number(paramsObj.guided_repair_max_error_chars ?? opts.guidedRepair?.maxErrorChars ?? 1200),
    64,
    20000,
  );
  const commandAliasMap = asStringRecord(paramsObj.command_alias_map);

  const timeoutMs = clampInt(Number(paramsObj.timeout_ms ?? localExecutor?.timeoutMs ?? 15000), 100, 600000);
  const stdioMaxBytes = clampInt(Number(paramsObj.stdio_max_bytes ?? localExecutor?.stdioMaxBytes ?? 65536), 1024, 1024 * 1024);
  const workdir = toStringOrNull(paramsObj.workdir) ?? localExecutor?.workdir ?? process.cwd();
  const autoConfirm = paramsObj.auto_confirm === true;
  const stopOnFailure = paramsObj.stop_on_failure !== false;
  if (executionBackend !== "local_process" && opts.sandboxBudgetGuard) {
    await opts.sandboxBudgetGuard({
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      project_id: sandboxProjectId,
    });
  }

  let runStartOut: Record<string, unknown> | null = null;
  if (recordRun) {
    runStartOut = await replayRunStart(
      client,
      {
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        ...replayCallIdentity,
        run_id: replayRunId,
        goal: `Replay playbook ${parsed.playbook_id} v${row.version_num}`,
        context_snapshot_ref: buildAionisUri({
          tenant_id: tenancy.tenant_id,
          scope: tenancy.scope,
          type: row.type,
          id: row.id,
        }),
        metadata: {
          replay_mode: mode,
          execution_backend: executionBackend,
          replay_project_id: sandboxProjectId,
          sensitive_review_mode: sensitiveReviewMode,
          source_playbook_id: parsed.playbook_id,
          source_playbook_version: row.version_num,
          guided_repair_strategy: mode === "guided" ? guidedRepairStrategy : null,
        },
      },
      opts.writeOptions,
    ) as Record<string, unknown>;
  }

  let executedSteps = 0;
  let succeededSteps = 0;
  let failedSteps = 0;
  let repairedSteps = 0;
  let blockedSteps = 0;
  let skippedSteps = 0;
  let pendingSteps = 0;
  const usageOut = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    source: "no_model_call",
  };

  for (const step of stepsRaw) {
    const stepObj = asObject(step) ?? {};
    const stepIndex = Number(stepObj.step_index ?? 0) || null;
    const toolName = toStringOrNull(stepObj.tool_name);
    const safetyLevel = toStringOrNull(stepObj.safety_level) ?? "needs_confirm";
    const expectedSignature = stepObj.expected_output_signature ?? null;
    const toolInput = stepObj.tool_input_template ?? stepObj.tool_input ?? {};
    const preconditions = Array.isArray(stepObj.preconditions) ? stepObj.preconditions : [];
    const postconditions = Array.isArray(stepObj.postconditions) ? stepObj.postconditions : [];

    let persistedStepId: string | null = null;
    if (recordRun && stepIndex != null && toolName) {
      const before = await replayStepBefore(
        client,
        {
          tenant_id: tenancy.tenant_id,
          scope: tenancy.scope,
          ...replayCallIdentity,
          run_id: replayRunId,
          step_index: stepIndex,
          tool_name: toolName,
          tool_input: toolInput,
          expected_output_signature: expectedSignature,
          preconditions,
          safety_level: safetyLevel as "auto_ok" | "needs_confirm" | "manual_only",
          metadata: {
            replay_mode: mode,
            playbook_id: parsed.playbook_id,
            playbook_version: row.version_num,
          },
        },
        opts.writeOptions,
      ) as Record<string, unknown>;
      persistedStepId = toStringOrNull(before.step_id);
    }

    const preChecks: PreconditionResult[] = [];
    for (const cond of preconditions) preChecks.push(await evaluatePrecondition(cond));
    const preFailed = preChecks.filter((c) => c.state === "fail");
    const preUnknown = preChecks.filter((c) => c.state === "unknown");
    if (preFailed.length > 0 || preUnknown.length > 0) {
      blockedSteps += 1;
      const reason =
        preFailed.length > 0
          ? "preconditions_failed"
          : "preconditions_unknown";
      if (mode === "strict") {
        failedSteps += 1;
        stepReports.push({
          step_index: stepIndex,
          tool_name: toolName,
          status: "failed",
          readiness: "blocked",
          preconditions: preChecks,
          error: reason,
        });
        if (recordRun) {
          await replayStepAfter(
            client,
            {
              tenant_id: tenancy.tenant_id,
              scope: tenancy.scope,
              ...replayCallIdentity,
              run_id: replayRunId,
              step_id: persistedStepId ?? undefined,
              step_index: stepIndex ?? undefined,
              status: "failed",
              output_signature: {
                reason,
                preconditions: preChecks,
              },
              postconditions: [],
              artifact_refs: [],
              repair_applied: false,
              error: reason,
            },
            opts.writeOptions,
          );
        }
        if (stopOnFailure) break;
        continue;
      }
      repairedSteps += 1;
      skippedSteps += 1;
      const repair = await makeGuidedRepairPatch({
        strategy: guidedRepairStrategy,
        stepIndex,
        toolName,
        reason,
        detail: "guided mode skipped blocked step",
        stepObj,
        allowedCommands,
        commandAliasMap,
        maxErrorChars: guidedRepairMaxErrorChars,
        httpEndpoint: opts.guidedRepair?.httpEndpoint,
        httpTimeoutMs: opts.guidedRepair?.httpTimeoutMs,
        httpAuthToken: opts.guidedRepair?.httpAuthToken,
        llmBaseUrl: opts.guidedRepair?.llmBaseUrl,
        llmApiKey: opts.guidedRepair?.llmApiKey,
        llmModel: opts.guidedRepair?.llmModel,
        llmTimeoutMs: opts.guidedRepair?.llmTimeoutMs,
        llmMaxTokens: opts.guidedRepair?.llmMaxTokens,
        llmTemperature: opts.guidedRepair?.llmTemperature,
        mode: "guided",
      });
      mergeReplayUsage(usageOut, asObject(repair)?.usage);
      stepReports.push({
        step_index: stepIndex,
        tool_name: toolName,
        status: "partial",
        readiness: preUnknown.length > 0 ? "unknown" : "blocked",
        preconditions: preChecks,
        repair_applied: true,
        repair,
      });
      if (recordRun) {
        await replayStepAfter(
          client,
          {
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            ...replayCallIdentity,
            run_id: replayRunId,
            step_id: persistedStepId ?? undefined,
            step_index: stepIndex ?? undefined,
            status: "partial",
            output_signature: {
              reason,
              preconditions: preChecks,
              repair,
            },
            postconditions: [],
            artifact_refs: [],
            repair_applied: true,
            repair_note: reason,
          },
          opts.writeOptions,
        );
      }
      continue;
    }

    if (safetyLevel === "manual_only" || (safetyLevel === "needs_confirm" && !autoConfirm)) {
      const reason = safetyLevel === "manual_only" ? "manual_only_step" : "confirmation_required";
      if (mode === "strict") {
        failedSteps += 1;
        stepReports.push({
          step_index: stepIndex,
          tool_name: toolName,
          status: "failed",
          readiness: "blocked",
          error: reason,
        });
        if (recordRun) {
          await replayStepAfter(
            client,
            {
              tenant_id: tenancy.tenant_id,
              scope: tenancy.scope,
              ...replayCallIdentity,
              run_id: replayRunId,
              step_id: persistedStepId ?? undefined,
              step_index: stepIndex ?? undefined,
              status: "failed",
              output_signature: { reason },
              postconditions: [],
              artifact_refs: [],
              repair_applied: false,
              error: reason,
            },
            opts.writeOptions,
          );
        }
        if (stopOnFailure) break;
        continue;
      }
      repairedSteps += 1;
      skippedSteps += 1;
      const repair = await makeGuidedRepairPatch({
        strategy: guidedRepairStrategy,
        stepIndex,
        toolName,
        reason,
        detail: "guided mode skipped confirmation-gated step",
        stepObj,
        allowedCommands,
        commandAliasMap,
        maxErrorChars: guidedRepairMaxErrorChars,
        httpEndpoint: opts.guidedRepair?.httpEndpoint,
        httpTimeoutMs: opts.guidedRepair?.httpTimeoutMs,
        httpAuthToken: opts.guidedRepair?.httpAuthToken,
        llmBaseUrl: opts.guidedRepair?.llmBaseUrl,
        llmApiKey: opts.guidedRepair?.llmApiKey,
        llmModel: opts.guidedRepair?.llmModel,
        llmTimeoutMs: opts.guidedRepair?.llmTimeoutMs,
        llmMaxTokens: opts.guidedRepair?.llmMaxTokens,
        llmTemperature: opts.guidedRepair?.llmTemperature,
        mode: "guided",
      });
      mergeReplayUsage(usageOut, asObject(repair)?.usage);
      stepReports.push({
        step_index: stepIndex,
        tool_name: toolName,
        status: "partial",
        readiness: "blocked",
        repair_applied: true,
        repair,
      });
      if (recordRun) {
        await replayStepAfter(
          client,
          {
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            ...replayCallIdentity,
            run_id: replayRunId,
            step_id: persistedStepId ?? undefined,
            step_index: stepIndex ?? undefined,
            status: "partial",
            output_signature: { reason, repair },
            postconditions: [],
            artifact_refs: [],
            repair_applied: true,
            repair_note: reason,
          },
          opts.writeOptions,
        );
      }
      continue;
    }

    if (!isReplayCommandTool(toolName)) {
      const reason = "unsupported_tool_for_command_executor";
      if (mode === "strict") {
        failedSteps += 1;
        stepReports.push({
          step_index: stepIndex,
          tool_name: toolName,
          status: "failed",
          readiness: "blocked",
          error: reason,
        });
        if (recordRun) {
          await replayStepAfter(
            client,
            {
              tenant_id: tenancy.tenant_id,
              scope: tenancy.scope,
              ...replayCallIdentity,
              run_id: replayRunId,
              step_id: persistedStepId ?? undefined,
              step_index: stepIndex ?? undefined,
              status: "failed",
              output_signature: { reason },
              postconditions: [],
              artifact_refs: [],
              repair_applied: false,
              error: reason,
            },
            opts.writeOptions,
          );
        }
        if (stopOnFailure) break;
        continue;
      }
      repairedSteps += 1;
      skippedSteps += 1;
      const repair = await makeGuidedRepairPatch({
        strategy: guidedRepairStrategy,
        stepIndex,
        toolName,
        reason,
        detail: "tool is not mapped to command-style replay executor",
        stepObj,
        allowedCommands,
        commandAliasMap,
        maxErrorChars: guidedRepairMaxErrorChars,
        httpEndpoint: opts.guidedRepair?.httpEndpoint,
        httpTimeoutMs: opts.guidedRepair?.httpTimeoutMs,
        httpAuthToken: opts.guidedRepair?.httpAuthToken,
        llmBaseUrl: opts.guidedRepair?.llmBaseUrl,
        llmApiKey: opts.guidedRepair?.llmApiKey,
        llmModel: opts.guidedRepair?.llmModel,
        llmTimeoutMs: opts.guidedRepair?.llmTimeoutMs,
        llmMaxTokens: opts.guidedRepair?.llmMaxTokens,
        llmTemperature: opts.guidedRepair?.llmTemperature,
        mode: "guided",
      });
      mergeReplayUsage(usageOut, asObject(repair)?.usage);
      stepReports.push({
        step_index: stepIndex,
        tool_name: toolName,
        status: "partial",
        readiness: "unknown",
        repair_applied: true,
        repair,
      });
      if (recordRun) {
        await replayStepAfter(
          client,
          {
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            ...replayCallIdentity,
            run_id: replayRunId,
            step_id: persistedStepId ?? undefined,
            step_index: stepIndex ?? undefined,
            status: "partial",
            output_signature: { reason, repair },
            postconditions: [],
            artifact_refs: [],
            repair_applied: true,
            repair_note: reason,
          },
          opts.writeOptions,
        );
      }
      continue;
    }

    const argv = parseStepArgv(stepObj, toolName);
    const command = String(argv[0] ?? "").trim();
    if (argv.length === 0 || !command || !isSafeCommandName(command) || !allowedCommands.has(command)) {
      const reason = "command_not_allowed_or_missing";
      if (mode === "strict") {
        failedSteps += 1;
        stepReports.push({
          step_index: stepIndex,
          tool_name: toolName,
          status: "failed",
          readiness: "blocked",
          error: reason,
          command,
          allowed_commands: [...allowedCommands.values()],
        });
        if (recordRun) {
          await replayStepAfter(
            client,
            {
              tenant_id: tenancy.tenant_id,
              scope: tenancy.scope,
              ...replayCallIdentity,
              run_id: replayRunId,
              step_id: persistedStepId ?? undefined,
              step_index: stepIndex ?? undefined,
              status: "failed",
              output_signature: { reason, command, allowed_commands: [...allowedCommands.values()] },
              postconditions: [],
              artifact_refs: [],
              repair_applied: false,
              error: reason,
            },
            opts.writeOptions,
          );
        }
        if (stopOnFailure) break;
        continue;
      }
      repairedSteps += 1;
      skippedSteps += 1;
      const repair = await makeGuidedRepairPatch({
        strategy: guidedRepairStrategy,
        stepIndex,
        toolName,
        reason,
        detail: command ? `command '${command}' is not allowed` : "argv is missing",
        stepObj,
        command,
        argv,
        allowedCommands,
        commandAliasMap,
        maxErrorChars: guidedRepairMaxErrorChars,
        httpEndpoint: opts.guidedRepair?.httpEndpoint,
        httpTimeoutMs: opts.guidedRepair?.httpTimeoutMs,
        httpAuthToken: opts.guidedRepair?.httpAuthToken,
        llmBaseUrl: opts.guidedRepair?.llmBaseUrl,
        llmApiKey: opts.guidedRepair?.llmApiKey,
        llmModel: opts.guidedRepair?.llmModel,
        llmTimeoutMs: opts.guidedRepair?.llmTimeoutMs,
        llmMaxTokens: opts.guidedRepair?.llmMaxTokens,
        llmTemperature: opts.guidedRepair?.llmTemperature,
        mode: "guided",
      });
      mergeReplayUsage(usageOut, asObject(repair)?.usage);
      stepReports.push({
        step_index: stepIndex,
        tool_name: toolName,
        status: "partial",
        readiness: "blocked",
        repair_applied: true,
        repair,
        command,
      });
      if (recordRun) {
        await replayStepAfter(
          client,
          {
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            ...replayCallIdentity,
            run_id: replayRunId,
            step_id: persistedStepId ?? undefined,
            step_index: stepIndex ?? undefined,
            status: "partial",
            output_signature: { reason, command, repair },
            postconditions: [],
            artifact_refs: [],
            repair_applied: true,
            repair_note: reason,
          },
          opts.writeOptions,
        );
      }
      continue;
    }

    const sensitive = detectSensitiveCommand(command, argv);
    const sensitiveReviewInfo = sensitive.sensitive
      ? {
          command,
          argv,
          reason: sensitive.reason,
          risk_level: sensitive.risk_level,
          mode: sensitiveReviewMode,
          override_used: allowSensitiveExec,
        }
      : null;
    if (sensitive.sensitive && sensitiveReviewMode === "block" && !allowSensitiveExec) {
      const reason = "sensitive_command_requires_override";
      const sensitiveReview = {
        command,
        argv,
        reason: sensitive.reason,
        risk_level: sensitive.risk_level,
        required_param: "params.allow_sensitive_exec=true",
      };
      if (mode === "strict") {
        failedSteps += 1;
        blockedSteps += 1;
        stepReports.push({
          step_index: stepIndex,
          tool_name: toolName,
          status: "failed",
          readiness: "blocked",
          error: reason,
          sensitive_review: sensitiveReview,
        });
        if (recordRun) {
          await replayStepAfter(
            client,
            {
              tenant_id: tenancy.tenant_id,
              scope: tenancy.scope,
              ...replayCallIdentity,
              run_id: replayRunId,
              step_id: persistedStepId ?? undefined,
              step_index: stepIndex ?? undefined,
              status: "failed",
              output_signature: { reason, sensitive_review: sensitiveReview },
              postconditions: [],
              artifact_refs: [],
              repair_applied: false,
              error: reason,
            },
            opts.writeOptions,
          );
        }
        if (stopOnFailure) break;
        continue;
      }
      repairedSteps += 1;
      skippedSteps += 1;
      const repair = await makeGuidedRepairPatch({
        strategy: guidedRepairStrategy,
        stepIndex,
        toolName,
        reason,
        detail: `blocked sensitive command '${command}' (${sensitive.reason ?? "risk"})`,
        stepObj,
        command,
        argv,
        allowedCommands,
        commandAliasMap,
        maxErrorChars: guidedRepairMaxErrorChars,
        httpEndpoint: opts.guidedRepair?.httpEndpoint,
        httpTimeoutMs: opts.guidedRepair?.httpTimeoutMs,
        httpAuthToken: opts.guidedRepair?.httpAuthToken,
        llmBaseUrl: opts.guidedRepair?.llmBaseUrl,
        llmApiKey: opts.guidedRepair?.llmApiKey,
        llmModel: opts.guidedRepair?.llmModel,
        llmTimeoutMs: opts.guidedRepair?.llmTimeoutMs,
        llmMaxTokens: opts.guidedRepair?.llmMaxTokens,
        llmTemperature: opts.guidedRepair?.llmTemperature,
        mode: "guided",
      });
      mergeReplayUsage(usageOut, asObject(repair)?.usage);
      stepReports.push({
        step_index: stepIndex,
        tool_name: toolName,
        status: "partial",
        readiness: "blocked",
        command,
        argv,
        sensitive_review: sensitiveReview,
        repair_applied: true,
        repair,
      });
      if (recordRun) {
        await replayStepAfter(
          client,
          {
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            ...replayCallIdentity,
            run_id: replayRunId,
            step_id: persistedStepId ?? undefined,
            step_index: stepIndex ?? undefined,
            status: "partial",
            output_signature: { reason, sensitive_review: sensitiveReview, repair },
            postconditions: [],
            artifact_refs: [],
            repair_applied: true,
            repair_note: reason,
          },
          opts.writeOptions,
        );
      }
      continue;
    }

    executedSteps += 1;
    const exec = await executeReplayCommand({
      backend: executionBackend,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      project_id: sandboxProjectId,
      argv,
      timeout_ms: timeoutMs,
      local: { cwd: workdir, stdioMaxBytes },
      sandboxExecutor: opts.sandboxExecutor,
    });
    if (exec.pending || !exec.outcome) {
      pendingSteps += 1;
      repairedSteps += mode === "guided" ? 1 : 0;
      const reason = "sandbox_async_execution_pending";
      stepReports.push({
        step_index: stepIndex,
        tool_name: toolName,
        status: mode === "guided" ? "partial" : "failed",
        readiness: "pending",
        command,
        argv,
        execution_backend: executionBackend,
        sandbox_run_id: exec.sandbox_run_id,
        pending: true,
        error: reason,
      });
      if (recordRun) {
        await replayStepAfter(
          client,
          {
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            ...replayCallIdentity,
            run_id: replayRunId,
            step_id: persistedStepId ?? undefined,
            step_index: stepIndex ?? undefined,
            status: mode === "guided" ? "partial" : "failed",
            output_signature: {
              reason,
              execution_backend: executionBackend,
              sandbox_run_id: exec.sandbox_run_id,
              sandbox_status: exec.raw_status,
            },
            postconditions: [],
            artifact_refs: [],
            repair_applied: mode === "guided",
            repair_note: mode === "guided" ? reason : undefined,
            error: mode === "strict" ? reason : undefined,
          },
          opts.writeOptions,
        );
      }
      if (mode === "strict" && stopOnFailure) break;
      if (mode === "strict") failedSteps += 1;
      continue;
    }
    const execOutcome = exec.outcome;
    const resultSummary = summarizeToolResult({
      stdout: execOutcome.stdout,
      stderr: execOutcome.stderr,
      exit_code: execOutcome.exit_code,
      error: execOutcome.error,
      truncated: false,
    });
    const signature = evaluateExpectedSignature(expectedSignature, execOutcome);
    const postChecks: PreconditionResult[] = [];
    for (const cond of postconditions) postChecks.push(await evaluatePostcondition(cond, execOutcome));
    const failedPost = postChecks.filter((c) => c.state === "fail");
    const unknownPost = postChecks.filter((c) => c.state === "unknown");
    const executionPassed = execOutcome.ok && signature.ok && failedPost.length === 0 && unknownPost.length === 0;

    if (executionPassed) {
      succeededSteps += 1;
      stepReports.push({
        step_index: stepIndex,
        tool_name: toolName,
        status: "success",
        readiness: "ready",
        command,
        argv,
        execution_backend: executionBackend,
        sandbox_run_id: exec.sandbox_run_id,
        sensitive_review: sensitiveReviewInfo,
        execution: execOutcome,
        result_summary: resultSummary,
        signature,
        postconditions: postChecks,
      });
      if (recordRun) {
        await replayStepAfter(
          client,
          {
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            ...replayCallIdentity,
            run_id: replayRunId,
            step_id: persistedStepId ?? undefined,
            step_index: stepIndex ?? undefined,
            status: "success",
            output_signature: {
              command,
              argv,
              execution_backend: executionBackend,
              sandbox_run_id: exec.sandbox_run_id,
              sensitive_review: sensitiveReviewInfo,
              exit_code: execOutcome.exit_code,
              duration_ms: execOutcome.duration_ms,
              result_summary: resultSummary,
              signature,
            },
            postconditions: postChecks,
            artifact_refs: [],
            repair_applied: false,
          },
          opts.writeOptions,
        );
      }
      continue;
    }

    const failureReason = execOutcome.error ?? (execOutcome.status === "timeout" ? "execution_timeout" : "execution_failed");
    if (mode === "strict") {
      failedSteps += 1;
      stepReports.push({
        step_index: stepIndex,
        tool_name: toolName,
        status: "failed",
        readiness: "blocked",
        command,
        argv,
        execution_backend: executionBackend,
        sandbox_run_id: exec.sandbox_run_id,
        sensitive_review: sensitiveReviewInfo,
        execution: execOutcome,
        result_summary: resultSummary,
        signature,
        postconditions: postChecks,
        error: failureReason,
      });
      if (recordRun) {
        await replayStepAfter(
          client,
          {
            tenant_id: tenancy.tenant_id,
            scope: tenancy.scope,
            ...replayCallIdentity,
            run_id: replayRunId,
            step_id: persistedStepId ?? undefined,
            step_index: stepIndex ?? undefined,
            status: "failed",
            output_signature: {
              command,
              argv,
              execution_backend: executionBackend,
              sandbox_run_id: exec.sandbox_run_id,
              sensitive_review: sensitiveReviewInfo,
              exit_code: execOutcome.exit_code,
              duration_ms: execOutcome.duration_ms,
              result_summary: resultSummary,
              signature,
              preconditions: preChecks,
              postconditions: postChecks,
            },
            postconditions: postChecks,
            artifact_refs: [],
            repair_applied: false,
            error: failureReason,
          },
          opts.writeOptions,
        );
      }
      if (stopOnFailure) break;
      continue;
    }

    repairedSteps += 1;
    const repair = await makeGuidedRepairPatch({
      strategy: guidedRepairStrategy,
      stepIndex,
      toolName,
      reason: "execution_failed_guided_skip",
      detail: failureReason,
      stepObj,
      command,
      argv,
      allowedCommands,
      commandAliasMap,
      maxErrorChars: guidedRepairMaxErrorChars,
      httpEndpoint: opts.guidedRepair?.httpEndpoint,
      httpTimeoutMs: opts.guidedRepair?.httpTimeoutMs,
      httpAuthToken: opts.guidedRepair?.httpAuthToken,
      llmBaseUrl: opts.guidedRepair?.llmBaseUrl,
      llmApiKey: opts.guidedRepair?.llmApiKey,
      llmModel: opts.guidedRepair?.llmModel,
      llmTimeoutMs: opts.guidedRepair?.llmTimeoutMs,
      llmMaxTokens: opts.guidedRepair?.llmMaxTokens,
      llmTemperature: opts.guidedRepair?.llmTemperature,
      mode: "guided",
    });
    mergeReplayUsage(usageOut, asObject(repair)?.usage);
    stepReports.push({
      step_index: stepIndex,
      tool_name: toolName,
      status: "partial",
      readiness: "partial",
      command,
      argv,
      execution_backend: executionBackend,
      sandbox_run_id: exec.sandbox_run_id,
      sensitive_review: sensitiveReviewInfo,
      execution: execOutcome,
      result_summary: resultSummary,
      signature,
      postconditions: postChecks,
      repair_applied: true,
      repair,
    });
    if (recordRun) {
      await replayStepAfter(
        client,
        {
          tenant_id: tenancy.tenant_id,
          scope: tenancy.scope,
          ...replayCallIdentity,
          run_id: replayRunId,
          step_id: persistedStepId ?? undefined,
          step_index: stepIndex ?? undefined,
          status: "partial",
          output_signature: {
            command,
            argv,
            execution_backend: executionBackend,
            sandbox_run_id: exec.sandbox_run_id,
            sensitive_review: sensitiveReviewInfo,
            exit_code: execOutcome.exit_code,
            duration_ms: execOutcome.duration_ms,
            result_summary: resultSummary,
            signature,
            postconditions: postChecks,
            repair,
          },
          postconditions: postChecks,
          artifact_refs: [],
          repair_applied: true,
          repair_note: failureReason,
          error: failureReason,
        },
        opts.writeOptions,
      );
    }
  }

  const runStatus: "success" | "failed" | "partial" =
    mode === "strict"
      ? (failedSteps > 0 ? "failed" : "success")
      : (failedSteps > 0 ? "failed" : repairedSteps > 0 || skippedSteps > 0 ? "partial" : "success");

  let runEndOut: Record<string, unknown> | null = null;
  if (recordRun) {
    runEndOut = await replayRunEnd(
      client,
      {
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        ...replayCallIdentity,
        run_id: replayRunId,
        status: runStatus,
        summary: `Replay ${mode} run completed: success=${succeededSteps}, failed=${failedSteps}, repaired=${repairedSteps}, pending=${pendingSteps}`,
        success_criteria: {
          mode,
          execution_backend: executionBackend,
          failed_steps: failedSteps,
          repaired_steps: repairedSteps,
          skipped_steps: skippedSteps,
          pending_steps: pendingSteps,
        },
        metrics: {
          total_steps: stepsRaw.length,
          executed_steps: executedSteps,
          succeeded_steps: succeededSteps,
          failed_steps: failedSteps,
          repaired_steps: repairedSteps,
          blocked_steps: blockedSteps,
          skipped_steps: skippedSteps,
          pending_steps: pendingSteps,
        },
      },
      opts.writeOptions,
    ) as Record<string, unknown>;
  }

  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    playbook: {
      playbook_id: parsed.playbook_id,
      version: row.version_num,
      status: row.playbook_status ?? "draft",
      name: row.title,
      uri: buildAionisUri({
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        type: row.type,
        id: row.id,
      }),
    },
    mode,
    deterministic_gate: deterministicGate,
    run: {
      run_id: replayRunId,
      status: runStatus,
      run_uri: toStringOrNull(runStartOut?.run_uri),
      run_end_uri: toStringOrNull(runEndOut?.run_end_uri),
      commit_id_start: toStringOrNull(runStartOut?.commit_id),
      commit_id_end: toStringOrNull(runEndOut?.commit_id),
    },
    summary: {
      total_steps: stepsRaw.length,
      executed_steps: executedSteps,
      succeeded_steps: succeededSteps,
      failed_steps: failedSteps,
      repaired_steps: repairedSteps,
      blocked_steps: blockedSteps,
      skipped_steps: skippedSteps,
      pending_steps: pendingSteps,
      replay_readiness:
        failedSteps > 0 ? "failed" : pendingSteps > 0 || repairedSteps > 0 || skippedSteps > 0 ? "partial" : "success",
      next_action:
        failedSteps > 0
          ? "Inspect failed step outputs and fix playbook/tool constraints."
          : pendingSteps > 0
            ? "Wait for queued sandbox runs and then replay run_get for completion evidence."
            : repairedSteps > 0 || skippedSteps > 0
            ? "Review guided repair patches and promote a new playbook version if accepted."
            : "Replay run passed with no repair.",
    },
    steps: stepReports,
    execution: {
      inference_skipped: deterministicGate.inference_skipped,
      deterministic_gate_matched: deterministicGate.matched,
      execution_backend: executionBackend,
      local_executor_enabled: localExecutor?.enabled === true,
      sandbox_executor_available: typeof opts.sandboxExecutor === "function",
      sandbox_project_id: sandboxProjectId,
      workdir,
      timeout_ms: timeoutMs,
      stdio_max_bytes: stdioMaxBytes,
      allowed_commands: [...allowedCommands.values()],
      auto_confirm: autoConfirm,
      stop_on_failure: stopOnFailure,
      record_run: recordRun,
      sensitive_review_mode: sensitiveReviewMode,
      allow_sensitive_exec: allowSensitiveExec,
      guided_repair_strategy: guidedRepairStrategy,
      guided_repair_max_error_chars: guidedRepairMaxErrorChars,
      guided_repair_http_configured: Boolean(opts.guidedRepair?.httpEndpoint),
      guided_repair_builtin_llm_configured: Boolean(
        opts.guidedRepair?.llmBaseUrl && opts.guidedRepair?.llmApiKey && opts.guidedRepair?.llmModel,
      ),
    },
    params_echo: parsed.params ?? {},
    usage: usageOut,
    cost_signals: buildReplayCostSignals({ deterministic_gate: deterministicGate }),
  };
}
