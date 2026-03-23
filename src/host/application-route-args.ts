import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../config.js";
import type { EmbeddingSurfacePolicy } from "../embeddings/surface-policy.js";
import type { IdentityRequestKind, InflightKind, RateLimitKind, TenantQuotaKind } from "../app/request-guards.js";
import type { RecallEndpoint } from "../app/recall-policy.js";
import type { AuthPrincipal } from "../util/auth.js";
import type { InflightGateToken } from "../util/inflight_gate.js";

export type RegisterApplicationRoutesArgs = {
  app: FastifyInstance;
  env: Env;
  db: any;
  store: any;
  embedder: any;
  embeddingSurfacePolicy: EmbeddingSurfacePolicy;
  embeddedRuntime: any;
  liteRecallAccess: any;
  liteReplayAccess: any;
  liteReplayStore: any;
  liteWriteStore: any;
  liteAutomationStore: any;
  liteAutomationRunStore: any;
  recallTextEmbedBatcher: unknown;
  recallAccessForClient: (client: any) => any;
  writeStoreCapabilities: {
    shadow_mirror_v2: boolean;
  };
  requireAdminToken: (req: FastifyRequest) => void;
  requireStoreFeatureCapability: (...args: any[]) => void;
  requireMemoryPrincipal: (req: FastifyRequest) => Promise<AuthPrincipal | null>;
  withIdentityFromRequest: (
    req: FastifyRequest,
    body: unknown,
    principal: AuthPrincipal | null,
    kind: IdentityRequestKind,
  ) => unknown;
  enforceRateLimit: (req: FastifyRequest, reply: FastifyReply, kind: RateLimitKind) => Promise<void>;
  enforceTenantQuota: (req: FastifyRequest, reply: FastifyReply, kind: TenantQuotaKind, tenantId: string) => Promise<void>;
  enforceRecallTextEmbedQuota: (req: FastifyRequest, reply: FastifyReply, tenantId: string) => Promise<void>;
  buildRecallAuth: (req: FastifyRequest, allowEmbeddings: boolean) => any;
  tenantFromBody: (body: unknown) => string;
  scopeFromBody: (body: unknown) => string;
  projectFromBody: (body: unknown) => string | null;
  acquireInflightSlot: (kind: InflightKind) => Promise<InflightGateToken>;
  hasExplicitRecallKnobs: (body: unknown) => boolean;
  resolveRecallProfile: (endpoint: RecallEndpoint, tenantId: string | null | undefined) => any;
  resolveExplicitRecallMode: (body: unknown, baseProfile: any, explicitRecallKnobs: boolean) => any;
  resolveClassAwareRecallProfile: (...args: any[]) => any;
  withRecallProfileDefaults: (body: unknown, defaults: any) => any;
  resolveRecallStrategy: (body: unknown, explicitRecallKnobs: boolean) => any;
  resolveAdaptiveRecallProfile: (profile: any, waitMs: number, explicitRecallKnobs: boolean) => any;
  resolveAdaptiveRecallHardCap: (knobs: any, waitMs: number, explicitRecallKnobs: boolean) => any;
  inferRecallStrategyFromKnobs: (knobs: any) => any;
  buildRecallTrajectory: (args: any) => any;
  embedRecallTextQuery: (...args: any[]) => Promise<any>;
  mapRecallTextEmbeddingError: (...args: any[]) => any;
  recordContextAssemblyTelemetryBestEffort: (...args: any[]) => Promise<void>;
  withReplayRepairReviewDefaults: (...args: any[]) => any;
  buildReplayRepairReviewOptions: (...args: any[]) => any;
  buildAutomationReplayRunOptions: (reply: FastifyReply, source: string) => any;
  sandboxExecutor: any;
  enforceSandboxTenantBudget: (reply: FastifyReply, tenantId: string, scope: string, projectId?: string | null) => Promise<void>;
  writeAccessForClient: (client: any) => any;
  runTopicClusterForEventIds: (client: any, args: any) => Promise<any>;
};
