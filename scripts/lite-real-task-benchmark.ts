import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import {
  GOVERNANCE_HTTP_FORM_PATTERN_PROMPT_VERSION,
  GOVERNANCE_HTTP_OPENAI_TRANSPORT_CONTRACT_VERSION,
  GOVERNANCE_HTTP_PROMOTE_MEMORY_PROMPT_VERSION,
} from "../src/memory/governance-model-client-http-contract.ts";
import {
  MEMORY_FORM_PATTERN_SEMANTIC_REVIEW_VERSION,
  MEMORY_PROMOTE_SEMANTIC_REVIEW_VERSION,
} from "../src/memory/schemas.ts";
import { FakeEmbeddingProvider } from "../src/embeddings/fake.ts";
import { createRequestGuards } from "../src/app/request-guards.ts";
import { createReplayRepairReviewPolicy } from "../src/app/replay-repair-review-policy.ts";
import { createReplayRuntimeOptionBuilders } from "../src/app/replay-runtime-options.ts";
import type { LiteGovernanceRuntimeProviderBuilderOptions } from "../src/app/governance-runtime-providers.ts";
import { registerHostErrorHandler } from "../src/host/http-host-bootstrap-shared.ts";
import { registerSdkDemoMemoryAccessRoutes as registerMemoryAccessRoutes } from "../src/routes/sdk-demo-memory-access.ts";
import { registerMemoryContextRuntimeRoutes } from "../src/routes/memory-context-runtime.ts";
import { registerSdkDemoMemoryFeedbackToolRoutes as registerMemoryFeedbackToolRoutes } from "../src/routes/sdk-demo-memory-feedback-tools.ts";
import { registerSdkDemoMemoryReplayGovernedRoutes as registerMemoryReplayGovernedRoutes } from "../src/routes/sdk-demo-memory-replay-governed.ts";
import { registerSdkDemoMemoryWriteRoutes as registerMemoryWriteRoutes } from "../src/routes/sdk-demo-memory-write.ts";
import {
  ExecutionMemoryIntrospectionResponseSchema,
  PlanningContextRouteContractSchema,
  ReplayPlaybookRepairReviewResponseSchema,
  ToolsFeedbackResponseSchema,
  ToolsSelectRouteContractSchema,
} from "../src/memory/schemas.ts";
import { applyReplayMemoryWrite } from "../src/memory/replay-write.ts";
import { updateRuleState } from "../src/memory/rules.ts";
import { createStaticFormPatternGovernanceReviewProvider } from "../src/memory/governance-provider-static.ts";
import { toolSelectionFeedback } from "../src/memory/tools-feedback.ts";
import { selectTools } from "../src/memory/tools-select.ts";
import { applyMemoryWrite, prepareMemoryWrite } from "../src/memory/write.ts";
import { createLiteRecallStore } from "../src/store/lite-recall-store.ts";
import { createLiteReplayStore } from "../src/store/lite-replay-store.ts";
import { createLiteWriteStore } from "../src/store/lite-write-store.ts";
import { InflightGate } from "../src/util/inflight_gate.ts";
import type {
  GovernanceHttpModelClientConfig,
  GovernanceModelClientFactory,
} from "../src/memory/governance-model-client.ts";

type AssertionResult = {
  name: string;
  status: "pass" | "fail";
  detail?: string;
};

type BenchmarkScenarioResult = {
  id: string;
  title: string;
  status: "pass" | "fail";
  duration_ms: number;
  assertion_summary: {
    passed: number;
    total: number;
  };
  score_pct: number;
  pass_criteria_summary: string;
  assertions: AssertionResult[];
  metrics: Record<string, unknown>;
  notes: string[];
  compare_summary?: {
    baseline_status: "pass" | "fail" | "missing";
    baseline_score_pct: number | null;
    score_delta_pct: number | null;
    status_changed: boolean;
  };
  error?: string;
};

type BenchmarkSuiteProfile = {
  policy_learning?: {
    trusted_pattern_count_after_revalidation: number | null;
    contested_revalidation_fresh_runs_needed: number | null;
  };
  workflow_progression?: {
    stable_workflow_count_after_second: number | null;
  };
  multi_step_repair?: {
    stable_workflow_count_after_validate: number | null;
  };
  governed_learning?: {
    workflow_promotion_state: string | null;
    tools_pattern_state: string | null;
    tools_credibility_state: string | null;
  };
  governed_replay?: {
    replay_learning_rule_state: string | null;
    stable_workflow_count_after_replay: number | null;
  };
  governance_provider_precedence?: {
    workflow_provider_override_blocked: boolean | null;
    tools_provider_override_blocked: boolean | null;
    tools_pattern_state: string | null;
  };
  custom_model_client?: {
    workflow_governed_state: string | null;
    tools_pattern_state: string | null;
    replay_learning_rule_state: string | null;
  };
  http_model_client?: {
    workflow_governed_state: string | null;
    tools_pattern_state: string | null;
    replay_learning_rule_state: string | null;
  };
  http_shadow_compare?: {
    workflow_state_match: boolean | null;
    tools_state_match: boolean | null;
    replay_state_match: boolean | null;
  };
  http_prompt_contract?: {
    transport_contract_version: string | null;
    promote_memory_prompt_version: string | null;
    form_pattern_prompt_version: string | null;
  };
  http_response_contract?: {
    promote_memory_review_version: string | null;
    form_pattern_review_version: string | null;
  };
  slim_surface_boundary?: {
    planning_has_layered_context: boolean | null;
    assemble_has_layered_context: boolean | null;
  };
};

type BenchmarkProfilePolicyLevel = "hard" | "soft";

type BenchmarkSuiteResult = {
  generated_at: string;
  overall_status: "pass" | "fail";
  suite_summary: {
    passed_scenarios: number;
    total_scenarios: number;
    score_pct: number;
  };
  suite_profile: BenchmarkSuiteProfile;
  compare_summary?: {
    baseline_score_pct: number | null;
    score_delta_pct: number | null;
    profile_policy_version: string;
    scenarios_with_status_change: string[];
    changed_profile_keys: string[];
    hard_changed_profile_keys: string[];
    soft_changed_profile_keys: string[];
  };
  scenarios: BenchmarkScenarioResult[];
};

type CliOptions = {
  json: boolean;
  outJson: string | null;
  outMarkdown: string | null;
  baselineJson: string | null;
  failOnStatusRegression: boolean;
  maxSuiteScoreDropPct: number | null;
  maxScenarioScoreDropPct: number | null;
  failOnProfileDrift: boolean;
  failOnHardProfileDrift: boolean;
  externalHttpShadow: boolean;
  externalHttpBaseUrl: string | null;
  externalHttpApiKey: string | null;
  externalHttpModel: string | null;
  externalHttpTransport: string | null;
  externalHttpTimeoutMs: number | null;
  externalHttpMaxTokens: number | null;
  externalHttpTemperature: number | null;
};

type BenchmarkRegressionGate = {
  ok: boolean;
  reasons: string[];
};

const BENCHMARK_PROFILE_POLICY_VERSION = "v4";
const HARD_BENCHMARK_PROFILE_KEYS = new Set<string>([
  "workflow_progression.stable_workflow_count_after_second",
  "multi_step_repair.stable_workflow_count_after_validate",
  "governed_learning.workflow_promotion_state",
  "governed_learning.tools_pattern_state",
  "governed_learning.tools_credibility_state",
  "governed_replay.replay_learning_rule_state",
  "governed_replay.stable_workflow_count_after_replay",
  "governance_provider_precedence.workflow_provider_override_blocked",
  "governance_provider_precedence.tools_provider_override_blocked",
  "custom_model_client.workflow_governed_state",
  "custom_model_client.tools_pattern_state",
  "custom_model_client.replay_learning_rule_state",
  "http_model_client.workflow_governed_state",
  "http_model_client.tools_pattern_state",
  "http_model_client.replay_learning_rule_state",
  "http_shadow_compare.workflow_state_match",
  "http_shadow_compare.tools_state_match",
  "http_shadow_compare.replay_state_match",
  "http_prompt_contract.transport_contract_version",
  "http_prompt_contract.promote_memory_prompt_version",
  "http_prompt_contract.form_pattern_prompt_version",
  "http_response_contract.promote_memory_review_version",
  "http_response_contract.form_pattern_review_version",
  "slim_surface_boundary.planning_has_layered_context",
  "slim_surface_boundary.assemble_has_layered_context",
]);

function getBenchmarkProfilePolicyLevel(key: string): BenchmarkProfilePolicyLevel {
  return HARD_BENCHMARK_PROFILE_KEYS.has(key) ? "hard" : "soft";
}

function tmpDbPath(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aionis-lite-real-benchmark-"));
  return path.join(dir, `${name}.sqlite`);
}

function ensureParentDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function parseCliArgs(argv: string[]): CliOptions {
  let json = false;
  let outJson: string | null = null;
  let outMarkdown: string | null = null;
  let baselineJson: string | null = null;
  let failOnStatusRegression = false;
  let maxSuiteScoreDropPct: number | null = null;
  let maxScenarioScoreDropPct: number | null = null;
  let failOnProfileDrift = false;
  let failOnHardProfileDrift = false;
  let externalHttpShadow = false;
  let externalHttpBaseUrl: string | null = null;
  let externalHttpApiKey: string | null = null;
  let externalHttpModel: string | null = null;
  let externalHttpTransport: string | null = null;
  let externalHttpTimeoutMs: number | null = null;
  let externalHttpMaxTokens: number | null = null;
  let externalHttpTemperature: number | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--out-json") {
      outJson = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--out-md") {
      outMarkdown = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--baseline-json") {
      baselineJson = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--fail-on-status-regression") {
      failOnStatusRegression = true;
      continue;
    }
    if (arg === "--fail-on-profile-drift") {
      failOnProfileDrift = true;
      continue;
    }
    if (arg === "--fail-on-hard-profile-drift") {
      failOnHardProfileDrift = true;
      continue;
    }
    if (arg === "--external-http-shadow") {
      externalHttpShadow = true;
      continue;
    }
    if (arg === "--external-http-base-url") {
      externalHttpBaseUrl = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--external-http-api-key") {
      externalHttpApiKey = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--external-http-model") {
      externalHttpModel = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--external-http-transport") {
      externalHttpTransport = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--external-http-timeout-ms") {
      const raw = argv[i + 1] ?? null;
      if (raw == null) {
        throw new Error("--external-http-timeout-ms requires a numeric value");
      }
      externalHttpTimeoutMs = Number(raw);
      i += 1;
      continue;
    }
    if (arg === "--external-http-max-tokens") {
      const raw = argv[i + 1] ?? null;
      if (raw == null) {
        throw new Error("--external-http-max-tokens requires a numeric value");
      }
      externalHttpMaxTokens = Number(raw);
      i += 1;
      continue;
    }
    if (arg === "--external-http-temperature") {
      const raw = argv[i + 1] ?? null;
      if (raw == null) {
        throw new Error("--external-http-temperature requires a numeric value");
      }
      externalHttpTemperature = Number(raw);
      i += 1;
      continue;
    }
    if (arg === "--max-suite-score-drop") {
      const raw = argv[i + 1] ?? null;
      if (raw == null) {
        throw new Error("--max-suite-score-drop requires a numeric value");
      }
      maxSuiteScoreDropPct = Number(raw);
      i += 1;
      continue;
    }
    if (arg === "--max-scenario-score-drop") {
      const raw = argv[i + 1] ?? null;
      if (raw == null) {
        throw new Error("--max-scenario-score-drop requires a numeric value");
      }
      maxScenarioScoreDropPct = Number(raw);
      i += 1;
      continue;
    }
  }

  if (!outJson && argv.includes("--out-json")) {
    throw new Error("--out-json requires a file path");
  }
  if (!outMarkdown && argv.includes("--out-md")) {
    throw new Error("--out-md requires a file path");
  }
  if (!baselineJson && argv.includes("--baseline-json")) {
    throw new Error("--baseline-json requires a file path");
  }
  if (!externalHttpBaseUrl && argv.includes("--external-http-base-url")) {
    throw new Error("--external-http-base-url requires a value");
  }
  if (!externalHttpApiKey && argv.includes("--external-http-api-key")) {
    throw new Error("--external-http-api-key requires a value");
  }
  if (!externalHttpModel && argv.includes("--external-http-model")) {
    throw new Error("--external-http-model requires a value");
  }
  if (!externalHttpTransport && argv.includes("--external-http-transport")) {
    throw new Error("--external-http-transport requires a value");
  }
  if (
    maxSuiteScoreDropPct != null
    && (!Number.isFinite(maxSuiteScoreDropPct) || maxSuiteScoreDropPct < 0)
  ) {
    throw new Error("--max-suite-score-drop must be a non-negative number");
  }
  if (
    maxScenarioScoreDropPct != null
    && (!Number.isFinite(maxScenarioScoreDropPct) || maxScenarioScoreDropPct < 0)
  ) {
    throw new Error("--max-scenario-score-drop must be a non-negative number");
  }
  if (
    externalHttpTimeoutMs != null
    && (!Number.isFinite(externalHttpTimeoutMs) || externalHttpTimeoutMs <= 0)
  ) {
    throw new Error("--external-http-timeout-ms must be a positive number");
  }
  if (
    externalHttpMaxTokens != null
    && (!Number.isFinite(externalHttpMaxTokens) || externalHttpMaxTokens <= 0)
  ) {
    throw new Error("--external-http-max-tokens must be a positive number");
  }
  if (
    externalHttpTemperature != null
    && (!Number.isFinite(externalHttpTemperature) || externalHttpTemperature < 0 || externalHttpTemperature > 1)
  ) {
    throw new Error("--external-http-temperature must be between 0 and 1");
  }

  return {
    json,
    outJson,
    outMarkdown,
    baselineJson,
    failOnStatusRegression,
    maxSuiteScoreDropPct,
    maxScenarioScoreDropPct,
    failOnProfileDrift,
    failOnHardProfileDrift,
    externalHttpShadow,
    externalHttpBaseUrl,
    externalHttpApiKey,
    externalHttpModel,
    externalHttpTransport,
    externalHttpTimeoutMs,
    externalHttpMaxTokens,
    externalHttpTemperature,
  };
}

function resolveExternalHttpShadowConfig(cli: CliOptions): GovernanceHttpModelClientConfig | null {
  if (!cli.externalHttpShadow) return null;

  const envNumber = (key: string): number | null => {
    const raw = process.env[key];
    if (typeof raw !== "string" || raw.trim().length === 0) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };

  const baseUrl =
    cli.externalHttpBaseUrl
    ?? process.env.LITE_EXTERNAL_GOVERNANCE_HTTP_BASE_URL
    ?? process.env.GOVERNANCE_MODEL_CLIENT_BASE_URL
    ?? "https://api.openai.com/v1";
  const apiKey =
    cli.externalHttpApiKey
    ?? process.env.LITE_EXTERNAL_GOVERNANCE_HTTP_API_KEY
    ?? process.env.OPENAI_API_KEY
    ?? process.env.GOVERNANCE_MODEL_CLIENT_API_KEY
    ?? "";
  const model =
    cli.externalHttpModel
    ?? process.env.LITE_EXTERNAL_GOVERNANCE_HTTP_MODEL
    ?? process.env.OPENAI_MODEL
    ?? process.env.GOVERNANCE_MODEL_CLIENT_MODEL
    ?? "gpt-4.1-mini";
  const transport =
    cli.externalHttpTransport
    ?? process.env.LITE_EXTERNAL_GOVERNANCE_HTTP_TRANSPORT
    ?? process.env.GOVERNANCE_MODEL_CLIENT_TRANSPORT
    ?? undefined;
  const timeoutMs =
    cli.externalHttpTimeoutMs
    ?? envNumber("LITE_EXTERNAL_GOVERNANCE_HTTP_TIMEOUT_MS")
    ?? envNumber("GOVERNANCE_MODEL_CLIENT_TIMEOUT_MS")
    ?? 15_000;
  const maxTokens =
    cli.externalHttpMaxTokens
    ?? envNumber("LITE_EXTERNAL_GOVERNANCE_HTTP_MAX_TOKENS")
    ?? envNumber("GOVERNANCE_MODEL_CLIENT_MAX_TOKENS")
    ?? 300;
  const temperature =
    cli.externalHttpTemperature
    ?? envNumber("LITE_EXTERNAL_GOVERNANCE_HTTP_TEMPERATURE")
    ?? envNumber("GOVERNANCE_MODEL_CLIENT_TEMPERATURE")
    ?? 0.1;

  if (!baseUrl.trim() || !apiKey.trim() || !model.trim()) {
    throw new Error(
      "external HTTP shadow run requires base URL, API key, and model via CLI or env "
      + "(LITE_EXTERNAL_GOVERNANCE_HTTP_* or OPENAI_API_KEY/GOVERNANCE_MODEL_CLIENT_*).",
    );
  }

  return {
    baseUrl: baseUrl.trim(),
    apiKey: apiKey.trim(),
    model: model.trim(),
    transport:
      transport === "openai_chat_completions_v1" || transport === "anthropic_messages_v1"
        ? transport
        : undefined,
    timeoutMs,
    maxTokens,
    temperature,
  };
}

function loadBaselineResult(filePath: string | null): BenchmarkSuiteResult | null {
  if (!filePath) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as BenchmarkSuiteResult;
}

function getScenarioMetrics(
  scenarios: BenchmarkScenarioResult[],
  id: string,
): Record<string, unknown> {
  return scenarios.find((scenario) => scenario.id === id)?.metrics ?? {};
}

