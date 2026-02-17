import { sha256Hex } from "./crypto.js";

type RedactionResult = {
  text: string;
  counts: Record<string, number>;
};

function tag(kind: string, value: string): string {
  // Stable pseudonymization token (lets you correlate repeats without storing the original).
  const h = sha256Hex(value).slice(0, 8);
  return `[${kind}#${h}]`;
}

export function redactPII(input: string): RedactionResult {
  let text = input;
  const counts: Record<string, number> = {};

  const bump = (k: string) => {
    counts[k] = (counts[k] ?? 0) + 1;
  };

  // Email
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (m) => {
    bump("email");
    return tag("EMAIL", m);
  });

  // US SSN
  text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, (m) => {
    bump("ssn");
    return tag("SSN", m);
  });

  // IPv4 (rough)
  text = text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (m) => {
    bump("ip");
    return tag("IP", m);
  });

  // Phone (US-ish; intentionally conservative)
  text = text.replace(/(?:\+?1[\s-]?)?(?:\(\s*\d{3}\s*\)|\d{3})[\s-]?\d{3}[\s-]?\d{4}\b/g, (m) => {
    bump("phone");
    return tag("PHONE", m);
  });

  return { text, counts };
}

export function redactJsonStrings(value: unknown): { value: unknown; counts: Record<string, number> } {
  const counts: Record<string, number> = {};

  const merge = (c: Record<string, number>) => {
    for (const [k, v] of Object.entries(c)) counts[k] = (counts[k] ?? 0) + v;
  };

  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      const r = redactPII(v);
      merge(r.counts);
      return r.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, vv] of Object.entries(v as Record<string, unknown>)) out[k] = walk(vv);
      return out;
    }
    return v;
  };

  return { value: walk(value), counts };
}

