import { badRequest } from "../util/http.js";
import type { PolicyPatch } from "./rule-policy.js";

export type ToolDecision = {
  candidates: string[];
  allowed: string[];
  denied: Array<{ name: string; reason: "deny_list" | "not_in_allow_list" }>;
  preferred: string[];
  ordered: string[];
  selected: string | null;
  fallback?: {
    applied: boolean;
    reason: "none" | "allowlist_filtered_all" | "deny_filtered_all";
    note: string;
    effective_mode: "allow_and_deny" | "deny_only";
  };
};

function uniqKeepOrder(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const k = String(x);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export function applyToolPolicy(candidatesIn: string[], patch: PolicyPatch, opts: { strict: boolean }): ToolDecision {
  const candidates = uniqKeepOrder(candidatesIn);

  const allow = uniqKeepOrder(patch?.tool?.allow ?? []);
  const deny = new Set(uniqKeepOrder(patch?.tool?.deny ?? []));
  const prefer = uniqKeepOrder(patch?.tool?.prefer ?? []);

  const allowSet = allow.length > 0 ? new Set(allow) : null;
  const denied: Array<{ name: string; reason: "deny_list" | "not_in_allow_list" }> = [];

  const applyAllowDeny = (useAllow: boolean) => {
    const deniedLocal: Array<{ name: string; reason: "deny_list" | "not_in_allow_list" }> = [];
    const allowedLocal: string[] = [];
    for (const c of candidates) {
      if (deny.has(c)) {
        deniedLocal.push({ name: c, reason: "deny_list" });
        continue;
      }
      if (useAllow && allowSet && !allowSet.has(c)) {
        deniedLocal.push({ name: c, reason: "not_in_allow_list" });
        continue;
      }
      allowedLocal.push(c);
    }
    return { allowed: allowedLocal, denied: deniedLocal };
  };

  // Primary mode: apply allowlist (if present) + denylist.
  let { allowed, denied: deniedOut } = applyAllowDeny(true);
  let fallback: ToolDecision["fallback"] = {
    applied: false,
    reason: "none",
    note: "no fallback applied",
    effective_mode: allowSet ? "allow_and_deny" : "deny_only",
  };

  // If strict=false and allow+deny filtered out everything, fall back to deny-only.
  // This preserves safety (deny is hard), but avoids "no tools selected" when allowlist is too strict.
  if (!opts.strict && allowed.length === 0 && allowSet) {
    const fb = applyAllowDeny(false);
    allowed = fb.allowed;
    // Keep the primary denied list for transparency, but annotate fallback.
    deniedOut = fb.denied;
    fallback = {
      applied: true,
      reason: "allowlist_filtered_all",
      note: "allowlist eliminated all candidates; falling back to deny-only (ignore tool.allow) because strict=false",
      effective_mode: "deny_only",
    };
  }

  if (opts.strict && allowed.length === 0) {
    badRequest(
      "no_tools_allowed",
      allowSet ? "no candidates remain after allow/deny filters" : "no candidates remain after deny filters",
      { candidates: candidates.length, allow: allow.length, deny: deny.size },
    );
  }

  // If denylist still eliminates all tools, we keep it empty even in strict=false and explain.
  if (!opts.strict && allowed.length === 0) {
    fallback = {
      applied: true,
      reason: "deny_filtered_all",
      note: "denylist eliminated all candidates; no tool can be selected",
      effective_mode: "deny_only",
    };
  }

  // Ordering: preferred tools first (in prefer list order), then remaining allowed tools in original order.
  const preferred = prefer.filter((t) => allowed.includes(t));
  const preferredSet = new Set(preferred);
  const ordered = preferred.concat(allowed.filter((t) => !preferredSet.has(t)));

  return {
    candidates,
    allowed,
    denied: deniedOut,
    preferred,
    ordered,
    selected: ordered.length > 0 ? ordered[0] : null,
    fallback,
  };
}
