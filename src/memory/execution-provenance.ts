import stableStringify from "fast-json-stable-stringify";
import { sha256Hex } from "../util/crypto.js";

export function normalizeToolCandidates(candidates: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of candidates) {
    const c = String(raw ?? "").trim();
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

export function hashExecutionContext(context: unknown): string {
  return sha256Hex(stableStringify(context ?? null));
}

export function hashPolicy(policy: unknown): string {
  return sha256Hex(stableStringify(policy ?? {}));
}

export function uniqueRuleIds(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const v = String(id ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