function buildSuiteProfile(scenarios: BenchmarkScenarioResult[]): BenchmarkSuiteProfile {
  const policyLearning = getScenarioMetrics(scenarios, "policy_learning_loop");
  const workflowProgression = getScenarioMetrics(scenarios, "workflow_progression_loop");
  const multiStepRepair = getScenarioMetrics(scenarios, "multi_step_repair_loop");
  const governedLearning = getScenarioMetrics(scenarios, "governed_learning_runtime_loop");
  const governedReplay = getScenarioMetrics(scenarios, "governed_replay_runtime_loop");
  const precedence = getScenarioMetrics(scenarios, "governance_provider_precedence_runtime_loop");
  const customModelClient = getScenarioMetrics(scenarios, "custom_model_client_runtime_loop");
  const httpModelClient = getScenarioMetrics(scenarios, "http_model_client_runtime_loop");
  const httpShadowCompare = getScenarioMetrics(scenarios, "http_model_client_shadow_compare_runtime_loop");
  const slimSurface = getScenarioMetrics(scenarios, "slim_surface_boundary");

  return {
    policy_learning: {
      trusted_pattern_count_after_revalidation:
        typeof policyLearning.trusted_pattern_count_after_revalidation === "number"
          ? policyLearning.trusted_pattern_count_after_revalidation
          : null,
      contested_revalidation_fresh_runs_needed:
        typeof policyLearning.contested_revalidation_fresh_runs_needed === "number"
          ? policyLearning.contested_revalidation_fresh_runs_needed
          : null,
    },
    workflow_progression: {
      stable_workflow_count_after_second:
        typeof workflowProgression.stable_workflow_count_after_second === "number"
          ? workflowProgression.stable_workflow_count_after_second
          : null,
    },
    multi_step_repair: {
      stable_workflow_count_after_validate:
        typeof multiStepRepair.stable_workflow_count_after_validate === "number"
          ? multiStepRepair.stable_workflow_count_after_validate
          : null,
    },
    governed_learning: {
      workflow_promotion_state:
        typeof governedLearning.workflow_governed_promotion_state_override === "string"
          ? governedLearning.workflow_governed_promotion_state_override
          : null,
      tools_pattern_state:
        typeof governedLearning.tools_pattern_state === "string"
          ? governedLearning.tools_pattern_state
          : null,
      tools_credibility_state:
        typeof governedLearning.tools_pattern_credibility_state === "string"
          ? governedLearning.tools_pattern_credibility_state
          : null,
    },
    governed_replay: {
      replay_learning_rule_state:
        typeof governedReplay.replay_learning_rule_state === "string"
          ? governedReplay.replay_learning_rule_state
          : null,
      stable_workflow_count_after_replay:
        typeof governedReplay.stable_workflow_count_after_replay === "number"
          ? governedReplay.stable_workflow_count_after_replay
          : null,
    },
    governance_provider_precedence: {
      workflow_provider_override_blocked:
        typeof precedence.workflow_provider_override_blocked === "boolean"
          ? precedence.workflow_provider_override_blocked
          : null,
      tools_provider_override_blocked:
        typeof precedence.tools_provider_override_blocked === "boolean"
          ? precedence.tools_provider_override_blocked
          : null,
      tools_pattern_state:
        typeof precedence.tools_pattern_state === "string"
          ? precedence.tools_pattern_state
          : null,
    },
    custom_model_client: {
      workflow_governed_state:
        typeof customModelClient.workflow_governed_state === "string"
          ? customModelClient.workflow_governed_state
          : null,
      tools_pattern_state:
        typeof customModelClient.tools_pattern_state === "string"
          ? customModelClient.tools_pattern_state
          : null,
      replay_learning_rule_state:
        typeof customModelClient.replay_learning_rule_state === "string"
          ? customModelClient.replay_learning_rule_state
          : null,
    },
    http_model_client: {
      workflow_governed_state:
        typeof httpModelClient.workflow_governed_state === "string"
          ? httpModelClient.workflow_governed_state
          : null,
      tools_pattern_state:
        typeof httpModelClient.tools_pattern_state === "string"
          ? httpModelClient.tools_pattern_state
          : null,
      replay_learning_rule_state:
        typeof httpModelClient.replay_learning_rule_state === "string"
          ? httpModelClient.replay_learning_rule_state
          : null,
    },
    http_shadow_compare: {
      workflow_state_match:
        typeof httpShadowCompare.workflow_state_match === "boolean"
          ? httpShadowCompare.workflow_state_match
          : null,
      tools_state_match:
        typeof httpShadowCompare.tools_state_match === "boolean"
          ? httpShadowCompare.tools_state_match
          : null,
      replay_state_match:
        typeof httpShadowCompare.replay_state_match === "boolean"
          ? httpShadowCompare.replay_state_match
          : null,
    },
    http_prompt_contract: {
      transport_contract_version: GOVERNANCE_HTTP_OPENAI_TRANSPORT_CONTRACT_VERSION,
      promote_memory_prompt_version: GOVERNANCE_HTTP_PROMOTE_MEMORY_PROMPT_VERSION,
      form_pattern_prompt_version: GOVERNANCE_HTTP_FORM_PATTERN_PROMPT_VERSION,
    },
    http_response_contract: {
      promote_memory_review_version: MEMORY_PROMOTE_SEMANTIC_REVIEW_VERSION,
      form_pattern_review_version: MEMORY_FORM_PATTERN_SEMANTIC_REVIEW_VERSION,
    },
    slim_surface_boundary: {
      planning_has_layered_context:
        typeof slimSurface.planning_has_layered_context === "boolean"
          ? slimSurface.planning_has_layered_context
          : null,
      assemble_has_layered_context:
        typeof slimSurface.assemble_has_layered_context === "boolean"
          ? slimSurface.assemble_has_layered_context
          : null,
    },
  };
}

function flattenProfile(
  value: Record<string, unknown>,
  prefix = "",
): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  for (const [key, entry] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      out.push(...flattenProfile(entry as Record<string, unknown>, nextKey));
      continue;
    }
    out.push([nextKey, entry]);
  }
  return out;
}

function applyBaselineComparison(result: BenchmarkSuiteResult, baseline: BenchmarkSuiteResult | null): BenchmarkSuiteResult {
  if (!baseline) return result;

  const baselineByScenario = new Map(baseline.scenarios.map((scenario) => [scenario.id, scenario]));
  const scenarios = result.scenarios.map((scenario) => {
    const prior = baselineByScenario.get(scenario.id);
    const baselineStatus = prior?.status ?? "missing";
    const baselineScore = prior?.score_pct ?? null;
    return {
      ...scenario,
      compare_summary: {
        baseline_status: baselineStatus,
        baseline_score_pct: baselineScore,
        score_delta_pct: baselineScore == null ? null : scenario.score_pct - baselineScore,
        status_changed: prior ? prior.status !== scenario.status : false,
      },
    };
  });

  const currentProfile = flattenProfile(result.suite_profile as Record<string, unknown>);
  const baselineProfile = baseline.suite_profile
    ? new Map(flattenProfile(baseline.suite_profile as Record<string, unknown>))
    : null;
  const changedProfileKeys =
    baselineProfile == null
      ? []
      : currentProfile
          .filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(baselineProfile.get(key)))
          .map(([key]) => key);
  const hardChangedProfileKeys = changedProfileKeys.filter(
    (key) => getBenchmarkProfilePolicyLevel(key) === "hard",
  );
  const softChangedProfileKeys = changedProfileKeys.filter(
    (key) => getBenchmarkProfilePolicyLevel(key) === "soft",
  );

  return {
    ...result,
    scenarios,
    compare_summary: {
      baseline_score_pct: baseline.suite_summary?.score_pct ?? null,
      score_delta_pct:
        typeof baseline.suite_summary?.score_pct === "number"
          ? result.suite_summary.score_pct - baseline.suite_summary.score_pct
          : null,
      profile_policy_version: BENCHMARK_PROFILE_POLICY_VERSION,
      scenarios_with_status_change: scenarios
        .filter((scenario) => scenario.compare_summary?.status_changed)
        .map((scenario) => scenario.id),
      changed_profile_keys: changedProfileKeys,
      hard_changed_profile_keys: hardChangedProfileKeys,
      soft_changed_profile_keys: softChangedProfileKeys,
    },
  };
}

