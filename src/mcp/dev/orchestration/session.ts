import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type AionisDevEnv, clipText, postJson } from "../client.js";
import { CodexGateArgsSchema, CodexLearnFromRunArgsSchema, type CodexLearnFromRunInput, submitCodexLearnFromRun } from "../profile.js";
import { buildPlanningRequest, readJsonFile } from "./workflow.js";

const CategorySchema = z.enum(["bugfix", "feature", "refactor", "review", "ops", "research"]);

const SessionStateSchema = z.object({
  version: z.literal("aionis_dev_session_v1"),
  run_id: z.string().uuid(),
  root: z.string().min(1),
  state_path: z.string().min(1),
  actor: z.string().min(1),
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  title: z.string().min(1),
  goal: z.string().min(1),
  category: CategorySchema.optional(),
  query_text: z.string().min(1).optional(),
  user_request: z.string().min(1).optional(),
  acceptance_criteria: z.array(z.string().min(1)).default([]),
  started_at: z.string().min(1),
  updated_at: z.string().min(1),
  ended_at: z.string().min(1).optional(),
  session_status: z.enum(["started", "ended"]),
  replay_status: z.enum(["success", "failed", "partial"]).optional(),
  next_step_index: z.number().int().positive(),
  planning_request_path: z.string().min(1).optional(),
  planning_response_path: z.string().min(1).optional(),
});

export type SessionState = z.infer<typeof SessionStateSchema>;

export const StartSessionArgsSchema = z.object({
  root: z.string().min(1).optional(),
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).default("agent"),
  run_id: z.string().uuid().optional(),
  title: z.string().min(1),
  goal: z.string().min(1),
  category: CategorySchema.optional(),
  query_text: z.string().min(1).optional(),
  user_request: z.string().min(1).optional(),
  acceptance_criteria: z.array(z.string().min(1)).default([]),
  plan_on_start: z.boolean().default(false),
  tool_candidates: z.array(z.string().min(1)).max(200).default([]),
  target_paths: z.array(z.string().min(1)).default([]),
  entrypoints: z.array(z.string().min(1)).default([]),
  must_pass: z.array(z.string().min(1)).default([]),
  forbidden_tools: z.array(z.string().min(1)).default([]),
  preferred_tools: z.array(z.string().min(1)).default([]),
  risk_level: z.enum(["low", "medium", "high"]).optional(),
  tests_status: z.enum(["pass", "fail", "not_run"]).optional(),
  lint_status: z.enum(["pass", "fail", "not_run"]).optional(),
  build_status: z.enum(["pass", "fail", "not_run"]).optional(),
  failing_paths: z.array(z.string().min(1)).default([]),
  include_shadow: z.boolean().optional(),
  rules_limit: z.number().int().min(1).max(200).optional(),
  tool_strict: z.boolean().optional(),
});

export const EndSessionArgsSchema = z.object({
  root: z.string().min(1).optional(),
  run_id: z.string().uuid(),
  status: z.enum(["success", "failed", "partial"]),
  summary: z.string().min(1).optional(),
  quality_gate_file: z.string().min(1).optional(),
  learn_file: z.string().min(1).optional(),
});

function sessionDir(root: string): string {
  return join(root, ".aionis", "dev-runs");
}

function statePath(root: string, runId: string): string {
  return join(sessionDir(root), `${runId}.json`);
}

