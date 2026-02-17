import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AionisClient } from "../sdk/index.js";

function readJsonFile(path: string): any {
  const abs = resolve(path);
  const txt = readFileSync(abs, "utf8");
  return JSON.parse(txt);
}

async function main() {
  const ctxFile = process.argv[2];
  if (!ctxFile) {
    throw new Error("usage: tsx src/dev/sdk-rules-evaluate.ts <planner_context.json>");
  }
  const contextObj = readJsonFile(ctxFile);

  const scope = typeof contextObj?.scope === "string" && contextObj.scope.trim().length > 0 ? contextObj.scope.trim() : undefined;
  const baseUrl = process.env.AIONIS_BASE_URL?.trim() || `http://localhost:${process.env.PORT || "3001"}`;
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

  const out = await client.rulesEvaluate({
    ...(scope ? { scope } : {}),
    context: contextObj,
    include_shadow: true,
    limit: 50,
  });

  process.stdout.write(`${JSON.stringify(out.data)}\n`);
}

main().catch((err) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        ok: false,
        error: String((err as any)?.code ?? (err as any)?.name ?? "error"),
        message: String((err as any)?.message ?? err),
        status: (err as any)?.status ?? null,
        request_id: (err as any)?.request_id ?? null,
        details: (err as any)?.details ?? null,
      },
      null,
      2,
    )}\n`,
  );
  process.exit(1);
});
