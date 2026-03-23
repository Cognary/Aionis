import type { RuntimeBootstrapServices, RuntimeServices } from "./runtime-services.js";

export type SdkDemoRuntimeServices = RuntimeBootstrapServices;

export function selectSdkDemoRuntimeServices(
  services: RuntimeServices,
): SdkDemoRuntimeServices {
  return {
    sandboxRemoteAllowedHosts: services.sandboxRemoteAllowedHosts,
    sandboxRemoteAllowedCidrs: services.sandboxRemoteAllowedCidrs,
    sandboxAllowedCommands: services.sandboxAllowedCommands,
    store: services.store,
    db: services.db,
    embeddedRuntime: services.embeddedRuntime,
    liteRecallStore: services.liteRecallStore,
    liteRecallAccess: services.liteRecallAccess,
    liteReplayStore: services.liteReplayStore,
    liteReplayAccess: services.liteReplayAccess,
    liteWriteStore: services.liteWriteStore,
    liteAutomationStore: services.liteAutomationStore,
    liteAutomationRunStore: services.liteAutomationRunStore,
    embedder: services.embedder,
    sandboxExecutor: services.sandboxExecutor,
    writeStoreCapabilities: services.writeStoreCapabilities,
    recallAccessForClient: services.recallAccessForClient,
    replayAccessForClient: services.replayAccessForClient,
    writeAccessForClient: services.writeAccessForClient,
    requireStoreFeatureCapability: services.requireStoreFeatureCapability,
    recallLimiter: services.recallLimiter,
    debugEmbedLimiter: services.debugEmbedLimiter,
    writeLimiter: services.writeLimiter,
    sandboxWriteLimiter: services.sandboxWriteLimiter,
    sandboxReadLimiter: services.sandboxReadLimiter,
    recallTextEmbedLimiter: services.recallTextEmbedLimiter,
    sandboxTenantBudgetPolicy: services.sandboxTenantBudgetPolicy,
    recallTextEmbedCache: services.recallTextEmbedCache,
    recallTextEmbedInflight: services.recallTextEmbedInflight,
    recallTextEmbedBatcher: services.recallTextEmbedBatcher,
    embeddingSurfacePolicy: services.embeddingSurfacePolicy,
    recallInflightGate: services.recallInflightGate,
    writeInflightGate: services.writeInflightGate,
  };
}
