import "dotenv/config";
import { loadEnv } from "../config.js";

type CaseName = "recall_text" | "write";

type Sample = {
  ok: boolean;
  status: number;
  ms: number;
  error?: string;
};

type CaseSummary = {
  name: CaseName;
  total: number;
  ok: number;
  failed: number;
  rps: number;
  latency_ms: {
    min: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
    mean: number;
  };
  by_status: Record<string, number>;
  transport_error_count: number;
  transport_error_rate: number;
};

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return null;
  return v;
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1));
  return sorted[idx];
}

function round(v: number, d = 3): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

async function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function pickApiKey(envJson: string): string | null {
  try {
    const o = JSON.parse(envJson) as Record<string, unknown>;
    const keys = Object.keys(o ?? {});
    return keys.length > 0 ? keys[0] : null;
  } catch {
    return null;
  }
}

async function runConcurrent(total: number, concurrency: number, fn: (i: number) => Promise<Sample>): Promise<Sample[]> {
  const out: Sample[] = [];
  let next = 0;
  const workers: Promise<void>[] = [];

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= total) return;
      out.push(await fn(i));
    }
  };

  for (let i = 0; i < concurrency; i += 1) workers.push(worker());
  await Promise.all(workers);
  return out;
}

function summarize(name: CaseName, samples: Sample[], elapsedMs: number): CaseSummary {
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
  const ok = samples.filter((s) => s.ok).length;
  const failed = samples.length - ok;
  const byStatus: Record<string, number> = {};
  for (const s of samples) {
    const k = s.error ? `error:${s.error}` : String(s.status);
    byStatus[k] = (byStatus[k] ?? 0) + 1;
  }
  const sum = ms.reduce((a, b) => a + b, 0);
  const transportErrorCount = Object.entries(byStatus).reduce((acc, [k, v]) => {
    if (k.startsWith("error:")) return acc + Number(v);
    return acc;
  }, 0);
  const transportErrorRate = samples.length > 0 ? transportErrorCount / samples.length : 0;
  return {
    name,
    total: samples.length,
    ok,
    failed,
    rps: elapsedMs > 0 ? round((samples.length * 1000) / elapsedMs, 2) : 0,
    latency_ms: {
      min: round(ms[0] ?? 0),
      p50: round(quantile(ms, 0.5)),
      p95: round(quantile(ms, 0.95)),
      p99: round(quantile(ms, 0.99)),
      max: round(ms[ms.length - 1] ?? 0),
      mean: ms.length > 0 ? round(sum / ms.length) : 0,
    },
    by_status: byStatus,
    transport_error_count: transportErrorCount,
    transport_error_rate: round(transportErrorRate, 6),
  };
}

