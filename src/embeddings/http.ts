type RetryConfig = {
  timeoutMs: number;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  maxConcurrency: number;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms: number) {
  // Full jitter in [0, ms]
  return Math.floor(Math.random() * (ms + 1));
}

function isRetryableStatus(status: number): boolean {
  if (status === 429) return true;
  return status >= 500 && status <= 599;
}

function capText(s: string, maxBytes: number): string {
  if (!s) return "";
  const buf = Buffer.from(s, "utf8");
  if (buf.byteLength <= maxBytes) return s;
  return buf.subarray(0, maxBytes).toString("utf8") + "…(truncated)";
}

async function readTextSafe(res: Response, maxBytes: number): Promise<string> {
  try {
    const t = await res.text();
    return capText(t, maxBytes);
  } catch {
    return "";
  }
}

class Semaphore {
  private available: number;
  private queue: Array<() => void> = [];

  constructor(count: number) {
    this.available = Math.max(1, Math.floor(count));
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1;
      return () => this.release();
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.available -= 1;
        resolve(() => this.release());
      });
    });
  }

  private release() {
    this.available += 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

export class EmbedHttpError extends Error {
  status: number | null;
  bodyPreview: string;

  constructor(message: string, status: number | null, bodyPreview: string) {
    super(message);
    this.name = "EmbedHttpError";
    this.status = status;
    this.bodyPreview = bodyPreview;
  }
}

export function createEmbedJsonPoster(cfg: RetryConfig) {
  const sem = new Semaphore(cfg.maxConcurrency);

  async function postJson<T>(url: string, headers: Record<string, string>, body: unknown): Promise<T> {
    const release = await sem.acquire();
    try {
      let lastErr: unknown = null;

      for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), cfg.timeoutMs);

        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json", ...headers },
            body: JSON.stringify(body),
            signal: controller.signal,
          });

          if (res.ok) {
            // Assume success responses are JSON.
            return (await res.json()) as T;
          }

          // Retry on 429/5xx; fail fast on other 4xx.
          const preview = await readTextSafe(res, 2048);
          const msg = `embeddings http error: ${res.status} ${res.statusText}`;
          if (!isRetryableStatus(res.status) || attempt >= cfg.maxRetries) {
            throw new EmbedHttpError(msg, res.status, preview);
          }

          lastErr = new EmbedHttpError(msg, res.status, preview);
        } catch (err: any) {
          lastErr = err;
          // Network errors / aborts are retryable. But do not loop forever.
          if (attempt >= cfg.maxRetries) break;
        } finally {
          clearTimeout(t);
        }

        const backoff = Math.min(cfg.maxDelayMs, cfg.baseDelayMs * Math.pow(2, attempt));
        await sleep(backoff + jitter(cfg.baseDelayMs));
      }

      const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
      if (lastErr instanceof EmbedHttpError) {
        throw new EmbedHttpError(
          `embeddings request failed after retries: ${msg}`,
          lastErr.status,
          lastErr.bodyPreview,
        );
      }
      throw new EmbedHttpError(`embeddings request failed after retries: ${msg}`, null, "");
    } finally {
      release();
    }
  }

  return { postJson };
}

export type EmbedHttpConfig = RetryConfig;
