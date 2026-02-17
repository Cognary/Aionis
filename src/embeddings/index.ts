import { z } from "zod";
import { FakeEmbeddingProvider } from "./fake.js";
import { createMinimaxEmbeddingProvider } from "./minimax.js";
import { createOpenAIEmbeddingProvider } from "./openai.js";
import type { EmbeddingProvider } from "./types.js";
import type { EmbedHttpConfig } from "./http.js";

const ProviderEnvSchema = z.object({
  EMBEDDING_PROVIDER: z.enum(["none", "fake", "openai", "minimax"]).default("fake"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  OPENAI_EMBED_BATCH_SIZE: z.coerce.number().int().positive().max(256).default(32),
  EMBEDDING_DIM: z.coerce.number().int().positive().default(1536),

  MINIMAX_API_KEY: z.string().optional(),
  MINIMAX_GROUP_ID: z.string().optional(),
  MINIMAX_EMBED_MODEL: z.string().default("embo-01"),
  MINIMAX_EMBED_TYPE: z.enum(["db", "query"]).default("db"),
  MINIMAX_EMBED_ENDPOINT: z.string().default("https://api.minimax.chat/v1/embeddings"),

  // Embedding HTTP hardening
  EMBED_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  EMBED_HTTP_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(2),
  EMBED_HTTP_BASE_DELAY_MS: z.coerce.number().int().positive().default(250),
  EMBED_HTTP_MAX_DELAY_MS: z.coerce.number().int().positive().default(5_000),
  EMBED_HTTP_MAX_CONCURRENCY: z.coerce.number().int().positive().max(128).default(8),
});

export function createEmbeddingProviderFromEnv(env: Record<string, string | undefined>): EmbeddingProvider | null {
  const parsed = ProviderEnvSchema.parse(env);

  if (parsed.EMBEDDING_DIM !== 1536) {
    throw new Error(`EMBEDDING_DIM must be 1536; got ${parsed.EMBEDDING_DIM}`);
  }

  if (parsed.EMBEDDING_PROVIDER === "none") return null;
  if (parsed.EMBEDDING_PROVIDER === "fake") return FakeEmbeddingProvider;

  const httpCfg: EmbedHttpConfig = {
    timeoutMs: parsed.EMBED_HTTP_TIMEOUT_MS,
    maxRetries: parsed.EMBED_HTTP_MAX_RETRIES,
    baseDelayMs: parsed.EMBED_HTTP_BASE_DELAY_MS,
    maxDelayMs: parsed.EMBED_HTTP_MAX_DELAY_MS,
    maxConcurrency: parsed.EMBED_HTTP_MAX_CONCURRENCY,
  };

  if (parsed.EMBEDDING_PROVIDER === "minimax") {
    if (!parsed.MINIMAX_API_KEY) throw new Error("EMBEDDING_PROVIDER=minimax requires MINIMAX_API_KEY");
    if (!parsed.MINIMAX_GROUP_ID) throw new Error("EMBEDDING_PROVIDER=minimax requires MINIMAX_GROUP_ID");
    return createMinimaxEmbeddingProvider({
      apiKey: parsed.MINIMAX_API_KEY,
      groupId: parsed.MINIMAX_GROUP_ID,
      model: parsed.MINIMAX_EMBED_MODEL,
      endpointUrl: parsed.MINIMAX_EMBED_ENDPOINT,
      embedType: parsed.MINIMAX_EMBED_TYPE,
      dim: parsed.EMBEDDING_DIM,
      http: httpCfg,
    });
  }

  if (!parsed.OPENAI_API_KEY) {
    throw new Error("EMBEDDING_PROVIDER=openai requires OPENAI_API_KEY");
  }
  return createOpenAIEmbeddingProvider({
    apiKey: parsed.OPENAI_API_KEY,
    model: parsed.OPENAI_EMBEDDING_MODEL,
    dim: parsed.EMBEDDING_DIM,
    batchSize: parsed.OPENAI_EMBED_BATCH_SIZE,
    http: httpCfg,
  });
}