function evaluateRegressionGate(args: {
  result: BenchmarkSuiteResult;
  options: CliOptions;
}): BenchmarkRegressionGate | null {
  const { result, options } = args;
  if (
    !result.compare_summary
    || (
      !options.failOnStatusRegression
      && !options.failOnProfileDrift
      && !options.failOnHardProfileDrift
      && options.maxSuiteScoreDropPct == null
      && options.maxScenarioScoreDropPct == null
    )
  ) {
    return null;
  }

  const reasons: string[] = [];

  if (options.failOnStatusRegression) {
    const changed = result.compare_summary.scenarios_with_status_change;
    if (changed.length > 0) {
      reasons.push(`status regression detected in scenarios: ${changed.join(", ")}`);
    }
  }

  if (options.failOnProfileDrift) {
    const changedProfileKeys = result.compare_summary.changed_profile_keys;
    if (changedProfileKeys.length > 0) {
      reasons.push(`profile drift detected in keys: ${changedProfileKeys.join(", ")}`);
    }
  }

  if (options.failOnHardProfileDrift) {
    const hardChangedProfileKeys = result.compare_summary.hard_changed_profile_keys;
    if (hardChangedProfileKeys.length > 0) {
      reasons.push(`hard profile drift detected in keys: ${hardChangedProfileKeys.join(", ")}`);
    }
  }

  if (
    options.maxSuiteScoreDropPct != null
    && typeof result.compare_summary.score_delta_pct === "number"
    && result.compare_summary.score_delta_pct < 0
    && Math.abs(result.compare_summary.score_delta_pct) > options.maxSuiteScoreDropPct
  ) {
    reasons.push(
      `suite score regressed by ${Math.abs(result.compare_summary.score_delta_pct)} which exceeds threshold ${options.maxSuiteScoreDropPct}`,
    );
  }

  if (options.maxScenarioScoreDropPct != null) {
    for (const scenario of result.scenarios) {
      const delta = scenario.compare_summary?.score_delta_pct;
      if (typeof delta !== "number" || delta >= 0) continue;
      if (Math.abs(delta) > options.maxScenarioScoreDropPct) {
        reasons.push(
          `scenario ${scenario.id} regressed by ${Math.abs(delta)} which exceeds threshold ${options.maxScenarioScoreDropPct}`,
        );
      }
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

function buildEnv(overrides: Record<string, unknown> = {}) {
  return {
    AIONIS_EDITION: "lite",
    MEMORY_AUTH_MODE: "off",
    TENANT_QUOTA_ENABLED: false,
    LITE_LOCAL_ACTOR_ID: "local-user",
    MEMORY_TENANT_ID: "default",
    MEMORY_SCOPE: "default",
    APP_ENV: "test",
    ADMIN_TOKEN: "",
    TRUST_PROXY: false,
    TRUSTED_PROXY_CIDRS: [],
    RATE_LIMIT_ENABLED: false,
    RATE_LIMIT_BYPASS_LOOPBACK: false,
    WRITE_RATE_LIMIT_MAX_WAIT_MS: 0,
    RECALL_TEXT_EMBED_RATE_LIMIT_MAX_WAIT_MS: 0,
    MAX_TEXT_LEN: 10_000,
    PII_REDACTION: false,
    ALLOW_CROSS_SCOPE_EDGES: false,
    MEMORY_SHADOW_DUAL_WRITE_ENABLED: false,
    MEMORY_SHADOW_DUAL_WRITE_STRICT: false,
    AUTO_TOPIC_CLUSTER_ON_WRITE: false,
    TOPIC_CLUSTER_ASYNC_ON_WRITE: true,
    MEMORY_WRITE_REQUIRE_NODES: false,
    MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT: 4096,
    MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY: true,
    MEMORY_RECALL_ADAPTIVE_HARD_CAP_WAIT_MS: 0,
    MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT: "balanced",
    MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT: "balanced",
    REPLAY_LEARNING_PROJECTION_ENABLED: false,
    REPLAY_LEARNING_PROJECTION_MODE: "rule_and_episode",
    REPLAY_LEARNING_PROJECTION_DELIVERY: "async_outbox",
    REPLAY_LEARNING_TARGET_RULE_STATE: "draft",
    REPLAY_LEARNING_MIN_TOTAL_STEPS: 1,
    REPLAY_LEARNING_MIN_SUCCESS_RATIO: 1,
    REPLAY_LEARNING_MAX_MATCHER_BYTES: 16_384,
    REPLAY_LEARNING_MAX_TOOL_PREFER: 8,
    EPISODE_GC_TTL_DAYS: 30,
    REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_PROFILE: "custom",
    REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_DEFAULT: false,
    REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_TARGET_STATUS: "active",
    REPLAY_REPAIR_REVIEW_GATE_REQUIRE_SHADOW_PASS: false,
    REPLAY_REPAIR_REVIEW_GATE_MIN_TOTAL_STEPS: 0,
    REPLAY_REPAIR_REVIEW_GATE_MAX_FAILED_STEPS: 0,
    REPLAY_REPAIR_REVIEW_GATE_MAX_BLOCKED_STEPS: 0,
    REPLAY_REPAIR_REVIEW_GATE_MAX_UNKNOWN_STEPS: 0,
    REPLAY_REPAIR_REVIEW_GATE_MIN_SUCCESS_RATIO: 1,
    REPLAY_REPAIR_REVIEW_POLICY_JSON: "{}",
    WORKFLOW_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED: false,
    TOOLS_GOVERNANCE_STATIC_FORM_PATTERN_PROVIDER_ENABLED: false,
    ...overrides,
  } as any;
}

function buildRequestGuards(env: ReturnType<typeof buildEnv>) {
  return createRequestGuards({
    env,
    embedder: FakeEmbeddingProvider,
    recallLimiter: null,
    debugEmbedLimiter: null,
    writeLimiter: null,
    sandboxWriteLimiter: null,
    sandboxReadLimiter: null,
    recallTextEmbedLimiter: null,
    recallInflightGate: new InflightGate({ maxInflight: 8, maxQueue: 8, queueTimeoutMs: 100 }),
    writeInflightGate: new InflightGate({ maxInflight: 8, maxQueue: 8, queueTimeoutMs: 100 }),
  });
}

function registerBenchmarkApp(args: {
  app: ReturnType<typeof Fastify>;
  liteWriteStore: ReturnType<typeof createLiteWriteStore>;
  liteRecallStore: ReturnType<typeof createLiteRecallStore>;
  envOverrides?: Record<string, unknown>;
  governanceRuntimeProviderBuilderOptions?: LiteGovernanceRuntimeProviderBuilderOptions;
}) {
  const env = buildEnv(args.envOverrides);
  const guards = buildRequestGuards(env);

  registerHostErrorHandler(args.app);
  registerMemoryWriteRoutes({
    app: args.app,
    env,
    store: {
      withTx: async <T>(fn: (client: any) => Promise<T>) => await fn({} as any),
    },
    embedder: FakeEmbeddingProvider,
    embeddedRuntime: null,
    liteWriteStore: args.liteWriteStore,
    writeAccessForClient: () => args.liteWriteStore,
    requireMemoryPrincipal: guards.requireMemoryPrincipal,
    withIdentityFromRequest: guards.withIdentityFromRequest,
    enforceRateLimit: guards.enforceRateLimit,
    enforceTenantQuota: guards.enforceTenantQuota,
    tenantFromBody: guards.tenantFromBody,
    acquireInflightSlot: guards.acquireInflightSlot,
    runTopicClusterForEventIds: async () => ({ processed_events: 0 }),
    executionStateStore: null,
    governanceRuntimeProviderBuilderOptions: args.governanceRuntimeProviderBuilderOptions,
  });

  registerMemoryContextRuntimeRoutes({
    app: args.app,
    env,
    embedder: FakeEmbeddingProvider,
    embeddedRuntime: null,
    liteWriteStore: args.liteWriteStore,
    liteRecallAccess: args.liteRecallStore.createRecallAccess(),
    recallTextEmbedBatcher: { stats: () => null },
    requireMemoryPrincipal: guards.requireMemoryPrincipal,
    withIdentityFromRequest: guards.withIdentityFromRequest,
    enforceRateLimit: guards.enforceRateLimit,
    enforceTenantQuota: guards.enforceTenantQuota,
    enforceRecallTextEmbedQuota: guards.enforceRecallTextEmbedQuota,
    buildRecallAuth: guards.buildRecallAuth,
    tenantFromBody: guards.tenantFromBody,
    acquireInflightSlot: guards.acquireInflightSlot,
    hasExplicitRecallKnobs: () => false,
    resolveRecallProfile: () => ({ profile: "balanced", source: "benchmark" }),
    resolveExplicitRecallMode: () => ({
      mode: null,
      profile: "balanced",
      defaults: {},
      applied: false,
      reason: "benchmark_default",
      source: "benchmark",
    }),
    resolveClassAwareRecallProfile: (_endpoint, _body, baseProfile) => ({
      profile: baseProfile,
      defaults: {},
      enabled: false,
      applied: false,
      reason: "benchmark_default",
      source: "benchmark",
      workload_class: null,
      signals: [],
    }),
    withRecallProfileDefaults: (body) => ({ ...(body as Record<string, unknown>) }),
    resolveRecallStrategy: () => ({ strategy: "local", defaults: {}, applied: false }),
    resolveAdaptiveRecallProfile: (profile) => ({ profile, defaults: {}, applied: false, reason: "benchmark_default" }),
    resolveAdaptiveRecallHardCap: () => ({ defaults: {}, applied: false, reason: "benchmark_default" }),
    inferRecallStrategyFromKnobs: () => "local",
    buildRecallTrajectory: () => ({ strategy: "local" }),
    embedRecallTextQuery: async (provider, queryText) => {
      const [vec] = await provider.embed([queryText]);
      return {
        vec,
        ms: 0,
        cache_hit: false,
        singleflight_join: false,
        queue_wait_ms: 0,
        batch_size: 1,
      };
    },
    mapRecallTextEmbeddingError: () => ({
      statusCode: 500,
      code: "embed_failed",
      message: "embedding failed",
    }),
    recordContextAssemblyTelemetryBestEffort: async () => {},
  });

  registerMemoryAccessRoutes({
    app: args.app,
    env,
    liteWriteStore: args.liteWriteStore,
    requireMemoryPrincipal: guards.requireMemoryPrincipal,
    withIdentityFromRequest: guards.withIdentityFromRequest,
    enforceRateLimit: guards.enforceRateLimit,
    enforceTenantQuota: guards.enforceTenantQuota,
    tenantFromBody: guards.tenantFromBody,
    acquireInflightSlot: guards.acquireInflightSlot,
  });

  registerMemoryFeedbackToolRoutes({
    app: args.app,
    env,
    embedder: FakeEmbeddingProvider,
    embeddedRuntime: null,
    liteRecallAccess: args.liteRecallStore.createRecallAccess(),
    liteWriteStore: args.liteWriteStore,
    requireMemoryPrincipal: guards.requireMemoryPrincipal,
    withIdentityFromRequest: guards.withIdentityFromRequest,
    enforceRateLimit: guards.enforceRateLimit,
    enforceTenantQuota: guards.enforceTenantQuota,
    tenantFromBody: guards.tenantFromBody,
    acquireInflightSlot: guards.acquireInflightSlot,
    governanceRuntimeProviderBuilderOptions: args.governanceRuntimeProviderBuilderOptions,
  });
}

function buildBenchmarkWritePayload(args: {
  eventId: string;
  title: string;
  inputText: string;
  taskBrief: string;
  stateId: string;
  filePath: string;
  workflowPromotionGovernanceReview?: Record<string, unknown>;
}) {
  return {
    tenant_id: "default",
    scope: "default",
    input_text: args.inputText,
    auto_embed: true,
    memory_lane: "private",
    nodes: [
      {
        client_id: `benchmark-event:${args.eventId}`,
        type: "event",
        title: args.title,
        text_summary: args.taskBrief,
        slots: {
          summary_kind: "handoff",
          ...(args.workflowPromotionGovernanceReview
            ? {
                workflow_promotion_governance_review: args.workflowPromotionGovernanceReview,
              }
            : {}),
          execution_packet_v1: {
            version: 1,
            state_id: args.stateId,
            current_stage: "patch",
            active_role: "patch",
            task_brief: args.taskBrief,
            target_files: [args.filePath],
            next_action: `Patch ${args.filePath} and rerun export tests`,
            hard_constraints: [],
            accepted_facts: [],
            rejected_paths: [],
            pending_validations: ["npm run -s test:lite -- export"],
            unresolved_blockers: [],
            rollback_notes: [],
            review_contract: null,
            resume_anchor: {
              anchor: `resume:${args.filePath}`,
              file_path: args.filePath,
              symbol: null,
              repo_root: "/Volumes/ziel/Aionisgo",
            },
            artifact_refs: [],
            evidence_refs: [],
          },
        },
      },
    ],
    edges: [],
  };
}

function createBenchmarkCustomGovernanceModelClientFactory(): GovernanceModelClientFactory {
  return ({ operation }) => {
    if (operation === "promote_memory") {
      return {
        reviewPromoteMemory: () => ({
          review_version: "promote_memory_semantic_review_v1",
          adjudication: {
            operation: "promote_memory",
            disposition: "recommend",
            target_kind: "workflow",
            target_level: "L2",
            reason: "benchmark custom promote_memory client",
            confidence: 0.96,
            strategic_value: "high",
          },
        }),
      };
    }
    if (operation === "form_pattern") {
      return {
        reviewFormPattern: () => ({
          review_version: "form_pattern_semantic_review_v1",
          adjudication: {
            operation: "form_pattern",
            disposition: "recommend",
            target_kind: "pattern",
            target_level: "L3",
            reason: "benchmark custom form_pattern client",
            confidence: 0.96,
          },
        }),
      };
    }
    return undefined;
  };
}

async function withBenchmarkGovernanceChatStub<T>(
  fn: (args: { baseUrl: string; apiKey: string; model: string }) => Promise<T>,
): Promise<T> {
  const app = Fastify();
  app.post("/chat/completions", async (request) => {
    const body = request.body as Record<string, any> | null;
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const userPayloadRaw = typeof messages[1]?.content === "string" ? messages[1].content : "{}";
    let userPayload: Record<string, any> = {};
    try {
      userPayload = JSON.parse(userPayloadRaw);
    } catch {
      userPayload = {};
    }
    const operation = userPayload.operation;
    const content =
      operation === "form_pattern"
        ? JSON.stringify({
            review_version: "form_pattern_semantic_review_v1",
            adjudication: {
              operation: "form_pattern",
              disposition: "recommend",
              target_kind: "pattern",
              target_level: "L3",
              reason: "benchmark http form_pattern client",
              confidence: 0.95,
            },
          })
        : JSON.stringify({
            review_version: "promote_memory_semantic_review_v1",
            adjudication: {
              operation: "promote_memory",
              disposition: "recommend",
              target_kind: "workflow",
              target_level: "L2",
              reason: "benchmark http promote_memory client",
              confidence: 0.95,
              strategic_value: "high",
            },
          });
    return {
      choices: [
        {
          message: {
            content,
          },
        },
      ],
    };
  });
  const baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
  try {
    return await fn({
      baseUrl,
      apiKey: "benchmark-http-key",
      model: "benchmark-http-model",
    });
  } finally {
    await app.close();
  }
}

function buildBenchmarkSessionEventPayload(args: {
  sessionId: string;
  eventId: string;
  title: string;
  taskBrief: string;
  stateId: string;
  filePath: string;
  currentStage: "triage" | "patch" | "review";
  nextAction: string;
  pendingValidations: string[];
  completedValidations: string[];
}) {
  const updatedAt = "2026-03-21T12:00:00.000Z";
  return {
    tenant_id: "default",
    scope: "default",
    session_id: args.sessionId,
    event_id: args.eventId,
    title: args.title,
    text_summary: args.taskBrief,
    input_text: `continue ${args.taskBrief}: ${args.nextAction}`,
    memory_lane: "private",
    execution_state_v1: {
      version: 1,
      state_id: args.stateId,
      scope: `aionis://execution/${args.stateId}`,
      task_brief: args.taskBrief,
      current_stage: args.currentStage,
      active_role: args.currentStage,
      owned_files: [],
      modified_files: args.currentStage === "triage" ? [] : [args.filePath],
      pending_validations: args.pendingValidations,
      completed_validations: args.completedValidations,
      last_accepted_hypothesis: null,
      rejected_paths: [],
      unresolved_blockers: [],
      rollback_notes: [],
      reviewer_contract: null,
      resume_anchor: {
        anchor: `resume:${args.filePath}`,
        file_path: args.filePath,
        symbol: null,
        repo_root: "/Volumes/ziel/Aionisgo",
      },
      updated_at: updatedAt,
    },
    execution_packet_v1: {
      version: 1,
      state_id: args.stateId,
      current_stage: args.currentStage,
      active_role: args.currentStage,
      task_brief: args.taskBrief,
      target_files: [args.filePath],
      next_action: args.nextAction,
      hard_constraints: [],
      accepted_facts: [],
      rejected_paths: [],
      pending_validations: args.pendingValidations,
      unresolved_blockers: [],
      rollback_notes: [],
      review_contract: null,
      resume_anchor: {
        anchor: `resume:${args.filePath}`,
        file_path: args.filePath,
        symbol: null,
        repo_root: "/Volumes/ziel/Aionisgo",
      },
      artifact_refs: [],
      evidence_refs: [],
    },
  };
}

async function seedActiveToolRule(
  liteWriteStore: ReturnType<typeof createLiteWriteStore>,
  args: {
    preferredTool?: string;
    suffix?: string;
  } = {},
) {
  const preferredTool = args.preferredTool ?? "edit";
  const suffix = args.suffix ?? "benchmark";
  const prepared = await prepareMemoryWrite(
    {
      tenant_id: "default",
      scope: "default",
      actor: "local-user",
      input_text: `seed benchmark prefer-${preferredTool} rule`,
      auto_embed: false,
      memory_lane: "shared",
      nodes: [
        {
          client_id: `rule:prefer-${preferredTool}:repair-export:${suffix}`,
          type: "rule",
          title: `Prefer ${preferredTool} for repair export`,
          text_summary: `For repair_export tasks, prefer ${preferredTool} over the other tools.`,
          slots: {
            if: {
              task_kind: { $eq: "repair_export" },
            },
            then: {
              tool: {
                prefer: [preferredTool],
              },
            },
            exceptions: [],
            rule_scope: "global",
          },
        },
      ],
      edges: [],
    },
    "default",
    "default",
    {
      maxTextLen: 10_000,
      piiRedaction: false,
      allowCrossScopeEdges: false,
    },
    null,
  );

  const out = await liteWriteStore.withTx(() =>
    applyMemoryWrite({} as any, prepared, {
      maxTextLen: 10_000,
      piiRedaction: false,
      allowCrossScopeEdges: false,
      shadowDualWriteEnabled: false,
      shadowDualWriteStrict: false,
      associativeLinkOrigin: "memory_write",
      write_access: liteWriteStore,
    }),
  );
  const ruleNodeId = out.nodes.find((node) => node.type === "rule")?.id;
  assert.ok(ruleNodeId);

  await liteWriteStore.withTx(() =>
    updateRuleState(
      {} as any,
      {
        tenant_id: "default",
        scope: "default",
        actor: "local-user",
        rule_node_id: ruleNodeId,
        state: "active",
        input_text: `activate benchmark prefer-${preferredTool} rule`,
      },
      "default",
      "default",
      { liteWriteStore },
    ),
  );
  return ruleNodeId;
}

async function seedActiveToolRules(
  liteWriteStore: ReturnType<typeof createLiteWriteStore>,
  preferredTools: string[],
) {
  const ruleNodeIds: string[] = [];
  for (const [index, preferredTool] of preferredTools.entries()) {
    ruleNodeIds.push(
      await seedActiveToolRule(liteWriteStore, {
        preferredTool,
        suffix: `benchmark-${preferredTool}-${index + 1}`,
      }),
    );
  }
  return ruleNodeIds;
}

function pass(name: string, detail?: string): AssertionResult {
  return { name, status: "pass", detail };
}

async function runScenario(
  id: string,
  title: string,
  fn: () => Promise<Omit<BenchmarkScenarioResult, "id" | "title" | "status" | "duration_ms">>,
): Promise<BenchmarkScenarioResult> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    const passed = result.assertions.filter((item) => item.status === "pass").length;
    const total = result.assertions.length;
    const status = total > 0 && passed === total ? "pass" : "fail";
    const scorePct = total === 0 ? 0 : Math.round((passed / total) * 100);
    return {
      id,
      title,
      status,
      duration_ms: Date.now() - startedAt,
      assertion_summary: {
        passed,
        total,
      },
      score_pct: scorePct,
      pass_criteria_summary: `${passed}/${total} assertions passed`,
      assertions: result.assertions,
      metrics: result.metrics,
      notes: result.notes,
    };
  } catch (error) {
    return {
      id,
      title,
      status: "fail",
      duration_ms: Date.now() - startedAt,
      assertion_summary: {
        passed: 0,
        total: 0,
      },
      score_pct: 0,
      pass_criteria_summary: "0/0 assertions passed",
      assertions: [],
      metrics: {},
      notes: [],
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    };
  }
}

async function runPolicyLearningLoop(): Promise<Omit<BenchmarkScenarioResult, "id" | "title" | "status" | "duration_ms">> {
  const dbPath = tmpDbPath("policy-learning");
  const app = Fastify();
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  const assertions: AssertionResult[] = [];
  try {
    registerBenchmarkApp({ app, liteWriteStore, liteRecallStore });
    await seedActiveToolRule(liteWriteStore);

    const selectPayload = (runId: string) => ({
      tenant_id: "default",
      scope: "default",
      run_id: runId,
      context: {
        task_kind: "repair_export",
        goal: "repair export failure in node tests",
        error: {
          signature: "node-export-mismatch",
        },
      },
      candidates: ["bash", "edit", "test"],
      include_shadow: false,
      rules_limit: 20,
      strict: true,
      reorder_candidates: true,
    });
    const feedbackPayload = (runId: string, outcome: "positive" | "negative") => ({
      tenant_id: "default",
      scope: "default",
      run_id: runId,
      outcome,
      context: {
        task_kind: "repair_export",
        goal: "repair export failure in node tests",
        error: {
          signature: "node-export-mismatch",
        },
      },
      candidates: ["bash", "edit", "test"],
      selected_tool: "edit",
      target: "all",
      input_text: `benchmark ${outcome} feedback for ${runId}`,
    });

    const firstSelectResponse = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: selectPayload("run-1"),
    });
    assert.equal(firstSelectResponse.statusCode, 200);
    const firstSelect = ToolsSelectRouteContractSchema.parse(firstSelectResponse.json());
    assert.equal(firstSelect.selection.selected, "edit");
    assertions.push(pass("first select prefers edit", firstSelect.selection_summary.provenance_explanation));

    const firstFeedbackResponse = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: feedbackPayload("run-1", "positive"),
    });
    assert.equal(firstFeedbackResponse.statusCode, 200);
    const firstFeedback = firstFeedbackResponse.json() as any;
    assert.equal(firstFeedback.pattern_anchor?.credibility_state, "candidate");
    assertions.push(pass("first positive feedback creates candidate"));

    const afterFirst = ExecutionMemoryIntrospectionResponseSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: { tenant_id: "default", scope: "default", limit: 12 },
    })).json());
    assert.equal(afterFirst.pattern_signal_summary.candidate_pattern_count, 1);
    assertions.push(pass("introspection shows candidate after first positive"));

    await app.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: selectPayload("run-2"),
    });
    const secondFeedbackResponse = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: feedbackPayload("run-2", "positive"),
    });
    assert.equal(secondFeedbackResponse.statusCode, 200);
    const secondFeedback = secondFeedbackResponse.json() as any;
    assert.equal(secondFeedback.pattern_anchor?.credibility_state, "candidate");
    assertions.push(pass("second positive feedback remains candidate under the hardened promotion gate"));

    const afterSecond = ExecutionMemoryIntrospectionResponseSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: { tenant_id: "default", scope: "default", limit: 12 },
    })).json());
    assert.equal(afterSecond.pattern_signal_summary.candidate_pattern_count, 1);
    assertions.push(pass("introspection still shows candidate after second positive"));

    await app.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: selectPayload("run-3"),
    });
    const thirdFeedbackResponse = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: feedbackPayload("run-3", "positive"),
    });
    assert.equal(thirdFeedbackResponse.statusCode, 200);
    const thirdFeedback = thirdFeedbackResponse.json() as any;
    assert.equal(thirdFeedback.pattern_anchor?.credibility_state, "trusted");
    assertions.push(pass("third positive feedback promotes trusted"));

    const afterThird = ExecutionMemoryIntrospectionResponseSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: { tenant_id: "default", scope: "default", limit: 12 },
    })).json());
    assert.equal(afterThird.pattern_signal_summary.trusted_pattern_count, 1);
    assertions.push(pass("introspection shows trusted after third positive"));

    const negativeFeedbackResponse = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: feedbackPayload("run-4", "negative"),
    });
    assert.equal(negativeFeedbackResponse.statusCode, 200);
    const negativeFeedback = negativeFeedbackResponse.json() as any;
    assert.equal(negativeFeedback.pattern_anchor?.credibility_state, "contested");
    assertions.push(pass("negative feedback opens contested state"));

    const contestedSelect = ToolsSelectRouteContractSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: selectPayload("run-5"),
    })).json());
    assert.match(contestedSelect.selection_summary.provenance_explanation, /contested patterns visible but not trusted/i);
    assertions.push(pass("selector explanation reflects contested pattern"));

    const afterNegative = ExecutionMemoryIntrospectionResponseSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: { tenant_id: "default", scope: "default", limit: 12 },
    })).json());
    assert.equal(afterNegative.pattern_signal_summary.contested_pattern_count, 1);
    assertions.push(pass("introspection shows contested after negative"));

    const revalidatedFeedbackResponse = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: feedbackPayload("run-5", "positive"),
    });
    assert.equal(revalidatedFeedbackResponse.statusCode, 200);
    const firstRevalidationFeedback = revalidatedFeedbackResponse.json() as any;
    assert.equal(firstRevalidationFeedback.pattern_anchor?.credibility_state, "contested");
    assertions.push(pass("first fresh positive after contest is still below the revalidation floor"));

    const secondRevalidatedFeedbackResponse = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: feedbackPayload("run-6", "positive"),
    });
    assert.equal(secondRevalidatedFeedbackResponse.statusCode, 200);
    const revalidatedFeedback = secondRevalidatedFeedbackResponse.json() as any;
    assert.equal(revalidatedFeedback.pattern_anchor?.credibility_state, "trusted");
    assert.equal(revalidatedFeedback.pattern_anchor?.promotion?.last_transition, "revalidated_to_trusted");
    assertions.push(pass("second fresh positive after contest restores trusted"));

    const afterRevalidation = ExecutionMemoryIntrospectionResponseSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: { tenant_id: "default", scope: "default", limit: 12 },
    })).json());
    assert.equal(afterRevalidation.pattern_signal_summary.trusted_pattern_count, 1);
    assert.equal(afterRevalidation.pattern_signal_summary.contested_pattern_count, 0);
    assertions.push(pass("introspection returns to trusted after revalidation"));

    return {
      assertions,
      metrics: {
        first_selected_tool: firstSelect.selection.selected,
        candidate_pattern_count_after_first: afterFirst.pattern_signal_summary.candidate_pattern_count,
        candidate_pattern_count_after_second: afterSecond.pattern_signal_summary.candidate_pattern_count,
        trusted_pattern_count_after_third: afterThird.pattern_signal_summary.trusted_pattern_count,
        contested_pattern_count_after_negative: afterNegative.pattern_signal_summary.contested_pattern_count,
        trusted_pattern_count_after_revalidation: afterRevalidation.pattern_signal_summary.trusted_pattern_count,
        contested_provenance: contestedSelect.selection_summary.provenance_explanation,
        transitions: [
          firstFeedback.pattern_anchor?.promotion?.last_transition,
          secondFeedback.pattern_anchor?.promotion?.last_transition,
          thirdFeedback.pattern_anchor?.promotion?.last_transition,
          negativeFeedback.pattern_anchor?.promotion?.last_transition,
          firstRevalidationFeedback.pattern_anchor?.promotion?.last_transition,
          revalidatedFeedback.pattern_anchor?.promotion?.last_transition,
        ],
      },
      notes: [
        "Measures whether Aionis learns, contests, and revalidates tool-selection policy.",
      ],
    };
  } finally {
    await app.close();
    await liteWriteStore.close();
  }
}

async function runCrossTaskIsolationLoop(): Promise<Omit<BenchmarkScenarioResult, "id" | "title" | "status" | "duration_ms">> {
  const dbPath = tmpDbPath("cross-task-isolation");
  const app = Fastify();
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  const assertions: AssertionResult[] = [];
  try {
    registerBenchmarkApp({ app, liteWriteStore, liteRecallStore });
    const ruleNodeId = await seedActiveToolRule(liteWriteStore);

    const sourceSelectPayload = (runId: string) => ({
      tenant_id: "default",
      scope: "default",
      run_id: runId,
      context: {
        task_kind: "repair_export",
        goal: "repair export failure in node tests",
        error: {
          signature: "node-export-mismatch",
        },
      },
      candidates: ["bash", "edit", "test"],
      include_shadow: false,
      rules_limit: 20,
      strict: true,
      reorder_candidates: true,
    });
    const feedbackPayload = (runId: string) => ({
      tenant_id: "default",
      scope: "default",
      run_id: runId,
      outcome: "positive" as const,
      context: {
        task_kind: "repair_export",
        goal: "repair export failure in node tests",
        error: {
          signature: "node-export-mismatch",
        },
      },
      candidates: ["bash", "edit", "test"],
      selected_tool: "edit",
      target: "all" as const,
      input_text: `benchmark positive feedback for ${runId}`,
    });

    await app.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: sourceSelectPayload("cross-task-run-1"),
    });
    const firstFeedback = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: feedbackPayload("cross-task-run-1"),
    });
    assert.equal(firstFeedback.statusCode, 200);

    await app.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: sourceSelectPayload("cross-task-run-2"),
    });
    const secondFeedback = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: feedbackPayload("cross-task-run-2"),
    });
    assert.equal(secondFeedback.statusCode, 200);
    assert.equal((secondFeedback.json() as any).pattern_anchor?.credibility_state, "candidate");

    await app.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: sourceSelectPayload("cross-task-run-3"),
    });
    const thirdFeedback = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: feedbackPayload("cross-task-run-3"),
    });
    assert.equal(thirdFeedback.statusCode, 200);
    assert.equal((thirdFeedback.json() as any).pattern_anchor?.credibility_state, "trusted");
    assertions.push(pass("source task produces a trusted learned pattern after the higher promotion gate"));

    await liteWriteStore.withTx(() =>
      updateRuleState(
        {} as any,
        {
          tenant_id: "default",
          scope: "default",
          actor: "local-user",
          rule_node_id: ruleNodeId,
          state: "disabled",
          input_text: "disable benchmark prefer-edit rule after trust formation",
        },
        "default",
        "default",
        { liteWriteStore },
      ),
    );

    const sameTaskResponse = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: sourceSelectPayload("cross-task-run-4"),
    });
    assert.equal(sameTaskResponse.statusCode, 200);
    const sameTask = ToolsSelectRouteContractSchema.parse(sameTaskResponse.json());
    assert.equal(sameTask.selection.selected, "edit");
    assert.deepEqual(sameTask.selection_summary.used_trusted_pattern_tools, ["edit"]);
    assert.deepEqual(sameTask.selection_summary.used_trusted_pattern_affinity_levels ?? [], ["exact_task_signature"]);
    assert.match(sameTask.selection_summary.provenance_explanation ?? "", /trusted pattern support: edit \[exact_task_signature\]/i);
    assertions.push(pass("same task continues to reuse the trusted pattern after the source rule is disabled"));

    const differentTaskResponse = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: {
        tenant_id: "default",
        scope: "default",
        run_id: "cross-task-run-5",
        context: {
          task_kind: "review_docs_headers",
          goal: "review markdown heading drift in docs pages",
          error: {
            signature: "markdown-header-drift",
          },
        },
        candidates: ["bash", "edit", "test"],
        include_shadow: false,
        rules_limit: 20,
        strict: true,
        reorder_candidates: false,
      },
    });
    assert.equal(differentTaskResponse.statusCode, 200);
    const differentTask = ToolsSelectRouteContractSchema.parse(differentTaskResponse.json());
    const crossTaskBleedObserved =
      differentTask.selection.selected === "edit"
      || differentTask.selection_summary.used_trusted_pattern_tools.includes("edit")
      || differentTask.selection_summary.used_trusted_pattern_affinity_levels!.length > 0;
    assertions.push(pass(
      "different task selection remains measurable after source-task learning",
      differentTask.selection_summary.provenance_explanation ?? undefined,
    ));
    assert.equal(crossTaskBleedObserved, false);
    assert.equal(differentTask.selection.selected, "bash");
    assert.deepEqual(differentTask.selection_summary.used_trusted_pattern_tools, []);
    assertions.push(pass("different task no longer receives flat trusted reuse under task-affinity weighting"));

    return {
      assertions,
      metrics: {
        source_task_selected_tool_after_rule_disable: sameTask.selection.selected,
        source_task_used_trusted_pattern_tools: sameTask.selection_summary.used_trusted_pattern_tools,
        source_task_used_trusted_pattern_affinity_levels: sameTask.selection_summary.used_trusted_pattern_affinity_levels,
        source_task_provenance: sameTask.selection_summary.provenance_explanation,
        different_task_selected_tool: differentTask.selection.selected,
        different_task_trusted_pattern_count: differentTask.selection_summary.trusted_pattern_count,
        different_task_used_trusted_pattern_tools: differentTask.selection_summary.used_trusted_pattern_tools,
        different_task_used_trusted_pattern_affinity_levels: differentTask.selection_summary.used_trusted_pattern_affinity_levels,
        different_task_recalled_affinity_levels: differentTask.pattern_matches.anchors.map((anchor) => anchor.affinity_level ?? null),
        different_task_provenance: differentTask.selection_summary.provenance_explanation,
        cross_task_bleed_observed: crossTaskBleedObserved,
      },
      notes: [
        "Measures whether a trusted pattern remains reusable for its source task after explicit rules are removed.",
        "Measures whether a nearby but different task context still recalls the pattern while avoiding flat trusted reuse under task-affinity weighting.",
      ],
    };
  } finally {
    await app.close();
    await liteWriteStore.close();
  }
}

