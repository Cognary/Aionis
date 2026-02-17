import { loadEnv } from "../config.js";
import { AionisApiError, AionisClient } from "../sdk/index.js";

function inferApiKeyFromEnv(): string | undefined {
  const explicit = process.env.API_KEY?.trim() || process.env.PERF_API_KEY?.trim();
  if (explicit) return explicit;
  const raw = process.env.MEMORY_API_KEYS_JSON?.trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const first = Object.keys(parsed)[0];
    return first ? first.trim() : undefined;
  } catch {
    return undefined;
  }
}

const env = loadEnv();
const port = env.PORT;
const scope = env.MEMORY_SCOPE;
const baseUrl = process.env.AIONIS_BASE_URL?.trim() || `http://localhost:${port}`;
const apiKey = inferApiKeyFromEnv();
const authBearer = process.env.AUTH_BEARER?.trim() || process.env.PERF_AUTH_BEARER?.trim() || undefined;

const client = new AionisClient({
  base_url: baseUrl,
  timeout_ms: 10_000,
  retry: { max_retries: 2 },
  admin_token: process.env.ADMIN_TOKEN || undefined,
  api_key: apiKey,
  auth_bearer: authBearer,
});

async function main() {
  const stamp = Date.now();
  const clientId = `sdk_smoke_evt_${stamp}`;

  const write = await client.write({
    scope,
    input_text: "sdk smoke write",
    auto_embed: false,
    memory_lane: "shared",
    nodes: [{ client_id: clientId, type: "event", text_summary: "sdk smoke event for typed client" }],
    edges: [],
  });

  const rules = await client.rulesEvaluate({
    scope,
    context: { intent: "json", provider: "minimax", tool: { name: "curl" } },
    include_shadow: true,
    limit: 50,
  });

  const tools = await client.toolsSelect({
    scope,
    context: { intent: "json", provider: "minimax", tool: { name: "curl" } },
    candidates: ["psql", "curl", "bash"],
    strict: false,
    include_shadow: false,
    rules_limit: 50,
  });

  let recallText: { ok: boolean; status: number; request_id: string | null; seeds: number } | { ok: false; reason: string };
  try {
    const recall = await client.recallText({
      scope,
      query_text: "memory graph",
      limit: 10,
      return_debug: false,
      include_embeddings: false,
      include_meta: false,
      include_slots: false,
      include_slots_preview: false,
      slots_preview_keys: 10,
      max_nodes: 30,
      max_edges: 60,
      ranked_limit: 100,
      neighborhood_hops: 2,
      min_edge_weight: 0,
      min_edge_confidence: 0,
      rules_include_shadow: false,
      rules_limit: 50,
    });
    recallText = {
      ok: true,
      status: recall.status,
      request_id: recall.request_id,
      seeds: Array.isArray(recall.data.seeds) ? recall.data.seeds.length : 0,
    };
  } catch (err) {
    if (err instanceof AionisApiError && err.code === "no_embedding_provider") {
      recallText = { ok: false, reason: "recall_text skipped: no embedding provider configured" };
    } else {
      throw err;
    }
  }

  const out = {
    ok: true,
    base_url: baseUrl,
    scope,
    calls: {
      write: {
        status: write.status,
        request_id: write.request_id,
        commit_id: write.data.commit_id,
        node_id: write.data.nodes?.[0]?.id ?? null,
      },
      rules_evaluate: {
        status: rules.status,
        request_id: rules.request_id,
        considered: Number((rules.data as any).considered ?? 0),
        matched: Number((rules.data as any).matched ?? 0),
      },
      tools_select: {
        status: tools.status,
        request_id: tools.request_id,
        selected: tools.data.selection?.selected ?? null,
        ordered: tools.data.selection?.ordered ?? [],
      },
      recall_text: recallText,
    },
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

main().catch((err) => {
  const out = {
    ok: false,
    error: String((err as any)?.code ?? (err as any)?.name ?? "error"),
    message: String((err as any)?.message ?? err),
    status: (err as any)?.status ?? null,
    request_id: (err as any)?.request_id ?? null,
    details: (err as any)?.details ?? null,
    issues: (err as any)?.issues ?? null,
  };
  process.stderr.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(1);
});
