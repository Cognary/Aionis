import {
  assertBootstrapStoreContracts,
  createHttpApp,
  listenHttpApp,
  registerBootstrapLifecycle,
} from "./host/bootstrap.js";
import { createRequestGuards } from "./app/request-guards.js";
import { createHttpObservabilityHelpers } from "./app/http-observability.js";
import {
  logMemoryApiConfig,
  registerHealthRoute,
  registerHostErrorHandler,
  registerHostRequestHooks,
} from "./host/http-host-bootstrap-shared.js";
import type { RegisterApplicationRoutesArgs } from "./host/application-route-args.js";
import { createRecallPolicy } from "./app/recall-policy.js";
import { createRecallTextEmbedRuntime } from "./app/recall-text-embed.js";
import { createReplayRepairReviewPolicy } from "./app/replay-repair-review-policy.js";
import { createReplayRuntimeOptionBuilders } from "./app/replay-runtime-options.js";
import { createSandboxBudgetService } from "./app/sandbox-budget.js";
import {
  createRuntimeServices,
  selectRuntimeBootstrapServices,
  type RuntimeBootstrapServices,
  type RuntimeServices,
} from "./app/runtime-services.js";
import { loadEnv } from "./config.js";
import { recordMemoryContextAssemblyTelemetry } from "./control-plane.js";
import { runTopicClusterForEventIds } from "./jobs/topicClusterLib.js";

export async function startAionisRuntimeWithRouteRegistrar<
  TRouteArgs = RegisterApplicationRoutesArgs,
  TServices extends RuntimeBootstrapServices = RuntimeBootstrapServices,