async function runNearbyTaskGeneralizationLoop(): Promise<Omit<BenchmarkScenarioResult, "id" | "title" | "status" | "duration_ms">> {
  const dbPath = tmpDbPath("nearby-task-generalization");
  const app = Fastify();
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  const assertions: AssertionResult[] = [];
  try {
    registerBenchmarkApp({ app, liteWriteStore, liteRecallStore });
    const ruleNodeId = await seedActiveToolRule(liteWriteStore);

    const sourceSelectPayload = (runId: string) => ({
      tenant_id: "default",
      scope: "default",
      run_id: runId,
      context: {
        task_kind: "repair_export",
        goal: "repair export failure in node tests",
        error: {
          signature: "node-export-mismatch",
        },
      },
      candidates: ["bash", "edit", "test"],
      include_shadow: false,
      rules_limit: 20,
      strict: true,
      reorder_candidates: true,
    });
    const sourceFeedbackPayload = (runId: string) => ({
      tenant_id: "default",
      scope: "default",
      run_id: runId,
      outcome: "positive" as const,
      context: {
        task_kind: "repair_export",
        goal: "repair export failure in node tests",
        error: {
          signature: "node-export-mismatch",
        },
      },
      candidates: ["bash", "edit", "test"],
      selected_tool: "edit",
      target: "all" as const,
      input_text: `benchmark positive feedback for ${runId}`,
    });

    for (const runId of ["nearby-source-run-1", "nearby-source-run-2", "nearby-source-run-3"]) {
      const selectResponse = await app.inject({
        method: "POST",
        url: "/v1/memory/tools/select",
        payload: sourceSelectPayload(runId),
      });
      assert.equal(selectResponse.statusCode, 200);
      const feedbackResponse = await app.inject({
        method: "POST",
        url: "/v1/memory/tools/feedback",
        payload: sourceFeedbackPayload(runId),
      });
      assert.equal(feedbackResponse.statusCode, 200);
    }
    assertions.push(pass("source task produces a trusted pattern baseline"));

    await liteWriteStore.withTx(() =>
      updateRuleState(
        {} as any,
        {
          tenant_id: "default",
          scope: "default",
          actor: "local-user",
          rule_node_id: ruleNodeId,
          state: "disabled",
          input_text: "disable benchmark prefer-edit rule after nearby-task learning",
        },
        "default",
        "default",
        { liteWriteStore },
      ),
    );

    const nearbyTaskResponse = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: {
        tenant_id: "default",
        scope: "default",
        run_id: "nearby-task-run-1",
        context: {
          task_kind: "repair_export",
          goal: "repair export failure in API package tests",
          error: {
            signature: "esm-export-mismatch",
          },
        },
        candidates: ["bash", "edit", "test"],
        include_shadow: false,
        rules_limit: 20,
        strict: true,
        reorder_candidates: true,
      },
    });
    assert.equal(nearbyTaskResponse.statusCode, 200);
    const nearbyTask = ToolsSelectRouteContractSchema.parse(nearbyTaskResponse.json());
    assert.equal(nearbyTask.selection.selected, "edit");
    assert.deepEqual(nearbyTask.selection_summary.used_trusted_pattern_tools, ["edit"]);
    assert.deepEqual(nearbyTask.selection_summary.used_trusted_pattern_affinity_levels ?? [], ["same_task_family"]);
    assert.match(nearbyTask.selection_summary.provenance_explanation ?? "", /trusted pattern support: edit \[same_task_family\]/i);
    assertions.push(pass("nearby task with the same task family still benefits from trusted reuse"));

    const nearbyIntrospect = ExecutionMemoryIntrospectionResponseSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: { tenant_id: "default", scope: "default", limit: 20 },
    })).json());
    assert.equal(nearbyIntrospect.pattern_signal_summary.trusted_pattern_count, 1);
    assertions.push(pass("introspection still shows one trusted source pattern during nearby-task reuse"));

    return {
      assertions,
      metrics: {
        nearby_task_selected_tool: nearbyTask.selection.selected,
        nearby_task_used_trusted_pattern_tools: nearbyTask.selection_summary.used_trusted_pattern_tools,
        nearby_task_used_trusted_pattern_affinity_levels: nearbyTask.selection_summary.used_trusted_pattern_affinity_levels,
        nearby_task_provenance: nearbyTask.selection_summary.provenance_explanation,
        nearby_task_recalled_affinity_levels: nearbyTask.pattern_matches.anchors.map((anchor) => anchor.affinity_level ?? null),
        trusted_pattern_count_during_nearby_task: nearbyIntrospect.pattern_signal_summary.trusted_pattern_count,
      },
      notes: [
        "Measures whether a nearby task with the same task family still receives useful trusted reuse after explicit rules are removed.",
        "Confirms that beneficial generalization survives while broader cross-task bleed remains blocked.",
      ],
    };
  } finally {
    await app.close();
    await liteWriteStore.close();
  }
}

async function runContestedRevalidationCostLoop(): Promise<Omit<BenchmarkScenarioResult, "id" | "title" | "status" | "duration_ms">> {
  const dbPath = tmpDbPath("contested-revalidation-cost");
  const app = Fastify();
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  const assertions: AssertionResult[] = [];
  try {
    registerBenchmarkApp({ app, liteWriteStore, liteRecallStore });
    await seedActiveToolRule(liteWriteStore);

    const selectPayload = (runId: string) => ({
      tenant_id: "default",
      scope: "default",
      run_id: runId,
      context: {
        task_kind: "repair_export",
        goal: "repair export failure in node tests",
        error: {
          signature: "node-export-mismatch",
        },
      },
      candidates: ["bash", "edit", "test"],
      include_shadow: false,
      rules_limit: 20,
      strict: true,
      reorder_candidates: true,
    });
    const feedbackPayload = (runId: string, outcome: "positive" | "negative") => ({
      tenant_id: "default",
      scope: "default",
      run_id: runId,
      outcome,
      context: {
        task_kind: "repair_export",
        goal: "repair export failure in node tests",
        error: {
          signature: "node-export-mismatch",
        },
      },
      candidates: ["bash", "edit", "test"],
      selected_tool: "edit",
      target: "all" as const,
      input_text: `benchmark ${outcome} feedback for ${runId}`,
    });

    await app.inject({ method: "POST", url: "/v1/memory/tools/select", payload: selectPayload("reval-run-1") });
    const firstFeedback = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: feedbackPayload("reval-run-1", "positive"),
    });
    assert.equal(firstFeedback.statusCode, 200);

    await app.inject({ method: "POST", url: "/v1/memory/tools/select", payload: selectPayload("reval-run-2") });
    const secondFeedback = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: feedbackPayload("reval-run-2", "positive"),
    });
    assert.equal(secondFeedback.statusCode, 200);
    assert.equal((secondFeedback.json() as any).pattern_anchor?.credibility_state, "candidate");

    await app.inject({ method: "POST", url: "/v1/memory/tools/select", payload: selectPayload("reval-run-3") });
    const thirdFeedback = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: feedbackPayload("reval-run-3", "positive"),
    });
    assert.equal(thirdFeedback.statusCode, 200);
    assert.equal((thirdFeedback.json() as any).pattern_anchor?.credibility_state, "trusted");
    assertions.push(pass("pattern reaches trusted before contest after the higher promotion gate"));

    const negativeFeedback = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: feedbackPayload("reval-run-4", "negative"),
    });
    assert.equal(negativeFeedback.statusCode, 200);
    assert.equal((negativeFeedback.json() as any).pattern_anchor?.credibility_state, "contested");
    assertions.push(pass("negative feedback moves the pattern into contested"));

    const duplicatePositive = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: feedbackPayload("reval-run-2", "positive"),
    });
    assert.equal(duplicatePositive.statusCode, 200);
    const duplicatePositiveBody = duplicatePositive.json() as any;
    assert.equal(duplicatePositiveBody.pattern_anchor?.credibility_state, "contested");
    assertions.push(pass("duplicate positive on an already-counted run does not revalidate the contested pattern"));

    const afterDuplicate = ExecutionMemoryIntrospectionResponseSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: { tenant_id: "default", scope: "default", limit: 12 },
    })).json());
    assert.equal(afterDuplicate.pattern_signal_summary.contested_pattern_count, 1);
    assertions.push(pass("introspection keeps the pattern contested after duplicate positive evidence"));

    const firstFreshPositive = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: feedbackPayload("reval-run-5", "positive"),
    });
    assert.equal(firstFreshPositive.statusCode, 200);
    const firstFreshPositiveBody = firstFreshPositive.json() as any;
    assert.equal(firstFreshPositiveBody.pattern_anchor?.credibility_state, "contested");
    assertions.push(pass("one fresh distinct positive run is still not enough to revalidate the contested pattern"));

    const afterFirstFresh = ExecutionMemoryIntrospectionResponseSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: { tenant_id: "default", scope: "default", limit: 12 },
    })).json());
    assert.equal(afterFirstFresh.pattern_signal_summary.trusted_pattern_count, 0);
    assert.equal(afterFirstFresh.pattern_signal_summary.contested_pattern_count, 1);
    assertions.push(pass("introspection keeps the pattern contested after the first fresh post-contest run"));

    const secondFreshPositive = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: feedbackPayload("reval-run-6", "positive"),
    });
    assert.equal(secondFreshPositive.statusCode, 200);
    const secondFreshPositiveBody = secondFreshPositive.json() as any;
    assert.equal(secondFreshPositiveBody.pattern_anchor?.credibility_state, "trusted");
    assert.equal(secondFreshPositiveBody.pattern_anchor?.promotion?.last_transition, "revalidated_to_trusted");
    assertions.push(pass("two fresh distinct positive runs revalidate the contested pattern back to trusted"));

    const afterSecondFresh = ExecutionMemoryIntrospectionResponseSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: { tenant_id: "default", scope: "default", limit: 12 },
    })).json());
    assert.equal(afterSecondFresh.pattern_signal_summary.trusted_pattern_count, 1);
    assert.equal(afterSecondFresh.pattern_signal_summary.contested_pattern_count, 0);
    assertions.push(pass("introspection returns to trusted after two fresh post-contest runs"));

    return {
      assertions,
      metrics: {
        contested_revalidation_fresh_runs_needed: 2,
        duplicate_positive_revalidated: false,
        trusted_pattern_count_after_duplicate_positive: afterDuplicate.pattern_signal_summary.trusted_pattern_count,
        contested_pattern_count_after_duplicate_positive: afterDuplicate.pattern_signal_summary.contested_pattern_count,
        trusted_pattern_count_after_first_fresh_positive: afterFirstFresh.pattern_signal_summary.trusted_pattern_count,
        contested_pattern_count_after_first_fresh_positive: afterFirstFresh.pattern_signal_summary.contested_pattern_count,
        trusted_pattern_count_after_second_fresh_positive: afterSecondFresh.pattern_signal_summary.trusted_pattern_count,
        contested_pattern_count_after_second_fresh_positive: afterSecondFresh.pattern_signal_summary.contested_pattern_count,
        transitions: [
          (firstFeedback.json() as any).pattern_anchor?.promotion?.last_transition,
          (secondFeedback.json() as any).pattern_anchor?.promotion?.last_transition,
          (thirdFeedback.json() as any).pattern_anchor?.promotion?.last_transition,
          (negativeFeedback.json() as any).pattern_anchor?.promotion?.last_transition,
          duplicatePositiveBody.pattern_anchor?.promotion?.last_transition,
          firstFreshPositiveBody.pattern_anchor?.promotion?.last_transition,
          secondFreshPositiveBody.pattern_anchor?.promotion?.last_transition,
        ],
      },
      notes: [
        "Measures how much fresh distinct evidence is needed to move a contested pattern back to trusted.",
        "The current runtime now requires two fresh post-contest runs after a single counter-evidence event; duplicate positive feedback on an already-counted run does not reopen trust.",
      ],
    };
  } finally {
    await app.close();
    await liteWriteStore.close();
  }
}

async function runWrongTurnRecoveryLoop(): Promise<Omit<BenchmarkScenarioResult, "id" | "title" | "status" | "duration_ms">> {
  const dbPath = tmpDbPath("wrong-turn-recovery");
  const app = Fastify();
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  const assertions: AssertionResult[] = [];
  try {
    registerBenchmarkApp({ app, liteWriteStore, liteRecallStore });
    const ruleNodeId = await seedActiveToolRule(liteWriteStore);

    const selectPayload = (runId: string) => ({
      tenant_id: "default",
      scope: "default",
      run_id: runId,
      context: {
        task_kind: "repair_export",
        goal: "repair export failure in node tests",
        error: {
          signature: "node-export-mismatch",
        },
      },
      candidates: ["bash", "edit", "test"],
      include_shadow: false,
      rules_limit: 20,
      strict: true,
      reorder_candidates: true,
    });
    const feedbackPayload = (runId: string, outcome: "positive" | "negative") => ({
      tenant_id: "default",
      scope: "default",
      run_id: runId,
      outcome,
      context: {
        task_kind: "repair_export",
        goal: "repair export failure in node tests",
        error: {
          signature: "node-export-mismatch",
        },
      },
      candidates: ["bash", "edit", "test"],
      selected_tool: "edit",
      target: "all" as const,
      input_text: `benchmark ${outcome} feedback for ${runId}`,
    });

    for (const runId of ["wrong-turn-run-1", "wrong-turn-run-2", "wrong-turn-run-3"]) {
      const selectResponse = await app.inject({
        method: "POST",
        url: "/v1/memory/tools/select",
        payload: selectPayload(runId),
      });
      assert.equal(selectResponse.statusCode, 200);
      const feedbackResponse = await app.inject({
        method: "POST",
        url: "/v1/memory/tools/feedback",
        payload: feedbackPayload(runId, "positive"),
      });
      assert.equal(feedbackResponse.statusCode, 200);
    }
    assertions.push(pass("source task first reaches trusted before the wrong-turn sequence starts"));

    const trustedSelect = ToolsSelectRouteContractSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: selectPayload("wrong-turn-run-4"),
    })).json());
    assert.equal(trustedSelect.selection.selected, "edit");
    assert.deepEqual(trustedSelect.selection_summary.used_trusted_pattern_affinity_levels ?? [], ["exact_task_signature"]);
    assertions.push(pass("selector still trusts the learned path before counter-evidence"));

    const negativeFeedback = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: feedbackPayload("wrong-turn-run-4", "negative"),
    });
    assert.equal(negativeFeedback.statusCode, 200);
    assert.equal((negativeFeedback.json() as any).pattern_anchor?.credibility_state, "contested");
    assertions.push(pass("negative feedback turns the trusted pattern into contested"));

    await liteWriteStore.withTx(() =>
      updateRuleState(
        {} as any,
        {
          tenant_id: "default",
          scope: "default",
          actor: "local-user",
          rule_node_id: ruleNodeId,
          state: "disabled",
          input_text: "disable benchmark prefer-edit rule while the pattern is contested",
        },
        "default",
        "default",
        { liteWriteStore },
      ),
    );

    const contestedSelect = ToolsSelectRouteContractSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: selectPayload("wrong-turn-run-5"),
    })).json());
    assert.equal(contestedSelect.selection.selected, "bash");
    assert.deepEqual(contestedSelect.selection_summary.used_trusted_pattern_tools, []);
    assert.match(contestedSelect.selection_summary.provenance_explanation ?? "", /contested patterns visible but not trusted/i);
    assertions.push(pass("selector stops trusting the old path immediately after the wrong turn"));

    await liteWriteStore.withTx(() =>
      updateRuleState(
        {} as any,
        {
          tenant_id: "default",
          scope: "default",
          actor: "local-user",
          rule_node_id: ruleNodeId,
          state: "active",
          input_text: "reactivate benchmark prefer-edit rule for contested recovery evidence",
        },
        "default",
        "default",
        { liteWriteStore },
      ),
    );

    const firstRecoverySelect = ToolsSelectRouteContractSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: selectPayload("wrong-turn-run-6"),
    })).json());
    assert.equal(firstRecoverySelect.selection.selected, "edit");
    const firstRecovery = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: feedbackPayload("wrong-turn-run-6", "positive"),
    });
    assert.equal(firstRecovery.statusCode, 200);
    assert.equal((firstRecovery.json() as any).pattern_anchor?.credibility_state, "contested");
    assertions.push(pass("one fresh recovery run is still not enough to restore trust"));

    const secondRecoverySelect = ToolsSelectRouteContractSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: selectPayload("wrong-turn-run-7"),
    })).json());
    assert.equal(secondRecoverySelect.selection.selected, "edit");
    const secondRecovery = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: feedbackPayload("wrong-turn-run-7", "positive"),
    });
    assert.equal(secondRecovery.statusCode, 200);
    assert.equal((secondRecovery.json() as any).pattern_anchor?.credibility_state, "trusted");
    assertions.push(pass("two fresh recovery runs restore trusted state"));

    await liteWriteStore.withTx(() =>
      updateRuleState(
        {} as any,
        {
          tenant_id: "default",
          scope: "default",
          actor: "local-user",
          rule_node_id: ruleNodeId,
          state: "disabled",
          input_text: "disable benchmark prefer-edit rule after contested recovery",
        },
        "default",
        "default",
        { liteWriteStore },
      ),
    );

    const recoveredSelect = ToolsSelectRouteContractSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: selectPayload("wrong-turn-run-8"),
    })).json());
    assert.equal(recoveredSelect.selection.selected, "edit");
    assert.deepEqual(recoveredSelect.selection_summary.used_trusted_pattern_affinity_levels ?? [], ["exact_task_signature"]);
    assert.match(recoveredSelect.selection_summary.provenance_explanation ?? "", /trusted pattern support: edit \[exact_task_signature\]/i);
    assertions.push(pass("selector reuses the learned path again after deliberate recovery"));

    return {
      assertions,
      metrics: {
        selected_before_negative: trustedSelect.selection.selected,
        contested_selected_tool: contestedSelect.selection.selected,
        contested_provenance: contestedSelect.selection_summary.provenance_explanation,
        recovered_selected_tool: recoveredSelect.selection.selected,
        recovered_used_trusted_pattern_affinity_levels: recoveredSelect.selection_summary.used_trusted_pattern_affinity_levels,
      },
      notes: [
        "Measures whether one wrong-turn feedback immediately strips trusted reuse from the selector.",
        "Confirms that recovery requires deliberate fresh evidence before trusted reuse returns.",
      ],
    };
  } finally {
    await app.close();
    await liteWriteStore.close();
  }
}

