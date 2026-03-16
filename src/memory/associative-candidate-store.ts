import type {
  AssociativeCandidateStatus,
  AssociativeRelationKind,
} from "./associative-linking-types.js";

export type AssociationCandidateJson = Record<string, unknown>;

export type AssociationCandidateRecord = {
  id: string;
  scope: string;
  src_id: string;
  dst_id: string;
  relation_kind: AssociativeRelationKind;
  status: AssociativeCandidateStatus;
  score: number;
  confidence: number;
  feature_summary_json: AssociationCandidateJson;
  evidence_json: AssociationCandidateJson;
  source_commit_id: string | null;
  worker_run_id: string | null;
  promoted_edge_id: string | null;
  created_at: string;
  updated_at: string;
};

export type UpsertAssociationCandidateArgs = Omit<AssociationCandidateRecord, "id" | "created_at" | "updated_at">;

export type ListAssociationCandidatesForSourceArgs = {
  scope: string;
  src_id: string;
  limit?: number;
  statuses?: AssociativeCandidateStatus[];
};

export type MarkAssociationCandidatePromotedArgs = {
  scope: string;
  src_id: string;
  dst_id: string;
  relation_kind: AssociativeRelationKind;
  promoted_edge_id: string;
};

export type UpdateAssociationCandidateStatusArgs = {
  scope: string;
  src_id: string;
  dst_id: string;
  relation_kind: AssociativeRelationKind;
  status: AssociativeCandidateStatus;
  promoted_edge_id?: string | null;
};

export interface AssociativeCandidateStoreAccess {
  upsertAssociationCandidates(args: UpsertAssociationCandidateArgs[]): Promise<void>;
  listAssociationCandidatesForSource(args: ListAssociationCandidatesForSourceArgs): Promise<AssociationCandidateRecord[]>;
  markAssociationCandidatePromoted(args: MarkAssociationCandidatePromotedArgs): Promise<void>;
  updateAssociationCandidateStatus(args: UpdateAssociationCandidateStatusArgs): Promise<void>;
}
