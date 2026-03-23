import { getSharedExecutionStateStore } from "../execution/state-store.js";
import { registerMemoryAccessRoutes } from "../routes/memory-access.js";
import { registerMemoryContextRuntimeRoutes } from "../routes/memory-context-runtime.js";
import { registerMemoryFeedbackToolRoutes } from "../routes/memory-feedback-tools.js";
import { registerMemoryReplayGovernedRoutes } from "../routes/memory-replay-governed.js";
import { registerMemoryWriteRoutes } from "../routes/memory-write.js";
import { registerLiteServerOnlyRoutes } from "./lite-edition.js";
import type { RegisterApplicationRoutesArgs } from "./http-host.js";

export type RegisterSdkDemoRoutesArgs = Pick<
  RegisterApplicationRoutesArgs,
  | "app"
  | "env"
  | "store"
  | "embedder"
  | "embeddingSurfacePolicy"
  | "embeddedRuntime"
  | "liteWriteStore"
  | "recallTextEmbedBatcher"
  | "liteRecallAccess"
  | "writeStoreCapabilities"
  | "requireStoreFeatureCapability"
  | "requireMemoryPrincipal"
  | "withIdentityFromRequest"
  | "enforceRateLimit"
  | "enforceTenantQuota"
  | "enforceRecallTextEmbedQuota"
  | "buildRecallAuth"
  | "tenantFromBody"
  | "acquireInflightSlot"
  | "hasExplicitRecallKnobs"
  | "resolveRecallProfile"
  | "resolveExplicitRecallMode"
  | "resolveClassAwareRecallProfile"
  | "withRecallProfileDefaults"
  | "resolveRecallStrategy"
  | "resolveAdaptiveRecallProfile"
  | "resolveAdaptiveRecallHardCap"
  | "inferRecallStrategyFromKnobs"
  | "buildRecallTrajectory"
  | "embedRecallTextQuery"
  | "mapRecallTextEmbeddingError"
  | "recordContextAssemblyTelemetryBestEffort"
  | "withReplayRepairReviewDefaults"
  | "buildReplayRepairReviewOptions"
  | "buildAutomationReplayRunOptions"
  | "writeAccessForClient"
  | "runTopicClusterForEventIds"
>;

export function buildSdkDemoRouteArgs(
  args: RegisterApplicationRoutesArgs,
): RegisterSdkDemoRoutesArgs {
  return {
    app: args.app,
    env: args.env,
    store: args.store,
    embedder: args.embedder,
    embeddingSurfacePolicy: args.embeddingSurfacePolicy,
    embeddedRuntime: args.embeddedRuntime,
    liteWriteStore: args.liteWriteStore,
    recallTextEmbedBatcher: args.recallTextEmbedBatcher,
    liteRecallAccess: args.liteRecallAccess,
    writeStoreCapabilities: args.writeStoreCapabilities,
    requireStoreFeatureCapability: args.requireStoreFeatureCapability,
    requireMemoryPrincipal: args.requireMemoryPrincipal,
    withIdentityFromRequest: args.withIdentityFromRequest,
    enforceRateLimit: args.enforceRateLimit,
    enforceTenantQuota: args.enforceTenantQuota,
    enforceRecallTextEmbedQuota: args.enforceRecallTextEmbedQuota,
    buildRecallAuth: args.buildRecallAuth,
    tenantFromBody: args.tenantFromBody,
    acquireInflightSlot: args.acquireInflightSlot,
    hasExplicitRecallKnobs: args.hasExplicitRecallKnobs,
    resolveRecallProfile: args.resolveRecallProfile,
    resolveExplicitRecallMode: args.resolveExplicitRecallMode,
    resolveClassAwareRecallProfile: args.resolveClassAwareRecallProfile,
    withRecallProfileDefaults: args.withRecallProfileDefaults,
    resolveRecallStrategy: args.resolveRecallStrategy,
    resolveAdaptiveRecallProfile: args.resolveAdaptiveRecallProfile,
    resolveAdaptiveRecallHardCap: args.resolveAdaptiveRecallHardCap,
    inferRecallStrategyFromKnobs: args.inferRecallStrategyFromKnobs,
    buildRecallTrajectory: args.buildRecallTrajectory,
    embedRecallTextQuery: args.embedRecallTextQuery,
    mapRecallTextEmbeddingError: args.mapRecallTextEmbeddingError,
    recordContextAssemblyTelemetryBestEffort: args.recordContextAssemblyTelemetryBestEffort,
    withReplayRepairReviewDefaults: args.withReplayRepairReviewDefaults,
    buildReplayRepairReviewOptions: args.buildReplayRepairReviewOptions,
    buildAutomationReplayRunOptions: args.buildAutomationReplayRunOptions,
    writeAccessForClient: args.writeAccessForClient,
    runTopicClusterForEventIds: args.runTopicClusterForEventIds,
  };
}

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
