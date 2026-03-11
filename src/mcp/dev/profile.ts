import { z } from "zod";
import { type AionisDevEnv, postJson } from "./client.js";

const JsonRecord = z.record(z.unknown());
const Uuid = z.string().uuid();

export const CodexTaskContextSchema = z.object({
  task: z.object({
    id: z.string().min(1).optional(),
    title: z.string().min(1),
    category: z.enum(["bugfix", "feature", "refactor", "review", "ops", "research"]).optional(),
    goal: z.string().min(1),
    acceptance_criteria: z.array(z.string().min(1)).default([]),
    user_request: z.string().min(1).optional(),
  }),
  repo: z.object({
    name: z.string().min(1),
    root: z.string().min(1),
    branch: z.string().min(1).optional(),
    languages: z.array(z.string().min(1)).default([]),
    package_managers: z.array(z.string().min(1)).default([]),
  }),
  environment: z.object({
    os: z.string().min(1).optional(),
    shell: z.string().min(1).optional(),
    ci: z.boolean().optional(),
    sandboxed: z.boolean().optional(),
  }).default({}),
  files: z.object({
    target_paths: z.array(z.string().min(1)).default([]),
    entrypoints: z.array(z.string().min(1)).default([]),
  }).default({ target_paths: [], entrypoints: [] }),
  constraints: z.object({
    must_pass: z.array(z.string().min(1)).default([]),
    forbidden_tools: z.array(z.string().min(1)).default([]),
    preferred_tools: z.array(z.string().min(1)).default([]),
    risk_level: z.enum(["low", "medium", "high"]).optional(),
  }).default({ must_pass: [], forbidden_tools: [], preferred_tools: [] }),
  signals: z.object({
    tests_status: z.enum(["pass", "fail", "not_run"]).optional(),
    lint_status: z.enum(["pass", "fail", "not_run"]).optional(),
    build_status: z.enum(["pass", "fail", "not_run"]).optional(),
    dirty_worktree: z.boolean().optional(),
    failing_paths: z.array(z.string().min(1)).default([]),
  }).default({ failing_paths: [] }),
  metadata: JsonRecord.optional(),
});

export const CodexPlanningContextArgsSchema = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  query_text: z.string().min(1),
  context: CodexTaskContextSchema,
  tool_candidates: z.array(z.string().min(1)).min(1).max(200),
  include_shadow: z.boolean().optional(),
  rules_limit: z.number().int().min(1).max(200).optional(),
  tool_strict: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  neighborhood_hops: z.number().int().min(1).max(2).optional(),
  max_nodes: z.number().int().min(1).max(200).optional(),
  max_edges: z.number().int().min(1).max(100).optional(),
  context_token_budget: z.number().int().positive().max(256_000).optional(),
  context_char_budget: z.number().int().positive().max(1_000_000).optional(),
  context_compaction_profile: z.enum(["balanced", "aggressive"]).optional(),
  context_optimization_profile: z.enum(["balanced", "aggressive"]).optional(),
  return_layered_context: z.boolean().optional(),
  context_layers: z.object({
    enabled: z.array(z.enum(["facts", "episodes", "rules", "static", "decisions", "tools", "citations"])).min(1).max(7).optional(),
    char_budget_total: z.number().int().positive().max(200_000).optional(),
    char_budget_by_layer: z.record(z.number().int().positive().max(200_000)).optional(),
    max_items_by_layer: z.record(z.number().int().positive().max(500)).optional(),
    include_merge_trace: z.boolean().optional(),
    forgetting_policy: z.object({
      enabled: z.boolean().optional(),
      allowed_tiers: z.array(z.enum(["hot", "warm", "cold", "archive"])).min(1).max(4).optional(),
      exclude_archived: z.boolean().optional(),
      min_salience: z.number().min(0).max(1).optional(),
    }).optional(),
  }).optional(),
  static_context_blocks: z.array(z.object({
    id: z.string().min(1).max(128),
    title: z.string().min(1).max(200).optional(),
    content: z.string().min(1).max(20_000),
    tags: z.array(z.string().min(1).max(64)).max(32).optional(),
    intents: z.array(z.string().min(1).max(64)).max(32).optional(),
    tools: z.array(z.string().min(1).max(128)).max(64).optional(),
    priority: z.number().int().min(0).max(100).optional(),
    always_include: z.boolean().optional(),
  })).max(100).optional(),
  static_injection: z.object({
    enabled: z.boolean().optional(),
    max_blocks: z.number().int().positive().max(32).optional(),
    min_score: z.number().int().min(0).max(500).optional(),
    include_selection_trace: z.boolean().optional(),
  }).optional(),
});

export const CodexGateArgsSchema = z.object({
  task_completed: z.boolean(),
  tests_status: z.enum(["pass", "fail", "not_run"]).default("not_run"),
  lint_status: z.enum(["pass", "fail", "not_run"]).default("not_run"),
  build_status: z.enum(["pass", "fail", "not_run"]).default("not_run"),
  regression_detected: z.boolean().default(false),
  sandbox_status: z.enum(["succeeded", "failed", "not_used"]).default("not_used"),
  review_findings_count: z.number().int().min(0).default(0),
  changed_files_count: z.number().int().min(0).optional(),
  risky_surface: z.boolean().default(false),
  notes: z.array(z.string().min(1)).default([]),
});

export type CodexGateInput = z.infer<typeof CodexGateArgsSchema>;

export type CodexGateEvaluation = {
  recommended_outcome: "positive" | "negative" | "neutral";
  eligible_for_learning: boolean;
  confidence: "high" | "medium";
  reasons: string[];
};

