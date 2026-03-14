import type { Env } from "../config.js";
import type { EmbeddingSurfacePolicy } from "../embeddings/surface-policy.js";
import { buildReplayLearningProjectionDefaults } from "../memory/replay-learning.js";
import { createSandboxSession, enqueueSandboxRun, getSandboxRun } from "../memory/sandbox.js";
import { HttpError } from "../util/http.js";

type StoreLike = {
  withTx: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
  withClient: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
};

type SandboxExecutorLike = {
  enqueue: (runId: string) => void;
  executeSync: (runId: string) => Promise<void>;
};

function createSandboxRunExecutor(args: {
  env: Env;
  store: StoreLike;
  sandboxExecutor: SandboxExecutorLike;
  source: string;
}) {
  const { env, store, sandboxExecutor, source } = args;
  return async (input: {
    tenant_id: string;
    scope: string;
    project_id?: string | null;
    argv: string[];
    timeout_ms: number;
    mode: "sync" | "async";
    metadata?: Record<string, unknown>;
  }) => {
    if (!env.SANDBOX_ENABLED) {
      return {
        ok: false,
        status: "failed",
        stdout: "",
        stderr: "",
        exit_code: null,
        error: "sandbox_disabled",
        run_id: null,
      };
    }
    const sandboxMode = input.mode === "async" ? "async" : "sync";
    const sessionOut = await store.withTx((client) =>
      createSandboxSession(
        client,
        {
          tenant_id: input.tenant_id,
          scope: input.scope,
          actor: source,
          profile: "restricted",
          ttl_seconds: 900,
          metadata: {
            source,
            ...(input.metadata ?? {}),
          },
        },
        {
          defaultScope: env.MEMORY_SCOPE,
          defaultTenantId: env.MEMORY_TENANT_ID,
        },
      ),
    );
    const queued = await store.withTx((client) =>
      enqueueSandboxRun(
        client,
        {
          tenant_id: input.tenant_id,
          scope: input.scope,
          project_id: input.project_id ?? undefined,
          actor: source,
          session_id: sessionOut.session.session_id,
          mode: sandboxMode,
          timeout_ms: input.timeout_ms,
          action: {
            kind: "command",
            argv: input.argv,
          },
          metadata: {
            source,
            ...(input.metadata ?? {}),
          },
        },
        {
          defaultScope: env.MEMORY_SCOPE,
          defaultTenantId: env.MEMORY_TENANT_ID,
          defaultTimeoutMs: env.SANDBOX_EXECUTOR_TIMEOUT_MS,
        },
      ),
    );
    if (sandboxMode === "async") {
      sandboxExecutor.enqueue(queued.run.run_id);
      return {
        ok: false,
        status: queued.run.status ?? "queued",
        stdout: "",
        stderr: "",
        exit_code: null,
        error: null,
        run_id: queued.run.run_id,
      };
    }

    await sandboxExecutor.executeSync(queued.run.run_id);
    const final = await store.withClient((client) =>
      getSandboxRun(
        client,
        {
          tenant_id: input.tenant_id,
          scope: input.scope,
          run_id: queued.run.run_id,
        },
        {
          defaultScope: env.MEMORY_SCOPE,
          defaultTenantId: env.MEMORY_TENANT_ID,
        },
      ),
    );
    return {
      ok: final.run.status === "succeeded",
      status: final.run.status,
      stdout: final.run.output?.stdout ?? "",
      stderr: final.run.output?.stderr ?? "",
      exit_code: Number.isFinite(final.run.exit_code ?? NaN) ? Number(final.run.exit_code) : null,
      error: final.run.error ? String(final.run.error) : null,
      run_id: final.run.run_id,
    };
  };
}

