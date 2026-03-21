import type pg from "pg";
import type { EmbeddingProvider } from "../embeddings/types.js";
import { applyMemoryWrite } from "../memory/write.js";
import { completeLiteInlineEmbeddings, type LiteInlineEmbeddingStore } from "./lite-inline-embedding.js";
import { appendLiteWorkflowProjection, type LiteWorkflowProjectionStore } from "./lite-workflow-projection.js";

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
  auto_embed_effective?: boolean;
  nodes: PreparedProjectionNode[];
  edges: Array<Record<string, unknown>>;
};

export type LiteProjectedWriteStore = LiteWorkflowProjectionStore & LiteInlineEmbeddingStore & {
  withTx: <T>(fn: () => Promise<T>) => Promise<T>;
};

export async function commitLitePreparedWriteWithProjection(args: {
  prepared: PreparedProjectionWrite;
  liteWriteStore: LiteProjectedWriteStore;
  embedder: EmbeddingProvider | null;
  writeOptions: {
    maxTextLen: number;
    piiRedaction: boolean;
    allowCrossScopeEdges: boolean;
    shadowDualWriteEnabled: boolean;
    shadowDualWriteStrict: boolean;
    associativeLinkOrigin?: string;
  };
}) {
  await appendLiteWorkflowProjection({
    prepared: args.prepared,
    liteWriteStore: args.liteWriteStore,
  });
  const out = await args.liteWriteStore.withTx(() =>
    applyMemoryWrite({} as pg.PoolClient, args.prepared as any, {
      maxTextLen: args.writeOptions.maxTextLen,
      piiRedaction: args.writeOptions.piiRedaction,
      allowCrossScopeEdges: args.writeOptions.allowCrossScopeEdges,
      shadowDualWriteEnabled: args.writeOptions.shadowDualWriteEnabled,
      shadowDualWriteStrict: args.writeOptions.shadowDualWriteStrict,
      write_access: args.liteWriteStore as any,
      ...(args.writeOptions.associativeLinkOrigin
        ? { associativeLinkOrigin: args.writeOptions.associativeLinkOrigin as any }
        : {}),
    }),
  );
  const liteInlineEmbedding = await completeLiteInlineEmbeddings({
    prepared: args.prepared,
    embedder: args.embedder,
    liteWriteStore: args.liteWriteStore,
  });
  return {
    out,
    liteInlineEmbedding,
  };
}
