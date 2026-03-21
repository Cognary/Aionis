import type { EmbeddingProvider } from "../embeddings/types.js";

export type LiteInlineEmbeddingStore = {
  withTx: <T>(fn: () => Promise<T>) => Promise<T>;
  readyEmbeddingNodeIds: (scope: string, ids: string[]) => Promise<Set<string>>;
  setNodeEmbeddingReady: (args: {
    scope: string;
    id: string;
    embedding: number[];
    embeddingModel: string;
  }) => Promise<void>;
  setNodeEmbeddingFailed: (args: {
    scope: string;
    id: string;
    error: string;
  }) => Promise<void>;
};

type PreparedNodeLike = {
  id: unknown;
  embedding?: unknown;
  embed_text?: unknown;
};

type PreparedLiteWriteLike = {
  scope: string;
  auto_embed_effective?: boolean;
  nodes: PreparedNodeLike[];
};

export async function completeLiteInlineEmbeddings(args: {
  prepared: PreparedLiteWriteLike;
  embedder: EmbeddingProvider | null;
  liteWriteStore: LiteInlineEmbeddingStore;
}): Promise<{
  attempted: number;
  updated: number;
  failed: number;
  error?: string;
} | null> {
  const { prepared, embedder, liteWriteStore } = args;
  if (!embedder || !prepared.auto_embed_effective) return null;

  const planned = ((prepared.nodes ?? []) as PreparedNodeLike[])
    .filter((node) => !node.embedding && typeof node.embed_text === "string" && node.embed_text.trim().length > 0)
    .map((node) => ({
      id: String(node.id),
      text: String(node.embed_text),
    }));
  if (planned.length === 0) return null;

  const ready = await liteWriteStore.readyEmbeddingNodeIds(prepared.scope, planned.map((node) => node.id));
  const pending = planned.filter((node) => !ready.has(node.id));
  if (pending.length === 0) {
    return {
      attempted: planned.length,
      updated: 0,
      failed: 0,
    };
  }

  let vectors: number[][];
  try {
    vectors = await embedder.embed(pending.map((node) => node.text));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await liteWriteStore.withTx(async () => {
      for (const node of pending) {
        await liteWriteStore.setNodeEmbeddingFailed({
          scope: prepared.scope,
          id: node.id,
          error: message,
        });
      }
    });
    return {
      attempted: pending.length,
      updated: 0,
      failed: pending.length,
      error: message,
    };
  }
  if (vectors.length !== pending.length) {
    const message = `unexpected embedding count: expected ${pending.length}, got ${vectors.length}`;
    await liteWriteStore.withTx(async () => {
      for (const node of pending) {
        await liteWriteStore.setNodeEmbeddingFailed({
          scope: prepared.scope,
          id: node.id,
          error: message,
        });
      }
    });
    return {
      attempted: pending.length,
      updated: 0,
      failed: pending.length,
      error: message,
    };
  }

  await liteWriteStore.withTx(async () => {
    for (let i = 0; i < pending.length; i += 1) {
      await liteWriteStore.setNodeEmbeddingReady({
        scope: prepared.scope,
        id: pending[i].id,
        embedding: vectors[i] ?? [],
        embeddingModel: embedder.name,
      });
    }
  });

  return {
    attempted: pending.length,
    updated: pending.length,
    failed: 0,
  };
}