async function runWorkflowProgressionLoop(): Promise<Omit<BenchmarkScenarioResult, "id" | "title" | "status" | "duration_ms">> {
  const dbPath = tmpDbPath("workflow-progression");
  const app = Fastify();
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  const assertions: AssertionResult[] = [];
  try {
    registerBenchmarkApp({ app, liteWriteStore, liteRecallStore });

    const firstWrite = await app.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: buildBenchmarkWritePayload({
        eventId: randomUUID(),
        title: "Benchmark export repair",
        inputText: "continue fixing export resolver benchmark run one",
        taskBrief: "Fix export failure in node tests",
        stateId: `state:${randomUUID()}`,
        filePath: "src/routes/export.ts",
      }),
    });
    assert.equal(firstWrite.statusCode, 200);

    const firstPlanning = PlanningContextRouteContractSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/planning/context",
      payload: {
        tenant_id: "default",
        scope: "default",
        query_text: "fix export failure in node tests",
        context: { goal: "fix export failure in node tests" },
        tool_candidates: ["bash", "edit", "test"],
      },
    })).json());
    assert.equal(firstPlanning.planner_packet.sections.candidate_workflows.length, 1);
    assert.equal(firstPlanning.planner_packet.sections.recommended_workflows.length, 0);
    assert.match(firstPlanning.planning_summary.planner_explanation, /candidate workflows visible but not yet promoted/i);
    assertions.push(pass("first continuity write creates planner-visible candidate"));

    const firstIntrospect = ExecutionMemoryIntrospectionResponseSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: { tenant_id: "default", scope: "default", limit: 12 },
    })).json());
    assert.equal(firstIntrospect.workflow_signal_summary.observing_workflow_count, 1);
    assertions.push(pass("introspection shows observing workflow after first write"));

    const secondWrite = await app.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: buildBenchmarkWritePayload({
        eventId: randomUUID(),
        title: "Benchmark export repair second run",
        inputText: "continue fixing export resolver benchmark run two",
        taskBrief: "Fix export failure in node tests",
        stateId: `state:${randomUUID()}`,
        filePath: "src/routes/export.ts",
      }),
    });
    assert.equal(secondWrite.statusCode, 200);

    const secondPlanning = PlanningContextRouteContractSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/planning/context",
      payload: {
        tenant_id: "default",
        scope: "default",
        query_text: "fix export failure in node tests",
        context: { goal: "fix export failure in node tests" },
        tool_candidates: ["bash", "edit", "test"],
      },
    })).json());
    assert.equal(secondPlanning.planner_packet.sections.recommended_workflows.length, 1);
    assert.equal(secondPlanning.planner_packet.sections.candidate_workflows.length, 0);
    assert.equal(secondPlanning.workflow_signals[0]?.promotion_state, "stable");
    assert.match(secondPlanning.planning_summary.planner_explanation, /workflow guidance:/i);
    assertions.push(pass("second unique continuity write upgrades to stable workflow guidance"));

    const secondIntrospect = ExecutionMemoryIntrospectionResponseSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: { tenant_id: "default", scope: "default", limit: 12 },
    })).json());
    assert.equal(secondIntrospect.workflow_signal_summary.stable_workflow_count, 1);
    assert.equal(secondIntrospect.recommended_workflows.length, 1);
    assertions.push(pass("introspection aligns with stable workflow guidance"));

    return {
      assertions,
      metrics: {
        candidate_workflows_after_first: firstPlanning.planner_packet.sections.candidate_workflows.length,
        planner_explanation_after_first: firstPlanning.planning_summary.planner_explanation,
        observing_workflow_count_after_first: firstIntrospect.workflow_signal_summary.observing_workflow_count,
        recommended_workflows_after_second: secondPlanning.planner_packet.sections.recommended_workflows.length,
        planner_explanation_after_second: secondPlanning.planning_summary.planner_explanation,
        stable_workflow_count_after_second: secondIntrospect.workflow_signal_summary.stable_workflow_count,
      },
      notes: [
        "Measures whether repeated structured execution continuity becomes planner-visible workflow guidance.",
      ],
    };
  } finally {
    await app.close();
    await liteWriteStore.close();
  }
}

async function runMultiStepRepairLoop(): Promise<Omit<BenchmarkScenarioResult, "id" | "title" | "status" | "duration_ms">> {
  const dbPath = tmpDbPath("multi-step-repair");
  const app = Fastify();
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  const assertions: AssertionResult[] = [];
  const sessionId = "benchmark-session-export-repair";
  const taskBrief = "Fix export failure in node tests";
  const filePath = "src/routes/export.ts";
  const planningPayload = {
    tenant_id: "default",
    scope: "default",
    query_text: "fix export failure in node tests",
    context: { goal: "fix export failure in node tests" },
    tool_candidates: ["bash", "edit", "test"],
  };
  try {
    registerBenchmarkApp({ app, liteWriteStore, liteRecallStore });

    const inspectEvent = await app.inject({
      method: "POST",
      url: "/v1/memory/events",
      payload: buildBenchmarkSessionEventPayload({
        sessionId,
        eventId: randomUUID(),
        title: "Inspect failing export path",
        taskBrief,
        stateId: `state:${randomUUID()}`,
        filePath,
        currentStage: "patch",
        nextAction: `Inspect ${filePath} and locate the failing export branch`,
        pendingValidations: ["npm run -s test:lite -- export"],
        completedValidations: [],
      }),
    });
    assert.equal(inspectEvent.statusCode, 200);

    const inspectPlanning = PlanningContextRouteContractSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/planning/context",
      payload: planningPayload,
    })).json());
    assert.equal(inspectPlanning.planner_packet.sections.candidate_workflows.length, 1);
    assert.equal(inspectPlanning.planner_packet.sections.recommended_workflows.length, 0);
    assert.match(inspectPlanning.planning_summary.planner_explanation, /candidate workflows visible but not yet promoted/i);
    assertions.push(pass("inspect step creates planner-visible candidate workflow"));

    const inspectIntrospect = ExecutionMemoryIntrospectionResponseSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: { tenant_id: "default", scope: "default", limit: 20 },
    })).json());
    assert.equal(inspectIntrospect.workflow_signal_summary.observing_workflow_count, 1);
    assertions.push(pass("inspect step is tracked as observing workflow"));

    const patchEvent = await app.inject({
      method: "POST",
      url: "/v1/memory/events",
      payload: buildBenchmarkSessionEventPayload({
        sessionId,
        eventId: randomUUID(),
        title: "Patch export resolver",
        taskBrief,
        stateId: `state:${randomUUID()}`,
        filePath,
        currentStage: "patch",
        nextAction: `Patch ${filePath} and rerun export tests`,
        pendingValidations: ["npm run -s test:lite -- export"],
        completedValidations: [],
      }),
    });
    assert.equal(patchEvent.statusCode, 200);

    const patchPlanning = PlanningContextRouteContractSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/planning/context",
      payload: planningPayload,
    })).json());
    assert.equal(patchPlanning.planner_packet.sections.recommended_workflows.length, 1);
    assert.equal(patchPlanning.planner_packet.sections.candidate_workflows.length, 0);
    assert.equal(patchPlanning.workflow_signals[0]?.promotion_state, "stable");
    assert.match(patchPlanning.planning_summary.planner_explanation, /workflow guidance:/i);
    assertions.push(pass("patch step upgrades the repair run to stable workflow guidance"));

    const patchIntrospect = ExecutionMemoryIntrospectionResponseSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: { tenant_id: "default", scope: "default", limit: 20 },
    })).json());
    assert.equal(patchIntrospect.workflow_signal_summary.stable_workflow_count, 1);
    assertions.push(pass("introspection shows stable workflow after patch step"));

    const validateEvent = await app.inject({
      method: "POST",
      url: "/v1/memory/events",
      payload: buildBenchmarkSessionEventPayload({
        sessionId,
        eventId: randomUUID(),
        title: "Validate export repair",
        taskBrief,
        stateId: `state:${randomUUID()}`,
        filePath,
        currentStage: "review",
        nextAction: "Confirm export tests remain green and summarize the fix",
        pendingValidations: [],
        completedValidations: ["npm run -s test:lite -- export"],
      }),
    });
    assert.equal(validateEvent.statusCode, 200);

    const validatePlanning = PlanningContextRouteContractSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/planning/context",
      payload: planningPayload,
    })).json());
    assert.equal(validatePlanning.planner_packet.sections.recommended_workflows.length, 1);
    assert.equal(validatePlanning.planner_packet.sections.candidate_workflows.length, 0);
    assert.match(validatePlanning.planning_summary.planner_explanation, /workflow guidance:/i);
    assertions.push(pass("later validation step keeps stable workflow guidance instead of reopening candidate state"));

    const validateIntrospect = ExecutionMemoryIntrospectionResponseSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: { tenant_id: "default", scope: "default", limit: 20 },
    })).json());
    assert.equal(validateIntrospect.workflow_signal_summary.stable_workflow_count, 1);
    assert.equal(validateIntrospect.recommended_workflows.length, 1);
    assert.equal(validateIntrospect.candidate_workflows.length, 0);
    assertions.push(pass("introspection keeps one stable workflow after the full repair sequence"));

    assert.ok((validateIntrospect.continuity_projection_report.decision_counts.projected ?? 0) >= 2);
    assert.ok((validateIntrospect.continuity_projection_report.decision_counts.skipped_stable_exists ?? 0) >= 1);
    assertions.push(pass("continuity projection report shows the third step was skipped once stable guidance existed"));

    return {
      assertions,
      metrics: {
        step_count: 3,
        planner_explanation_after_inspect: inspectPlanning.planning_summary.planner_explanation,
        planner_explanation_after_patch: patchPlanning.planning_summary.planner_explanation,
        planner_explanation_after_validate: validatePlanning.planning_summary.planner_explanation,
        observing_workflow_count_after_inspect: inspectIntrospect.workflow_signal_summary.observing_workflow_count,
        stable_workflow_count_after_patch: patchIntrospect.workflow_signal_summary.stable_workflow_count,
        stable_workflow_count_after_validate: validateIntrospect.workflow_signal_summary.stable_workflow_count,
        continuity_projection_decisions_after_validate: validateIntrospect.continuity_projection_report.decision_counts,
      },
      notes: [
        "Measures a three-step repair run across inspect, patch, and validate session events.",
        "Confirms that once stable workflow guidance exists, later repair steps do not reopen duplicate candidate workflow rows.",
      ],
    };
  } finally {
    await app.close();
    await liteWriteStore.close();
  }
}

async function runSlimSurfaceBoundary(): Promise<Omit<BenchmarkScenarioResult, "id" | "title" | "status" | "duration_ms">> {
  const dbPath = tmpDbPath("slim-surface");
  const app = Fastify();
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  const assertions: AssertionResult[] = [];
  try {
    registerBenchmarkApp({ app, liteWriteStore, liteRecallStore });

    await app.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: buildBenchmarkWritePayload({
        eventId: randomUUID(),
        title: "Benchmark slim surface fixture",
        inputText: "seed slim surface benchmark",
        taskBrief: "Fix export failure in node tests",
        stateId: `state:${randomUUID()}`,
        filePath: "src/routes/export.ts",
      }),
    });

    const planning = PlanningContextRouteContractSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/planning/context",
      payload: {
        tenant_id: "default",
        scope: "default",
        query_text: "fix export failure in node tests",
        context: { goal: "fix export failure in node tests" },
        tool_candidates: ["bash", "edit", "test"],
      },
    })).json());
    assert.ok(!("layered_context" in (planning as Record<string, unknown>)));
    assertions.push(pass("default planning context stays slim"));

    const assembleResponse = (await app.inject({
      method: "POST",
      url: "/v1/memory/context/assemble",
      payload: {
        tenant_id: "default",
        scope: "default",
        query_text: "fix export failure in node tests",
        context: { goal: "fix export failure in node tests" },
        tool_candidates: ["bash", "edit", "test"],
        return_layered_context: true,
      },
    })).json() as Record<string, unknown>;
    assert.ok("layered_context" in assembleResponse);
    assertions.push(pass("debug context assemble returns layered_context on demand"));

    return {
      assertions,
      metrics: {
        planning_has_layered_context: "layered_context" in (planning as Record<string, unknown>),
        assemble_has_layered_context: "layered_context" in assembleResponse,
        planner_packet_present: !!planning.planner_packet,
        execution_kernel_present: !!planning.execution_kernel,
      },
      notes: [
        "Measures whether Aionis keeps the default planner surface slim while retaining explicit debug inspection.",
      ],
    };
  } finally {
    await app.close();
    await liteWriteStore.close();
  }
}

async function runGovernedLearningRuntimeLoop(): Promise<Omit<BenchmarkScenarioResult, "id" | "title" | "status" | "duration_ms">> {
  const dbPath = tmpDbPath("governed-learning-runtime");
  const app = Fastify();
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  const assertions: AssertionResult[] = [];
  try {
    registerBenchmarkApp({
      app,
      liteWriteStore,
      liteRecallStore,
      envOverrides: {
        WORKFLOW_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED: true,
      },
    });

    const taskBrief = "Fix export failure in node tests";
    const filePath = "src/routes/export.ts";
    const planningPayload = {
      tenant_id: "default",
      scope: "default",
      query_text: "fix export failure in node tests",
      context: { goal: "fix export failure in node tests" },
      tool_candidates: ["bash", "edit", "test"],
    };

    const firstWrite = await app.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: buildBenchmarkWritePayload({
        eventId: randomUUID(),
        title: "Governed inspect export path",
        inputText: "governed benchmark first execution continuity write",
        taskBrief,
        stateId: `state:${randomUUID()}`,
        filePath,
      }),
    });
    assert.equal(firstWrite.statusCode, 200);

    const afterFirstPlanning = PlanningContextRouteContractSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/planning/context",
      payload: planningPayload,
    })).json());
    assert.equal(afterFirstPlanning.planner_packet.sections.candidate_workflows.length, 1);
    assert.equal(afterFirstPlanning.planner_packet.sections.recommended_workflows.length, 0);
    assertions.push(pass("first write stays candidate before governed promotion"));

    const secondWrite = await app.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: buildBenchmarkWritePayload({
        eventId: randomUUID(),
        title: "Governed patch export path",
        inputText: "governed benchmark second execution continuity write",
        taskBrief,
        stateId: `state:${randomUUID()}`,
        filePath,
      }),
    });
    assert.equal(secondWrite.statusCode, 200);

    const storedStable = await liteWriteStore.findNodes({
      scope: "default",
      type: "procedure",
      slotsContains: {
        summary_kind: "workflow_anchor",
      },
      consumerAgentId: "local-user",
      consumerTeamId: null,
      limit: 20,
      offset: 0,
    });
    const stableWorkflowNode = storedStable.rows.find((row) => {
      const projection = (row.slots?.workflow_write_projection ?? null) as Record<string, unknown> | null;
      return projection?.auto_promoted === true;
    }) ?? null;
    assert.ok(stableWorkflowNode);
    const stableProjection = (stableWorkflowNode.slots?.workflow_write_projection ?? {}) as Record<string, unknown>;
    const workflowPreview = ((stableProjection.governance_preview ?? {}) as Record<string, unknown>).promote_memory as Record<string, any> | undefined;
    assert.equal(stableProjection.governed_promotion_state_override, "stable");
    assert.equal(workflowPreview?.admissibility?.admissible, true);
    assert.equal(workflowPreview?.policy_effect?.applies, true);
    assert.equal(workflowPreview?.decision_trace?.runtime_apply_changed_promotion_state, true);
    assertions.push(pass("second write yields governed stable workflow apply"));

    const afterSecondPlanning = PlanningContextRouteContractSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/planning/context",
      payload: planningPayload,
    })).json());
    assert.equal(afterSecondPlanning.planner_packet.sections.recommended_workflows.length, 1);
    assert.match(afterSecondPlanning.planning_summary.planner_explanation, /workflow guidance:/i);
    assertions.push(pass("planning surface exposes workflow guidance after governed promotion"));

    const ruleNodeIds = await seedActiveToolRules(liteWriteStore, ["edit", "edit"]);
    const runId = "governed-pattern-run-1";
    const toolContext = {
      task_kind: "repair_export",
      goal: "repair export failure in node tests",
      error: {
        signature: "node-export-mismatch",
      },
    };

    const selection = ToolsSelectRouteContractSchema.parse(await selectTools(null, {
      tenant_id: "default",
      scope: "default",
      run_id: runId,
      context: toolContext,
      candidates: ["bash", "edit", "test"],
      include_shadow: false,
      rules_limit: 20,
      strict: true,
      reorder_candidates: false,
    }, "default", "default", {
      liteWriteStore,
    }));
    assert.equal(selection.selection.selected, "edit");

    const feedback = ToolsFeedbackResponseSchema.parse(
      await liteWriteStore.withTx(() =>
        toolSelectionFeedback(null, {
          tenant_id: "default",
          scope: "default",
          actor: "local-user",
          run_id: runId,
          decision_id: selection.decision.decision_id,
        outcome: "positive",
        context: toolContext,
        candidates: ["bash", "edit", "test"],
          selected_tool: "edit",
          target: "tool",
          note: "Governed benchmark provider-backed edit repair succeeded",
          input_text: "repair export failure in node tests",
        }, "default", "default", {
          maxTextLen: 10_000,
          piiRedaction: false,
          embedder: FakeEmbeddingProvider,
          liteWriteStore,
          governanceReviewProviders: {
            form_pattern: createStaticFormPatternGovernanceReviewProvider(),
          },
        }),
      ),
    );
    assert.equal(feedback.pattern_anchor?.pattern_state, "stable");
    assert.equal(feedback.pattern_anchor?.credibility_state, "trusted");
    assertions.push(pass("provider-backed tools feedback yields trusted stable pattern state"));

    assert.equal(feedback.governance_preview?.form_pattern?.admissibility?.admissible, true);
    assert.equal(feedback.governance_preview?.form_pattern?.policy_effect?.applies, true);
    assert.equal(feedback.governance_preview?.form_pattern?.decision_trace?.runtime_apply_changed_pattern_state, true);
    assertions.push(pass("tools governance preview reports runtime apply"));

    for (const ruleNodeId of ruleNodeIds) {
      await liteWriteStore.withTx(() =>
        updateRuleState(
          {} as any,
          {
            tenant_id: "default",
            scope: "default",
            actor: "local-user",
            rule_node_id: ruleNodeId,
            state: "disabled",
            input_text: "disable benchmark provider source rule after trusted pattern formation",
          },
          "default",
          "default",
          { liteWriteStore },
        ),
      );
    }

    const reused = ToolsSelectRouteContractSchema.parse(await selectTools(null, {
      tenant_id: "default",
      scope: "default",
      run_id: "governed-pattern-run-2",
      context: toolContext,
      candidates: ["bash", "edit", "test"],
      include_shadow: false,
      rules_limit: 20,
      strict: true,
      reorder_candidates: true,
    }, "default", "default", {
      liteWriteStore,
    }));
    const afterRuleDisableIntrospect = ExecutionMemoryIntrospectionResponseSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: { tenant_id: "default", scope: "default", limit: 20 },
    })).json());
    assert.ok(afterRuleDisableIntrospect.pattern_signal_summary.trusted_pattern_count >= 1);
    assertions.push(pass("trusted pattern remains present after source rules are disabled"));

    return {
      assertions,
      metrics: {
        workflow_governed_promotion_state_override: stableProjection.governed_promotion_state_override ?? null,
        workflow_governance_reason: workflowPreview?.review_result?.adjudication?.reason ?? null,
        workflow_recommended_count: afterSecondPlanning.planner_packet.sections.recommended_workflows.length,
        tools_pattern_state: feedback.pattern_anchor?.pattern_state ?? null,
        tools_pattern_credibility_state: feedback.pattern_anchor?.credibility_state ?? null,
        tools_governance_reason: feedback.governance_preview?.form_pattern?.review_result?.adjudication?.reason ?? null,
        reused_selected_tool: reused.selection.selected,
        reused_trusted_pattern_tools: reused.selection_summary.used_trusted_pattern_tools,
        trusted_pattern_count_after_rule_disable: afterRuleDisableIntrospect.pattern_signal_summary.trusted_pattern_count,
      },
      notes: [
        "Measures provider-backed governed workflow promotion through the runtime write path.",
        "Measures provider-backed governed pattern formation through the runtime tools feedback path.",
        "Confirms the provider-backed trusted pattern remains in the execution-memory surface after the source rules are removed.",
      ],
    };
  } finally {
    await app.close();
    await liteWriteStore.close();
  }
}

