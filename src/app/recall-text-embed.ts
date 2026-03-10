import { EmbedHttpError } from "../embeddings/http.js";
import { sha256Hex } from "../util/crypto.js";
import { EmbedQueryBatcherError } from "../util/embed_query_batcher.js";

type RecallTextEmbedCacheLike = {
  get: (key: string) => number[] | undefined;
  set: (key: string, value: number[]) => void;
};

type RecallTextEmbedInflightLike = Map<string, Promise<{ vector: number[]; queue_wait_ms: number; batch_size: number }>>;

type RecallTextEmbedBatcherLike = {
  enqueue: (key: string, text: string) => Promise<{ vector: number[]; queue_wait_ms: number; batch_size: number }>;
};

export function createRecallTextEmbedRuntime(args: {
  recallTextEmbedCache: RecallTextEmbedCacheLike | null;
  recallTextEmbedInflight: RecallTextEmbedInflightLike;
  recallTextEmbedBatcher: RecallTextEmbedBatcherLike | null;
}) {
  const {
    recallTextEmbedCache,
    recallTextEmbedInflight,
    recallTextEmbedBatcher,
  } = args;

  async function embedRecallTextQuery(
    provider: { name: string; embed: (texts: string[]) => Promise<number[][]> },
    queryText: string,
  ): Promise<{ vec: number[]; ms: number; cache_hit: boolean; singleflight_join: boolean; queue_wait_ms: number; batch_size: number }> {
    const cacheKey = `${provider.name}:${sha256Hex(queryText)}`;
    const cached = recallTextEmbedCache?.get(cacheKey);
    if (cached) {
      return { vec: cached.slice(), ms: 0, cache_hit: true, singleflight_join: false, queue_wait_ms: 0, batch_size: 1 };
    }

    const joined = recallTextEmbedInflight.get(cacheKey);
    if (joined) {
      const t0 = performance.now();
      const out = await joined;
      const ms = performance.now() - t0;
      return {
        vec: out.vector.slice(),
        ms,
        cache_hit: false,
        singleflight_join: true,
        queue_wait_ms: out.queue_wait_ms,
        batch_size: out.batch_size,
      };
    }

    const inflight = (async (): Promise<{ vector: number[]; queue_wait_ms: number; batch_size: number }> => {
      if (recallTextEmbedBatcher) {
        const batched = await recallTextEmbedBatcher.enqueue(cacheKey, queryText);
        recallTextEmbedCache?.set(cacheKey, batched.vector);
        return batched;
      }

      const [vec] = await provider.embed([queryText]);
      if (!Array.isArray(vec) || vec.length !== 1536) {
        throw new Error(`invalid query embedding result: expected dim=1536, got ${Array.isArray(vec) ? vec.length : "non-array"}`);
      }
      recallTextEmbedCache?.set(cacheKey, vec);
      return { vector: vec, queue_wait_ms: 0, batch_size: 1 };
    })().finally(() => {
      recallTextEmbedInflight.delete(cacheKey);
    });

    recallTextEmbedInflight.set(cacheKey, inflight);
    const t0 = performance.now();
    const out = await inflight;
    const ms = performance.now() - t0;
    return {
      vec: out.vector.slice(),
      ms,
      cache_hit: false,
      singleflight_join: false,
      queue_wait_ms: out.queue_wait_ms,
      batch_size: out.batch_size,
    };
  }

  function mapRecallTextEmbeddingError(err: unknown): {
    statusCode: number;
    code: string;
    message: string;
    retry_after_sec?: number;
    details?: Record<string, unknown>;
  } {
    if (err instanceof EmbedQueryBatcherError) {
      const isQueueFull = err.code === "queue_full";
      return {
        statusCode: isQueueFull ? 429 : 503,
        code: isQueueFull ? "recall_text_embed_queue_full" : "recall_text_embed_queue_timeout",
        message: isQueueFull
          ? "recall_text embedding queue is saturated; retry later"
          : "recall_text embedding queue timed out; retry later",
        retry_after_sec: isQueueFull ? 1 : 2,
        details: err.details,
      };
    }

    const msg = String((err as any)?.message ?? err ?? "");
    const msgLc = msg.toLowerCase();
    const isRateLimit =
      (err instanceof EmbedHttpError && err.status === 429) ||
      msgLc.includes("rate limit") ||
      msgLc.includes("too many requests") ||
      msgLc.includes("status_code\":1002");
    if (isRateLimit) {
      return {
        statusCode: 429,
        code: "upstream_embedding_rate_limited",
        message: "embedding provider is rate limited; retry later",
        retry_after_sec: 2,
        details: { provider_status: err instanceof EmbedHttpError ? err.status : null },
      };
    }

    const isTimeoutLike =
      msgLc.includes("abort") || msgLc.includes("timeout") || msgLc.includes("timed out") || msgLc.includes("fetch failed");
    if (isTimeoutLike) {
      return {
        statusCode: 503,
        code: "upstream_embedding_unavailable",
        message: "embedding provider timeout/unavailable; retry later",
        retry_after_sec: 1,
        details: { provider_status: err instanceof EmbedHttpError ? err.status : null },
      };
    }

    if (err instanceof EmbedHttpError && typeof err.status === "number") {
      if (err.status >= 500) {
        return {
          statusCode: 503,
          code: "upstream_embedding_unavailable",
          message: "embedding provider unavailable; retry later",
          retry_after_sec: 1,
          details: { provider_status: err.status },
        };
      }
      return {
        statusCode: 502,
        code: "upstream_embedding_bad_response",
        message: "embedding provider returned an unexpected response",
        details: { provider_status: err.status },
      };
    }

    return {
      statusCode: 503,
      code: "upstream_embedding_unavailable",
      message: "embedding provider unavailable; retry later",
      retry_after_sec: 1,
    };
  }

  return {
    embedRecallTextQuery,
    mapRecallTextEmbeddingError,
  };
}
