import { z } from "zod";

import {
  AionisDocRuntimeHandoffSchema,
  type AionisDocRuntimeHandoffV1,
} from "./runtime-handoff.js";

export const AIONIS_DOC_HANDOFF_STORE_REQUEST_VERSION = "aionis_doc_handoff_store_request_v1" as const;

export const AionisDocHandoffStoreRequestSchema = z.object({
  request_version: z.literal(AIONIS_DOC_HANDOFF_STORE_REQUEST_VERSION),
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  memory_lane: z.enum(["private", "shared"]).default("shared"),
  anchor: z.string().min(1),
  file_path: z.string().min(1).optional(),
  repo_root: z.string().min(1).optional(),
  symbol: z.string().min(1).optional(),
  handoff_kind: z.literal("task_handoff"),
  title: z.string().min(1).optional(),
  summary: z.string().min(1),
  handoff_text: z.string().min(1),
  risk: z.string().min(1).optional(),
  acceptance_checks: z.array(z.string().min(1)).optional(),
  tags: z.array(z.string().min(1)).optional(),
  target_files: z.array(z.string().min(1)).optional(),
  next_action: z.string().min(1).optional(),
  must_change: z.array(z.string().min(1)).optional(),
  must_remove: z.array(z.string().min(1)).optional(),
  must_keep: z.array(z.string().min(1)).optional(),
  execution_result_summary: z.record(z.unknown()).optional(),
  execution_artifacts: z.array(z.record(z.unknown())).optional(),
  execution_evidence: z.array(z.record(z.unknown())).optional(),
  execution_state_v1: z.record(z.unknown()),
  execution_packet_v1: z.record(z.unknown()),
  control_profile_v1: z.record(z.unknown()).optional(),
  execution_transitions_v1: z.array(z.record(z.unknown())).optional(),
});

export type AionisDocHandoffStoreRequest = z.infer<typeof AionisDocHandoffStoreRequestSchema>;

type BuildHandoffStoreRequestOptions = {
  tenantId?: string;
  scope?: string;
  actor?: string;
  memoryLane?: "private" | "shared";
  title?: string;
  tags?: string[];
};

export function buildHandoffStoreRequestFromRuntimeHandoff(args: {
  handoff: unknown;
} & BuildHandoffStoreRequestOptions): AionisDocHandoffStoreRequest {
  const handoff = AionisDocRuntimeHandoffSchema.parse(args.handoff);
  return buildHandoffStoreRequestFromParsedRuntimeHandoff(handoff, args);
}

function buildHandoffStoreRequestFromParsedRuntimeHandoff(
  handoff: AionisDocRuntimeHandoffV1,
  options: BuildHandoffStoreRequestOptions,
): AionisDocHandoffStoreRequest {
  const tags = [
    "aionis-doc",
    "runtime-handoff",
    `doc:${handoff.source_doc_id}`,
    ...(options.tags ?? []),
  ];
  const risk =
    handoff.execution_state_v1.unresolved_blockers.length > 0
      ? handoff.execution_state_v1.unresolved_blockers.join(" | ")
      : undefined;

  return AionisDocHandoffStoreRequestSchema.parse({
    request_version: AIONIS_DOC_HANDOFF_STORE_REQUEST_VERSION,
    tenant_id: options.tenantId,
    scope: options.scope ?? handoff.scope,
    actor: options.actor,
    memory_lane: options.memoryLane ?? "shared",
    anchor: handoff.execution_ready_handoff.anchor,
    file_path: handoff.execution_state_v1.resume_anchor?.file_path ?? undefined,
    repo_root: handoff.execution_state_v1.resume_anchor?.repo_root ?? undefined,
    symbol: handoff.execution_state_v1.resume_anchor?.symbol ?? undefined,
    handoff_kind: "task_handoff",
    title: options.title ?? `Aionis Doc ${handoff.source_doc_id}`,
    summary: handoff.execution_ready_handoff.summary ?? handoff.task_brief,
    handoff_text: handoff.execution_ready_handoff.handoff_text,
    risk,
    acceptance_checks: handoff.execution_ready_handoff.acceptance_checks,
    tags,
    target_files: handoff.execution_ready_handoff.target_files,
    next_action: handoff.execution_ready_handoff.next_action ?? undefined,
    must_change: handoff.execution_packet_v1.hard_constraints,
    must_remove: handoff.execution_state_v1.rejected_paths,
    must_keep: handoff.execution_state_v1.rollback_notes,
    execution_result_summary: handoff.execution_result_summary ?? undefined,
    execution_artifacts: handoff.execution_artifacts,
    execution_evidence: handoff.execution_evidence,
    execution_state_v1: handoff.execution_state_v1 as unknown as Record<string, unknown>,
    execution_packet_v1: handoff.execution_packet_v1 as unknown as Record<string, unknown>,
    control_profile_v1: undefined,
    execution_transitions_v1: undefined,
  });
}
