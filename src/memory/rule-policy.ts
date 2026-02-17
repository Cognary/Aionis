import { z } from "zod";

// Minimal, strict "then_json" schema for execution injection.
// Anything outside this shape must be carried in `extensions` (namespaced) to avoid accidental contract drift.
const ToolPolicy = z
  .object({
    allow: z.array(z.string().min(1)).max(100).optional(),
    deny: z.array(z.string().min(1)).max(100).optional(),
    prefer: z.array(z.string().min(1)).max(100).optional(),
  })
  .strict();

const OutputPolicy = z
  .object({
    format: z.enum(["json", "text", "markdown"]).optional(),
    strict: z.boolean().optional(),
  })
  .strict();

export const PolicyPatchSchema = z
  .object({
    output: OutputPolicy.optional(),
    tool: ToolPolicy.optional(),
    // Escape hatch: future, caller-owned schema extensions must be explicitly namespaced.
    extensions: z.record(z.any()).optional(),
  })
  .strict();

export type PolicyPatch = z.infer<typeof PolicyPatchSchema>;

export type PolicySource = {
  rule_node_id: string;
  state: "shadow" | "active";
  commit_id: string;
  touched_paths: string[];
};

export type PolicyConflict = {
  path: string;
  winner_rule_node_id: string;
};

function isPlainObject(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function stableKey(x: any): string {
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

function mergeArrays(a: any[], b: any[]): any[] {
  // For policy lists, union is safer than overwrite.
  const seen = new Set<string>();
  const out: any[] = [];
  for (const x of a.concat(b)) {
    const k = stableKey(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function mergeDeep(
  base: any,
  patch: any,
  path: string,
  conflicts: PolicyConflict[],
  winnerRuleId: string,
): any {
  if (base === undefined) return patch;
  if (patch === undefined) return base;

  if (Array.isArray(base) && Array.isArray(patch)) return mergeArrays(base, patch);

  if (isPlainObject(base) && isPlainObject(patch)) {
    const out: Record<string, any> = { ...base };
    for (const [k, v] of Object.entries(patch)) {
      const nextPath = path ? `${path}.${k}` : k;
      out[k] = mergeDeep(out[k], v, nextPath, conflicts, winnerRuleId);
    }
    return out;
  }

  // Primitive/shape conflict: patch overwrites base, but we record it.
  if (stableKey(base) !== stableKey(patch)) {
    conflicts.push({ path: path || "$", winner_rule_node_id: winnerRuleId });
  }
  return patch;
}

function leafPaths(obj: any, prefix = "", out: string[] = []): string[] {
  if (obj === null || obj === undefined) return out;
  if (Array.isArray(obj)) {
    out.push(prefix || "$");
    return out;
  }
  if (isPlainObject(obj)) {
    const keys = Object.keys(obj).sort();
    if (keys.length === 0) {
      out.push(prefix || "$");
      return out;
    }
    for (const k of keys) {
      leafPaths(obj[k], prefix ? `${prefix}.${k}` : k, out);
    }
    return out;
  }
  out.push(prefix || "$");
  return out;
}

export function parsePolicyPatch(thenJson: unknown): PolicyPatch {
  return PolicyPatchSchema.parse(thenJson);
}

export function buildAppliedPolicy(
  rules: Array<{ rule_node_id: string; state: "shadow" | "active"; commit_id: string; then_patch: PolicyPatch }>,
): { policy: PolicyPatch; sources: PolicySource[]; conflicts: PolicyConflict[] } {
  const conflicts: PolicyConflict[] = [];
  let policy: any = {};
  const sources: PolicySource[] = [];

  for (const r of rules) {
    // Merge with patch overwriting base for scalar conflicts.
    policy = mergeDeep(policy, r.then_patch, "", conflicts, r.rule_node_id);
    sources.push({ rule_node_id: r.rule_node_id, state: r.state, commit_id: r.commit_id, touched_paths: policyTouchedPaths(r.then_patch) });
  }

  return { policy, sources, conflicts };
}

export function policyTouchedPaths(patch: PolicyPatch): string[] {
  return leafPaths(patch).sort();
}
