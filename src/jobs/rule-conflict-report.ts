import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import stableStringify from "fast-json-stable-stringify";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";
import { evaluateRules } from "../memory/rules-evaluate.js";
import { sha256Hex } from "../util/crypto.js";

type ConflictRecord = {
  key: string;
  context_id: string;
  state: "active" | "shadow";
  path: string;
  winner_rule_node_id: string;
  winner_score: number | null;
  loser_rule_node_ids: string[];
  loser_scores: Array<number | null>;
  reason: string;
};

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return null;
  return v;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function truthy(v: string | null, fallback: boolean): boolean {
  if (v === null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (s === "true") return true;
  if (s === "false") return false;
  return fallback;
}

function normalizeContextItem(raw: any, idx: number): { id: string; context: any } {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const context = obj.context && typeof obj.context === "object" && !Array.isArray(obj.context) ? obj.context : obj;
  const idCandidate =
    (typeof obj.id === "string" && obj.id.trim()) ||
    (typeof context?.id === "string" && context.id.trim()) ||
    (typeof context?.run?.id === "string" && context.run.id.trim()) ||
    `ctx_${idx + 1}`;
  return { id: idCandidate, context };
}

async function loadContexts(filePath: string, maxContexts: number): Promise<Array<{ id: string; context: any }>> {
  const raw = await fs.readFile(filePath, "utf8");
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let items: any[] = [];
  if (filePath.endsWith(".jsonl")) {
    items = trimmed
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter((x) => x.length > 0)
      .map((line) => JSON.parse(line));
  } else {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) items = parsed;
    else items = [parsed];
  }

  return items.slice(0, maxContexts).map((x, i) => normalizeContextItem(x, i));
}

function normalizeConflictRecord(
  contextId: string,
  state: "active" | "shadow",
  raw: any,
): ConflictRecord | null {
  const pathValue = typeof raw?.path === "string" ? raw.path.trim() : "";
  const winner = typeof raw?.winner?.rule_node_id === "string" ? raw.winner.rule_node_id.trim() : "";
  if (!pathValue || !winner) return null;
  const losersRaw = Array.isArray(raw?.losers) ? raw.losers : [];
  const losers = losersRaw
    .map((x: any) => (typeof x?.rule_node_id === "string" ? x.rule_node_id.trim() : ""))
    .filter((x: string) => x.length > 0)
    .sort();
  const loserScores = losersRaw
    .map((x: any) => {
      const v = Number(x?.score);
      return Number.isFinite(v) ? v : null;
    })
    .slice(0, losers.length);
  const winnerScoreRaw = Number(raw?.winner?.score);
  const winnerScore = Number.isFinite(winnerScoreRaw) ? winnerScoreRaw : null;
  const reason = typeof raw?.reason === "string" ? raw.reason : "higher rank wins";
  const key = `${contextId}|${state}|${pathValue}`;
  return {
    key,
    context_id: contextId,
    state,
    path: pathValue,
    winner_rule_node_id: winner,
    winner_score: winnerScore,
    loser_rule_node_ids: losers,
    loser_scores: loserScores,
    reason,
  };
}

function sortRecords(records: ConflictRecord[]): ConflictRecord[] {
  return records
    .slice()
    .sort((a, b) =>
      a.context_id.localeCompare(b.context_id) ||
      a.state.localeCompare(b.state) ||
      a.path.localeCompare(b.path) ||
      a.winner_rule_node_id.localeCompare(b.winner_rule_node_id),
    );
}

function dedupeByKey(records: ConflictRecord[]): ConflictRecord[] {
  const m = new Map<string, ConflictRecord>();
  for (const r of sortRecords(records)) {
    if (!m.has(r.key)) m.set(r.key, r);
  }
  return Array.from(m.values());
}

function extractBaselineRecords(raw: any): ConflictRecord[] {
  if (!raw || typeof raw !== "object") return [];
  const direct = Array.isArray((raw as any).conflicts) ? (raw as any).conflicts : [];
  const nested = Array.isArray((raw as any)?.details?.conflicts) ? (raw as any).details.conflicts : [];
  const source = nested.length > 0 ? nested : direct;
  const out: ConflictRecord[] = [];
  for (const x of source) {
    if (!x || typeof x !== "object") continue;
    const rec: ConflictRecord = {
      key: String((x as any).key ?? ""),
      context_id: String((x as any).context_id ?? ""),
      state: (String((x as any).state ?? "active") === "shadow" ? "shadow" : "active"),
      path: String((x as any).path ?? ""),
      winner_rule_node_id: String((x as any).winner_rule_node_id ?? ""),
      winner_score: Number.isFinite(Number((x as any).winner_score)) ? Number((x as any).winner_score) : null,
      loser_rule_node_ids: Array.isArray((x as any).loser_rule_node_ids)
        ? (x as any).loser_rule_node_ids.map((v: any) => String(v)).sort()
        : [],
      loser_scores: Array.isArray((x as any).loser_scores)
        ? (x as any).loser_scores.map((v: any) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          })
        : [],
      reason: String((x as any).reason ?? "higher rank wins"),
    };
    if (!rec.key && rec.context_id && rec.path && rec.winner_rule_node_id) {
      rec.key = `${rec.context_id}|${rec.state}|${rec.path}`;
    }
    if (!rec.key || !rec.context_id || !rec.path || !rec.winner_rule_node_id) continue;
    out.push(rec);
  }
  return dedupeByKey(out);
}

