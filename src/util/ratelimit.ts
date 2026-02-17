export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retry_after_ms: number };

type Bucket = {
  tokens: number;
  last_refill_ms: number;
  last_seen_ms: number;
};

export type TokenBucketOptions = {
  rate_per_sec: number; // refill rate
  burst: number; // max capacity
  ttl_ms: number; // idle bucket eviction
  sweep_every_n: number; // amortize sweeping cost
};

// Simple in-memory token bucket rate limiter (per-process).
// Note: in multi-process deployments, this is best-effort and not globally consistent.
export class TokenBucketLimiter {
  private readonly rate: number;
  private readonly burst: number;
  private readonly ttlMs: number;
  private readonly sweepEveryN: number;
  private readonly buckets = new Map<string, Bucket>();
  private sweeps = 0;

  constructor(opts: TokenBucketOptions) {
    if (!Number.isFinite(opts.rate_per_sec) || opts.rate_per_sec <= 0) {
      throw new Error(`TokenBucketLimiter: rate_per_sec must be >0; got ${opts.rate_per_sec}`);
    }
    if (!Number.isFinite(opts.burst) || opts.burst <= 0) {
      throw new Error(`TokenBucketLimiter: burst must be >0; got ${opts.burst}`);
    }
    this.rate = opts.rate_per_sec;
    this.burst = opts.burst;
    this.ttlMs = Math.max(1_000, opts.ttl_ms);
    this.sweepEveryN = Math.max(1, opts.sweep_every_n);
  }

  check(key: string, cost = 1, nowMs = Date.now()): RateLimitResult {
    if (!key) return { allowed: true, remaining: this.burst };
    if (!Number.isFinite(cost) || cost <= 0) cost = 1;

    this.sweeps += 1;
    if (this.sweeps % this.sweepEveryN === 0) this.sweep(nowMs);

    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.burst, last_refill_ms: nowMs, last_seen_ms: nowMs };
      this.buckets.set(key, b);
    }

    // Refill tokens based on elapsed time.
    const dtMs = Math.max(0, nowMs - b.last_refill_ms);
    if (dtMs > 0) {
      const refill = (dtMs / 1000) * this.rate;
      b.tokens = Math.min(this.burst, b.tokens + refill);
      b.last_refill_ms = nowMs;
    }
    b.last_seen_ms = nowMs;

    if (b.tokens >= cost) {
      b.tokens -= cost;
      return { allowed: true, remaining: Math.floor(b.tokens) };
    }

    // Not enough tokens: compute retry-after time.
    const missing = cost - b.tokens;
    const sec = missing / this.rate;
    const retryAfterMs = Math.max(1, Math.ceil(sec * 1000));
    return { allowed: false, retry_after_ms: retryAfterMs };
  }

  private sweep(nowMs: number) {
    for (const [k, b] of this.buckets.entries()) {
      if (nowMs - b.last_seen_ms > this.ttlMs) this.buckets.delete(k);
    }
  }
}

