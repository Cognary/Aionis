import "dotenv/config";
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
  registerApplicationRoutes,
  registerHealthRoute,
  registerHostErrorHandler,
  registerHostRequestHooks,
} from "./host/http-host.js";
import { createRecallPolicy } from "./app/recall-policy.js";
import { createRecallTextEmbedRuntime } from "./app/recall-text-embed.js";
import { createReplayRepairReviewPolicy } from "./app/replay-repair-review-policy.js";
import { createReplayRuntimeOptionBuilders } from "./app/replay-runtime-options.js";
import { createSandboxBudgetService } from "./app/sandbox-budget.js";
import { createRuntimeServices } from "./app/runtime-services.js";
import { loadEnv } from "./config.js";
import {
  recordMemoryContextAssemblyTelemetry,
} from "./control-plane.js";
import { runTopicClusterForEventIds } from "./jobs/topicClusterLib.js";

const env = loadEnv();
const {
  sandboxRemoteAllowedHosts,
  sandboxRemoteAllowedCidrs,
  sandboxAllowedCommands,
  store,
  db,
  embeddedRuntime,
  embedder,
  sandboxExecutor,
  authResolver,
  healthDatabaseTargetHash,
  recallStoreCapabilities,
  writeStoreCapabilities,
  storeFeatureCapabilities,
  recallAccessForClient,
  writeAccessForClient,
  requireStoreFeatureCapability,
  recallLimiter,
  debugEmbedLimiter,
  writeLimiter,
  sandboxWriteLimiter,
  sandboxReadLimiter,
  recallTextEmbedLimiter,
  resolveControlPlaneApiKeyPrincipal,
  tenantQuotaResolver,
  sandboxTenantBudgetPolicy,
  recallTextEmbedCache,
  recallTextEmbedInflight,
  recallTextEmbedBatcher,
  recallInflightGate,
  writeInflightGate,
} = await createRuntimeServices(env);
const {
  buildRecallAuth,
  acquireInflightSlot,
  enforceRateLimit,
  enforceRecallTextEmbedQuota,
  emitControlAudit,
  requireAdminToken,
  requireMemoryPrincipal,
  withIdentityFromRequest,
  tenantFromBody,
  scopeFromBody,
  projectFromBody,
  enforceTenantQuota,
} = createRequestGuards({
  env,
  db,
  embedder,
  authResolver,
  resolveControlPlaneApiKeyPrincipal,
  tenantQuotaResolver,
  recallLimiter,
  debugEmbedLimiter,
  writeLimiter,
  sandboxWriteLimiter,
  sandboxReadLimiter,
  recallTextEmbedLimiter,
  recallInflightGate,
  writeInflightGate,
});
const {
  listSandboxBudgetProfiles,
  getSandboxBudgetProfile,
  upsertSandboxBudgetProfile,
  deleteSandboxBudgetProfile,
  listSandboxProjectBudgetProfiles,
  getSandboxProjectBudgetProfile,
  upsertSandboxProjectBudgetProfile,
  deleteSandboxProjectBudgetProfile,
  enforceSandboxTenantBudget,
} = createSandboxBudgetService({
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
const {
  embedRecallTextQuery,
  mapRecallTextEmbeddingError,
} = createRecallTextEmbedRuntime({
  recallTextEmbedCache,
  recallTextEmbedInflight,
  recallTextEmbedBatcher,
});
const {
  buildReplayRepairReviewOptions,
  buildAutomationReplayRunOptions,
  buildAutomationTestHook,
} = createReplayRuntimeOptionBuilders({
  env,
  store,
  embedder,
  embeddedRuntime,
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
const {
  withReplayRepairReviewDefaults,
} = createReplayRepairReviewPolicy({
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
  embeddedRuntime,
  recallStoreCapabilities,
  writeStoreCapabilities,
  storeFeatureCapabilities,
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
  healthDatabaseTargetHash,
  embeddedRuntime,
  recallStoreCapabilities,
  writeStoreCapabilities,
  storeFeatureCapabilities,
  sandboxExecutor,
  sandboxTenantBudgetPolicy,
  sandboxRemoteAllowedCidrs,
});
registerApplicationRoutes({
  app,
  env,
  db,
  store,
  embedder,
  embeddedRuntime,
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
  buildAutomationTestHook,
  sandboxExecutor,
  enforceSandboxTenantBudget,
  writeAccessForClient,
  runTopicClusterForEventIds,
  emitControlAudit,
  tenantQuotaResolver,
  listSandboxBudgetProfiles,
  getSandboxBudgetProfile,
  upsertSandboxBudgetProfile,
  deleteSandboxBudgetProfile,
  listSandboxProjectBudgetProfiles,
  getSandboxProjectBudgetProfile,
  upsertSandboxProjectBudgetProfile,
  deleteSandboxProjectBudgetProfile,
});

registerBootstrapLifecycle({
  app,
  store,
  sandboxExecutor,
});

await assertBootstrapStoreContracts({
  store,
  recallAccessForClient,
  writeAccessForClient,
});

await listenHttpApp(app, env);