function lockPath(root: string, runId: string): string {
  return join(sessionDir(root), `${runId}.lock`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function acquireSessionLock(root: string, runId: string): Promise<string> {
  const path = lockPath(root, runId);
  const deadline = Date.now() + 10_000;
  const retryMs = 25;
  const staleMs = 60_000;

  mkdirSync(sessionDir(root), { recursive: true });

  while (Date.now() < deadline) {
    try {
      mkdirSync(path);
      writeFileSync(join(path, "owner.json"), `${JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() })}\n`, "utf8");
      return path;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;

      try {
        const ageMs = Date.now() - statSync(path).mtimeMs;
        if (ageMs > staleMs) {
          rmSync(path, { recursive: true, force: true });
          continue;
        }
      } catch {
        // Another process may have released the lock.
      }

      await delay(retryMs);
    }
  }

  throw new Error(`session_lock_timeout: ${path}`);
}

function releaseSessionLock(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

async function withSessionLock<T>(root: string, runId: string, fn: () => Promise<T>): Promise<T> {
  const path = await acquireSessionLock(root, runId);
  try {
    return await fn();
  } finally {
    releaseSessionLock(path);
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(tmpPath, path);
}

function persistState(state: SessionState): void {
  writeJson(state.state_path, state);
}

export function loadSessionState(root: string | undefined, runId: string): SessionState {
  const baseRoot = resolve(root ?? process.cwd());
  const fullPath = statePath(baseRoot, runId);
  if (!existsSync(fullPath)) {
    throw new Error(`session_state_not_found: ${fullPath}`);
  }
  return SessionStateSchema.parse(JSON.parse(readFileSync(fullPath, "utf8")));
}

export async function reserveSessionStepIndex(root: string | undefined, runId: string): Promise<{ step_index: number; session: SessionState }> {
  const baseRoot = resolve(root ?? process.cwd());
  return await withSessionLock(baseRoot, runId, async () => {
    const state = loadSessionState(baseRoot, runId);
    if (state.session_status !== "started") {
      throw new Error(`session_not_started: ${runId}`);
    }

    const nextState = SessionStateSchema.parse({
      ...state,
      next_step_index: state.next_step_index + 1,
      updated_at: new Date().toISOString(),
    });
    persistState(nextState);
    return {
      step_index: state.next_step_index,
      session: nextState,
    };
  });
}

export async function startAgentSession(env: AionisDevEnv, input: z.infer<typeof StartSessionArgsSchema>): Promise<Record<string, unknown>> {
  const parsed = StartSessionArgsSchema.parse(input);
  const root = resolve(parsed.root ?? process.cwd());
  const runId = parsed.run_id ?? randomUUID();
  mkdirSync(sessionDir(root), { recursive: true });
  const startedAt = new Date().toISOString();

  const replayStart = await postJson(env, "/v1/memory/replay/run/start", {
    tenant_id: parsed.tenant_id,
    scope: parsed.scope,
    actor: parsed.actor,
    run_id: runId,
    goal: parsed.goal,
    metadata: {
      title: parsed.title,
      category: parsed.category,
      user_request: parsed.user_request,
      acceptance_criteria: parsed.acceptance_criteria,
      root,
    },
  });

  let planning: unknown = null;
  let planningRequestPath: string | undefined;
  let planningResponsePath: string | undefined;
  if (parsed.plan_on_start && parsed.query_text) {
    const request = buildPlanningRequest({
      root,
      run_id: runId,
      query_text: parsed.query_text,
      tool_candidates: parsed.tool_candidates.length > 0 ? parsed.tool_candidates : ["exec_command", "apply_patch", "write_stdin"],
      task: {
        title: parsed.title,
        category: parsed.category,
        goal: parsed.goal,
        acceptance_criteria: parsed.acceptance_criteria,
        user_request: parsed.user_request,
      },
      files: {
        target_paths: parsed.target_paths,
        entrypoints: parsed.entrypoints,
      },
      constraints: {
        must_pass: parsed.must_pass,
        forbidden_tools: parsed.forbidden_tools,
        preferred_tools: parsed.preferred_tools,
        risk_level: parsed.risk_level,
      },
      signals: {
        tests_status: parsed.tests_status,
        lint_status: parsed.lint_status,
        build_status: parsed.build_status,
        failing_paths: parsed.failing_paths,
      },
      metadata: {
        actor: parsed.actor,
        source: "aionis-dev-session-start",
      },
      tenant_id: parsed.tenant_id,
      scope: parsed.scope,
      include_shadow: parsed.include_shadow,
      rules_limit: parsed.rules_limit,
      tool_strict: parsed.tool_strict,
    });
    planning = await postJson(env, "/v1/memory/planning/context", request);
    planningRequestPath = join(sessionDir(root), `${runId}.planning.request.json`);
    planningResponsePath = join(sessionDir(root), `${runId}.planning.response.json`);
    writeJson(planningRequestPath, request);
    writeJson(planningResponsePath, planning);
  }

  const state = SessionStateSchema.parse({
    version: "aionis_dev_session_v1",
    run_id: runId,
    root,
    state_path: statePath(root, runId),
    actor: parsed.actor,
    tenant_id: parsed.tenant_id,
    scope: parsed.scope,
    title: parsed.title,
    goal: parsed.goal,
    category: parsed.category,
    query_text: parsed.query_text,
    user_request: parsed.user_request,
    acceptance_criteria: parsed.acceptance_criteria,
    started_at: startedAt,
    updated_at: startedAt,
    session_status: "started",
    next_step_index: 1,
    planning_request_path: planningRequestPath,
    planning_response_path: planningResponsePath,
  });
  persistState(state);

  return {
    session: state,
    replay_start: replayStart,
    planning,
  };
}

export async function endAgentSession(env: AionisDevEnv, input: z.infer<typeof EndSessionArgsSchema>): Promise<Record<string, unknown>> {
  const parsed = EndSessionArgsSchema.parse(input);
  const baseRoot = resolve(parsed.root ?? process.cwd());
  return await withSessionLock(baseRoot, parsed.run_id, async () => {
    const state = loadSessionState(baseRoot, parsed.run_id);
    const endedAt = new Date().toISOString();

    const replayEnd = await postJson(env, "/v1/memory/replay/run/end", {
      tenant_id: state.tenant_id,
      scope: state.scope,
      actor: state.actor,
      run_id: state.run_id,
      status: parsed.status,
      summary: parsed.summary,
      metadata: {
        session_state_path: state.state_path,
        title: state.title,
      },
    });

    let learn: unknown = null;
    if (parsed.learn_file) {
      const learnInput = CodexLearnFromRunArgsSchema.parse(readJsonFile(parsed.learn_file)) as CodexLearnFromRunInput;
      learn = await submitCodexLearnFromRun(env, {
        ...learnInput,
        run_id: state.run_id,
        tenant_id: learnInput.tenant_id ?? state.tenant_id,
        scope: learnInput.scope ?? state.scope,
        actor: learnInput.actor ?? state.actor,
      });
    } else if (parsed.quality_gate_file) {
      const qualityGate = CodexGateArgsSchema.parse(readJsonFile(parsed.quality_gate_file));
      learn = await submitCodexLearnFromRun(env, {
        tenant_id: state.tenant_id,
        scope: state.scope,
        actor: state.actor,
        run_id: state.run_id,
        quality_gate: qualityGate,
        compile: { enabled: false },
      });
    }

    const nextState = SessionStateSchema.parse({
      ...state,
      updated_at: endedAt,
      ended_at: endedAt,
      session_status: "ended",
      replay_status: parsed.status,
    });
    persistState(nextState);

    return {
      session: nextState,
      replay_end: replayEnd,
      learn,
    };
  });
}

export function showAgentSession(root: string | undefined, runId: string, maxChars = 100_000): string {
  return clipText(JSON.stringify(loadSessionState(root, runId), null, 2), maxChars);
}
