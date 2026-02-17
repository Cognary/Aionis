type Entry<V> = {
  value: V;
  expiresAtMs: number;
};

// Small in-memory LRU+TTL cache (per-process, best-effort).
export class LruTtlCache<K, V> {
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly map = new Map<K, Entry<V>>();

  constructor(opts: { maxEntries: number; ttlMs: number }) {
    this.maxEntries = Math.max(1, Math.trunc(opts.maxEntries));
    this.ttlMs = Math.max(1000, Math.trunc(opts.ttlMs));
  }

  get(key: K, nowMs = Date.now()): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expiresAtMs <= nowMs) {
      this.map.delete(key);
      return undefined;
    }
    // LRU bump
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: K, value: V, nowMs = Date.now()) {
    const entry: Entry<V> = { value, expiresAtMs: nowMs + this.ttlMs };
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, entry);
    this.evict();
  }

  size(): number {
    return this.map.size;
  }

  private evict() {
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next();
      if (oldest.done) return;
      this.map.delete(oldest.value);
    }
  }
}

