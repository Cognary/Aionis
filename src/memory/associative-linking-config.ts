export const ASSOCIATIVE_LINKING_SOURCE_NODE_TYPES = ["event", "evidence", "concept", "procedure"] as const;

export type AssociativeLinkingSourceNodeType = (typeof ASSOCIATIVE_LINKING_SOURCE_NODE_TYPES)[number];

export type AssociativeLinkingResolvedConfig = {
  max_source_node_ids: number;
  max_candidates_per_source: number;
  promotion_score_threshold: number;
  promotion_confidence_threshold: number;
  source_node_types: readonly AssociativeLinkingSourceNodeType[];
};

export const DEFAULT_ASSOCIATIVE_LINKING_CONFIG: AssociativeLinkingResolvedConfig = {
  max_source_node_ids: 64,
  max_candidates_per_source: 24,
  promotion_score_threshold: 0.92,
  promotion_confidence_threshold: 0.9,
  source_node_types: ASSOCIATIVE_LINKING_SOURCE_NODE_TYPES,
};