async function main() {
  const env = loadEnv();
  const baseUrl = argValue("--base-url") ?? `http://localhost:${env.PORT}`;
  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const tenantId = argValue("--tenant-id") ?? env.MEMORY_TENANT_ID;
  const modeRaw = (argValue("--mode") ?? "all").trim().toLowerCase();
  const mode = modeRaw === "recall" || modeRaw === "write" || modeRaw === "all" ? modeRaw : "all";

  const warmup = clampInt(Number(argValue("--warmup") ?? "20"), 0, 2000);
  const recallRequests = clampInt(Number(argValue("--recall-requests") ?? "200"), 1, 100000);
  const writeRequests = clampInt(Number(argValue("--write-requests") ?? "80"), 1, 100000);
  const recallConcurrency = clampInt(Number(argValue("--recall-concurrency") ?? "12"), 1, 512);
  const writeConcurrency = clampInt(Number(argValue("--write-concurrency") ?? "4"), 1, 128);
  const timeoutMs = clampInt(Number(argValue("--timeout-ms") ?? "15000"), 1000, 120000);
  const paceMs = clampInt(Number(argValue("--pace-ms") ?? "0"), 0, 5000);
  const failTransportRateRaw = argValue("--fail-on-transport-error-rate") ?? "";
  const failTransportRate = failTransportRateRaw === "" ? null : Math.max(0, Math.min(1, Number(failTransportRateRaw)));
  const embedOnWrite = (argValue("--embed-on-write") ?? "false").trim().toLowerCase() === "true";

  const apiKey = process.env.PERF_API_KEY?.trim() || pickApiKey(process.env.MEMORY_API_KEYS_JSON ?? "");
  const bearer = process.env.PERF_AUTH_BEARER?.trim() || "";
  const authMode = env.MEMORY_AUTH_MODE;
  if ((authMode === "api_key" || authMode === "api_key_or_jwt") && !apiKey && !bearer) {
    throw new Error("auth mode requires credentials; set PERF_API_KEY or PERF_AUTH_BEARER");
  }
  if (authMode === "jwt" && !bearer) {
    throw new Error("jwt auth mode requires PERF_AUTH_BEARER");
  }

  const headers = new Headers();
  headers.set("content-type", "application/json");
  if (apiKey) headers.set("x-api-key", apiKey);
  if (bearer) headers.set("authorization", `Bearer ${bearer}`);

  const timedRequest = async (path: string, body: Record<string, unknown>): Promise<Sample> => {
    const t0 = process.hrtime.bigint();
    const ac = new AbortController();
    const tm = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      const ms = Number(process.hrtime.bigint() - t0) / 1_000_000;
      return { ok: res.ok, status: res.status, ms };
    } catch (e: any) {
      const ms = Number(process.hrtime.bigint() - t0) / 1_000_000;
      return { ok: false, status: 0, ms, error: String(e?.name ?? e?.message ?? "request_error") };
    } finally {
      clearTimeout(tm);
    }
  };

  const warmupReq = async () => {
    await timedRequest("/v1/memory/recall_text", {
      tenant_id: tenantId,
      scope,
      query_text: "perf warmup",
      limit: 20,
    });
  };
  for (let i = 0; i < warmup; i += 1) await warmupReq();

  const cases: Array<{ name: CaseName; summary: CaseSummary }> = [];

  if (mode === "all" || mode === "recall") {
    const t0 = Date.now();
    const samples = await runConcurrent(recallRequests, recallConcurrency, async () => {
      if (paceMs > 0) await sleepMs(paceMs);
      return timedRequest("/v1/memory/recall_text", {
        tenant_id: tenantId,
        scope,
        query_text: "memory graph perf",
        limit: 20,
      });
    });
    cases.push({ name: "recall_text", summary: summarize("recall_text", samples, Date.now() - t0) });
  }

  if (mode === "all" || mode === "write") {
    const runTag = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const t0 = Date.now();
    const samples = await runConcurrent(writeRequests, writeConcurrency, async (i) => {
      if (paceMs > 0) await sleepMs(paceMs);
      return timedRequest("/v1/memory/write", {
        tenant_id: tenantId,
        scope,
        input_text: `perf write ${runTag} #${i}`,
        auto_embed: embedOnWrite,
        memory_lane: "shared",
        nodes: [
          {
            client_id: `perf_write_${runTag}_${i}`,
            type: "event",
            text_summary: `perf write payload #${i}`,
          },
        ],
      });
    });
    cases.push({ name: "write", summary: summarize("write", samples, Date.now() - t0) });
  }

  const caseSummaries = cases.map((c) => c.summary);
  const transportFailCases =
    failTransportRate === null || !Number.isFinite(failTransportRate)
      ? []
      : caseSummaries
          .filter((c) => c.transport_error_rate > (failTransportRate as number))
          .map((c) => ({
            name: c.name,
            transport_error_count: c.transport_error_count,
            transport_error_rate: c.transport_error_rate,
          }));
  const runOk = transportFailCases.length === 0;

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: runOk,
        base_url: baseUrl,
        auth_mode: authMode,
        scope,
        tenant_id: tenantId,
        params: {
          mode,
          warmup,
          recall_requests: recallRequests,
          recall_concurrency: recallConcurrency,
          write_requests: writeRequests,
          write_concurrency: writeConcurrency,
          timeout_ms: timeoutMs,
          pace_ms: paceMs,
          fail_on_transport_error_rate: failTransportRate,
          embed_on_write: embedOnWrite,
        },
        quality: {
          transport_error_gate: {
            enabled: failTransportRate !== null && Number.isFinite(failTransportRate),
            threshold: failTransportRate,
            failed_cases: transportFailCases,
          },
        },
        cases: caseSummaries,
      },
      null,
      2,
    ),
  );

  if (!runOk) process.exitCode = 2;
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
