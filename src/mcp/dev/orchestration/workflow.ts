import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type AionisDevEnv, clipText, postJson } from "../client.js";
import {
  CodexGateArgsSchema,
  CodexPlanningContextArgsSchema,
  type CodexGateInput,
  type CodexGateEvaluation,
  evaluateCodexGate,
} from "../profile.js";

const JsonRecord = z.record(z.unknown());
const Uuid = z.string().uuid();
const ReplayStepStatusSchema = z.enum(["success", "failed", "skipped", "partial"]);

const ReplayStepCommonSchema = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  run_id: Uuid,
  step_id: Uuid.optional(),
  decision_id: Uuid.optional(),
  step_index: z.number().int().positive(),
  tool_name: z.string().min(1),
  safety_level: z.enum(["auto_ok", "needs_confirm", "manual_only"]).default("needs_confirm"),
  retry_policy: JsonRecord.optional(),
  metadata: JsonRecord.optional(),
});

export const DevCommandStepArgsSchema = ReplayStepCommonSchema.extend({
  cwd: z.string().min(1).optional(),
  argv: z.array(z.string()).min(1),
  expected_output_signature: z.unknown().optional(),
  timeout_ms: z.number().int().positive().max(600_000).optional(),
});

export const DevMarkStepArgsSchema = ReplayStepCommonSchema.extend({
  tool_input: z.unknown().default({}),
  expected_output_signature: z.unknown().optional(),
  status: ReplayStepStatusSchema,
  output_signature: z.unknown().optional(),
  postconditions: z.array(JsonRecord).max(200).default([]),
  artifact_refs: z.array(z.string().min(1)).max(200).default([]),
  repair_applied: z.boolean().default(false),
  repair_note: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});

export type DevCommandStepArgs = z.infer<typeof DevCommandStepArgsSchema>;
export type DevMarkStepArgs = z.infer<typeof DevMarkStepArgsSchema>;

type PlanningRequestInput = {
  root?: string;
  run_id?: string;
  query_text: string;
  tool_candidates: string[];
  task: {
    id?: string;
    title: string;
    category?: "bugfix" | "feature" | "refactor" | "review" | "ops" | "research";
    goal: string;
    acceptance_criteria?: string[];
    user_request?: string;
  };
  files?: {
    target_paths?: string[];
    entrypoints?: string[];
  };
  constraints?: {
    must_pass?: string[];
    forbidden_tools?: string[];
    preferred_tools?: string[];
    risk_level?: "low" | "medium" | "high";
  };
  signals?: {
    tests_status?: "pass" | "fail" | "not_run";
    lint_status?: "pass" | "fail" | "not_run";
    build_status?: "pass" | "fail" | "not_run";
    failing_paths?: string[];
  };
  metadata?: Record<string, unknown>;
  tenant_id?: string;
  scope?: string;
  include_shadow?: boolean;
  rules_limit?: number;
  tool_strict?: boolean;
};

type RecordedStepBeforeResponse = {
  before: unknown;
  step_id: string;
};

type RecordedCommandExecution = {
  exit_code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  duration_ms: number;
  status: z.infer<typeof ReplayStepStatusSchema>;
  error_message: string | null;
};

