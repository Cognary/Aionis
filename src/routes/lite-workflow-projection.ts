import { projectWorkflowCandidatesFromPreparedWrite } from "../memory/workflow-write-projection.js";

export type LiteWorkflowProjectionStore = {
  findExecutionNativeNodes: (args: {
    scope: string;
    consumerAgentId?: string | null;
    consumerTeamId?: string | null;
    executionKind?: "workflow_candidate" | "workflow_anchor" | null;
    workflowSignature?: string | null;
    limit: number;
    offset: number;
  }) => Promise<{ rows: Array<{ id: string; client_id?: string | null; slots?: Record<string, unknown> }>; has_more: boolean }>;
  findLatestNodeByClientId: (scope: string, type: string, clientId: string) => Promise<{ id: string } | null>;
  findNodes: (args: {
    scope: string;
    type?: string | null;
    clientId?: string | null;
    slotsContains?: Record<string, unknown> | null;
    consumerAgentId?: string | null;
    consumerTeamId?: string | null;
    limit: number;
    offset: number;
  }) => Promise<{ rows: Array<{ id: string; client_id?: string | null; slots?: Record<string, unknown> }>; has_more: boolean }>;
};

type PreparedProjectionNode = {
  id: string;
  client_id?: string;
  scope: string;
  type: string;
  memory_lane: "private" | "shared";
  producer_agent_id?: string;
  owner_agent_id?: string;
  owner_team_id?: string;
  title?: string;
  text_summary?: string;
  slots: Record<string, unknown>;
  embed_text?: string;
};

type PreparedProjectionWrite = {
  scope: string;
  nodes: PreparedProjectionNode[];
  edges: Array<Record<string, unknown>>;
};

export async function appendLiteWorkflowProjection(args: {
  prepared: PreparedProjectionWrite;
  liteWriteStore: LiteWorkflowProjectionStore;
  governanceReviewProviders?: Parameters<typeof projectWorkflowCandidatesFromPreparedWrite>[0]["governanceReviewProviders"];
}): Promise<void> {
  const projection = await projectWorkflowCandidatesFromPreparedWrite({
    scope: args.prepared.scope,
    nodes: args.prepared.nodes,
    liteWriteStore: args.liteWriteStore,
    governanceReviewProviders: args.governanceReviewProviders,
  });
  if (projection.nodes.length > 0) {
    args.prepared.nodes.push(...projection.nodes);
  }
  if (projection.edges.length > 0) {
    args.prepared.edges.push(...projection.edges);
  }
}