async function seedPendingReplayBenchmarkPlaybook(args: {
  liteWriteStore: ReturnType<typeof createLiteWriteStore>;
  liteReplayStore: ReturnType<typeof createLiteReplayStore>;
  playbookId: string;
  workflowSignature?: string | null;
}) {
  const sourceClientId = `replay:playbook:${args.playbookId}:v1`;
  const out = await applyReplayMemoryWrite(
    {} as any,
    {
      tenant_id: "default",
      scope: "default",
      actor: "local-user",
      input_text: `seed pending review playbook ${args.playbookId}`,
      auto_embed: false,
      memory_lane: "private",
      producer_agent_id: "local-user",
      owner_agent_id: "local-user",
      nodes: [
        {
          client_id: sourceClientId,
          type: "procedure",
          title: "Fix export failure",
          text_summary: "Replay playbook pending review",
          slots: {
            replay_kind: "playbook",
            playbook_id: args.playbookId,
            name: "Fix export failure",
            version: 1,
            status: "draft",
            matchers: { task_kind: "repair_export" },
            success_criteria: { status: "success" },
            risk_profile: "medium",
            source_run_id: randomUUID(),
            created_from_run_ids: [randomUUID()],
            policy_constraints: {},
            ...(args.workflowSignature ? { workflow_signature: args.workflowSignature } : {}),
            steps_template: [
              { step_index: 1, tool_name: "edit", preconditions: [], postconditions: [], safety_level: "needs_confirm" },
              { step_index: 2, tool_name: "test", preconditions: [], postconditions: [], safety_level: "observe_only" },
            ],
            repair_patch: { note: "normalize export path" },
            repair_review: { state: "pending_review" },
          },
        },
      ],
      edges: [],
    },
    {
      defaultScope: "default",
      defaultTenantId: "default",
      maxTextLen: 10_000,
      piiRedaction: false,
      allowCrossScopeEdges: false,
      shadowDualWriteEnabled: false,
      shadowDualWriteStrict: false,
      writeAccessShadowMirrorV2: false,
      embedder: null,
      replayMirror: args.liteReplayStore,
      writeAccess: args.liteWriteStore,
    },
  );
  assert.ok(out.out.nodes[0]?.id);
}

function registerReplayBenchmarkApp(args: {
  app: ReturnType<typeof Fastify>;
  liteWriteStore: ReturnType<typeof createLiteWriteStore>;
  liteReplayStore: ReturnType<typeof createLiteReplayStore>;
  liteRecallStore: ReturnType<typeof createLiteRecallStore>;
  envOverrides?: Record<string, unknown>;
  governanceRuntimeProviderBuilderOptions?: LiteGovernanceRuntimeProviderBuilderOptions;
}) {
  const env = buildEnv({
    REPLAY_LEARNING_PROJECTION_ENABLED: true,
    REPLAY_LEARNING_PROJECTION_MODE: "rule_and_episode",
    REPLAY_LEARNING_PROJECTION_DELIVERY: "sync_inline",
    REPLAY_LEARNING_TARGET_RULE_STATE: "draft",
    REPLAY_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED: false,
    ...args.envOverrides,
  });
  const guards = buildRequestGuards(env);
  registerHostErrorHandler(args.app);

  const runtimeOptions = createReplayRuntimeOptionBuilders({
    env,
    store: {
      withTx: async <T>(fn: (client: any) => Promise<T>) => await fn({} as any),
      withClient: async <T>(fn: (client: any) => Promise<T>) => await fn({} as any),
    },
    embedder: FakeEmbeddingProvider,
    embeddingSurfacePolicy: undefined,
    embeddedRuntime: null,
    liteWriteStore: args.liteWriteStore,
    liteReplayAccess: args.liteReplayStore.createReplayAccess(),
    liteReplayStore: args.liteReplayStore,
    sandboxAllowedCommands: [],
    sandboxExecutor: {
      enqueue: () => {},
      executeSync: async () => {},
    },
    writeAccessShadowMirrorV2: false,
    enforceSandboxTenantBudget: async () => {},
    governanceRuntimeProviderBuilderOptions: args.governanceRuntimeProviderBuilderOptions,
  });
  const { withReplayRepairReviewDefaults } = createReplayRepairReviewPolicy({
    env,
    tenantFromBody: guards.tenantFromBody,
    scopeFromBody: guards.scopeFromBody,
  });

  registerMemoryReplayGovernedRoutes({
    app: args.app,
    env,
    liteWriteStore: args.liteWriteStore as any,
    requireMemoryPrincipal: guards.requireMemoryPrincipal,
    withIdentityFromRequest: guards.withIdentityFromRequest,
    enforceRateLimit: guards.enforceRateLimit,
    enforceTenantQuota: guards.enforceTenantQuota,
    tenantFromBody: guards.tenantFromBody,
    acquireInflightSlot: guards.acquireInflightSlot,
    withReplayRepairReviewDefaults,
    buildReplayRepairReviewOptions: runtimeOptions.buildReplayRepairReviewOptions,
  });

  registerMemoryContextRuntimeRoutes({
    app: args.app,
    env,
    embedder: FakeEmbeddingProvider,
    embeddedRuntime: null,
    liteWriteStore: args.liteWriteStore,
    liteRecallAccess: args.liteRecallStore.createRecallAccess(),
    recallTextEmbedBatcher: { stats: () => null },
    requireMemoryPrincipal: guards.requireMemoryPrincipal,
    withIdentityFromRequest: guards.withIdentityFromRequest,
    enforceRateLimit: guards.enforceRateLimit,
    enforceTenantQuota: guards.enforceTenantQuota,
    enforceRecallTextEmbedQuota: guards.enforceRecallTextEmbedQuota,
    buildRecallAuth: guards.buildRecallAuth,
    tenantFromBody: guards.tenantFromBody,
    acquireInflightSlot: guards.acquireInflightSlot,
    hasExplicitRecallKnobs: () => false,
    resolveRecallProfile: () => ({ profile: "balanced", source: "benchmark" }),
    resolveExplicitRecallMode: () => ({
      mode: null,
      profile: "balanced",
      defaults: {},
      applied: false,
      reason: "benchmark_default",
      source: "benchmark",
    }),
    resolveClassAwareRecallProfile: (_endpoint, _body, baseProfile) => ({
      profile: baseProfile,
      defaults: {},
      enabled: false,
      applied: false,
      reason: "benchmark_default",
      source: "benchmark",
      workload_class: null,
      signals: [],
    }),
    withRecallProfileDefaults: (body) => ({ ...(body as Record<string, unknown>) }),
    resolveRecallStrategy: () => ({ strategy: "local", defaults: {}, applied: false }),
    resolveAdaptiveRecallProfile: (profile) => ({ profile, defaults: {}, applied: false, reason: "benchmark_default" }),
    resolveAdaptiveRecallHardCap: () => ({ defaults: {}, applied: false, reason: "benchmark_default" }),
    inferRecallStrategyFromKnobs: () => "local",
    buildRecallTrajectory: () => ({ strategy: "local" }),
    embedRecallTextQuery: async (provider, queryText) => {
      const [vec] = await provider.embed([queryText]);
      return {
        vec,
        ms: 0,
        cache_hit: false,
        singleflight_join: false,
        queue_wait_ms: 0,
        batch_size: 1,
      };
    },
    mapRecallTextEmbeddingError: () => ({
      statusCode: 500,
      code: "embed_failed",
      message: "embed failed",
    }),
    recordContextAssemblyTelemetryBestEffort: async () => {},
  });

  registerMemoryAccessRoutes({
    app: args.app,
    env,
    liteWriteStore: args.liteWriteStore,
    requireMemoryPrincipal: guards.requireMemoryPrincipal,
    withIdentityFromRequest: guards.withIdentityFromRequest,
    enforceRateLimit: guards.enforceRateLimit,
    enforceTenantQuota: guards.enforceTenantQuota,
    tenantFromBody: guards.tenantFromBody,
    acquireInflightSlot: guards.acquireInflightSlot,
  });
}

async function runGovernedReplayRuntimeLoop(): Promise<Omit<BenchmarkScenarioResult, "id" | "title" | "status" | "duration_ms">> {
  const writeDbPath = tmpDbPath("governed-replay-write");
  const replayDbPath = tmpDbPath("governed-replay-store");
  const playbookId = randomUUID();
  const app = Fastify();
  const liteWriteStore = createLiteWriteStore(writeDbPath);
  const liteReplayStore = createLiteReplayStore(replayDbPath);
  const liteRecallStore = createLiteRecallStore(writeDbPath);
  const assertions: AssertionResult[] = [];
  try {
    await seedPendingReplayBenchmarkPlaybook({
      liteWriteStore,
      liteReplayStore,
      playbookId,
      workflowSignature: "wf:replay:export-fix",
    });
    registerReplayBenchmarkApp({
      app,
      liteWriteStore,
      liteReplayStore,
      liteRecallStore,
      envOverrides: {
        REPLAY_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED: true,
      },
    });

    const reviewRes = await app.inject({
      method: "POST",
      url: "/v1/memory/replay/playbooks/repair/review",
      payload: {
        tenant_id: "default",
        scope: "default",
        playbook_id: playbookId,
        action: "approve",
        auto_shadow_validate: false,
        target_status_on_approve: "shadow",
        learning_projection: {
          enabled: true,
        },
      },
    });
    assert.equal(reviewRes.statusCode, 200);
    const reviewBody = ReplayPlaybookRepairReviewResponseSchema.parse(reviewRes.json());
    assert.equal(reviewBody.learning_projection_result.status, "applied");
    assert.equal(reviewBody.learning_projection_result.rule_state, "shadow");
    assertions.push(pass("replay review applies provider-backed learning projection inline"));

    assert.equal(reviewBody.governance_preview?.promote_memory.admissibility?.admissible, true);
    assert.equal(reviewBody.governance_preview?.promote_memory.policy_effect?.applies, true);
    assert.equal(reviewBody.governance_preview?.promote_memory.decision_trace?.runtime_apply_changed_target_rule_state, true);
    assertions.push(pass("replay governance preview records admissible runtime apply"));

    const generatedRuleId = reviewBody.learning_projection_result.generated_rule_node_id;
    assert.ok(generatedRuleId);
    const { rows: ruleRows } = await liteWriteStore.findNodes({
      scope: "default",
      id: generatedRuleId,
      consumerAgentId: "local-user",
      consumerTeamId: null,
      limit: 10,
      offset: 0,
    });
    assert.equal(ruleRows.length, 1);
    assertions.push(pass("replay review materializes a governed replay-learning rule"));

    const planningRes = await app.inject({
      method: "POST",
      url: "/v1/memory/planning/context",
      payload: {
        tenant_id: "default",
        scope: "default",
        query_text: "repair export failure",
        context: {
          goal: "repair export failure in node tests",
          task_kind: "repair_export",
        },
        tool_candidates: ["bash", "edit", "test"],
      },
    });
    assert.equal(planningRes.statusCode, 200);
    const planningBody = PlanningContextRouteContractSchema.parse(planningRes.json());
    assert.ok(planningBody.planner_packet.sections.recommended_workflows.length >= 1);
    assert.match(planningBody.planning_summary.planner_explanation, /workflow guidance:/i);
    assertions.push(pass("planning surface consumes replay-learned workflow guidance"));

    const introspect = ExecutionMemoryIntrospectionResponseSchema.parse((await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: { tenant_id: "default", scope: "default", limit: 20 },
    })).json());
    assert.ok(introspect.workflow_signal_summary.stable_workflow_count >= 1);
    assertions.push(pass("execution introspection reflects replay-governed stable workflow state"));

    return {
      assertions,
      metrics: {
        replay_learning_rule_state: reviewBody.learning_projection_result.rule_state,
        replay_governance_reason: reviewBody.governance_preview?.promote_memory.review_result?.adjudication.reason ?? null,
        replay_generated_rule_id: generatedRuleId,
        planning_recommended_workflows: planningBody.planner_packet.sections.recommended_workflows.length,
        planning_explanation: planningBody.planning_summary.planner_explanation,
        stable_workflow_count_after_replay: introspect.workflow_signal_summary.stable_workflow_count,
      },
      notes: [
        "Measures provider-backed replay repair review on the real Lite runtime route.",
        "Confirms replay-governed learning projection produces planner-visible workflow guidance.",
      ],
    };
  } finally {
    await app.close();
    await liteRecallStore.close();
    await liteReplayStore.close();
    await liteWriteStore.close();
  }
}

async function runGovernanceProviderPrecedenceRuntimeLoop(): Promise<Omit<BenchmarkScenarioResult, "id" | "title" | "status" | "duration_ms">> {
  const dbPath = tmpDbPath("governance-provider-precedence");
  const app = Fastify();
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  const assertions: AssertionResult[] = [];
  try {
    registerBenchmarkApp({
      app,
      liteWriteStore,
      liteRecallStore,
      envOverrides: {
        WORKFLOW_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED: true,
        TOOLS_GOVERNANCE_STATIC_FORM_PATTERN_PROVIDER_ENABLED: true,
      },
    });

    const taskBrief = "Fix export failure in node tests";
    const filePath = "src/routes/export.ts";

    const firstWrite = await app.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: buildBenchmarkWritePayload({
        eventId: randomUUID(),
        title: "Precedence inspect export path",
        inputText: "precedence benchmark first execution continuity write",
        taskBrief,
        stateId: `state:${randomUUID()}`,
        filePath,
      }),
    });
    assert.equal(firstWrite.statusCode, 200);

    const secondWrite = await app.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: buildBenchmarkWritePayload({
        eventId: randomUUID(),
        title: "Precedence patch export path with explicit review",
        inputText: "precedence benchmark second execution continuity write",
        taskBrief,
        stateId: `state:${randomUUID()}`,
        filePath,
        workflowPromotionGovernanceReview: {
          promote_memory: {
            review_result: {
              review_version: "promote_memory_semantic_review_v1",
              adjudication: {
                operation: "promote_memory",
                disposition: "recommend",
                target_kind: "workflow",
                target_level: "L2",
                reason: "explicit review keeps workflow promotion ungovened",
                confidence: 0.55,
                strategic_value: "high",
              },
            },
          },
        },
      }),
    });
    assert.equal(secondWrite.statusCode, 200);

    const storedStable = await liteWriteStore.findNodes({
      scope: "default",
      type: "procedure",
      slotsContains: {
        summary_kind: "workflow_anchor",
      },
      consumerAgentId: "local-user",
      consumerTeamId: null,
      limit: 20,
      offset: 0,
    });
    const stableWorkflowNode = storedStable.rows.find((row) => {
      const projection = (row.slots?.workflow_write_projection ?? null) as Record<string, unknown> | null;
      return projection?.auto_promoted === true;
    }) ?? null;
    assert.ok(stableWorkflowNode);
    const stableProjection = (stableWorkflowNode.slots?.workflow_write_projection ?? {}) as Record<string, any>;
    const workflowPreview = ((stableProjection.governance_preview ?? {}) as Record<string, any>).promote_memory as Record<string, any> | undefined;
    assert.equal(workflowPreview?.review_result?.adjudication?.reason, "explicit review keeps workflow promotion ungovened");
    assert.equal(workflowPreview?.admissibility?.admissible, false);
    assert.equal(workflowPreview?.policy_effect?.applies, false);
    assert.equal(workflowPreview?.decision_trace?.runtime_apply_changed_promotion_state, false);
    assert.equal(stableProjection.governed_promotion_state_override ?? null, null);
    assertions.push(pass("workflow path prefers explicit governance review over provider fallback"));

    const ruleNodeIds = await seedActiveToolRules(liteWriteStore, ["edit", "edit"]);
    const selectRes = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: {
        tenant_id: "default",
        scope: "default",
        run_id: "precedence-tools-run-1",
        context: {
          task_kind: "repair_export",
          goal: "repair export failure in node tests",
          error: {
            signature: "node-export-mismatch",
          },
        },
        candidates: ["bash", "edit", "test"],
        include_shadow: false,
        rules_limit: 20,
        strict: true,
        reorder_candidates: false,
      },
    });
    assert.equal(selectRes.statusCode, 200);
    const selection = ToolsSelectRouteContractSchema.parse(selectRes.json());
    assert.equal(selection.selection.selected, "edit");

    const feedbackRes = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: {
        tenant_id: "default",
        scope: "default",
        actor: "local-user",
        run_id: "precedence-tools-run-1",
        decision_id: selection.decision.decision_id,
        outcome: "positive",
        context: {
          task_kind: "repair_export",
          goal: "repair export failure in node tests",
          error: {
            signature: "node-export-mismatch",
          },
        },
        candidates: ["bash", "edit", "test"],
        selected_tool: "edit",
        target: "tool",
        note: "Explicit review keeps grouped evidence provisional",
        input_text: "repair export failure in node tests",
        governance_review: {
          form_pattern: {
            review_result: {
              review_version: "form_pattern_semantic_review_v1",
              adjudication: {
                operation: "form_pattern",
                disposition: "recommend",
                target_kind: "pattern",
                target_level: "L3",
                reason: "explicit review keeps grouped evidence provisional",
                confidence: 0.55,
              },
            },
          },
        },
      },
    });
    assert.equal(feedbackRes.statusCode, 200);
    const feedback = ToolsFeedbackResponseSchema.parse(feedbackRes.json());
    assert.equal(feedback.governance_preview?.form_pattern.review_result?.adjudication.reason, "explicit review keeps grouped evidence provisional");
    assert.equal(feedback.governance_preview?.form_pattern.admissibility?.admissible, false);
    assert.equal(feedback.governance_preview?.form_pattern.policy_effect?.applies, false);
    assert.equal(feedback.governance_preview?.form_pattern.decision_trace?.runtime_apply_changed_pattern_state, false);
    assert.equal(feedback.pattern_anchor?.pattern_state, "provisional");
    assert.equal(feedback.pattern_anchor?.credibility_state, "candidate");
    assertions.push(pass("tools path prefers explicit governance review over provider fallback"));

    for (const ruleNodeId of ruleNodeIds) {
      await liteWriteStore.withTx(() =>
        updateRuleState(
          {} as any,
          {
            tenant_id: "default",
            scope: "default",
            actor: "local-user",
            rule_node_id: ruleNodeId,
            state: "disabled",
            input_text: "disable precedence benchmark source rules",
          },
          "default",
          "default",
          { liteWriteStore },
        ),
      );
    }

    return {
      assertions,
      metrics: {
        workflow_explicit_reason: workflowPreview?.review_result?.adjudication?.reason ?? null,
        workflow_provider_override_blocked: workflowPreview?.policy_effect?.applies ?? null,
        workflow_governed_override_state: stableProjection.governed_promotion_state_override ?? null,
        tools_explicit_reason: feedback.governance_preview?.form_pattern.review_result?.adjudication.reason ?? null,
        tools_provider_override_blocked: feedback.governance_preview?.form_pattern.policy_effect?.applies ?? null,
        tools_pattern_state: feedback.pattern_anchor?.pattern_state ?? null,
        tools_credibility_state: feedback.pattern_anchor?.credibility_state ?? null,
      },
      notes: [
        "Measures whether an explicit workflow governance review overrides the provider-backed fallback on the real write route.",
        "Measures whether an explicit form-pattern governance review overrides the provider-backed fallback on the real tools feedback route.",
      ],
    };
  } finally {
    await app.close();
    await liteWriteStore.close();
  }
}