function uniq(items: string[]): string[] {
  return Array.from(new Set(items.filter((item) => item.length > 0)));
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function detectBranch(root: string): string | undefined {
  const out = spawnSync("git", ["-C", root, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" });
  if (out.status !== 0) return undefined;
  const branch = out.stdout.trim();
  return branch.length > 0 ? branch : undefined;
}

function detectDirtyWorktree(root: string): boolean | undefined {
  const out = spawnSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" });
  if (out.status !== 0) return undefined;
  return out.stdout.trim().length > 0;
}

function detectLanguages(root: string, targetPaths: string[]): string[] {
  const seen = new Set<string>();
  const byExt: Record<string, string> = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".py": "Python",
    ".rs": "Rust",
    ".go": "Go",
    ".java": "Java",
    ".rb": "Ruby",
    ".php": "PHP",
  };

  for (const path of targetPaths) {
    const ext = extname(path).toLowerCase();
    const language = byExt[ext];
    if (language) seen.add(language);
  }

  if (existsSync(resolve(root, "tsconfig.json"))) seen.add("TypeScript");
  if (existsSync(resolve(root, "package.json")) && !seen.has("TypeScript")) seen.add("JavaScript");
  if (existsSync(resolve(root, "pyproject.toml")) || existsSync(resolve(root, "requirements.txt"))) seen.add("Python");
  if (existsSync(resolve(root, "Cargo.toml"))) seen.add("Rust");
  if (existsSync(resolve(root, "go.mod"))) seen.add("Go");

  return Array.from(seen);
}

function detectPackageManagers(root: string): string[] {
  const found: string[] = [];
  if (existsSync(resolve(root, "package-lock.json"))) found.push("npm");
  if (existsSync(resolve(root, "pnpm-lock.yaml"))) found.push("pnpm");
  if (existsSync(resolve(root, "yarn.lock"))) found.push("yarn");
  if (existsSync(resolve(root, "bun.lockb")) || existsSync(resolve(root, "bun.lock"))) found.push("bun");
  if (existsSync(resolve(root, "uv.lock"))) found.push("uv");
  if (existsSync(resolve(root, "poetry.lock"))) found.push("poetry");
  if (existsSync(resolve(root, "Cargo.lock"))) found.push("cargo");
  return found;
}

function coerceStepId(stepId?: string): string {
  return stepId ?? randomUUID();
}

function executeLocalCommand(args: DevCommandStepArgs): RecordedCommandExecution {
  const startedAt = Date.now();
  const child = spawnSync(args.argv[0], args.argv.slice(1), {
    cwd: args.cwd ? resolve(args.cwd) : process.cwd(),
    encoding: "utf8",
    timeout: args.timeout_ms,
  });
  const durationMs = Date.now() - startedAt;

  const stdout = child.stdout ?? "";
  const stderr = child.stderr ?? "";
  const signal = typeof child.signal === "string" ? child.signal : null;
  const exitCode = Number.isInteger(child.status) ? child.status : null;

  if (stdout.length > 0) process.stdout.write(stdout);
  if (stderr.length > 0) process.stderr.write(stderr);

  let status: z.infer<typeof ReplayStepStatusSchema> = exitCode === 0 && !child.error ? "success" : "failed";
  if (signal) status = "failed";

  const errorMessage = child.error
    ? child.error.message
    : signal
      ? `process_signaled:${signal}`
      : exitCode === 0
        ? null
        : `process_exit_${exitCode ?? "unknown"}`;

  return {
    exit_code: exitCode,
    signal,
    stdout,
    stderr,
    duration_ms: durationMs,
    status,
    error_message: errorMessage,
  };
}

export function buildPlanningRequest(input: PlanningRequestInput): z.infer<typeof CodexPlanningContextArgsSchema> {
  const root = resolve(input.root ?? process.cwd());
  const targetPaths = uniq((input.files?.target_paths ?? []).map((path) => resolve(root, path)));
  const entrypoints = uniq((input.files?.entrypoints ?? []).map((path) => resolve(root, path)));

  return CodexPlanningContextArgsSchema.parse({
    tenant_id: input.tenant_id,
    scope: input.scope,
    run_id: input.run_id,
    query_text: input.query_text,
    tool_candidates: input.tool_candidates,
    include_shadow: input.include_shadow ?? true,
    rules_limit: input.rules_limit,
    tool_strict: input.tool_strict ?? true,
    context: {
      task: {
        ...input.task,
        acceptance_criteria: input.task.acceptance_criteria ?? [],
      },
      repo: {
        name: root.split("/").filter(Boolean).pop() ?? "workspace",
        root,
        branch: detectBranch(root),
        languages: detectLanguages(root, targetPaths),
        package_managers: detectPackageManagers(root),
      },
      environment: {
        os: process.platform,
        shell: process.env.SHELL,
        ci: process.env.CI === "true",
        sandboxed: false,
      },
      files: {
        target_paths: targetPaths,
        entrypoints,
      },
      constraints: {
        must_pass: input.constraints?.must_pass ?? [],
        forbidden_tools: input.constraints?.forbidden_tools ?? [],
        preferred_tools: input.constraints?.preferred_tools ?? [],
        risk_level: input.constraints?.risk_level,
      },
      signals: {
        tests_status: input.signals?.tests_status,
        lint_status: input.signals?.lint_status,
        build_status: input.signals?.build_status,
        dirty_worktree: detectDirtyWorktree(root),
        failing_paths: input.signals?.failing_paths ?? [],
      },
      metadata: input.metadata ?? {},
    },
  });
}

export async function recordReplayStepBefore(
  env: AionisDevEnv,
  input: {
    tenant_id?: string;
    scope?: string;
    actor?: string;
    run_id: string;
    step_id?: string;
    decision_id?: string;
    step_index: number;
    tool_name: string;
    tool_input: unknown;
    expected_output_signature?: unknown;
    safety_level?: "auto_ok" | "needs_confirm" | "manual_only";
    retry_policy?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  },
): Promise<RecordedStepBeforeResponse> {
  const stepId = coerceStepId(input.step_id);
  const before = await postJson(env, "/v1/memory/replay/step/before", {
    tenant_id: input.tenant_id,
    scope: input.scope,
    actor: input.actor,
    run_id: input.run_id,
    step_id: stepId,
    decision_id: input.decision_id,
    step_index: input.step_index,
    tool_name: input.tool_name,
    tool_input: input.tool_input,
    expected_output_signature: input.expected_output_signature,
    preconditions: [],
    retry_policy: input.retry_policy,
    safety_level: input.safety_level,
    metadata: input.metadata,
  });
  return { before, step_id: stepId };
}

export async function recordReplayStepAfter(
  env: AionisDevEnv,
  input: {
    tenant_id?: string;
    scope?: string;
    actor?: string;
    run_id: string;
    step_id: string;
    step_index?: number;
    status: z.infer<typeof ReplayStepStatusSchema>;
    output_signature?: unknown;
    postconditions?: Array<Record<string, unknown>>;
    artifact_refs?: string[];
    repair_applied?: boolean;
    repair_note?: string;
    error?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<unknown> {
  return await postJson(env, "/v1/memory/replay/step/after", {
    tenant_id: input.tenant_id,
    scope: input.scope,
    actor: input.actor,
    run_id: input.run_id,
    step_id: input.step_id,
    step_index: input.step_index,
    status: input.status,
    output_signature: input.output_signature,
    postconditions: input.postconditions ?? [],
    artifact_refs: input.artifact_refs ?? [],
    repair_applied: input.repair_applied ?? false,
    repair_note: input.repair_note,
    error: input.error,
    metadata: input.metadata,
  });
}

export async function executeRecordedCommandStep(
  env: AionisDevEnv,
  input: DevCommandStepArgs,
): Promise<Record<string, unknown>> {
  const parsed = DevCommandStepArgsSchema.parse(input);
  const cwd = parsed.cwd ? resolve(parsed.cwd) : process.cwd();
  const before = await recordReplayStepBefore(env, {
    tenant_id: parsed.tenant_id,
    scope: parsed.scope,
    actor: parsed.actor,
    run_id: parsed.run_id,
    step_id: parsed.step_id,
    decision_id: parsed.decision_id,
    step_index: parsed.step_index,
    tool_name: parsed.tool_name,
    tool_input: {
      kind: "command",
      argv: parsed.argv,
      cwd,
    },
    expected_output_signature: parsed.expected_output_signature,
    safety_level: parsed.safety_level,
    retry_policy: parsed.retry_policy,
    metadata: {
      ...(parsed.metadata ?? {}),
      recorder: "aionis-dev-command-step-v1",
    },
  });

  const execution = executeLocalCommand(parsed);
  const after = await recordReplayStepAfter(env, {
    tenant_id: parsed.tenant_id,
    scope: parsed.scope,
    actor: parsed.actor,
    run_id: parsed.run_id,
    step_id: before.step_id,
    step_index: parsed.step_index,
    status: execution.status,
    output_signature: {
      kind: "command_result",
      argv: parsed.argv,
      cwd,
      exit_code: execution.exit_code,
      signal: execution.signal,
      stdout_preview: clipText(execution.stdout, 4000),
      stderr_preview: clipText(execution.stderr, 4000),
    },
    error: execution.error_message ? clipText(execution.error_message, 2000) : undefined,
    metadata: {
      ...(parsed.metadata ?? {}),
      recorder: "aionis-dev-command-step-v1",
      duration_ms: execution.duration_ms,
      stdout_chars: execution.stdout.length,
      stderr_chars: execution.stderr.length,
    },
  });

  return {
    before: before.before,
    after,
    execution: {
      exit_code: execution.exit_code,
      signal: execution.signal,
      duration_ms: execution.duration_ms,
      status: execution.status,
      stdout_chars: execution.stdout.length,
      stderr_chars: execution.stderr.length,
    },
    step_id: before.step_id,
  };
}

export async function markRecordedStep(
  env: AionisDevEnv,
  input: DevMarkStepArgs,
): Promise<Record<string, unknown>> {
  const parsed = DevMarkStepArgsSchema.parse(input);
  const before = await recordReplayStepBefore(env, {
    tenant_id: parsed.tenant_id,
    scope: parsed.scope,
    actor: parsed.actor,
    run_id: parsed.run_id,
    step_id: parsed.step_id,
    decision_id: parsed.decision_id,
    step_index: parsed.step_index,
    tool_name: parsed.tool_name,
    tool_input: parsed.tool_input,
    expected_output_signature: parsed.expected_output_signature,
    safety_level: parsed.safety_level,
    retry_policy: parsed.retry_policy,
    metadata: {
      ...(parsed.metadata ?? {}),
      recorder: "aionis-dev-mark-step-v1",
    },
  });

  const after = await recordReplayStepAfter(env, {
    tenant_id: parsed.tenant_id,
    scope: parsed.scope,
    actor: parsed.actor,
    run_id: parsed.run_id,
    step_id: before.step_id,
    step_index: parsed.step_index,
    status: parsed.status,
    output_signature: parsed.output_signature,
    postconditions: parsed.postconditions,
    artifact_refs: parsed.artifact_refs,
    repair_applied: parsed.repair_applied,
    repair_note: parsed.repair_note,
    error: parsed.error,
    metadata: {
      ...(parsed.metadata ?? {}),
      recorder: "aionis-dev-mark-step-v1",
    },
  });

  return {
    before: before.before,
    after,
    step_id: before.step_id,
    status: parsed.status,
  };
}

export function readJsonFile<T = unknown>(path: string): T {
  return readJson(resolve(path)) as T;
}

export function toPrintableJson(value: unknown, maxChars = 12_000): string {
  return clipText(JSON.stringify(value, null, 2), maxChars);
}

export function evaluateLocalGate(input: CodexGateInput): CodexGateEvaluation {
  return evaluateCodexGate(CodexGateArgsSchema.parse(input));
}
