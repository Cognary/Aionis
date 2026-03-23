import { getSharedExecutionStateStore } from "../execution/state-store.js";
import { registerMemoryAccessRoutes } from "../routes/memory-access.js";
import { registerMemoryContextRuntimeRoutes } from "../routes/memory-context-runtime.js";
import { registerMemoryFeedbackToolRoutes } from "../routes/memory-feedback-tools.js";
import { registerMemoryReplayGovernedRoutes } from "../routes/memory-replay-governed.js";
import { registerMemoryWriteRoutes } from "../routes/memory-write.js";
import { registerLiteServerOnlyRoutes } from "./lite-edition.js";
import type { RegisterSdkDemoRoutesArgs } from "./http-host-sdk-demo-args.js";

function registerSdkDemoMemoryRoutes(args: RegisterSdkDemoRoutesArgs) {
  const {
    app,
    env,
    store,
    embedder,
    embeddingSurfacePolicy,
    embeddedRuntime,
    liteWriteStore,
    recallTextEmbedBatcher,
    liteRecallAccess,
    writeStoreCapabilities,
    requireStoreFeatureCapability,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    enforceRecallTextEmbedQuota,
    buildRecallAuth,
    tenantFromBody,
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
    writeAccessForClient,
    runTopicClusterForEventIds,
  } = args;

  registerMemoryWriteRoutes({
    app,
    env,
    store,
    embedder,
    embeddingSurfacePolicy,
    embeddedRuntime,
    liteWriteStore,
    writeAccessForClient,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
    runTopicClusterForEventIds,
    executionStateStore: getSharedExecutionStateStore(),
  });

  registerMemoryAccessRoutes({
    app,
    env,
    embedder,
    embeddingSurfacePolicy,
    liteWriteStore,
    writeAccessShadowMirrorV2: writeStoreCapabilities.shadow_mirror_v2,
    requireStoreFeatureCapability,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
  });

  registerMemoryContextRuntimeRoutes({
    app,
    env,
    embedder,
    embeddingSurfacePolicy,
    embeddedRuntime,
    liteWriteStore,
    liteRecallAccess,
    recallTextEmbedBatcher,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    enforceRecallTextEmbedQuota,
    buildRecallAuth,
    tenantFromBody,
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
  });

  registerMemoryFeedbackToolRoutes({
    app,
    env,
    embedder,
    embeddedRuntime,
    liteRecallAccess,
    liteWriteStore,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
  });

  registerMemoryReplayGovernedRoutes({
    app,
    env,
    liteWriteStore,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
    withReplayRepairReviewDefaults,
    buildReplayRepairReviewOptions,
    buildReplayPlaybookRunOptions: buildAutomationReplayRunOptions,
  });
}

export function registerSdkDemoRoutes(args: RegisterSdkDemoRoutesArgs) {
  registerLiteServerOnlyRoutes(args.app);
  registerSdkDemoMemoryRoutes(args);
}
