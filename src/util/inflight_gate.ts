export type InflightGateToken = {
  wait_ms: number;
  release: () => void;
};

export type InflightGateOptions = {
  maxInflight: number;
  maxQueue: number;
  queueTimeoutMs: number;
};

type Waiter = {
  enqueuedAtMs: number;
  timer: ReturnType<typeof setTimeout>;
  resolve: (token: InflightGateToken) => void;
  reject: (err: unknown) => void;
};

export class InflightGateError extends Error {
  code: "queue_full" | "queue_timeout";
  details: Record<string, unknown>;

  constructor(code: "queue_full" | "queue_timeout", message: string, details: Record<string, unknown>) {
    super(message);
    this.name = "InflightGateError";
    this.code = code;
    this.details = details;
  }
}

export class InflightGate {
  private readonly maxInflight: number;
  private readonly maxQueue: number;
  private readonly queueTimeoutMs: number;
  private inflight = 0;
  private queue: Waiter[] = [];

  constructor(opts: InflightGateOptions) {
    this.maxInflight = Math.max(1, Math.trunc(opts.maxInflight));
    this.maxQueue = Math.max(0, Math.trunc(opts.maxQueue));
    this.queueTimeoutMs = Math.max(1, Math.trunc(opts.queueTimeoutMs));
  }

  stats(): { inflight: number; queued: number; max_inflight: number; max_queue: number } {
    return {
      inflight: this.inflight,
      queued: this.queue.length,
      max_inflight: this.maxInflight,
      max_queue: this.maxQueue,
    };
  }

  async acquire(): Promise<InflightGateToken> {
    if (this.inflight < this.maxInflight) {
      this.inflight += 1;
      return this.makeToken(0);
    }

    if (this.queue.length >= this.maxQueue) {
      throw new InflightGateError("queue_full", "inflight queue is full", {
        inflight: this.inflight,
        queued: this.queue.length,
        max_inflight: this.maxInflight,
        max_queue: this.maxQueue,
      });
    }

    const enqueuedAtMs = Date.now();
    return new Promise<InflightGateToken>((resolve, reject) => {
      const waiter: Waiter = {
        enqueuedAtMs,
        timer: setTimeout(() => {
          const idx = this.queue.indexOf(waiter);
          if (idx >= 0) this.queue.splice(idx, 1);
          reject(
            new InflightGateError("queue_timeout", "timed out while waiting for inflight slot", {
              inflight: this.inflight,
              queued: this.queue.length,
              wait_ms: Date.now() - enqueuedAtMs,
              max_inflight: this.maxInflight,
              max_queue: this.maxQueue,
              queue_timeout_ms: this.queueTimeoutMs,
            }),
          );
        }, this.queueTimeoutMs),
        resolve,
        reject,
      };
      this.queue.push(waiter);
    });
  }

  private makeToken(waitMs: number): InflightGateToken {
    let released = false;
    return {
      wait_ms: waitMs,
      release: () => {
        if (released) return;
        released = true;
        this.releaseSlot();
      },
    };
  }

  private releaseSlot() {
    const next = this.queue.shift();
    if (next) {
      clearTimeout(next.timer);
      const waitMs = Date.now() - next.enqueuedAtMs;
      next.resolve(this.makeToken(waitMs));
      return;
    }
    this.inflight = Math.max(0, this.inflight - 1);
  }
}
