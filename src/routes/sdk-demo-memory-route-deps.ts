import { getSharedExecutionStateStore } from "../execution/state-store.js";
import type { RegisterSdkDemoRoutesArgs } from "../host/http-host-sdk-demo-args.js";
import type { registerSdkDemoMemoryAccessRoutes } from "./sdk-demo-memory-access.js";
import type { registerSdkDemoMemoryContextRuntimeRoutes } from "./sdk-demo-memory-context-runtime.js";
import type { registerSdkDemoMemoryFeedbackToolRoutes } from "./sdk-demo-memory-feedback-tools.js";
import type { registerSdkDemoMemoryReplayGovernedRoutes } from "./sdk-demo-memory-replay-governed.js";
import type { registerSdkDemoMemoryWriteRoutes } from "./sdk-demo-memory-write.js";

export function buildSdkDemoMemoryWriteRouteArgs(
  args: RegisterSdkDemoRoutesArgs,
): Parameters<typeof registerSdkDemoMemoryWriteRoutes>[0] {
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
): Parameters<typeof registerSdkDemoMemoryAccessRoutes>[0] {
  return {
    app: args.app,
    env: args.env,
    liteWriteStore: args.liteWriteStore,
    requireMemoryPrincipal: args.requireMemoryPrincipal,
    withIdentityFromRequest: args.withIdentityFromRequest,
    enforceRateLimit: async (req, reply) => args.enforceRateLimit(req, reply, "recall"),
    enforceTenantQuota: async (req, reply, _kind, tenantId) =>
      args.enforceTenantQuota(req, reply, "recall", tenantId),
    tenantFromBody: args.tenantFromBody,
    acquireInflightSlot: async () => args.acquireInflightSlot("recall"),
  };
}

export function buildSdkDemoMemoryContextRuntimeRouteArgs(
  args: RegisterSdkDemoRoutesArgs,
): Parameters<typeof registerSdkDemoMemoryContextRuntimeRoutes>[0] {
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
): Parameters<typeof registerSdkDemoMemoryFeedbackToolRoutes>[0] {
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
): Parameters<typeof registerSdkDemoMemoryReplayGovernedRoutes>[0] {
  return {
    app: args.app,
    env: args.env,
    liteWriteStore: args.liteWriteStore,
    requireMemoryPrincipal: args.requireMemoryPrincipal,
    withIdentityFromRequest: args.withIdentityFromRequest,
    enforceRateLimit: async (req, reply) => args.enforceRateLimit(req, reply, "write"),
    enforceTenantQuota: async (req, reply, _kind, tenantId) =>
      args.enforceTenantQuota(req, reply, "write", tenantId),
    tenantFromBody: args.tenantFromBody,
    acquireInflightSlot: async () => args.acquireInflightSlot("write"),
    withReplayRepairReviewDefaults: args.withReplayRepairReviewDefaults,
    buildReplayRepairReviewOptions: args.buildReplayRepairReviewOptions,
  };
}
