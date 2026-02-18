export type EmbedBatchResult = {
  vector: number[];
  queue_wait_ms: number;
  batch_size: number;
};

export type EmbedQueryBatcherOptions = {
  maxBatchSize: number;
  maxBatchWaitMs: number;
  maxInflightBatches: number;
  maxQueue: number;
  queueTimeoutMs: number;
  runBatch: (texts: string[]) => Promise<number[][]>;
};

type Pending = {
  key: string;
  text: string;
  enqueuedAtMs: number;
  resolve: (out: EmbedBatchResult) => void;
  reject: (err: unknown) => void;
};

export class EmbedQueryBatcherError extends Error {
  code: "queue_full" | "queue_timeout";
  details: Record<string, unknown>;

  constructor(code: "queue_full" | "queue_timeout", message: string, details: Record<string, unknown>) {
    super(message);
    this.name = "EmbedQueryBatcherError";
    this.code = code;
    this.details = details;
  }
}

export class EmbedQueryBatcher {
  private readonly maxBatchSize: number;
  private readonly maxBatchWaitMs: number;
  private readonly maxInflightBatches: number;
  private readonly maxQueue: number;
  private readonly queueTimeoutMs: number;
  private readonly runBatch: (texts: string[]) => Promise<number[][]>;

  private queue: Pending[] = [];
  private inflightBatches = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: EmbedQueryBatcherOptions) {
    this.maxBatchSize = Math.max(1, Math.trunc(opts.maxBatchSize));
    this.maxBatchWaitMs = Math.max(0, Math.trunc(opts.maxBatchWaitMs));
    this.maxInflightBatches = Math.max(1, Math.trunc(opts.maxInflightBatches));
    this.maxQueue = Math.max(1, Math.trunc(opts.maxQueue));
    this.queueTimeoutMs = Math.max(1, Math.trunc(opts.queueTimeoutMs));
    this.runBatch = opts.runBatch;
  }

  stats(): { queued: number; inflight_batches: number; max_queue: number; max_inflight_batches: number } {
    return {
      queued: this.queue.length,
      inflight_batches: this.inflightBatches,
      max_queue: this.maxQueue,
      max_inflight_batches: this.maxInflightBatches,
    };
  }

  enqueue(key: string, text: string): Promise<EmbedBatchResult> {
    if (this.queue.length >= this.maxQueue) {
      throw new EmbedQueryBatcherError("queue_full", "embed queue is full", {
        queued: this.queue.length,
        max_queue: this.maxQueue,
        inflight_batches: this.inflightBatches,
        max_inflight_batches: this.maxInflightBatches,
      });
    }
    const enqueuedAtMs = Date.now();
    const p = new Promise<EmbedBatchResult>((resolve, reject) => {
      this.queue.push({ key, text, enqueuedAtMs, resolve, reject });
    });
    this.scheduleFlush();
    return p;
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.maxBatchWaitMs);
  }

  private scheduleImmediateFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 0);
  }

  private async flush() {
    while (this.inflightBatches < this.maxInflightBatches && this.queue.length > 0) {
      const now = Date.now();
      const picked: Pending[] = [];
      while (picked.length < this.maxBatchSize && this.queue.length > 0) {
        const item = this.queue.shift()!;
        const waitMs = now - item.enqueuedAtMs;
        if (waitMs > this.queueTimeoutMs) {
          item.reject(
            new EmbedQueryBatcherError("queue_timeout", "embed queue timeout", {
              wait_ms: waitMs,
              queue_timeout_ms: this.queueTimeoutMs,
              queued: this.queue.length,
              inflight_batches: this.inflightBatches,
            }),
          );
          continue;
        }
        picked.push(item);
      }
      if (picked.length === 0) continue;

      const groups = new Map<string, Pending[]>();
      const texts: string[] = [];
      for (const item of picked) {
        const g = groups.get(item.key);
        if (g) {
          g.push(item);
        } else {
          groups.set(item.key, [item]);
          texts.push(item.text);
        }
      }

      this.inflightBatches += 1;
      void this.runBatch(texts)
        .then((vectors) => {
          if (!Array.isArray(vectors) || vectors.length !== texts.length) {
            throw new Error(
              `embed batch result mismatch: vectors=${Array.isArray(vectors) ? vectors.length : "non-array"} texts=${texts.length}`,
            );
          }

          let idx = 0;
          for (const [key, items] of groups.entries()) {
            const vec = vectors[idx];
            idx += 1;
            if (!Array.isArray(vec) || vec.length !== 1536) {
              throw new Error(
                `embed batch vector dim mismatch for key=${key}: expected=1536 got=${Array.isArray(vec) ? vec.length : "non-array"}`,
              );
            }
            for (const item of items) {
              item.resolve({
                vector: vec.slice(),
                queue_wait_ms: Date.now() - item.enqueuedAtMs,
                batch_size: texts.length,
              });
            }
          }
        })
        .catch((err) => {
          for (const item of picked) item.reject(err);
        })
        .finally(() => {
          this.inflightBatches = Math.max(0, this.inflightBatches - 1);
          if (this.queue.length > 0) this.scheduleImmediateFlush();
        });
    }

    if (this.queue.length > 0 && this.inflightBatches >= this.maxInflightBatches) {
      this.scheduleFlush();
    }
  }
}
