export type ToolPolicyPatch = {
  allow?: string[];
  deny?: string[];
  prefer?: string[];
};

export type ToolPolicyExplain = {
  // Human-friendly summary of how tool.* was computed.
  notes: string[];
  // Contribution summary per matched rule (tool-relevant only).
  contributions: Array<{
    rule_node_id: string;
    score: number; // unified rank score
    evidence_score: number;
    priority: number;
    weight: number;
    specificity: number;
    allow_n: number;
    deny_n: number;
    prefer_n: number;
    first_prefer: string | null;
  }>;
  // Winners for preference ordering and denials (best-effort).
  winners: {
    prefer_by_tool: Record<string, string>; // tool -> rule_node_id that first preferred it (highest priority)
    deny_by_tool: Record<string, string>; // tool -> highest-score rule that denied it
  };
  // Readable conflict signals. These are not necessarily fatal; they exist to prevent silent behavior changes.
  conflicts: Array<{
    code: "allow_intersection" | "allow_intersection_empty" | "prefer_competing_top_choice";
    message: string;
    details?: any;
    winner_rule_node_id?: string | null;
  }>;
};

function uniq(xs: string[]): string[] {
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

function sorted(xs: string[]): string[] {
  return xs.slice().sort((a, b) => String(a).localeCompare(String(b)));
}

export function computeEffectiveToolPolicy(
  rules: Array<{
    rule_node_id: string;
    score: number;
    evidence_score?: number;
    priority?: number;
    weight?: number;
    specificity?: number;
    tool?: ToolPolicyPatch | null;
  }>,
): { tool: ToolPolicyPatch; explain: ToolPolicyExplain } {
  const notes: string[] = [];
  const contributions: ToolPolicyExplain["contributions"] = [];
  const winnersPrefer: Record<string, string> = {};
  const winnersDeny: Record<string, { rule_node_id: string; score: number }> = {};
  const conflicts: ToolPolicyExplain["conflicts"] = [];

  const allowSets: Array<{ rule_node_id: string; score: number; set: Set<string> }> = [];
  const denyUnion = new Set<string>();

  // Prefer ordering: higher score should win, so we traverse rules in descending score.
  const preferOrder: string[] = [];

  for (const r of rules.slice().sort((a, b) => b.score - a.score || String(a.rule_node_id).localeCompare(String(b.rule_node_id)))) {
    const tool = r.tool ?? undefined;
    const allow = uniq(tool?.allow ?? []);
    const deny = uniq(tool?.deny ?? []);
    const prefer = uniq(tool?.prefer ?? []);

    if (allow.length === 0 && deny.length === 0 && prefer.length === 0) continue;

    contributions.push({
      rule_node_id: r.rule_node_id,
      score: r.score,
      evidence_score: Number(r.evidence_score ?? 0),
      priority: Number(r.priority ?? 0),
      weight: Number(r.weight ?? 1),
      specificity: Number(r.specificity ?? 0),
      allow_n: allow.length,
      deny_n: deny.length,
      prefer_n: prefer.length,
      first_prefer: prefer.length > 0 ? prefer[0] : null,
    });

    if (allow.length > 0) {
      allowSets.push({ rule_node_id: r.rule_node_id, score: r.score, set: new Set(allow) });
    }

    for (const t of deny) {
      denyUnion.add(t);
      const cur = winnersDeny[t];
      if (!cur || r.score > cur.score) winnersDeny[t] = { rule_node_id: r.rule_node_id, score: r.score };
    }

    for (const t of prefer) {
      if (!(t in winnersPrefer)) winnersPrefer[t] = r.rule_node_id;
      preferOrder.push(t);
    }
  }

  // Allow semantics: if any allowlists exist, intersection is the effective allowlist.
  let allowOut: string[] | undefined = undefined;
  if (allowSets.length > 0) {
    notes.push("tool.allow present on >=1 matched rule; effective allowlist is the intersection across those rules.");
    let inter: Set<string> | null = null;
    for (const a of allowSets) {
      if (!inter) {
        inter = new Set(a.set);
        continue;
      }
      for (const x of Array.from(inter)) {
        if (!a.set.has(x)) inter.delete(x);
      }
    }
    allowOut = sorted(Array.from(inter ?? new Set<string>()));

    conflicts.push({
      code: "allow_intersection",
      message: `effective allowlist is intersection of ${allowSets.length} rule allowlists (size=${allowOut.length})`,
      details: allowSets.map((x) => ({ rule_node_id: x.rule_node_id, score: x.score, allow_n: x.set.size })),
      winner_rule_node_id: null,
    });

    if (allowOut.length === 0) {
      conflicts.push({
        code: "allow_intersection_empty",
        message: "allowlist intersection is empty; tool selection may require strict=false fallback or rule changes",
        details: allowSets.map((x) => ({ rule_node_id: x.rule_node_id, score: x.score, allow_n: x.set.size })),
        winner_rule_node_id: null,
      });
    }
  } else {
    notes.push("no matched rule sets tool.allow; allowlist not enforced.");
  }

  // Deny semantics: union is effective.
  const denyOut = sorted(Array.from(denyUnion));

  // Prefer semantics: concatenate in score-desc order, keep first occurrence (highest priority).
  const preferOut = uniq(preferOrder);

  // Prefer conflict: multiple rules with differing top choice.
  const topChoices = contributions
    .map((c) => ({ rule_node_id: c.rule_node_id, score: c.score, first_prefer: c.first_prefer }))
    .filter((x) => x.first_prefer);
  const distinctTop = uniq(topChoices.map((x) => x.first_prefer!));
  if (distinctTop.length > 1) {
    const winner = topChoices.slice().sort((a, b) => b.score - a.score || a.rule_node_id.localeCompare(b.rule_node_id))[0];
    conflicts.push({
      code: "prefer_competing_top_choice",
      message: `multiple matched rules propose different top preferred tools; highest-rank rule wins priority (winner=${winner.rule_node_id})`,
      details: topChoices,
      winner_rule_node_id: winner.rule_node_id,
    });
  }

  return {
    tool: {
      ...(allowOut ? { allow: allowOut } : {}),
      ...(denyOut.length > 0 ? { deny: denyOut } : {}),
      ...(preferOut.length > 0 ? { prefer: preferOut } : {}),
    },
    explain: {
      notes,
      contributions,
      winners: {
        prefer_by_tool: winnersPrefer,
        deny_by_tool: Object.fromEntries(Object.entries(winnersDeny).map(([k, v]) => [k, v.rule_node_id])),
      },
      conflicts,
    },
  };
}
