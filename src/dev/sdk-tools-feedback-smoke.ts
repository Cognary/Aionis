import { loadEnv } from "../config.js";
import { AionisClient } from "../sdk/index.js";

const env = loadEnv();
const baseUrl = process.env.AIONIS_BASE_URL?.trim() || `http://localhost:${env.PORT}`;
const scope = env.MEMORY_SCOPE;
const apiKey = process.env.API_KEY?.trim() || process.env.PERF_API_KEY?.trim() || undefined;
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
  const context = { intent: "json", provider: "minimax", tool: { name: "curl" } };
  const candidates = ["psql", "curl", "bash"];
  const runId = `sdk_tools_fb_${Date.now()}`;

  const select = await client.toolsSelect({
    scope,
    run_id: runId,
    context,
    candidates,
    strict: false,
    include_shadow: false,
    rules_limit: 50,
  });

  const selectedTool = select.data.selection?.selected ?? select.data.selection?.ordered?.[0] ?? candidates[0];
  const decisionId = (select.data as any)?.decision?.decision_id as string | undefined;

  const feedback = await client.toolsFeedback({
    scope,
    run_id: runId,
    ...(decisionId ? { decision_id: decisionId } : {}),
    outcome: "positive",
    context,
    candidates,
    selected_tool: selectedTool,
    include_shadow: false,
    rules_limit: 50,
    target: "tool",
    input_text: "sdk tools feedback smoke",
  });

  const out = {
    ok: true,
    base_url: baseUrl,
    scope,
    selected_tool: selectedTool,
    requests: {
      select: { status: select.status, request_id: select.request_id },
      feedback: { status: feedback.status, request_id: feedback.request_id },
    },
    feedback_result: feedback.data,
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
