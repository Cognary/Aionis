import { randomUUID } from "node:crypto";
import type {
  AionisClientOptions,
  AionisResponse,
  ApiErrorPayload,
  MemoryEventWriteInput,
  MemoryEventWriteResponse,
  MemoryFindInput,
  MemoryFindResponse,
  MemoryPackExportInput,
  MemoryPackExportResponse,
  MemoryPackImportInput,
  MemoryPackImportResponse,
  MemoryRecallInput,
  MemoryRecallResponse,
  MemoryRecallTextInput,
  MemorySessionCreateInput,
  MemorySessionCreateResponse,
  MemorySessionEventsListInput,
  MemorySessionEventsListResponse,
  MemoryWriteInput,
  MemoryWriteResponse,
  RequestOptions,
  RetryPolicy,
  RulesEvaluateInput,
  RulesEvaluateResponse,
  ToolsFeedbackInput,
  ToolsFeedbackResponse,
  ToolsSelectInput,
  ToolsSelectResponse,
} from "./types.js";
import { AionisApiError, AionisNetworkError } from "./types.js";

const DEFAULT_RETRY: RetryPolicy = {
  max_retries: 2,
  base_delay_ms: 200,
  max_delay_ms: 2000,
  jitter_ratio: 0.2,
};

function mergeRetryPolicy(base: RetryPolicy, override?: Partial<RetryPolicy>): RetryPolicy {
  return {
    max_retries: override?.max_retries ?? base.max_retries,
    base_delay_ms: override?.base_delay_ms ?? base.base_delay_ms,
    max_delay_ms: override?.max_delay_ms ?? base.max_delay_ms,
    jitter_ratio: override?.jitter_ratio ?? base.jitter_ratio,
  };
}

function clampRetryPolicy(p: RetryPolicy): RetryPolicy {
  return {
    max_retries: Math.max(0, Math.min(10, Math.trunc(p.max_retries))),
    base_delay_ms: Math.max(1, Math.min(30_000, Math.trunc(p.base_delay_ms))),
    max_delay_ms: Math.max(1, Math.min(60_000, Math.trunc(p.max_delay_ms))),
    jitter_ratio: Math.max(0, Math.min(1, p.jitter_ratio)),
  };
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function parseRetryAfterMs(res: Response): number | null {
  const v = res.headers.get("retry-after");
  if (!v) return null;
  const sec = Number(v);
  if (Number.isFinite(sec) && sec > 0) return Math.round(sec * 1000);
  return null;
}

function computeBackoffMs(policy: RetryPolicy, attempt: number): number {
  const exp = policy.base_delay_ms * Math.pow(2, Math.max(0, attempt - 1));
  const capped = Math.min(exp, policy.max_delay_ms);
  const spread = capped * policy.jitter_ratio;
  const jitter = spread > 0 ? (Math.random() * 2 - 1) * spread : 0;
  return Math.max(1, Math.round(capped + jitter));
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return;
  }
  if (signal.aborted) throw new Error("aborted");
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      signal.removeEventListener("abort", onAbort);
      reject(new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort);
  });
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function buildQueryString(query: Record<string, unknown> | undefined): string {
  if (!query) return "";
  const qp = new URLSearchParams();
  for (const [k, raw] of Object.entries(query)) {
    if (raw === undefined || raw === null) continue;
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (item === undefined || item === null) continue;
        qp.append(k, String(item));
      }
      continue;
    }
    qp.append(k, String(raw));
  }
  const s = qp.toString();
  return s.length > 0 ? `?${s}` : "";
}

async function parseBody(res: Response): Promise<unknown> {
  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  if (ct.includes("application/json")) {
    return res.json();
  }
  const txt = await res.text();
  return txt.length > 0 ? txt : null;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const want = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === want);
}

