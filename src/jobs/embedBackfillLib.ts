import type pg from "pg";
import { assertDim, toVectorLiteral } from "../util/pgvector.js";
import { normalizeText } from "../util/normalize.js";
import { redactPII } from "../util/redaction.js";
import type { EmbeddingProvider } from "../embeddings/types.js";
import { EmbedHttpError } from "../embeddings/http.js";

export type EmbedBackfillNode = { id: string; text: string };

export type EmbedBackfillParams = {
  scope: string;
  nodes: EmbedBackfillNode[];
  maxTextLen: number;
  piiRedaction: boolean;
};

export type EmbedBackfillOptions = {
  // If true, embed even if the node already has a READY embedding (used for model upgrades).
  // This preserves /write semantics: re-embed is async and best-effort; recall can continue using the old embedding
  // until the new one is computed and written.
  force_reembed?: boolean;
};

export type EmbedBackfillResult = {
  attempted: number;
  updated: number;
  skipped_already_ready: number;
  failed: number;
  status: "ok" | "retryable_error" | "fatal_error";
  error_message?: string;
};

function classifyEmbedError(err: unknown): { status: "retryable_error" | "fatal_error"; message: string } {
  const msg = err instanceof Error ? String(err.message) : String(err);
  if (err instanceof EmbedHttpError) {
    if (err.status && err.status >= 400 && err.status <= 499) {
      return { status: "fatal_error", message: `${msg} body=${err.bodyPreview}` };
    }
    return { status: "retryable_error", message: `${msg} body=${err.bodyPreview}` };
  }
  return { status: "retryable_error", message: msg };
}

export async function runEmbedBackfill(
  client: pg.PoolClient,
  params: EmbedBackfillParams,
  embedder: EmbeddingProvider | null,
  opts?: EmbedBackfillOptions,
): Promise<EmbedBackfillResult> {
  const scope = params.scope;
  const nodesIn = params.nodes ?? [];
  if (nodesIn.length === 0) {
    return { attempted: 0, updated: 0, skipped_already_ready: 0, failed: 0, status: "ok" };
  }

  const force = opts?.force_reembed === true;

  // If there's no provider, treat this as a retryable infra error. The job can be replayed
  // once the worker is configured correctly.
  if (!embedder) {
    for (const n of nodesIn) {
      await client.query(
        `
        UPDATE memory_nodes
        SET
          embedding_attempts = embedding_attempts + 1,
          embedding_last_error = $3,
          embedding_last_attempt_at = now()
        WHERE scope = $1 AND id = $2
        `,
        [scope, n.id, "embedding_provider_unavailable"],
      );
    }
    return {
      attempted: nodesIn.length,
      updated: 0,
      skipped_already_ready: 0,
      failed: nodesIn.length,
      status: "retryable_error",
      error_message: "embedding_provider_unavailable",
    };
  }

  // Filter out nodes already ready to keep the job idempotent.
  const ids = nodesIn.map((n) => n.id);
  const existing = await client.query<{ id: string; embedding_status: string; has_embedding: boolean }>(
    `
    SELECT id, embedding_status::text AS embedding_status, (embedding IS NOT NULL) AS has_embedding
    FROM memory_nodes
    WHERE scope=$1 AND id = ANY($2::uuid[])
    `,
    [scope, ids],
  );
  const existingMap = new Map(existing.rows.map((r) => [r.id, r]));

  const nodes: EmbedBackfillNode[] = [];
  let skipped = 0;
  for (const n of nodesIn) {
    const row = existingMap.get(n.id);
    if (!row) continue;
    if (!force && row.has_embedding && row.embedding_status === "ready") {
      skipped += 1;
      continue;
    }
    nodes.push(n);
  }

  if (nodes.length === 0) {
    return { attempted: 0, updated: 0, skipped_already_ready: skipped, failed: 0, status: "ok" };
  }

  // Normalize/redact again defensively (payload is already redacted, but this keeps job safe).
  const texts: string[] = [];
  const idsToEmbed: string[] = [];
  for (const n of nodes) {
    const norm = normalizeText(n.text ?? "", params.maxTextLen);
    const t = params.piiRedaction ? redactPII(norm).text : norm;
    if (!t) continue;
    idsToEmbed.push(n.id);
    texts.push(t);
  }

  if (texts.length === 0) {
    for (const id of ids) {
      const row = existingMap.get(id);
      const wasReady = !!row && row.has_embedding && row.embedding_status === "ready";
      const shouldFail = !wasReady;
      await client.query(
        `
        UPDATE memory_nodes
        SET
          embedding_attempts = embedding_attempts + 1,
          embedding_last_error = $3,
          embedding_last_attempt_at = now(),
          embedding_status = CASE WHEN $4 THEN 'failed' ELSE embedding_status END
        WHERE scope = $1 AND id = $2
        `,
        [scope, id, "no_embed_text", shouldFail],
      );
    }
    return { attempted: ids.length, updated: 0, skipped_already_ready: skipped, failed: ids.length, status: "fatal_error", error_message: "no_embed_text" };
  }

  let vectors: number[][];
  try {
    vectors = await embedder.embed(texts);
  } catch (err) {
    const c = classifyEmbedError(err);
    for (const id of idsToEmbed) {
      const row = existingMap.get(id);
      const wasReady = !!row && row.has_embedding && row.embedding_status === "ready";
      const shouldFail = c.status === "fatal_error" && !wasReady;
      await client.query(
        `
        UPDATE memory_nodes
        SET
          embedding_attempts = embedding_attempts + 1,
          embedding_last_error = $3,
          embedding_last_attempt_at = now(),
          embedding_status = CASE WHEN $4 THEN 'failed' ELSE embedding_status END
        WHERE scope = $1 AND id = $2
        `,
        [scope, id, c.message, shouldFail],
      );
    }
    return {
      attempted: idsToEmbed.length,
      updated: 0,
      skipped_already_ready: skipped,
      failed: idsToEmbed.length,
      status: c.status,
      error_message: c.message,
    };
  }

  let updated = 0;
  for (let i = 0; i < vectors.length; i++) {
    const id = idsToEmbed[i];
    const v = vectors[i];
    assertDim(v, 1536);
    await client.query(
      `
      UPDATE memory_nodes
      SET
        embedding = $3::vector(1536),
        embedding_model = $4,
        embedding_status = 'ready',
        embedding_attempts = embedding_attempts + 1,
        embedding_last_error = NULL,
        embedding_last_attempt_at = now(),
        embedding_ready_at = now()
      WHERE scope = $1 AND id = $2
      `,
      [scope, id, toVectorLiteral(v), embedder.name],
    );
    updated += 1;
  }

  return {
    attempted: idsToEmbed.length,
    updated,
    skipped_already_ready: skipped,
    failed: 0,
    status: "ok",
  };
}
