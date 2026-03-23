import { getSharedExecutionStateStore } from "../execution/state-store.js";
import type { RegisterSdkDemoRoutesArgs } from "../host/http-host-sdk-demo-args.js";
import type { registerMemoryAccessRoutes } from "./memory-access.js";
import type { registerMemoryContextRuntimeRoutes } from "./memory-context-runtime.js";
import type { registerMemoryFeedbackToolRoutes } from "./memory-feedback-tools.js";
import type { registerMemoryReplayGovernedRoutes } from "./memory-replay-governed.js";
import type { registerMemoryWriteRoutes } from "./memory-write.js";

export function buildSdkDemoMemoryWriteRouteArgs(
  args: RegisterSdkDemoRoutesArgs,
): Parameters<typeof registerMemoryWriteRoutes>[0] {
  return {
    app: args.app,
    env: args.env,
    store: args.store,
    embedder: args.embedder,
    embeddingSurfacePolicy: args.embeddingSurfacePolicy,
    embeddedRuntime: args.embeddedRuntime,
    liteWriteStore: args.liteWriteStore,
    writeAccessForClient: args.writeAccessForClient,
    requireMemoryPrincipal: args.requireMemoryPrincipal,
    withIdentityFromRequest: args.withIdentityFromRequest,
    enforceRateLimit: args.enforceRateLimit,
    enforceTenantQuota: args.enforceTenantQuota,
    tenantFromBody: args.tenantFromBody,
    acquireInflightSlot: args.acquireInflightSlot,
    runTopicClusterForEventIds: args.runTopicClusterForEventIds,
    executionStateStore: getSharedExecutionStateStore(),
  };
}

export function buildSdkDemoMemoryAccessRouteArgs(
  args: RegisterSdkDemoRoutesArgs,
): Parameters<typeof registerMemoryAccessRoutes>[0] {
  return {
    app: args.app,
    env: args.env,
    embedder: args.embedder,
    embeddingSurfacePolicy: args.embeddingSurfacePolicy,
    liteWriteStore: args.liteWriteStore,
    writeAccessShadowMirrorV2: args.writeStoreCapabilities.shadow_mirror_v2,
    requireStoreFeatureCapability: args.requireStoreFeatureCapability,
    requireMemoryPrincipal: args.requireMemoryPrincipal,
    withIdentityFromRequest: args.withIdentityFromRequest,
    enforceRateLimit: args.enforceRateLimit,
    enforceTenantQuota: args.enforceTenantQuota,
    tenantFromBody: args.tenantFromBody,
    acquireInflightSlot: args.acquireInflightSlot,
  };
}

export function buildSdkDemoMemoryContextRuntimeRouteArgs(
  args: RegisterSdkDemoRoutesArgs,
): Parameters<typeof registerMemoryContextRuntimeRoutes>[0] {
  return {
    app: args.app,
    env: args.env,
    embedder: args.embedder,
    embeddingSurfacePolicy: args.embeddingSurfacePolicy,
    embeddedRuntime: args.embeddedRuntime,
    liteWriteStore: args.liteWriteStore,
    liteRecallAccess: args.liteRecallAccess,
    recallTextEmbedBatcher: args.recallTextEmbedBatcher,
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
  };
}

export function buildSdkDemoMemoryFeedbackToolRouteArgs(
  args: RegisterSdkDemoRoutesArgs,
): Parameters<typeof registerMemoryFeedbackToolRoutes>[0] {
  return {
    app: args.app,
    env: args.env,
    embedder: args.embedder,
    embeddedRuntime: args.embeddedRuntime,
    liteRecallAccess: args.liteRecallAccess,
    liteWriteStore: args.liteWriteStore,
    requireMemoryPrincipal: args.requireMemoryPrincipal,
    withIdentityFromRequest: args.withIdentityFromRequest,
    enforceRateLimit: args.enforceRateLimit,
    enforceTenantQuota: args.enforceTenantQuota,
    tenantFromBody: args.tenantFromBody,
    acquireInflightSlot: args.acquireInflightSlot,
  };
}

export function buildSdkDemoMemoryReplayGovernedRouteArgs(
  args: RegisterSdkDemoRoutesArgs,
): Parameters<typeof registerMemoryReplayGovernedRoutes>[0] {
  return {
    app: args.app,
    env: args.env,
    liteWriteStore: args.liteWriteStore,
    requireMemoryPrincipal: args.requireMemoryPrincipal,
    withIdentityFromRequest: args.withIdentityFromRequest,
    enforceRateLimit: args.enforceRateLimit,
    enforceTenantQuota: args.enforceTenantQuota,
    tenantFromBody: args.tenantFromBody,
    acquireInflightSlot: args.acquireInflightSlot,
    withReplayRepairReviewDefaults: args.withReplayRepairReviewDefaults,
    buildReplayRepairReviewOptions: args.buildReplayRepairReviewOptions,
    buildReplayPlaybookRunOptions: args.buildAutomationReplayRunOptions,
  };
}
