import { createHash } from "node:crypto";

// Deterministic UUIDv5-like generator (stable across retries).
// Not RFC-complete, but sets version/variant bits to look like v5.
export function stableUuid(name: string, namespace = "aionis-memory-graph"): string {
  const h = createHash("sha256").update(`${namespace}:${name}`).digest();
  const bytes = h.subarray(0, 16);

  // Set version (5) and variant (RFC4122).
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