async function runCustomModelClientRuntimeLoop(): Promise<Omit<BenchmarkScenarioResult, "id" | "title" | "status" | "duration_ms">> {
  const customFactory = createBenchmarkCustomGovernanceModelClientFactory();

  const runtimeDbPath = tmpDbPath("custom-model-client-runtime");
  const runtimeApp = Fastify();
  const runtimeWriteStore = createLiteWriteStore(runtimeDbPath);
  const runtimeRecallStore = createLiteRecallStore(runtimeDbPath);

  const replayWriteDbPath = tmpDbPath("custom-model-client-replay-write");
  const replayDbPath = tmpDbPath("custom-model-client-replay-store");
  const replayApp = Fastify();
  const replayWriteStore = createLiteWriteStore(replayWriteDbPath);
  const replayStore = createLiteReplayStore(replayDbPath);
  const replayRecallStore = createLiteRecallStore(replayWriteDbPath);

  const assertions: AssertionResult[] = [];
  try {
    registerBenchmarkApp({
      app: runtimeApp,
      liteWriteStore: runtimeWriteStore,
      liteRecallStore: runtimeRecallStore,
      envOverrides: {
        WORKFLOW_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED: true,
        TOOLS_GOVERNANCE_STATIC_FORM_PATTERN_PROVIDER_ENABLED: true,
      },
      governanceRuntimeProviderBuilderOptions: {
        modelClientFactory: customFactory,
        modelClientModes: {
          workflowProjection: {
            promote_memory: "custom",
          },
          toolsFeedback: {
            form_pattern: "custom",
          },
        },
      },
    });

    const taskBrief = "Fix export failure in node tests";
    const filePath = "src/routes/export.ts";

    const firstWrite = await runtimeApp.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: buildBenchmarkWritePayload({
        eventId: randomUUID(),
        title: "Custom client inspect export path",
        inputText: "custom client benchmark first continuity write",
        taskBrief,
        stateId: `state:${randomUUID()}`,
        filePath,
      }),
    });
    assert.equal(firstWrite.statusCode, 200);

    const secondWrite = await runtimeApp.inject({
      method: "POST",
      url: "/v1/memory/write",
      payload: buildBenchmarkWritePayload({
        eventId: randomUUID(),
        title: "Custom client patch export path",
        inputText: "custom client benchmark second continuity write",
        taskBrief,
        stateId: `state:${randomUUID()}`,
        filePath,
      }),
    });
    assert.equal(secondWrite.statusCode, 200);

    const storedStable = await runtimeWriteStore.findNodes({
      scope: "default",
      type: "procedure",
      slotsContains: {
        summary_kind: "workflow_anchor",
      },
      consumerAgentId: "local-user",
      consumerTeamId: null,
      limit: 20,
      offset: 0,
    });
    const stableWorkflowNode = storedStable.rows.find((row) => {
      const projection = (row.slots?.workflow_write_projection ?? null) as Record<string, unknown> | null;
      return projection?.auto_promoted === true;
    }) ?? null;
    assert.ok(stableWorkflowNode);
    const stableProjection = (stableWorkflowNode.slots?.workflow_write_projection ?? {}) as Record<string, any>;
    const workflowPreview = ((stableProjection.governance_preview ?? {}) as Record<string, any>).promote_memory as Record<string, any> | undefined;
    assert.equal(workflowPreview?.review_result?.adjudication?.reason, "benchmark custom promote_memory client");
    assert.equal(workflowPreview?.policy_effect?.applies, true);
    assert.equal(stableProjection.governed_promotion_state_override, "stable");
    assertions.push(pass("workflow runtime path uses custom model client replacement"));

    const toolRuleNodeIds = await seedActiveToolRules(runtimeWriteStore, ["edit", "edit"]);
    const toolsSelectRes = await runtimeApp.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: {
        tenant_id: "default",
        scope: "default",
        run_id: "custom-client-tools-run",
        context: {
          task_kind: "repair_export",
          goal: "repair export failure in node tests",
          error: {
            signature: "node-export-mismatch",
          },
        },
        candidates: ["bash", "edit", "test"],
        include_shadow: false,
        rules_limit: 20,
        strict: true,
        reorder_candidates: false,
      },
    });
    assert.equal(toolsSelectRes.statusCode, 200);
    const toolsSelection = ToolsSelectRouteContractSchema.parse(toolsSelectRes.json());
    const toolsFeedbackRes = await runtimeApp.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: {
        tenant_id: "default",
        scope: "default",
        actor: "local-user",
        run_id: "custom-client-tools-run",
        decision_id: toolsSelection.decision.decision_id,
        outcome: "positive",
        context: {
          task_kind: "repair_export",
          goal: "repair export failure in node tests",
          error: {
            signature: "node-export-mismatch",
          },
        },
        candidates: ["bash", "edit", "test"],
        selected_tool: "edit",
        target: "tool",
        note: "Custom client grouped evidence benchmark",
        input_text: "repair export failure in node tests",
      },
    });
    assert.equal(toolsFeedbackRes.statusCode, 200);
    const toolsFeedback = ToolsFeedbackResponseSchema.parse(toolsFeedbackRes.json());
    assert.equal(toolsFeedback.governance_preview?.form_pattern.review_result?.adjudication.reason, "benchmark custom form_pattern client");
    assert.equal(toolsFeedback.governance_preview?.form_pattern.policy_effect?.applies, true);
    assert.equal(toolsFeedback.pattern_anchor?.pattern_state, "stable");
    assert.equal(toolsFeedback.pattern_anchor?.credibility_state, "trusted");
    assertions.push(pass("tools runtime path uses custom model client replacement"));

    for (const ruleNodeId of toolRuleNodeIds) {
      await runtimeWriteStore.withTx(() =>
        updateRuleState(
          {} as any,
          {
            tenant_id: "default",
            scope: "default",
            actor: "local-user",
            rule_node_id: ruleNodeId,
            state: "disabled",
            input_text: "disable custom client benchmark tool source rules",
          },
          "default",
          "default",
          { liteWriteStore: runtimeWriteStore },
        ),
      );
    }

    const replayPlaybookId = randomUUID();
    await seedPendingReplayBenchmarkPlaybook({
      liteWriteStore: replayWriteStore,
      liteReplayStore: replayStore,
      playbookId: replayPlaybookId,
      workflowSignature: "wf:replay:custom-client-export-fix",
    });
    registerReplayBenchmarkApp({
      app: replayApp,
      liteWriteStore: replayWriteStore,
      liteReplayStore: replayStore,
      liteRecallStore: replayRecallStore,
      envOverrides: {
        REPLAY_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED: true,
      },
      governanceRuntimeProviderBuilderOptions: {
        modelClientFactory: customFactory,
        modelClientModes: {
          replayRepairReview: {
            promote_memory: "custom",
          },
        },
      },
    });

    const replayReviewRes = await replayApp.inject({
      method: "POST",
      url: "/v1/memory/replay/playbooks/repair/review",
      payload: {
        tenant_id: "default",
        scope: "default",
        playbook_id: replayPlaybookId,
        action: "approve",
        auto_shadow_validate: false,
        target_status_on_approve: "shadow",
        learning_projection: {
          enabled: true,
        },
      },
    });
    assert.equal(replayReviewRes.statusCode, 200);
    const replayReview = ReplayPlaybookRepairReviewResponseSchema.parse(replayReviewRes.json());
    assert.equal(replayReview.governance_preview?.promote_memory.review_result?.adjudication.reason, "benchmark custom promote_memory client");
    assert.equal(replayReview.learning_projection_result.status, "applied");
    assert.equal(replayReview.learning_projection_result.rule_state, "shadow");
    assertions.push(pass("replay runtime path uses custom model client replacement"));

    return {
      assertions,
      metrics: {
        workflow_custom_reason: workflowPreview?.review_result?.adjudication?.reason ?? null,
        workflow_governed_state: stableProjection.governed_promotion_state_override ?? null,
        tools_custom_reason: toolsFeedback.governance_preview?.form_pattern.review_result?.adjudication.reason ?? null,
        tools_pattern_state: toolsFeedback.pattern_anchor?.pattern_state ?? null,
        replay_custom_reason: replayReview.governance_preview?.promote_memory.review_result?.adjudication.reason ?? null,
        replay_learning_rule_state: replayReview.learning_projection_result.rule_state ?? null,
      },
      notes: [
        "Measures whether workflow runtime wiring honors a custom modelClientFactory replacement.",
        "Measures whether tools runtime wiring honors a custom modelClientFactory replacement.",
        "Measures whether replay runtime wiring honors a custom modelClientFactory replacement.",
      ],
    };
  } finally {
    await runtimeApp.close();
    await replayApp.close();
    await runtimeWriteStore.close();
    await replayWriteStore.close();
  }
}

async function runHttpModelClientRuntimeLoop(): Promise<Omit<BenchmarkScenarioResult, "id" | "title" | "status" | "duration_ms">> {
  return await withBenchmarkGovernanceChatStub(async ({ baseUrl, apiKey, model }) => {
    const runtimeDbPath = tmpDbPath("http-model-client-runtime");
    const runtimeApp = Fastify();
    const runtimeWriteStore = createLiteWriteStore(runtimeDbPath);
    const runtimeRecallStore = createLiteRecallStore(runtimeDbPath);

    const replayWriteDbPath = tmpDbPath("http-model-client-replay-write");
    const replayDbPath = tmpDbPath("http-model-client-replay-store");
    const replayApp = Fastify();
    const replayWriteStore = createLiteWriteStore(replayWriteDbPath);
    const replayStore = createLiteReplayStore(replayDbPath);
    const replayRecallStore = createLiteRecallStore(replayWriteDbPath);

    const assertions: AssertionResult[] = [];
    try {
      registerBenchmarkApp({
        app: runtimeApp,
        liteWriteStore: runtimeWriteStore,
        liteRecallStore: runtimeRecallStore,
        governanceRuntimeProviderBuilderOptions: {
          httpClientConfig: {
            baseUrl,
            apiKey,
            model,
            timeoutMs: 2000,
            maxTokens: 300,
            temperature: 0,
          },
          modelClientModes: {
            workflowProjection: {
              promote_memory: "http",
            },
            toolsFeedback: {
              form_pattern: "http",
            },
          },
        },
      });

      const taskBrief = "Fix export failure in node tests";
      const filePath = "src/routes/export.ts";

      const firstWrite = await runtimeApp.inject({
        method: "POST",
        url: "/v1/memory/write",
        payload: buildBenchmarkWritePayload({
          eventId: randomUUID(),
          title: "HTTP client inspect export path",
          inputText: "http client benchmark first continuity write",
          taskBrief,
          stateId: `state:${randomUUID()}`,
          filePath,
        }),
      });
      assert.equal(firstWrite.statusCode, 200);

      const secondWrite = await runtimeApp.inject({
        method: "POST",
        url: "/v1/memory/write",
        payload: buildBenchmarkWritePayload({
          eventId: randomUUID(),
          title: "HTTP client patch export path",
          inputText: "http client benchmark second continuity write",
          taskBrief,
          stateId: `state:${randomUUID()}`,
          filePath,
        }),
      });
      assert.equal(secondWrite.statusCode, 200);

      const storedStable = await runtimeWriteStore.findNodes({
        scope: "default",
        type: "procedure",
        slotsContains: {
          summary_kind: "workflow_anchor",
        },
        consumerAgentId: "local-user",
        consumerTeamId: null,
        limit: 20,
        offset: 0,
      });
      const stableWorkflowNode = storedStable.rows.find((row) => {
        const projection = (row.slots?.workflow_write_projection ?? null) as Record<string, unknown> | null;
        return projection?.auto_promoted === true;
      }) ?? null;
      assert.ok(stableWorkflowNode);
      const stableProjection = (stableWorkflowNode.slots?.workflow_write_projection ?? {}) as Record<string, any>;
      const workflowPreview = ((stableProjection.governance_preview ?? {}) as Record<string, any>).promote_memory as Record<string, any> | undefined;
      const workflowPacket = workflowPreview?.review_packet as Record<string, any> | undefined;
      assert.equal(workflowPreview?.review_result?.adjudication?.reason, "benchmark http promote_memory client");
      assert.equal(stableProjection.governed_promotion_state_override, "stable");
      assertions.push(pass("workflow runtime path uses http model client"));

      const toolRuleNodeIds = await seedActiveToolRules(runtimeWriteStore, ["edit", "edit"]);
      const toolsSelectRes = await runtimeApp.inject({
        method: "POST",
        url: "/v1/memory/tools/select",
        payload: {
          tenant_id: "default",
          scope: "default",
          run_id: "http-client-tools-run",
          context: {
            task_kind: "repair_export",
            goal: "repair export failure in node tests",
            error: {
              signature: "node-export-mismatch",
            },
          },
          candidates: ["bash", "edit", "test"],
          include_shadow: false,
          rules_limit: 20,
          strict: true,
          reorder_candidates: false,
        },
      });
      assert.equal(toolsSelectRes.statusCode, 200);
      const toolsSelection = ToolsSelectRouteContractSchema.parse(toolsSelectRes.json());
      const toolsFeedbackRes = await runtimeApp.inject({
        method: "POST",
        url: "/v1/memory/tools/feedback",
        payload: {
          tenant_id: "default",
          scope: "default",
          actor: "local-user",
          run_id: "http-client-tools-run",
          decision_id: toolsSelection.decision.decision_id,
          outcome: "positive",
          context: {
            task_kind: "repair_export",
            goal: "repair export failure in node tests",
            error: {
              signature: "node-export-mismatch",
            },
          },
          candidates: ["bash", "edit", "test"],
          selected_tool: "edit",
          target: "tool",
          note: "HTTP client grouped evidence benchmark",
          input_text: "repair export failure in node tests",
        },
      });
      assert.equal(toolsFeedbackRes.statusCode, 200);
      const toolsFeedback = ToolsFeedbackResponseSchema.parse(toolsFeedbackRes.json());
      assert.equal(toolsFeedback.governance_preview?.form_pattern.review_result?.adjudication.reason, "benchmark http form_pattern client");
      assert.equal(toolsFeedback.pattern_anchor?.pattern_state, "stable");
      assertions.push(pass("tools runtime path uses http model client"));

      for (const ruleNodeId of toolRuleNodeIds) {
        await runtimeWriteStore.withTx(() =>
          updateRuleState(
            {} as any,
            {
              tenant_id: "default",
              scope: "default",
              actor: "local-user",
              rule_node_id: ruleNodeId,
              state: "disabled",
              input_text: "disable http client benchmark tool source rules",
            },
            "default",
            "default",
            { liteWriteStore: runtimeWriteStore },
          ),
        );
      }

      const replayPlaybookId = randomUUID();
      await seedPendingReplayBenchmarkPlaybook({
        liteWriteStore: replayWriteStore,
        liteReplayStore: replayStore,
        playbookId: replayPlaybookId,
        workflowSignature: "wf:replay:http-client-export-fix",
      });
      registerReplayBenchmarkApp({
        app: replayApp,
        liteWriteStore: replayWriteStore,
        liteReplayStore: replayStore,
        liteRecallStore: replayRecallStore,
        governanceRuntimeProviderBuilderOptions: {
          httpClientConfig: {
            baseUrl,
            apiKey,
            model,
            timeoutMs: 2000,
            maxTokens: 300,
            temperature: 0,
          },
          modelClientModes: {
            replayRepairReview: {
              promote_memory: "http",
            },
          },
        },
      });

      const replayReviewRes = await replayApp.inject({
        method: "POST",
        url: "/v1/memory/replay/playbooks/repair/review",
        payload: {
          tenant_id: "default",
          scope: "default",
          playbook_id: replayPlaybookId,
          action: "approve",
          auto_shadow_validate: false,
          target_status_on_approve: "shadow",
          learning_projection: {
            enabled: true,
          },
        },
      });
      assert.equal(replayReviewRes.statusCode, 200);
      const replayReview = ReplayPlaybookRepairReviewResponseSchema.parse(replayReviewRes.json());
      assert.equal(replayReview.governance_preview?.promote_memory.review_result?.adjudication.reason, "benchmark http promote_memory client");
      assert.equal(replayReview.learning_projection_result.rule_state, "shadow");
      assertions.push(pass("replay runtime path uses http model client"));

      return {
        assertions,
        metrics: {
          workflow_http_reason: workflowPreview?.review_result?.adjudication?.reason ?? null,
          workflow_governed_state: stableProjection.governed_promotion_state_override ?? null,
          tools_http_reason: toolsFeedback.governance_preview?.form_pattern.review_result?.adjudication.reason ?? null,
          tools_pattern_state: toolsFeedback.pattern_anchor?.pattern_state ?? null,
          replay_http_reason: replayReview.governance_preview?.promote_memory.review_result?.adjudication.reason ?? null,
          replay_learning_rule_state: replayReview.learning_projection_result.rule_state ?? null,
        },
        notes: [
          "Measures whether workflow runtime wiring honors an HTTP model-backed governance client.",
          "Measures whether tools runtime wiring honors an HTTP model-backed governance client.",
          "Measures whether replay runtime wiring honors an HTTP model-backed governance client.",
        ],
      };
    } finally {
      await runtimeApp.close();
      await replayApp.close();
      await runtimeWriteStore.close();
      await replayWriteStore.close();
    }
  });
}