export const CodexLearnFromRunArgsSchema = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  run_id: Uuid,
  quality_gate: CodexGateArgsSchema,
  feedback: z.object({
    run_id: z.string().min(1).optional(),
    decision_id: Uuid.optional(),
    decision_uri: z.string().min(1).optional(),
    context: z.unknown(),
    candidates: z.array(z.string().min(1)).min(1).max(200),
    selected_tool: z.string().min(1),
    include_shadow: z.boolean().optional(),
    rules_limit: z.number().int().min(1).max(200).optional(),
    target: z.enum(["tool", "all"]).optional(),
    note: z.string().min(1).optional(),
    input_text: z.string().min(1).optional(),
    input_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).optional(),
  compile: z.object({
    enabled: z.boolean().default(true),
    playbook_id: Uuid.optional(),
    name: z.string().min(1).optional(),
    version: z.number().int().positive().optional(),
    matchers: JsonRecord.optional(),
    success_criteria: JsonRecord.optional(),
    risk_profile: z.enum(["low", "medium", "high"]).optional(),
    allow_partial: z.boolean().optional(),
    metadata: JsonRecord.optional(),
  }).default({ enabled: true }),
}).superRefine((value, ctx) => {
  if (!value.feedback) return;
  if (!value.feedback.input_text && !value.feedback.input_sha256) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["feedback"],
      message: "feedback.input_text or feedback.input_sha256 is required when feedback is provided",
    });
  }
});

export type CodexLearnFromRunInput = z.infer<typeof CodexLearnFromRunArgsSchema>;

export function evaluateCodexGate(input: CodexGateInput): CodexGateEvaluation {
  const reasons: string[] = [];
  let recommended: CodexGateEvaluation["recommended_outcome"] = "neutral";
  let eligible = false;

  if (!input.task_completed) {
    reasons.push("task_not_completed");
    recommended = "negative";
  }
  if (input.regression_detected) {
    reasons.push("regression_detected");
    recommended = "negative";
  }
  if (input.tests_status === "fail") {
    reasons.push("tests_failed");
    recommended = "negative";
  }
  if (input.build_status === "fail") {
    reasons.push("build_failed");
    recommended = "negative";
  }
  if (input.sandbox_status === "failed") {
    reasons.push("sandbox_failed");
    recommended = "negative";
  }
  if (input.review_findings_count > 0) {
    reasons.push("review_findings_present");
    if (recommended !== "negative") recommended = "neutral";
  }

  if (recommended !== "negative" && input.task_completed) {
    if (
      input.tests_status === "pass" &&
      input.build_status !== "fail" &&
      !input.regression_detected &&
      !input.risky_surface &&
      input.review_findings_count === 0
    ) {
      recommended = "positive";
      eligible = true;
      reasons.push("quality_gate_passed");
    } else {
      recommended = "neutral";
      reasons.push("partial_signal_only");
    }
  }

  if (input.lint_status === "fail" && recommended === "positive") {
    recommended = "neutral";
    eligible = false;
    reasons.push("lint_failed");
  } else if (input.lint_status === "fail" && recommended !== "negative") {
    reasons.push("lint_failed");
  }

  for (const note of input.notes) {
    reasons.push(`note:${note}`);
  }

  return {
    recommended_outcome: recommended,
    eligible_for_learning: eligible,
    confidence: input.tests_status === "pass" || recommended === "negative" ? "high" : "medium",
    reasons,
  };
}

export async function submitCodexLearnFromRun(
  env: AionisDevEnv,
  input: CodexLearnFromRunInput,
): Promise<Record<string, unknown>> {
  const parsed = CodexLearnFromRunArgsSchema.parse(input);
  const gate = evaluateCodexGate(parsed.quality_gate);
  const out: Record<string, unknown> = {
    gate,
    feedback: null,
    compile: null,
  };

  if (parsed.feedback) {
    const feedbackBody: Record<string, unknown> = {
      tenant_id: parsed.tenant_id,
      scope: parsed.scope,
      actor: parsed.actor,
      run_id: parsed.feedback.run_id ?? parsed.run_id,
      outcome: gate.recommended_outcome,
      context: parsed.feedback.context,
      candidates: parsed.feedback.candidates,
      selected_tool: parsed.feedback.selected_tool,
      include_shadow: parsed.feedback.include_shadow,
      rules_limit: parsed.feedback.rules_limit,
      target: parsed.feedback.target,
      note: parsed.feedback.note,
      input_text: parsed.feedback.input_text,
      input_sha256: parsed.feedback.input_sha256,
    };
    if (parsed.feedback.decision_id) feedbackBody.decision_id = parsed.feedback.decision_id;
    if (parsed.feedback.decision_uri) feedbackBody.decision_uri = parsed.feedback.decision_uri;
    out.feedback = await postJson(env, "/v1/memory/tools/feedback", feedbackBody);
  }

  if (parsed.compile.enabled && gate.eligible_for_learning) {
    out.compile = await postJson(env, "/v1/memory/replay/playbooks/compile_from_run", {
      tenant_id: parsed.tenant_id,
      scope: parsed.scope,
      actor: parsed.actor,
      run_id: parsed.run_id,
      playbook_id: parsed.compile.playbook_id,
      name: parsed.compile.name,
      version: parsed.compile.version,
      matchers: parsed.compile.matchers,
      success_criteria: parsed.compile.success_criteria,
      risk_profile: parsed.compile.risk_profile,
      allow_partial: parsed.compile.allow_partial,
      metadata: {
        ...(parsed.compile.metadata ?? {}),
        codex_gate: gate,
      },
    });
  } else if (parsed.compile.enabled) {
    out.compile = {
      skipped: true,
      reason: "quality_gate_not_met",
      recommended_outcome: gate.recommended_outcome,
    };
  }

  return out;
}