>(
  options: {
    selectServices?: (services: RuntimeServices) => TServices;
    selectRouteArgs?: (args: RegisterApplicationRoutesArgs) => TRouteArgs;
    registerRoutes: (args: TRouteArgs) => void;
  },
): Promise<void> {
  const env = loadEnv();
  const runtimeServices = await createRuntimeServices(env);
  const {
    sandboxRemoteAllowedHosts,
    sandboxRemoteAllowedCidrs,
    sandboxAllowedCommands,
    store,
    db,
    embeddedRuntime,
    liteRecallStore,
    liteRecallAccess,
    liteReplayStore,
    liteReplayAccess,
    liteWriteStore,
    liteAutomationStore,
    liteAutomationRunStore,
    embedder,
    sandboxExecutor,
    recallStoreCapabilities,
    writeStoreCapabilities,
    storeFeatureCapabilities,
    recallAccessForClient,
    replayAccessForClient,
    writeAccessForClient,
    requireStoreFeatureCapability,
    recallLimiter,
    debugEmbedLimiter,
    writeLimiter,
    sandboxWriteLimiter,
    sandboxReadLimiter,
    recallTextEmbedLimiter,
    sandboxTenantBudgetPolicy,
    recallTextEmbedCache,
    recallTextEmbedInflight,
    recallTextEmbedBatcher,
    embeddingSurfacePolicy,
    recallInflightGate,
    writeInflightGate,
  } = options.selectServices
    ? options.selectServices(runtimeServices)
    : selectRuntimeBootstrapServices(runtimeServices);
  const {
    buildRecallAuth,
    acquireInflightSlot,
    enforceRateLimit,
    enforceRecallTextEmbedQuota,
    requireAdminToken,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    tenantFromBody,
    scopeFromBody,
    projectFromBody,
    enforceTenantQuota,
  } = createRequestGuards({
    env,
    embedder,
    recallLimiter,
    debugEmbedLimiter,
    writeLimiter,
    sandboxWriteLimiter,
    sandboxReadLimiter,
    recallTextEmbedLimiter,
    recallInflightGate,
    writeInflightGate,
  });
  const { enforceSandboxTenantBudget } = createSandboxBudgetService({
    env,
    db,
    sandboxTenantBudgetPolicy,
  });
  const {
    globalRecallProfileDefaults,
    recallProfilePolicy,
    withRecallProfileDefaults,
    resolveRecallProfile,
    resolveExplicitRecallMode,
    resolveClassAwareRecallProfile,
    hasExplicitRecallKnobs,
    resolveRecallStrategy,
    resolveAdaptiveRecallProfile,
    resolveAdaptiveRecallHardCap,
    inferRecallStrategyFromKnobs,
    buildRecallTrajectory,
  } = createRecallPolicy(env);
  const { embedRecallTextQuery, mapRecallTextEmbeddingError } = createRecallTextEmbedRuntime({
    recallTextEmbedCache,
    recallTextEmbedInflight,
    recallTextEmbedBatcher,
  });
  const { buildReplayRepairReviewOptions, buildAutomationReplayRunOptions } = createReplayRuntimeOptionBuilders({
    env,
    store,
    embedder,
    embeddingSurfacePolicy,
    embeddedRuntime,
    liteWriteStore,
    liteReplayAccess,
    liteReplayStore,
    sandboxAllowedCommands,
    sandboxExecutor,
    writeAccessShadowMirrorV2: writeStoreCapabilities.shadow_mirror_v2,
    enforceSandboxTenantBudget,
  });
  const {
    resolveCorsAllowOrigin,
    resolveCorsPolicy,
    telemetryEndpointFromRequest,
    resolveRequestScopeForTelemetry,
    resolveRequestTenantForTelemetry,
    resolveRequestApiKeyPrefixForTelemetry,
    recordContextAssemblyTelemetryBestEffort,
  } = createHttpObservabilityHelpers({
    env,
    db,
    recordMemoryContextAssemblyTelemetry,
  });
  const { withReplayRepairReviewDefaults } = createReplayRepairReviewPolicy({
    env,
    tenantFromBody,
    scopeFromBody,
  });

  const app = createHttpApp(env);

  registerHostErrorHandler(app);
  logMemoryApiConfig({
    app,
    env,
    embedder,
    embeddingSurfacePolicy,
    sandboxRemoteAllowedHosts,
    sandboxTenantBudgetPolicy,
    recallTextEmbedCache,
    globalRecallProfileDefaults,
    recallProfilePolicy,
    recallTextEmbedBatcher,
  });
  registerHostRequestHooks({
    app,
    db,
    resolveCorsPolicy,
    resolveCorsAllowOrigin,
    telemetryEndpointFromRequest,
    resolveRequestTenantForTelemetry,
    resolveRequestScopeForTelemetry,
    resolveRequestApiKeyPrefixForTelemetry,
  });
  registerHealthRoute({
    app,
    env,
    liteReplayStore,
    liteRecallStore,
    liteWriteStore,
    liteAutomationStore,
    liteAutomationRunStore,
    sandboxExecutor,
    sandboxTenantBudgetPolicy,
    sandboxRemoteAllowedCidrs,
  });
  const applicationRouteArgs: RegisterApplicationRoutesArgs = {
    app,
    env,
    db,
    store,
    embedder,
    embeddingSurfacePolicy,
    embeddedRuntime,
    liteRecallAccess,
    liteReplayAccess,
    liteReplayStore,
    liteWriteStore,
    liteAutomationStore,
    liteAutomationRunStore,
    recallTextEmbedBatcher,
    recallAccessForClient,
    writeStoreCapabilities,
    requireAdminToken,
    requireStoreFeatureCapability,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    enforceRecallTextEmbedQuota,
    buildRecallAuth,
    tenantFromBody,
    scopeFromBody,
    projectFromBody,
    acquireInflightSlot,
    hasExplicitRecallKnobs,
    resolveRecallProfile,
    resolveExplicitRecallMode,
    resolveClassAwareRecallProfile,
    withRecallProfileDefaults,
    resolveRecallStrategy,
    resolveAdaptiveRecallProfile,
    resolveAdaptiveRecallHardCap,
    inferRecallStrategyFromKnobs,
    buildRecallTrajectory,
    embedRecallTextQuery,
    mapRecallTextEmbeddingError,
    recordContextAssemblyTelemetryBestEffort,
    withReplayRepairReviewDefaults,
    buildReplayRepairReviewOptions,
    buildAutomationReplayRunOptions,
    sandboxExecutor,
    enforceSandboxTenantBudget,
    writeAccessForClient,
    runTopicClusterForEventIds,
  };
  const routeArgs = options.selectRouteArgs
    ? options.selectRouteArgs(applicationRouteArgs)
    : applicationRouteArgs;
  options.registerRoutes(routeArgs);

  registerBootstrapLifecycle({
    app,
    store,
    sandboxExecutor,
    liteRecallStore,
    liteReplayStore,
    liteWriteStore,
    liteAutomationStore,
    liteAutomationRunStore,
  });

  await assertBootstrapStoreContracts({
    store,
    recallAccessForClient,
    replayAccessForClient,
    writeAccessForClient,
    liteWriteStore,
  });

  await listenHttpApp(app, env);
}
