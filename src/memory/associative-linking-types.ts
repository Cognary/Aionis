import { z } from "zod";
import { UUID } from "./schemas.js";

export const AssociativeRelationKindSchema = z.enum([
  "same_task",
  "supports",
  "extends",
  "repeats",
  "supersedes",
]);

export type AssociativeRelationKind = z.infer<typeof AssociativeRelationKindSchema>;

export const AssociativeCandidateStatusSchema = z.enum([
  "shadow",
  "promoted",
  "rejected",
  "expired",
]);

export type AssociativeCandidateStatus = z.infer<typeof AssociativeCandidateStatusSchema>;

export const AssociativeLinkTriggerOriginSchema = z.enum([
  "memory_write",
  "handoff_store",
  "replay_write",
  "session_event",
]);

export type AssociativeLinkTriggerOrigin = z.infer<typeof AssociativeLinkTriggerOriginSchema>;

export const DeferredAssociativeLinkFollowupSchema = z
  .object({
    origin: AssociativeLinkTriggerOriginSchema,
    source_node_ids: z.array(UUID).min(1).max(64),
    source_commit_id: UUID,
  })
  .strict();

export type DeferredAssociativeLinkFollowup = z.infer<typeof DeferredAssociativeLinkFollowupSchema>;

export const AssociativeLinkTriggerPayloadSchema = z
  .object({
    origin: AssociativeLinkTriggerOriginSchema,
    scope: z.string().min(1),
    source_node_ids: z.array(UUID).min(1).max(64),
    source_commit_id: UUID,
  })
  .strict();

export type AssociativeLinkTriggerPayload = z.infer<typeof AssociativeLinkTriggerPayloadSchema>;
