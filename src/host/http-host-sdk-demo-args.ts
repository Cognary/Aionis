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