export function createReplayRuntimeOptionBuilders(args: {
  env: Env;
  store: StoreLike;
  embedder: any;
  embeddingSurfacePolicy?: EmbeddingSurfacePolicy;
  embeddedRuntime: any;
  liteReplayAccess?: any;
  liteReplayStore?: any;
  sandboxAllowedCommands: any;
  sandboxExecutor: SandboxExecutorLike;
  writeAccessShadowMirrorV2: boolean;
  enforceSandboxTenantBudget: (reply: any, tenantId: string, scope: string, projectId: string | null) => Promise<void>;
}) {
  const {
    env,
    store,
    embedder,
    embeddingSurfacePolicy,
    embeddedRuntime,
    liteReplayAccess,
    liteReplayStore,
    sandboxAllowedCommands,
    sandboxExecutor,
    writeAccessShadowMirrorV2,
    enforceSandboxTenantBudget,
  } = args;
  const writeEmbedder = embeddingSurfacePolicy?.providerFor("write_auto_embed", embedder) ?? embedder;

  function buildReplayRepairReviewOptions() {
    return {
      defaultScope: env.MEMORY_SCOPE,
      defaultTenantId: env.MEMORY_TENANT_ID,
      maxTextLen: env.MAX_TEXT_LEN,
      piiRedaction: env.PII_REDACTION,
      allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
      shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
      shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
      writeAccessShadowMirrorV2,
      embedder: writeEmbedder,
      embeddedRuntime,
      replayAccess: liteReplayAccess,
      replayMirror: liteReplayStore,
      localExecutor: {
        enabled: env.SANDBOX_ENABLED && env.SANDBOX_EXECUTOR_MODE === "local_process",
        mode: env.SANDBOX_ENABLED && env.SANDBOX_EXECUTOR_MODE === "local_process" ? "local_process" : "disabled",
        allowedCommands: sandboxAllowedCommands,
        workdir: env.SANDBOX_EXECUTOR_WORKDIR,
        timeoutMs: env.SANDBOX_EXECUTOR_TIMEOUT_MS,
        stdioMaxBytes: env.SANDBOX_STDIO_MAX_BYTES,
      },
      shadowValidationPolicy: {
        executeTimeoutMs: env.REPLAY_SHADOW_VALIDATE_EXECUTE_TIMEOUT_MS,
        executeStopOnFailure: env.REPLAY_SHADOW_VALIDATE_EXECUTE_STOP_ON_FAILURE,
        sandboxTimeoutMs: env.REPLAY_SHADOW_VALIDATE_SANDBOX_TIMEOUT_MS,
        sandboxStopOnFailure: env.REPLAY_SHADOW_VALIDATE_SANDBOX_STOP_ON_FAILURE,
      },
      learningProjectionDefaults: buildReplayLearningProjectionDefaults({
        enabled: env.REPLAY_LEARNING_PROJECTION_ENABLED,
        mode: env.REPLAY_LEARNING_PROJECTION_MODE,
        delivery: env.REPLAY_LEARNING_PROJECTION_DELIVERY,
        targetRuleState: env.REPLAY_LEARNING_TARGET_RULE_STATE,
        minTotalSteps: env.REPLAY_LEARNING_MIN_TOTAL_STEPS,
        minSuccessRatio: env.REPLAY_LEARNING_MIN_SUCCESS_RATIO,
        maxMatcherBytes: env.REPLAY_LEARNING_MAX_MATCHER_BYTES,
        maxToolPrefer: env.REPLAY_LEARNING_MAX_TOOL_PREFER,
        episodeTtlDays: env.EPISODE_GC_TTL_DAYS,
      }),
      sandboxValidationExecutor: createSandboxRunExecutor({
        env,
        store,
        sandboxExecutor,
        source: "replay_shadow_validation",
      }),
    };
  }

  function buildAutomationReplayRunOptions(reply: any, source: string) {
    const localExecutorMode = env.SANDBOX_ENABLED && env.SANDBOX_EXECUTOR_MODE === "local_process"
      ? "local_process" as const
      : "disabled" as const;
    return {
      defaultScope: env.MEMORY_SCOPE,
      defaultTenantId: env.MEMORY_TENANT_ID,
      embeddedRuntime,
      replayAccess: liteReplayAccess,
      writeOptions: {
        defaultScope: env.MEMORY_SCOPE,
        defaultTenantId: env.MEMORY_TENANT_ID,
        maxTextLen: env.MAX_TEXT_LEN,
        piiRedaction: env.PII_REDACTION,
        allowCrossScopeEdges: env.ALLOW_CROSS_SCOPE_EDGES,
        shadowDualWriteEnabled: env.MEMORY_SHADOW_DUAL_WRITE_ENABLED,
        shadowDualWriteStrict: env.MEMORY_SHADOW_DUAL_WRITE_STRICT,
        writeAccessShadowMirrorV2,
        embedder: writeEmbedder,
        embeddedRuntime,
        replayAccess: liteReplayAccess,
        replayMirror: liteReplayStore,
      },
      localExecutor: {
        enabled: env.SANDBOX_ENABLED && env.SANDBOX_EXECUTOR_MODE === "local_process",
        mode: localExecutorMode,
        allowedCommands: sandboxAllowedCommands,
        workdir: env.SANDBOX_EXECUTOR_WORKDIR,
        timeoutMs: env.SANDBOX_EXECUTOR_TIMEOUT_MS,
        stdioMaxBytes: env.SANDBOX_STDIO_MAX_BYTES,
      },
      guidedRepair: {
        strategy: env.REPLAY_GUIDED_REPAIR_STRATEGY,
        allowRequestBuiltinLlm: env.REPLAY_GUIDED_REPAIR_ALLOW_REQUEST_BUILTIN_LLM,
        maxErrorChars: env.REPLAY_GUIDED_REPAIR_MAX_ERROR_CHARS,
        httpEndpoint: env.REPLAY_GUIDED_REPAIR_HTTP_ENDPOINT,
        httpTimeoutMs: env.REPLAY_GUIDED_REPAIR_HTTP_TIMEOUT_MS,
        httpAuthToken: env.REPLAY_GUIDED_REPAIR_HTTP_AUTH_TOKEN,
        llmBaseUrl: env.REPLAY_GUIDED_REPAIR_LLM_BASE_URL,
        llmApiKey: env.REPLAY_GUIDED_REPAIR_LLM_API_KEY,
        llmModel: env.REPLAY_GUIDED_REPAIR_LLM_MODEL,
        llmTimeoutMs: env.REPLAY_GUIDED_REPAIR_LLM_TIMEOUT_MS,
        llmMaxTokens: env.REPLAY_GUIDED_REPAIR_LLM_MAX_TOKENS,
        llmTemperature: env.REPLAY_GUIDED_REPAIR_LLM_TEMPERATURE,
      },
      sandboxBudgetGuard: async (input: { tenant_id: string; scope: string; project_id: string | null }) => {
        await enforceSandboxTenantBudget(reply, input.tenant_id, input.scope, input.project_id);
      },
      sandboxExecutor: createSandboxRunExecutor({
        env,
        store,
        sandboxExecutor,
        source,
      }),
    };
  }

  function buildAutomationTestHook() {
    const raw = process.env.AUTOMATION_TEST_FAULT_INJECTION_JSON?.trim();
    if (!raw) return undefined;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined;
    }
    const byAction = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    return async (input: { action: string; stage: string; run_id?: string | null; node_id?: string | null }) => {
      const actionEntry = byAction[input.action];
      if (!actionEntry || typeof actionEntry !== "object" || Array.isArray(actionEntry)) return;
      const expectedStage = typeof (actionEntry as Record<string, unknown>).stage === "string"
        ? String((actionEntry as Record<string, unknown>).stage)
        : null;
      if (expectedStage !== input.stage) return;
      throw new HttpError(500, "automation_injected_db_failure", "automation test hook injected db failure", {
        action: input.action,
        stage: input.stage,
        run_id: input.run_id ?? null,
        node_id: input.node_id ?? null,
      });
    };
  }

  return {
    buildReplayRepairReviewOptions,
    buildAutomationReplayRunOptions,
    buildAutomationTestHook,
  };
}