export class AionisClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retry: RetryPolicy;
  private readonly defaultHeaders: Record<string, string>;
  private readonly adminToken?: string;
  private readonly apiKey?: string;
  private readonly authBearer?: string;

  constructor(opts: AionisClientOptions) {
    this.baseUrl = opts.base_url.replace(/\/+$/, "");
    this.timeoutMs = opts.timeout_ms ?? 10_000;
    this.retry = clampRetryPolicy(mergeRetryPolicy(DEFAULT_RETRY, opts.retry));
    this.defaultHeaders = opts.default_headers ?? {};
    this.adminToken = opts.admin_token;
    this.apiKey = opts.api_key;
    this.authBearer = opts.auth_bearer;
  }

  async write(input: MemoryWriteInput, opts?: RequestOptions): Promise<AionisResponse<MemoryWriteResponse>> {
    return this.requestPost<MemoryWriteInput, MemoryWriteResponse>("/v1/memory/write", input, opts);
  }

  async recall(input: MemoryRecallInput, opts?: RequestOptions): Promise<AionisResponse<MemoryRecallResponse>> {
    return this.requestPost<MemoryRecallInput, MemoryRecallResponse>("/v1/memory/recall", input, opts);
  }

  async recallText(input: MemoryRecallTextInput, opts?: RequestOptions): Promise<AionisResponse<MemoryRecallResponse>> {
    return this.requestPost<MemoryRecallTextInput, MemoryRecallResponse>("/v1/memory/recall_text", input, opts);
  }

  async find(input: MemoryFindInput, opts?: RequestOptions): Promise<AionisResponse<MemoryFindResponse>> {
    return this.requestPost<MemoryFindInput, MemoryFindResponse>("/v1/memory/find", input, opts);
  }

  async createSession(input: MemorySessionCreateInput, opts?: RequestOptions): Promise<AionisResponse<MemorySessionCreateResponse>> {
    return this.requestPost<MemorySessionCreateInput, MemorySessionCreateResponse>("/v1/memory/sessions", input, opts);
  }

  async writeEvent(input: MemoryEventWriteInput, opts?: RequestOptions): Promise<AionisResponse<MemoryEventWriteResponse>> {
    return this.requestPost<MemoryEventWriteInput, MemoryEventWriteResponse>("/v1/memory/events", input, opts);
  }

  async listSessionEvents(
    sessionId: string,
    input?: MemorySessionEventsListInput,
    opts?: RequestOptions,
  ): Promise<AionisResponse<MemorySessionEventsListResponse>> {
    const sid = String(sessionId ?? "").trim();
    if (!sid) throw new Error("sessionId is required");
    const path = `/v1/memory/sessions/${encodeURIComponent(sid)}/events`;
    return this.requestGet<MemorySessionEventsListResponse>(path, input ?? {}, opts);
  }

  async packExport(input: MemoryPackExportInput, opts?: RequestOptions): Promise<AionisResponse<MemoryPackExportResponse>> {
    return this.requestPost<MemoryPackExportInput, MemoryPackExportResponse>("/v1/memory/packs/export", input, opts);
  }

  async packImport(input: MemoryPackImportInput, opts?: RequestOptions): Promise<AionisResponse<MemoryPackImportResponse>> {
    return this.requestPost<MemoryPackImportInput, MemoryPackImportResponse>("/v1/memory/packs/import", input, opts);
  }

  async rulesEvaluate(input: RulesEvaluateInput, opts?: RequestOptions): Promise<AionisResponse<RulesEvaluateResponse>> {
    return this.requestPost<RulesEvaluateInput, RulesEvaluateResponse>("/v1/memory/rules/evaluate", input, opts);
  }

  async toolsSelect(input: ToolsSelectInput, opts?: RequestOptions): Promise<AionisResponse<ToolsSelectResponse>> {
    return this.requestPost<ToolsSelectInput, ToolsSelectResponse>("/v1/memory/tools/select", input, opts);
  }

  async toolsFeedback(input: ToolsFeedbackInput, opts?: RequestOptions): Promise<AionisResponse<ToolsFeedbackResponse>> {
    return this.requestPost<ToolsFeedbackInput, ToolsFeedbackResponse>("/v1/memory/tools/feedback", input, opts);
  }

  private async requestPost<TReq, TRes>(path: string, body: TReq, opts?: RequestOptions): Promise<AionisResponse<TRes>> {
    return this.request<TRes>("POST", path, opts, body, undefined);
  }

  private async requestGet<TRes>(path: string, query?: Record<string, unknown>, opts?: RequestOptions): Promise<AionisResponse<TRes>> {
    return this.request<TRes>("GET", path, opts, undefined, query);
  }

  private async request<TRes>(
    method: "GET" | "POST",
    path: string,
    opts?: RequestOptions,
    body?: unknown,
    query?: Record<string, unknown>,
  ): Promise<AionisResponse<TRes>> {
    const requestId = opts?.request_id ?? randomUUID();
    const perReqRetry = clampRetryPolicy(mergeRetryPolicy(this.retry, opts?.retry));
    const timeoutMs = opts?.timeout_ms ?? this.timeoutMs;
    const url = `${joinUrl(this.baseUrl, path)}${buildQueryString(query)}`;

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-request-id": requestId,
      ...this.defaultHeaders,
      ...(opts?.headers ?? {}),
    };
    const apiKey = opts?.api_key ?? this.apiKey;
    if (apiKey && !hasHeader(headers, "x-api-key")) headers["x-api-key"] = apiKey;

    const authBearer = opts?.auth_bearer ?? this.authBearer;
    if (authBearer && !hasHeader(headers, "authorization")) {
      headers.authorization = authBearer.toLowerCase().startsWith("bearer ") ? authBearer : `Bearer ${authBearer}`;
    }

    const adminToken = opts?.admin_token ?? this.adminToken;
    if (adminToken && !hasHeader(headers, "x-admin-token")) headers["x-admin-token"] = adminToken;

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= perReqRetry.max_retries; attempt++) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
          signal: abort.signal,
        });
        clearTimeout(timer);
        const responseRequestId = res.headers.get("x-request-id") ?? requestId;
        const parsedBody = (await parseBody(res)) as TRes | ApiErrorPayload;

        if (res.ok) {
          return {
            data: parsedBody as TRes,
            status: res.status,
            request_id: responseRequestId,
          };
        }

        const errPayload = (parsedBody ?? {}) as ApiErrorPayload;
        const code = errPayload.error ?? `http_${res.status}`;
        const message = errPayload.message ?? `request failed with status ${res.status}`;
        const apiErr = new AionisApiError({
          status: res.status,
          code,
          message,
          details: errPayload.details ?? null,
          request_id: responseRequestId,
          issues: Array.isArray(errPayload.issues) ? errPayload.issues : null,
        });

        const canRetry = attempt < perReqRetry.max_retries && shouldRetryStatus(res.status);
        if (!canRetry) throw apiErr;

        const retryAfterMs = parseRetryAfterMs(res);
        await sleep(retryAfterMs ?? computeBackoffMs(perReqRetry, attempt + 1));
        continue;
      } catch (err: any) {
        clearTimeout(timer);
        lastError = err;

        const isAbort = err?.name === "AbortError" || String(err?.message ?? "").toLowerCase().includes("aborted");
        const canRetry = attempt < perReqRetry.max_retries;
        if (!canRetry) break;

        if (err instanceof AionisApiError) {
          throw err;
        }
        await sleep(computeBackoffMs(perReqRetry, attempt + 1));
        if (isAbort) continue;
      }
    }

    if (lastError instanceof AionisApiError) throw lastError;
    throw new AionisNetworkError(
      `network request failed for ${method} ${path}: ${String((lastError as any)?.message ?? lastError ?? "unknown error")}`,
      requestId,
    );
  }
}