async function main() {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);

  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const tenantId = argValue("--tenant-id") ?? env.MEMORY_TENANT_ID;
  const contextsFile = path.resolve(argValue("--contexts-file") ?? "examples/planner_context.json");
  const includeShadow = truthy(argValue("--include-shadow"), true);
  const rulesLimit = clampInt(Number(argValue("--rules-limit") ?? "50"), 1, 200);
  const maxContexts = clampInt(Number(argValue("--max-contexts") ?? "200"), 1, 5000);
  const baselinePathRaw = argValue("--baseline");
  const baselinePath = baselinePathRaw && baselinePathRaw.trim().length > 0 ? path.resolve(baselinePathRaw.trim()) : null;
  const outPathArg = argValue("--out");
  const runId = argValue("--run-id") ?? new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const outPath =
    outPathArg && outPathArg.trim().length > 0
      ? path.resolve(outPathArg.trim())
      : path.resolve(`artifacts/rule_conflicts/${runId}/summary.json`);
  const maxWinnerChanges = clampInt(Number(argValue("--max-winner-changes") ?? "0"), 0, 1000000);
  const strict = hasFlag("--strict");

  let contexts = await loadContexts(contextsFile, maxContexts);
  if (contexts.length === 0) {
    contexts = [{ id: "ctx_1", context: {} }];
  }

  try {
    const records = await withTx(db, async (client) => {
      const out: ConflictRecord[] = [];
      for (const item of contexts) {
        const res = await evaluateRules(
          client,
          {
            scope,
            tenant_id: tenantId,
            context: item.context,
            include_shadow: includeShadow,
            limit: rulesLimit,
          },
          env.MEMORY_SCOPE,
          env.MEMORY_TENANT_ID,
        );
        const activeExplain = Array.isArray((res as any)?.applied?.conflict_explain)
          ? (res as any).applied.conflict_explain
          : [];
        const shadowExplain =
          includeShadow && Array.isArray((res as any)?.applied?.shadow_conflict_explain)
            ? (res as any).applied.shadow_conflict_explain
            : [];

        for (const c of activeExplain) {
          const rec = normalizeConflictRecord(item.id, "active", c);
          if (rec) out.push(rec);
        }
        for (const c of shadowExplain) {
          const rec = normalizeConflictRecord(item.id, "shadow", c);
          if (rec) out.push(rec);
        }
      }
      return dedupeByKey(out);
    });

    let baselineRecords: ConflictRecord[] = [];
    if (baselinePath) {
      try {
        const raw = JSON.parse(await fs.readFile(baselinePath, "utf8"));
        baselineRecords = extractBaselineRecords(raw);
      } catch (err: any) {
        throw new Error(`failed to load baseline: ${String(err?.message ?? err)}`);
      }
    }

    const currentByKey = new Map(records.map((x) => [x.key, x]));
    const baselineByKey = new Map(baselineRecords.map((x) => [x.key, x]));

    const newConflicts = records.filter((x) => !baselineByKey.has(x.key));
    const resolvedConflicts = baselineRecords.filter((x) => !currentByKey.has(x.key));
    const comparedKeys = records.filter((x) => baselineByKey.has(x.key)).map((x) => x.key);

    const winnerChanges: Array<{ key: string; from: string; to: string }> = [];
    const loserDeltas: Array<{ key: string; added: string[]; removed: string[] }> = [];
    for (const key of comparedKeys) {
      const cur = currentByKey.get(key)!;
      const prev = baselineByKey.get(key)!;
      if (cur.winner_rule_node_id !== prev.winner_rule_node_id) {
        winnerChanges.push({ key, from: prev.winner_rule_node_id, to: cur.winner_rule_node_id });
      }
      const curLosers = new Set(cur.loser_rule_node_ids);
      const prevLosers = new Set(prev.loser_rule_node_ids);
      const added = Array.from(curLosers).filter((x) => !prevLosers.has(x)).sort();
      const removed = Array.from(prevLosers).filter((x) => !curLosers.has(x)).sort();
      if (added.length > 0 || removed.length > 0) {
        loserDeltas.push({ key, added, removed });
      }
    }

    const activeConflicts = records.filter((x) => x.state === "active").length;
    const shadowConflicts = records.filter((x) => x.state === "shadow").length;
    const fingerprint = sha256Hex(
      stableStringify(records.map((x) => ({ key: x.key, winner: x.winner_rule_node_id, losers: x.loser_rule_node_ids }))),
    );

    const gatePass = winnerChanges.length <= maxWinnerChanges;
    const failedChecks = gatePass ? [] : ["winner_changes_exceeded"];
    const out = {
      ok: true,
      kind: "rule_conflict_report",
      run_id: runId,
      timestamp_utc: new Date().toISOString(),
      scope,
      tenant_id: tenantId,
      contexts: {
        file: contextsFile,
        count: contexts.length,
        ids: contexts.map((x) => x.id),
      },
      config: {
        include_shadow: includeShadow,
        rules_limit: rulesLimit,
        max_contexts: maxContexts,
        baseline: baselinePath,
        max_winner_changes: maxWinnerChanges,
      },
      summary: {
        active_conflicts: activeConflicts,
        shadow_conflicts: shadowConflicts,
        total_conflicts: records.length,
        fingerprint_sha256: fingerprint,
        delta: {
          compared: baselinePath !== null,
          new_conflicts: newConflicts.length,
          resolved_conflicts: resolvedConflicts.length,
          winner_changes: winnerChanges.length,
          loser_deltas: loserDeltas.length,
        },
        gate: {
          pass: gatePass,
          failed_checks: failedChecks,
        },
      },
      details: {
        conflicts: records,
        delta: {
          new_conflicts: newConflicts,
          resolved_conflicts: resolvedConflicts,
          winner_changes: winnerChanges,
          loser_deltas: loserDeltas,
        },
      },
      artifacts: {
        output_json: outPath,
        baseline_json: baselinePath,
      },
    };

    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(out, null, 2));
    if (strict && !gatePass) process.exitCode = 2;
  } finally {
    await closeDb(db);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