async function runHttpModelClientShadowCompareRuntimeLoop(
  externalConfig?: GovernanceHttpModelClientConfig | null,
): Promise<Omit<BenchmarkScenarioResult, "id" | "title" | "status" | "duration_ms">> {
  async function runOneSide(args: {
    mode: "baseline" | "http";
    httpConfig?: GovernanceHttpModelClientConfig;
  }) {
    const runtimeDbPath = tmpDbPath(`http-shadow-${args.mode}-runtime`);
    const runtimeApp = Fastify();
    const runtimeWriteStore = createLiteWriteStore(runtimeDbPath);
    const runtimeRecallStore = createLiteRecallStore(runtimeDbPath);

    const replayWriteDbPath = tmpDbPath(`http-shadow-${args.mode}-replay-write`);
    const replayDbPath = tmpDbPath(`http-shadow-${args.mode}-replay-store`);
    const replayApp = Fastify();
    const replayWriteStore = createLiteWriteStore(replayWriteDbPath);
    const replayStore = createLiteReplayStore(replayDbPath);
    const replayRecallStore = createLiteRecallStore(replayWriteDbPath);

    try {
      registerBenchmarkApp({
        app: runtimeApp,
        liteWriteStore: runtimeWriteStore,
        liteRecallStore: runtimeRecallStore,
        envOverrides:
          args.mode === "baseline"
            ? {
                WORKFLOW_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED: true,
                TOOLS_GOVERNANCE_STATIC_FORM_PATTERN_PROVIDER_ENABLED: true,
              }
            : undefined,
        governanceRuntimeProviderBuilderOptions:
          args.mode === "http"
            && args.httpConfig
            ? {
                httpClientConfig: args.httpConfig,
                modelClientModes: {
                  workflowProjection: {
                    promote_memory: "http",
                  },
                  toolsFeedback: {
                    form_pattern: "http",
                  },
                },
              }
            : undefined,
      });

      const taskBrief = "Fix export failure in node tests";
      const filePath = "src/routes/export.ts";

      const firstWrite = await runtimeApp.inject({
        method: "POST",
        url: "/v1/memory/write",
        payload: buildBenchmarkWritePayload({
          eventId: randomUUID(),
          title: `${args.mode} compare inspect export path`,
          inputText: `${args.mode} compare first continuity write`,
          taskBrief,
          stateId: `state:${randomUUID()}`,
          filePath,
        }),
      });
      assert.equal(firstWrite.statusCode, 200);

      const secondWrite = await runtimeApp.inject({
        method: "POST",
        url: "/v1/memory/write",
        payload: buildBenchmarkWritePayload({
          eventId: randomUUID(),
          title: `${args.mode} compare patch export path`,
          inputText: `${args.mode} compare second continuity write`,
          taskBrief,
          stateId: `state:${randomUUID()}`,
          filePath,
        }),
      });
      assert.equal(secondWrite.statusCode, 200);

      const storedStable = await runtimeWriteStore.findNodes({
        scope: "default",
        type: "procedure",
        slotsContains: {
          summary_kind: "workflow_anchor",
        },
        consumerAgentId: "local-user",
        consumerTeamId: null,
        limit: 20,
        offset: 0,
      });
      const stableWorkflowNode = storedStable.rows.find((row) => {
        const projection = (row.slots?.workflow_write_projection ?? null) as Record<string, unknown> | null;
        return projection?.auto_promoted === true;
      }) ?? null;
      assert.ok(stableWorkflowNode);
      const stableProjection = (stableWorkflowNode.slots?.workflow_write_projection ?? {}) as Record<string, any>;
      const workflowPreview = ((stableProjection.governance_preview ?? {}) as Record<string, any>).promote_memory as Record<string, any> | undefined;
      const workflowPacket = workflowPreview?.review_packet as Record<string, any> | undefined;

      const toolRuleNodeIds = await seedActiveToolRules(runtimeWriteStore, ["edit", "edit"]);
      const toolsSelectRes = await runtimeApp.inject({
        method: "POST",
        url: "/v1/memory/tools/select",
        payload: {
          tenant_id: "default",
          scope: "default",
          run_id: `${args.mode}-shadow-tools-run`,
          context: {
            task_kind: "repair_export",
            goal: "repair export failure in node tests",
            error: {
              signature: "node-export-mismatch",
            },
          },
          candidates: ["bash", "edit", "test"],
          include_shadow: false,
          rules_limit: 20,
          strict: true,
          reorder_candidates: false,
        },
      });
      assert.equal(toolsSelectRes.statusCode, 200);
      const toolsSelection = ToolsSelectRouteContractSchema.parse(toolsSelectRes.json());
      const toolsFeedbackRes = await runtimeApp.inject({
        method: "POST",
        url: "/v1/memory/tools/feedback",
        payload: {
          tenant_id: "default",
          scope: "default",
          actor: "local-user",
          run_id: `${args.mode}-shadow-tools-run`,
          decision_id: toolsSelection.decision.decision_id,
          outcome: "positive",
          context: {
            task_kind: "repair_export",
            goal: "repair export failure in node tests",
            error: {
              signature: "node-export-mismatch",
            },
          },
          candidates: ["bash", "edit", "test"],
          selected_tool: "edit",
          target: "tool",
          note: `${args.mode} shadow compare grouped evidence`,
          input_text: "repair export failure in node tests",
        },
      });
      assert.equal(toolsFeedbackRes.statusCode, 200);
      const toolsFeedback = ToolsFeedbackResponseSchema.parse(toolsFeedbackRes.json());

      for (const ruleNodeId of toolRuleNodeIds) {
        await runtimeWriteStore.withTx(() =>
          updateRuleState(
            {} as any,
            {
              tenant_id: "default",
              scope: "default",
              actor: "local-user",
              rule_node_id: ruleNodeId,
              state: "disabled",
              input_text: `disable ${args.mode} shadow compare tool source rules`,
            },
            "default",
            "default",
            { liteWriteStore: runtimeWriteStore },
          ),
        );
      }

      const replayPlaybookId = randomUUID();
      await seedPendingReplayBenchmarkPlaybook({
        liteWriteStore: replayWriteStore,
        liteReplayStore: replayStore,
        playbookId: replayPlaybookId,
        workflowSignature: `wf:replay:${args.mode}:shadow-compare-export-fix`,
      });
      registerReplayBenchmarkApp({
        app: replayApp,
        liteWriteStore: replayWriteStore,
        liteReplayStore: replayStore,
        liteRecallStore: replayRecallStore,
        envOverrides:
          args.mode === "baseline"
            ? {
                REPLAY_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED: true,
              }
            : undefined,
        governanceRuntimeProviderBuilderOptions:
          args.mode === "http"
            && args.httpConfig
            ? {
                httpClientConfig: args.httpConfig,
                modelClientModes: {
                  replayRepairReview: {
                    promote_memory: "http",
                  },
                },
              }
            : undefined,
      });

      const replayReviewRes = await replayApp.inject({
        method: "POST",
        url: "/v1/memory/replay/playbooks/repair/review",
        payload: {
          tenant_id: "default",
          scope: "default",
          playbook_id: replayPlaybookId,
          action: "approve",
          auto_shadow_validate: false,
          target_status_on_approve: "shadow",
          learning_projection: {
            enabled: true,
          },
        },
      });
      assert.equal(replayReviewRes.statusCode, 200);
      const replayReview = ReplayPlaybookRepairReviewResponseSchema.parse(replayReviewRes.json());

      return {
        workflowState: stableProjection.governed_promotion_state_override ?? null,
        workflowReason: workflowPreview?.review_result?.adjudication?.reason ?? null,
        workflowConfidence: workflowPreview?.review_result?.adjudication?.confidence ?? null,
        workflowStrategicValue: workflowPreview?.review_result?.adjudication?.strategic_value ?? null,
        workflowPacketGateSatisfied: workflowPacket?.deterministic_gate?.gate_satisfied ?? null,
        workflowPacketTargetKind: workflowPacket?.requested_target_kind ?? null,
        workflowPacketTargetLevel: workflowPacket?.requested_target_level ?? null,
        workflowPacketCandidateExampleCount: Array.isArray(workflowPacket?.candidate_examples)
          ? workflowPacket.candidate_examples.length
          : null,
        workflowPacketHasSignature: Array.isArray(workflowPacket?.candidate_examples)
          ? workflowPacket.candidate_examples.some((example: Record<string, unknown>) =>
              typeof example?.workflow_signature === "string" && example.workflow_signature.trim().length > 0
            )
          : null,
        toolsState: toolsFeedback.pattern_anchor?.pattern_state ?? null,
        toolsReason: toolsFeedback.governance_preview?.form_pattern.review_result?.adjudication.reason ?? null,
        toolsConfidence: toolsFeedback.governance_preview?.form_pattern.review_result?.adjudication.confidence ?? null,
        toolsStrategicValue: toolsFeedback.governance_preview?.form_pattern.review_result?.adjudication.strategic_value ?? null,
        replayState: replayReview.learning_projection_result.rule_state ?? null,
        replayReason: replayReview.governance_preview?.promote_memory.review_result?.adjudication.reason ?? null,
        replayConfidence: replayReview.governance_preview?.promote_memory.review_result?.adjudication.confidence ?? null,
        replayStrategicValue: replayReview.governance_preview?.promote_memory.review_result?.adjudication.strategic_value ?? null,
      };
    } finally {
      await runtimeApp.close();
      await replayApp.close();
      await runtimeWriteStore.close();
      await replayWriteStore.close();
    }
  }

  async function runCompare(config: GovernanceHttpModelClientConfig, backendKind: "stub" | "external") {
    const baseline = await runOneSide({ mode: "baseline" });
    const http = await runOneSide({
      mode: "http",
      httpConfig: config,
    });

    const assertions: AssertionResult[] = [];
    const compareSnapshot = JSON.stringify({ baseline, http }, null, 2);
    assert.equal(http.workflowState, baseline.workflowState, compareSnapshot);
    assertions.push(pass("http workflow path preserves governed workflow outcome against builtin/static baseline"));
    assert.equal(http.toolsState, baseline.toolsState, compareSnapshot);
    assertions.push(pass("http tools path preserves governed pattern outcome against builtin/static baseline"));
    assert.equal(http.replayState, baseline.replayState, compareSnapshot);
    assertions.push(pass("http replay path preserves governed replay outcome against builtin/static baseline"));

    return {
      assertions,
      metrics: {
        backend_kind: backendKind,
        backend_base_url: config.baseUrl,
        backend_model: config.model,
        backend_transport: config.transport ?? null,
        workflow_state_match: http.workflowState === baseline.workflowState,
        workflow_baseline_state: baseline.workflowState,
        workflow_http_state: http.workflowState,
        workflow_reason_changed: http.workflowReason !== baseline.workflowReason,
        tools_state_match: http.toolsState === baseline.toolsState,
        tools_baseline_state: baseline.toolsState,
        tools_http_state: http.toolsState,
        tools_reason_changed: http.toolsReason !== baseline.toolsReason,
        replay_state_match: http.replayState === baseline.replayState,
        replay_baseline_state: baseline.replayState,
        replay_http_state: http.replayState,
        replay_reason_changed: http.replayReason !== baseline.replayReason,
      },
      notes: [
        "Measures whether the HTTP governance model-client path preserves the same workflow outcome as the builtin/static governance baseline.",
        "Measures whether the HTTP governance model-client path preserves the same tools pattern outcome as the builtin/static governance baseline.",
        "Measures whether the HTTP governance model-client path preserves the same replay-learning outcome as the builtin/static governance baseline.",
      ],
    };
  }

  if (externalConfig) {
    return await runCompare(externalConfig, "external");
  }

  return await withBenchmarkGovernanceChatStub(async ({ baseUrl, apiKey, model }) =>
    await runCompare({
      baseUrl,
      apiKey,
      model,
      timeoutMs: 2000,
      maxTokens: 300,
      temperature: 0,
    }, "stub")
  );
}

function printHuman(result: BenchmarkSuiteResult) {
  const lines: string[] = [];
  lines.push("Aionis Real-Task Benchmark Suite");
  lines.push(`Generated: ${result.generated_at}`);
  lines.push(`Overall: ${result.overall_status.toUpperCase()}`);
  lines.push(`Suite score: ${result.suite_summary.score_pct}% (${result.suite_summary.passed_scenarios}/${result.suite_summary.total_scenarios} scenarios passed)`);
  if (result.compare_summary) {
    lines.push(
      `Baseline compare: ${result.compare_summary.baseline_score_pct == null ? "none" : `${result.compare_summary.baseline_score_pct}%`} -> ${result.suite_summary.score_pct}%` +
        `${result.compare_summary.score_delta_pct == null ? "" : ` (delta ${result.compare_summary.score_delta_pct >= 0 ? "+" : ""}${result.compare_summary.score_delta_pct})`}`,
    );
    lines.push(
      `Profile drift: ${result.compare_summary.changed_profile_keys.length === 0 ? "none" : result.compare_summary.changed_profile_keys.join(", ")}`,
    );
    lines.push(
      `Hard profile drift (${result.compare_summary.profile_policy_version}): ${result.compare_summary.hard_changed_profile_keys.length === 0 ? "none" : result.compare_summary.hard_changed_profile_keys.join(", ")}`,
    );
    lines.push(
      `Soft profile drift (${result.compare_summary.profile_policy_version}): ${result.compare_summary.soft_changed_profile_keys.length === 0 ? "none" : result.compare_summary.soft_changed_profile_keys.join(", ")}`,
    );
  }
  lines.push("Suite profile:");
  for (const [key, value] of flattenProfile(result.suite_profile as Record<string, unknown>)) {
    lines.push(`- ${key}: ${JSON.stringify(value)}`);
  }
  lines.push("");
  for (const scenario of result.scenarios) {
    lines.push(`${scenario.status === "pass" ? "PASS" : "FAIL"} ${scenario.id} (${scenario.duration_ms}ms)`);
    lines.push(`Title: ${scenario.title}`);
    lines.push(`Score: ${scenario.score_pct}% (${scenario.pass_criteria_summary})`);
    if (scenario.compare_summary) {
      lines.push(
        `Baseline: ${scenario.compare_summary.baseline_status}` +
          `${scenario.compare_summary.baseline_score_pct == null ? "" : ` @ ${scenario.compare_summary.baseline_score_pct}%`}` +
          `${scenario.compare_summary.score_delta_pct == null ? "" : ` (delta ${scenario.compare_summary.score_delta_pct >= 0 ? "+" : ""}${scenario.compare_summary.score_delta_pct})`}`,
      );
    }
    if (scenario.error) {
      lines.push(`Error: ${scenario.error}`);
    }
    for (const assertion of scenario.assertions) {
      lines.push(`- ${assertion.status.toUpperCase()} ${assertion.name}${assertion.detail ? `: ${assertion.detail}` : ""}`);
    }
    const metricEntries = Object.entries(scenario.metrics);
    if (metricEntries.length > 0) {
      lines.push("Metrics:");
      for (const [key, value] of metricEntries) {
        lines.push(`- ${key}: ${JSON.stringify(value)}`);
      }
    }
    if (scenario.notes.length > 0) {
      lines.push("Notes:");
      for (const note of scenario.notes) {
        lines.push(`- ${note}`);
      }
    }
    lines.push("");
  }
  console.log(lines.join("\n"));
}

function toMarkdown(result: BenchmarkSuiteResult): string {
  const lines: string[] = [];
  lines.push("# Aionis Real-Task Benchmark Report");
  lines.push("");
  lines.push(`Generated: \`${result.generated_at}\``);
  lines.push("");
  lines.push(`Overall status: \`${result.overall_status}\``);
  lines.push(`Suite score: \`${result.suite_summary.score_pct}%\` (\`${result.suite_summary.passed_scenarios}/${result.suite_summary.total_scenarios}\` scenarios passed)`);
  if (result.compare_summary) {
    lines.push(
      `Baseline compare: \`${result.compare_summary.baseline_score_pct == null ? "none" : `${result.compare_summary.baseline_score_pct}%`}\` -> \`${result.suite_summary.score_pct}%\`` +
        `${result.compare_summary.score_delta_pct == null ? "" : ` (delta \`${result.compare_summary.score_delta_pct >= 0 ? "+" : ""}${result.compare_summary.score_delta_pct}\`)`}`,
    );
    lines.push(`Profile drift: \`${result.compare_summary.changed_profile_keys.length === 0 ? "none" : result.compare_summary.changed_profile_keys.join(", ")}\``);
    lines.push(`Hard profile drift (${result.compare_summary.profile_policy_version}): \`${result.compare_summary.hard_changed_profile_keys.length === 0 ? "none" : result.compare_summary.hard_changed_profile_keys.join(", ")}\``);
    lines.push(`Soft profile drift (${result.compare_summary.profile_policy_version}): \`${result.compare_summary.soft_changed_profile_keys.length === 0 ? "none" : result.compare_summary.soft_changed_profile_keys.join(", ")}\``);
  }
  lines.push("");
  lines.push("Suite profile:");
  lines.push("");
  for (const [key, value] of flattenProfile(result.suite_profile as Record<string, unknown>)) {
    lines.push(`- \`${key}\`: \`${JSON.stringify(value)}\``);
  }
  lines.push("");
  for (const scenario of result.scenarios) {
    lines.push(`## ${scenario.id}`);
    lines.push("");
    lines.push(`${scenario.title}`);
    lines.push("");
    lines.push(`- status: \`${scenario.status}\``);
    lines.push(`- duration_ms: \`${scenario.duration_ms}\``);
    lines.push(`- score_pct: \`${scenario.score_pct}\``);
    lines.push(`- pass_criteria_summary: \`${scenario.pass_criteria_summary}\``);
    if (scenario.compare_summary) {
      lines.push(`- baseline_status: \`${scenario.compare_summary.baseline_status}\``);
      lines.push(`- baseline_score_pct: \`${scenario.compare_summary.baseline_score_pct}\``);
      lines.push(`- score_delta_pct: \`${scenario.compare_summary.score_delta_pct}\``);
      lines.push(`- status_changed: \`${scenario.compare_summary.status_changed}\``);
    }
    if (scenario.error) {
      lines.push(`- error: \`${scenario.error.replace(/\n/g, " ")}\``);
    }
    if (scenario.assertions.length > 0) {
      lines.push("");
      lines.push("Assertions:");
      lines.push("");
      for (const assertion of scenario.assertions) {
        lines.push(`- ${assertion.status}: ${assertion.name}${assertion.detail ? ` — ${assertion.detail}` : ""}`);
      }
    }
    const metricEntries = Object.entries(scenario.metrics);
    if (metricEntries.length > 0) {
      lines.push("");
      lines.push("Metrics:");
      lines.push("");
      for (const [key, value] of metricEntries) {
        lines.push(`- \`${key}\`: \`${JSON.stringify(value)}\``);
      }
    }
    if (scenario.notes.length > 0) {
      lines.push("");
      lines.push("Notes:");
      lines.push("");
      for (const note of scenario.notes) {
        lines.push(`- ${note}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  const baseline = loadBaselineResult(cli.baselineJson);
  const externalHttpShadowConfig = resolveExternalHttpShadowConfig(cli);
  const scenarios = await Promise.all([
    runScenario("policy_learning_loop", "Policy learning from repeated tool feedback", runPolicyLearningLoop),
    runScenario("cross_task_isolation", "Cross-task isolation for learned pattern reuse", runCrossTaskIsolationLoop),
    runScenario("nearby_task_generalization", "Nearby-task generalization for trusted pattern reuse", runNearbyTaskGeneralizationLoop),
    runScenario("contested_revalidation_cost", "Revalidation cost after a contested pattern", runContestedRevalidationCostLoop),
    runScenario("wrong_turn_recovery", "Wrong-turn recovery after contested counter-evidence", runWrongTurnRecoveryLoop),
    runScenario("workflow_progression_loop", "Workflow guidance from repeated execution continuity", runWorkflowProgressionLoop),
    runScenario("multi_step_repair_loop", "Multi-step repair continuity with stable workflow carry-forward", runMultiStepRepairLoop),
    runScenario("governed_learning_runtime_loop", "Governed learning through provider-backed runtime paths", runGovernedLearningRuntimeLoop),
    runScenario("governed_replay_runtime_loop", "Replay-governed learning through provider-backed repair review", runGovernedReplayRuntimeLoop),
    runScenario("governance_provider_precedence_runtime_loop", "Explicit governance review precedence over provider fallback", runGovernanceProviderPrecedenceRuntimeLoop),
    runScenario("custom_model_client_runtime_loop", "Custom model-client replacement through live runtime paths", runCustomModelClientRuntimeLoop),
    runScenario("http_model_client_runtime_loop", "HTTP model-client replacement through live runtime paths", runHttpModelClientRuntimeLoop),
    runScenario(
      "http_model_client_shadow_compare_runtime_loop",
      externalHttpShadowConfig
        ? "HTTP model-client shadow compare against builtin/static governance (external backend)"
        : "HTTP model-client shadow compare against builtin/static governance",
      async () => await runHttpModelClientShadowCompareRuntimeLoop(externalHttpShadowConfig),
    ),
    runScenario("slim_surface_boundary", "Slim planner/context default surface", runSlimSurfaceBoundary),
  ]);
  const rawResult: BenchmarkSuiteResult = {
    generated_at: new Date().toISOString(),
    overall_status: scenarios.every((scenario) => scenario.status === "pass") ? "pass" : "fail",
    suite_summary: {
      passed_scenarios: scenarios.filter((scenario) => scenario.status === "pass").length,
      total_scenarios: scenarios.length,
      score_pct: scenarios.length === 0 ? 0 : Math.round((scenarios.filter((scenario) => scenario.status === "pass").length / scenarios.length) * 100),
    },
    suite_profile: buildSuiteProfile(scenarios),
    scenarios,
  };
  const result = applyBaselineComparison(rawResult, baseline);
  const regressionGate = evaluateRegressionGate({
    result,
    options: cli,
  });

  if (cli.outJson) {
    ensureParentDir(cli.outJson);
    fs.writeFileSync(cli.outJson, JSON.stringify(result, null, 2));
  }
  if (cli.outMarkdown) {
    ensureParentDir(cli.outMarkdown);
    fs.writeFileSync(cli.outMarkdown, `${toMarkdown(result)}\n`);
  }

  if (cli.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }

  if (result.overall_status !== "pass") {
    process.exitCode = 1;
  }
  if (regressionGate && !regressionGate.ok) {
    for (const reason of regressionGate.reasons) {
      console.error(`Regression gate failed: ${reason}`);
    }
    process.exitCode = 1;
  }
}

await main();
