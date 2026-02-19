import "dotenv/config";
import type pg from "pg";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";

type Severity = "error" | "warning";

type CheckResult = {
  name: string;
  severity: Severity;
  count: number;
  sample: any[];
  note?: string;
  error?: string;
};

type CheckMode = "full" | "fast";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
let checkMode: CheckMode = "full";
let checkBatchSize = 0;
let checkBatchIndex = 0;
let checkOrdinal = 0;

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

function appendNote(base: string | undefined, extra: string): string {
  return base ? `${base} ${extra}` : extra;
}

function fastSampleSql(sampleSql: string): string {
  const tempLimitToken = "__FAST_LIMIT__";
  const withTempLimit = sampleSql.replace("__LIMIT__", tempLimitToken);
  const withoutOrder = withTempLimit.replace(
    /\s+ORDER\s+BY[\s\S]*?\s+LIMIT\s+__FAST_LIMIT__/i,
    "\n        LIMIT __FAST_LIMIT__",
  );
  return withoutOrder.replace(tempLimitToken, "__LIMIT__");
}

async function hasColumn(scopeClient: pg.PoolClient, tableName: string, columnName: string): Promise<boolean> {
  const r = await scopeClient.query<{ ok: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    ) AS ok
    `,
    [tableName, columnName],
  );
  return !!r.rows[0]?.ok;
}

async function hasTable(scopeClient: pg.PoolClient, tableName: string): Promise<boolean> {
  const r = await scopeClient.query<{ ok: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
    ) AS ok
    `,
    [tableName],
  );
  return !!r.rows[0]?.ok;
}

async function runCheck(
  client: pg.PoolClient,
  name: string,
  severity: Severity,
  countSql: string,
  countArgs: any[],
  sampleSql: string,
  sampleArgs: any[],
  sampleLimit: number,
  note?: string,
  opts?: { sampleWhenZero?: boolean },
): Promise<CheckResult> {
  try {
    const ordinal = checkOrdinal;
    checkOrdinal += 1;
    if (checkBatchSize > 0 && Math.floor(ordinal / checkBatchSize) !== checkBatchIndex) {
      return {
        name,
        severity,
        count: 0,
        sample: [],
        note: appendNote(note, `Skipped by batch filter (--batch-size=${checkBatchSize} --batch-index=${checkBatchIndex}).`),
      };
    }

    if (checkMode === "fast" && opts?.sampleWhenZero !== true) {
      const cappedLimit = sampleLimit + 1;
      const sr = await client.query(fastSampleSql(sampleSql).replace("__LIMIT__", String(cappedLimit)), sampleArgs);
      const rows = sr.rows ?? [];
      const truncated = rows.length > sampleLimit;
      const sample = truncated ? rows.slice(0, sampleLimit) : rows;
      const count = truncated ? sampleLimit + 1 : sample.length;
      const modeNote = truncated
        ? "Fast mode: count is a lower bound; additional violating rows may exist."
        : "Fast mode: count reflects sampled violating rows only.";
      return { name, severity, count, sample, note: appendNote(note, modeNote) };
    }

    const cr = await client.query<{ n: string }>(countSql, countArgs);
    const count = Number(cr.rows[0]?.n ?? 0);
    const shouldSample = count > 0 || opts?.sampleWhenZero === true;
    if (!shouldSample) return { name, severity, count, sample: [], note };
    const sr = await client.query(sampleSql.replace("__LIMIT__", String(sampleLimit)), sampleArgs);
    return { name, severity, count, sample: sr.rows ?? [], note };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    return { name, severity, count: -1, sample: [], note, error: msg };
  }
}

function zeroCheck(name: string, severity: Severity, note?: string): CheckResult {
  return { name, severity, count: 0, sample: [], note };
}

async function main() {
  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const sampleLimit = clampInt(Number(argValue("--sample") ?? "20"), 1, 200);
  const strict = hasFlag("--strict");
  const strictWarnings = hasFlag("--strict-warnings");
  const modeRaw = (argValue("--mode") ?? "full").toLowerCase();
  if (modeRaw !== "full" && modeRaw !== "fast") {
    throw new Error("invalid --mode (expected one of: full|fast)");
  }
  checkMode = modeRaw as CheckMode;
  const batchSize = clampInt(Number(argValue("--batch-size") ?? "0"), 0, 500);
  const batchIndexRaw = Number(argValue("--batch-index") ?? "0");
  const batchIndex = clampInt(batchIndexRaw, 0, 50000);
  if (!Number.isFinite(batchIndexRaw) || batchIndex !== Math.trunc(batchIndexRaw)) {
    throw new Error("invalid --batch-index (expected non-negative integer)");
  }
  if (batchSize === 0 && hasFlag("--batch-index") && batchIndex > 0) {
    throw new Error("--batch-index requires --batch-size > 0");
  }
  checkBatchSize = batchSize;
  checkBatchIndex = batchIndex;
  checkOrdinal = 0;
  const checkSetRaw = (argValue("--check-set") ?? "all").toLowerCase();
  if (checkSetRaw !== "all" && checkSetRaw !== "scope" && checkSetRaw !== "cross_tenant") {
    throw new Error("invalid --check-set (expected one of: all|scope|cross_tenant)");
  }
  const checkSet = checkSetRaw as "all" | "scope" | "cross_tenant";
  const includeScopeChecks = checkSet === "all" || checkSet === "scope";
  const includeCrossTenantChecks = checkSet === "all" || checkSet === "cross_tenant";

  const checks = await withTx(db, async (client) => {
    const out: CheckResult[] = [];

    const hasEmbeddingModel = await hasColumn(client, "memory_nodes", "embedding_model");
    const hasMemoryLane = await hasColumn(client, "memory_nodes", "memory_lane");
    const hasOwnerAgentId = await hasColumn(client, "memory_nodes", "owner_agent_id");
    const hasOwnerTeamId = await hasColumn(client, "memory_nodes", "owner_team_id");
    const hasRuleScope = await hasColumn(client, "memory_rule_defs", "rule_scope");
    const hasTargetAgentId = await hasColumn(client, "memory_rule_defs", "target_agent_id");
    const hasTargetTeamId = await hasColumn(client, "memory_rule_defs", "target_team_id");
    const hasFailedAt = await hasColumn(client, "memory_outbox", "failed_at");
    const hasExecutionDecisions = await hasTable(client, "memory_execution_decisions");
    const hasRuleFeedbackSource = await hasColumn(client, "memory_rule_feedback", "source");
    const hasRuleFeedbackDecisionId = await hasColumn(client, "memory_rule_feedback", "decision_id");
    const hasTenantScopedRowsRes = await client.query<{ ok: boolean }>(
      `
      SELECT (
        EXISTS (SELECT 1 FROM memory_commits WHERE scope LIKE 'tenant:%')
        OR EXISTS (SELECT 1 FROM memory_nodes WHERE scope LIKE 'tenant:%')
        OR EXISTS (SELECT 1 FROM memory_edges WHERE scope LIKE 'tenant:%')
        OR EXISTS (SELECT 1 FROM memory_rule_defs WHERE scope LIKE 'tenant:%')
        OR EXISTS (SELECT 1 FROM memory_rule_feedback WHERE scope LIKE 'tenant:%')
        OR EXISTS (SELECT 1 FROM memory_outbox WHERE scope LIKE 'tenant:%')
      ) AS ok
      `,
    );
    let hasTenantScopedRows = !!hasTenantScopedRowsRes.rows[0]?.ok;
    if (!hasTenantScopedRows && hasExecutionDecisions) {
      const extraTenantRowsRes = await client.query<{ ok: boolean }>(
        `
        SELECT EXISTS (
          SELECT 1
          FROM memory_execution_decisions
          WHERE scope LIKE 'tenant:%'
        ) AS ok
        `,
      );
      hasTenantScopedRows = !!extraTenantRowsRes.rows[0]?.ok;
    }

    // 1) Edge scope consistency (only meaningful if cross-scope edges are disallowed).
    if (includeScopeChecks) {
      out.push(
        await runCheck(
          client,
          "edges_cross_scope",
          env.ALLOW_CROSS_SCOPE_EDGES ? "warning" : "error",
          `
        SELECT count(*)::text AS n
        FROM memory_edges e
        JOIN memory_nodes s ON s.id = e.src_id
        JOIN memory_nodes d ON d.id = e.dst_id
        WHERE e.scope = $1
          AND (s.scope <> e.scope OR d.scope <> e.scope)
          `,
          [scope],
          `
        SELECT e.id, e.type::text AS type, e.scope AS edge_scope, s.scope AS src_scope, d.scope AS dst_scope, e.src_id, e.dst_id
        FROM memory_edges e
        JOIN memory_nodes s ON s.id = e.src_id
        JOIN memory_nodes d ON d.id = e.dst_id
        WHERE e.scope = $1
          AND (s.scope <> e.scope OR d.scope <> e.scope)
        ORDER BY e.created_at DESC
        LIMIT __LIMIT__
          `,
          [scope],
          sampleLimit,
          env.ALLOW_CROSS_SCOPE_EDGES
            ? "ALLOW_CROSS_SCOPE_EDGES=true; treating cross-scope edges as warning."
            : "Cross-scope edges are disallowed by default.",
        ),
      );
    } else {
      out.push(
        zeroCheck(
          "edges_cross_scope",
          env.ALLOW_CROSS_SCOPE_EDGES ? "warning" : "error",
          "Scope checks skipped by --check-set=cross_tenant.",
        ),
      );
    }

    // 1b) Cross-tenant scope-key consistency (Phase C multi-tenant hardening).
    // Fast path for single-tenant datasets: if there are no tenant-prefixed scopes at all,
    // all cross-tenant mismatch checks are provably zero and can be skipped safely.
    if (includeCrossTenantChecks && hasTenantScopedRows) {
      out.push(
        await runCheck(
          client,
          "tenant_scope_key_malformed",
          "error",
          `
        WITH scopes AS (
          SELECT 'memory_commits'::text AS table_name, scope FROM memory_commits
          UNION ALL
          SELECT 'memory_nodes'::text AS table_name, scope FROM memory_nodes
          UNION ALL
          SELECT 'memory_edges'::text AS table_name, scope FROM memory_edges
          UNION ALL
          SELECT 'memory_rule_defs'::text AS table_name, scope FROM memory_rule_defs
          UNION ALL
          SELECT 'memory_rule_feedback'::text AS table_name, scope FROM memory_rule_feedback
          UNION ALL
          SELECT 'memory_outbox'::text AS table_name, scope FROM memory_outbox
        )
        SELECT count(*)::text AS n
        FROM scopes
        WHERE scope LIKE 'tenant:%'
          AND scope !~ '^tenant:[A-Za-z0-9][A-Za-z0-9._-]{0,63}::scope:.+$'
          `,
          [],
          `
        WITH scopes AS (
          SELECT 'memory_commits'::text AS table_name, scope FROM memory_commits
          UNION ALL
          SELECT 'memory_nodes'::text AS table_name, scope FROM memory_nodes
          UNION ALL
          SELECT 'memory_edges'::text AS table_name, scope FROM memory_edges
          UNION ALL
          SELECT 'memory_rule_defs'::text AS table_name, scope FROM memory_rule_defs
          UNION ALL
          SELECT 'memory_rule_feedback'::text AS table_name, scope FROM memory_rule_feedback
          UNION ALL
          SELECT 'memory_outbox'::text AS table_name, scope FROM memory_outbox
        )
        SELECT table_name, scope
        FROM scopes
        WHERE scope LIKE 'tenant:%'
          AND scope !~ '^tenant:[A-Za-z0-9][A-Za-z0-9._-]{0,63}::scope:.+$'
        ORDER BY table_name, scope
        LIMIT __LIMIT__
          `,
          [],
          sampleLimit,
          "Tenant-prefixed scope keys must match tenant:<tenant_id>::scope:<scope>.",
        ),
      );

      out.push(
        await runCheck(
          client,
          "cross_tenant_edge_scope_mismatch",
          "error",
          `
        WITH x AS (
          SELECT
            e.id,
            CASE
              WHEN e.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(e.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS edge_tenant,
            CASE
              WHEN s.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(s.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS src_tenant,
            CASE
              WHEN d.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(d.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS dst_tenant
          FROM memory_edges e
          JOIN memory_nodes s ON s.id = e.src_id
          JOIN memory_nodes d ON d.id = e.dst_id
          WHERE e.scope LIKE 'tenant:%'
             OR s.scope LIKE 'tenant:%'
             OR d.scope LIKE 'tenant:%'
        )
        SELECT count(*)::text AS n
        FROM x
        WHERE edge_tenant <> src_tenant OR edge_tenant <> dst_tenant
          `,
          [env.MEMORY_TENANT_ID],
          `
        WITH x AS (
          SELECT
            e.id,
            e.type::text AS type,
            e.scope AS edge_scope,
            s.scope AS src_scope,
            d.scope AS dst_scope,
            CASE
              WHEN e.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(e.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS edge_tenant,
            CASE
              WHEN s.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(s.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS src_tenant,
            CASE
              WHEN d.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(d.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS dst_tenant
          FROM memory_edges e
          JOIN memory_nodes s ON s.id = e.src_id
          JOIN memory_nodes d ON d.id = e.dst_id
          WHERE e.scope LIKE 'tenant:%'
             OR s.scope LIKE 'tenant:%'
             OR d.scope LIKE 'tenant:%'
        )
        SELECT id, type, edge_scope, src_scope, dst_scope, edge_tenant, src_tenant, dst_tenant
        FROM x
        WHERE edge_tenant <> src_tenant OR edge_tenant <> dst_tenant
        ORDER BY id
        LIMIT __LIMIT__
          `,
          [env.MEMORY_TENANT_ID],
          sampleLimit,
          "Edge tenant ownership must match both endpoint nodes.",
        ),
      );

      out.push(
        await runCheck(
          client,
          "cross_tenant_rule_def_scope_mismatch",
          "error",
          `
        WITH x AS (
          SELECT
            d.rule_node_id,
            CASE
              WHEN d.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(d.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS def_tenant,
            CASE
              WHEN n.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(n.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS node_tenant
          FROM memory_rule_defs d
          JOIN memory_nodes n ON n.id = d.rule_node_id
          WHERE d.scope LIKE 'tenant:%'
             OR n.scope LIKE 'tenant:%'
        )
        SELECT count(*)::text AS n
        FROM x
        WHERE def_tenant <> node_tenant
          `,
          [env.MEMORY_TENANT_ID],
          `
        WITH x AS (
          SELECT
            d.rule_node_id,
            d.state::text AS state,
            d.scope AS def_scope,
            n.scope AS node_scope,
            CASE
              WHEN d.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(d.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS def_tenant,
            CASE
              WHEN n.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(n.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS node_tenant
          FROM memory_rule_defs d
          JOIN memory_nodes n ON n.id = d.rule_node_id
          WHERE d.scope LIKE 'tenant:%'
             OR n.scope LIKE 'tenant:%'
        )
        SELECT rule_node_id, state, def_scope, node_scope, def_tenant, node_tenant
        FROM x
        WHERE def_tenant <> node_tenant
        ORDER BY rule_node_id
        LIMIT __LIMIT__
          `,
          [env.MEMORY_TENANT_ID],
          sampleLimit,
          "Rule definitions must stay in the same tenant as their rule node.",
        ),
      );

      out.push(
        await runCheck(
          client,
          "cross_tenant_rule_feedback_scope_mismatch",
          "error",
          `
        WITH x AS (
          SELECT
            f.id,
            CASE
              WHEN f.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(f.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS fb_tenant,
            CASE
              WHEN n.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(n.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS node_tenant
          FROM memory_rule_feedback f
          JOIN memory_nodes n ON n.id = f.rule_node_id
          WHERE f.scope LIKE 'tenant:%'
             OR n.scope LIKE 'tenant:%'
        )
        SELECT count(*)::text AS n
        FROM x
        WHERE fb_tenant <> node_tenant
          `,
          [env.MEMORY_TENANT_ID],
          `
        WITH x AS (
          SELECT
            f.id,
            f.rule_node_id,
            f.scope AS feedback_scope,
            n.scope AS node_scope,
            f.outcome,
            CASE
              WHEN f.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(f.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS fb_tenant,
            CASE
              WHEN n.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(n.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS node_tenant
          FROM memory_rule_feedback f
          JOIN memory_nodes n ON n.id = f.rule_node_id
          WHERE f.scope LIKE 'tenant:%'
             OR n.scope LIKE 'tenant:%'
        )
        SELECT id, rule_node_id, feedback_scope, node_scope, outcome, fb_tenant, node_tenant
        FROM x
        WHERE fb_tenant <> node_tenant
        ORDER BY id DESC
        LIMIT __LIMIT__
          `,
          [env.MEMORY_TENANT_ID],
          sampleLimit,
          "Rule feedback tenant must match the target rule node tenant.",
        ),
      );

      out.push(
        await runCheck(
          client,
          "cross_tenant_outbox_scope_mismatch",
          "error",
          `
        WITH x AS (
          SELECT
            o.id,
            CASE
              WHEN o.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(o.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS outbox_tenant,
            CASE
              WHEN c.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(c.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS commit_tenant
          FROM memory_outbox o
          JOIN memory_commits c ON c.id = o.commit_id
          WHERE o.scope LIKE 'tenant:%'
             OR c.scope LIKE 'tenant:%'
        )
        SELECT count(*)::text AS n
        FROM x
        WHERE outbox_tenant <> commit_tenant
          `,
          [env.MEMORY_TENANT_ID],
          `
        WITH x AS (
          SELECT
            o.id,
            o.event_type,
            o.scope AS outbox_scope,
            c.scope AS commit_scope,
            o.commit_id,
            CASE
              WHEN o.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(o.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS outbox_tenant,
            CASE
              WHEN c.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(c.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS commit_tenant
          FROM memory_outbox o
          JOIN memory_commits c ON c.id = o.commit_id
          WHERE o.scope LIKE 'tenant:%'
             OR c.scope LIKE 'tenant:%'
        )
        SELECT id, event_type, outbox_scope, commit_scope, commit_id, outbox_tenant, commit_tenant
        FROM x
        WHERE outbox_tenant <> commit_tenant
        ORDER BY id DESC
        LIMIT __LIMIT__
          `,
          [env.MEMORY_TENANT_ID],
          sampleLimit,
          "Outbox rows must stay within the same tenant as the referenced commit.",
        ),
      );

      out.push(
        await runCheck(
          client,
          "cross_tenant_commit_parent_scope_mismatch",
          "error",
          `
        WITH x AS (
          SELECT
            c.id,
            CASE
              WHEN c.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(c.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS commit_tenant,
            CASE
              WHEN p.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(p.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS parent_tenant
          FROM memory_commits c
          JOIN memory_commits p ON p.id = c.parent_id
          WHERE c.scope LIKE 'tenant:%'
             OR p.scope LIKE 'tenant:%'
        )
        SELECT count(*)::text AS n
        FROM x
        WHERE commit_tenant <> parent_tenant
          `,
          [env.MEMORY_TENANT_ID],
          `
        WITH x AS (
          SELECT
            c.id,
            c.scope AS commit_scope,
            c.parent_id,
            p.scope AS parent_scope,
            CASE
              WHEN c.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(c.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS commit_tenant,
            CASE
              WHEN p.scope LIKE 'tenant:%::scope:%'
                THEN split_part(split_part(p.scope, '::scope:', 1), 'tenant:', 2)
              ELSE $1
            END AS parent_tenant
          FROM memory_commits c
          JOIN memory_commits p ON p.id = c.parent_id
          WHERE c.scope LIKE 'tenant:%'
             OR p.scope LIKE 'tenant:%'
        )
        SELECT id, parent_id, commit_scope, parent_scope, commit_tenant, parent_tenant
        FROM x
        WHERE commit_tenant <> parent_tenant
        ORDER BY id DESC
        LIMIT __LIMIT__
          `,
          [env.MEMORY_TENANT_ID],
          sampleLimit,
          "Commit chains must not cross tenant boundaries.",
        ),
      );
    } else if (includeCrossTenantChecks) {
      const note = "No tenant-prefixed scopes found; cross-tenant checks skipped for this run.";
      out.push(zeroCheck("tenant_scope_key_malformed", "error", note));
      out.push(zeroCheck("cross_tenant_edge_scope_mismatch", "error", note));
      out.push(zeroCheck("cross_tenant_rule_def_scope_mismatch", "error", note));
      out.push(zeroCheck("cross_tenant_rule_feedback_scope_mismatch", "error", note));
      out.push(zeroCheck("cross_tenant_outbox_scope_mismatch", "error", note));
      out.push(zeroCheck("cross_tenant_commit_parent_scope_mismatch", "error", note));
    } else {
      const note = "Cross-tenant checks skipped by --check-set=scope.";
      out.push(zeroCheck("tenant_scope_key_malformed", "error", note));
      out.push(zeroCheck("cross_tenant_edge_scope_mismatch", "error", note));
      out.push(zeroCheck("cross_tenant_rule_def_scope_mismatch", "error", note));
      out.push(zeroCheck("cross_tenant_rule_feedback_scope_mismatch", "error", note));
      out.push(zeroCheck("cross_tenant_outbox_scope_mismatch", "error", note));
      out.push(zeroCheck("cross_tenant_commit_parent_scope_mismatch", "error", note));
    }

    if (includeScopeChecks) {
    // 2) Embedding dim mismatch (should never happen for vector(1536)).
    out.push(
      await runCheck(
        client,
        "embedding_dim_mismatch",
        "error",
        `
        SELECT count(*)::text AS n
        FROM memory_nodes
        WHERE scope = $1
          AND embedding IS NOT NULL
          AND vector_dims(embedding) <> 1536
        `,
        [scope],
        `
        SELECT id, type::text AS type, vector_dims(embedding) AS dims
        FROM memory_nodes
        WHERE scope = $1
          AND embedding IS NOT NULL
          AND vector_dims(embedding) <> 1536
        ORDER BY updated_at DESC
        LIMIT __LIMIT__
        `,
        [scope],
        sampleLimit,
      ),
    );

    // 3) embedding_status inconsistencies.
    out.push(
      await runCheck(
        client,
        "embedding_ready_without_vector",
        "error",
        `
        SELECT count(*)::text AS n
        FROM memory_nodes
        WHERE scope = $1
          AND embedding_status = 'ready'
          AND embedding IS NULL
        `,
        [scope],
        `
        SELECT id, type::text AS type, embedding_status::text AS embedding_status, embedding_attempts, left(coalesce(embedding_last_error,''),120) AS last_error
        FROM memory_nodes
        WHERE scope = $1
          AND embedding_status = 'ready'
          AND embedding IS NULL
        ORDER BY updated_at DESC
        LIMIT __LIMIT__
        `,
        [scope],
        sampleLimit,
      ),
    );

    out.push(
      await runCheck(
        client,
        "embedding_not_ready_with_vector",
        "error",
        `
        SELECT count(*)::text AS n
        FROM memory_nodes
        WHERE scope = $1
          AND embedding_status <> 'ready'
          AND embedding IS NOT NULL
        `,
        [scope],
        `
        SELECT id, type::text AS type, embedding_status::text AS embedding_status, embedding_attempts, left(coalesce(embedding_last_error,''),120) AS last_error
        FROM memory_nodes
        WHERE scope = $1
          AND embedding_status <> 'ready'
          AND embedding IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT __LIMIT__
        `,
        [scope],
        sampleLimit,
      ),
    );

    // 4) embedding_model should be populated for READY nodes (warning; older rows may be null).
    if (hasEmbeddingModel) {
      out.push(
        await runCheck(
          client,
          "embedding_model_missing_for_ready",
          "error",
          `
          SELECT count(*)::text AS n
          FROM memory_nodes
          WHERE scope = $1
            AND embedding_status = 'ready'
            AND embedding IS NOT NULL
            AND (embedding_model IS NULL OR btrim(embedding_model) = '')
          `,
          [scope],
          `
          SELECT id, type::text AS type, embedding_status::text AS embedding_status
          FROM memory_nodes
          WHERE scope = $1
            AND embedding_status = 'ready'
            AND embedding IS NOT NULL
            AND (embedding_model IS NULL OR btrim(embedding_model) = '')
          ORDER BY updated_at DESC
          LIMIT __LIMIT__
          `,
          [scope],
          sampleLimit,
          "READY nodes must always have embedding_model populated; missing values are treated as hard errors.",
        ),
      );

      out.push(
        await runCheck(
          client,
          "embedding_model_invalid_for_ready",
          "error",
          `
          SELECT count(*)::text AS n
          FROM memory_nodes
          WHERE scope = $1
            AND embedding_status = 'ready'
            AND embedding IS NOT NULL
            AND embedding_model IS NOT NULL
            AND btrim(embedding_model) <> ''
            AND (
              lower(btrim(embedding_model)) LIKE 'unknown:%'
              OR (
                btrim(embedding_model) <> 'client'
                AND btrim(embedding_model) !~ '^[a-z0-9][a-z0-9_-]*:[^[:space:]]+$'
              )
            )
          `,
          [scope],
          `
          SELECT id, type::text AS type, embedding_model
          FROM memory_nodes
          WHERE scope = $1
            AND embedding_status = 'ready'
            AND embedding IS NOT NULL
            AND embedding_model IS NOT NULL
            AND btrim(embedding_model) <> ''
            AND (
              lower(btrim(embedding_model)) LIKE 'unknown:%'
              OR (
                btrim(embedding_model) <> 'client'
                AND btrim(embedding_model) !~ '^[a-z0-9][a-z0-9_-]*:[^[:space:]]+$'
              )
            )
          ORDER BY updated_at DESC
          LIMIT __LIMIT__
          `,
          [scope],
          sampleLimit,
          "READY nodes should carry a stable embedding_model label (provider:model or 'client'); unknown:* is treated as invalid and should be impossible after health-gate/backfill hardening.",
        ),
      );
    }

    // 5) Topic slots sanity.
    out.push(
      await runCheck(
        client,
        "topic_state_invalid",
        "warning",
        `
        SELECT count(*)::text AS n
        FROM memory_nodes
        WHERE scope = $1
          AND type = 'topic'
          AND COALESCE(slots->>'topic_state','active') NOT IN ('active','draft')
        `,
        [scope],
        `
        SELECT id, title, slots->>'topic_state' AS topic_state
        FROM memory_nodes
        WHERE scope = $1
          AND type = 'topic'
          AND COALESCE(slots->>'topic_state','active') NOT IN ('active','draft')
        ORDER BY updated_at DESC
        LIMIT __LIMIT__
        `,
        [scope],
        sampleLimit,
      ),
    );

    out.push(
      await runCheck(
        client,
        "topic_member_count_invalid",
        "warning",
        `
        SELECT count(*)::text AS n
        FROM memory_nodes
        WHERE scope = $1
          AND type = 'topic'
          AND (slots ? 'member_count')
          AND NOT ((slots->>'member_count') ~ '^[0-9]+$')
        `,
        [scope],
        `
        SELECT id, title, slots->>'member_count' AS member_count
        FROM memory_nodes
        WHERE scope = $1
          AND type = 'topic'
          AND (slots ? 'member_count')
          AND NOT ((slots->>'member_count') ~ '^[0-9]+$')
        ORDER BY updated_at DESC
        LIMIT __LIMIT__
        `,
        [scope],
        sampleLimit,
      ),
    );

    // 6) Tiering policy sanity (Phase 1 long-term memory).
    out.push(
      await runCheck(
        client,
        "tier_transition_marker_invalid",
        "warning",
        `
        SELECT count(*)::text AS n
        FROM memory_nodes
        WHERE scope = $1
          AND (slots ? 'last_tier_transition_ms')
          AND NOT ((slots->>'last_tier_transition_ms') ~ '^[0-9]+$')
        `,
        [scope],
        `
        SELECT id, type::text AS type, tier::text AS tier, slots->>'last_tier_transition_ms' AS last_tier_transition_ms
        FROM memory_nodes
        WHERE scope = $1
          AND (slots ? 'last_tier_transition_ms')
          AND NOT ((slots->>'last_tier_transition_ms') ~ '^[0-9]+$')
        ORDER BY updated_at DESC
        LIMIT __LIMIT__
        `,
        [scope],
        sampleLimit,
      ),
    );

    out.push(
      await runCheck(
        client,
        "protected_nodes_recently_tiered",
        "error",
        `
        SELECT count(*)::text AS n
        FROM memory_nodes
        WHERE scope = $1
          AND (
            lower(coalesce(slots->>'pin', 'false')) IN ('true', '1', 'yes', 'on')
            OR lower(coalesce(slots->>'legal_hold', 'false')) IN ('true', '1', 'yes', 'on')
          )
          AND (slots ? 'last_tier_transition_ms')
          AND (slots->>'last_tier_transition_ms') ~ '^[0-9]+$'
          AND (slots->>'last_tier_transition_ms')::bigint >= $2::bigint
        `,
        [scope, Date.now() - 24 * 60 * 60 * 1000],
        `
        SELECT id, type::text AS type, tier::text AS tier,
               slots->>'pin' AS pin, slots->>'legal_hold' AS legal_hold,
               slots->>'last_tier_transition_ms' AS last_tier_transition_ms,
               slots->>'last_tier_transition_from' AS from_tier,
               slots->>'last_tier_transition_to' AS to_tier
        FROM memory_nodes
        WHERE scope = $1
          AND (
            lower(coalesce(slots->>'pin', 'false')) IN ('true', '1', 'yes', 'on')
            OR lower(coalesce(slots->>'legal_hold', 'false')) IN ('true', '1', 'yes', 'on')
          )
          AND (slots ? 'last_tier_transition_ms')
          AND (slots->>'last_tier_transition_ms') ~ '^[0-9]+$'
          AND (slots->>'last_tier_transition_ms')::bigint >= $2::bigint
        ORDER BY updated_at DESC
        LIMIT __LIMIT__
        `,
        [scope, Date.now() - 24 * 60 * 60 * 1000],
        sampleLimit,
        "Pinned/legal_hold nodes must not be tier-demoted by forgetting jobs.",
      ),
    );

    out.push(
      await runCheck(
        client,
        "archive_salience_too_high",
        "warning",
        `
        SELECT count(*)::text AS n
        FROM memory_nodes
        WHERE scope = $1
          AND tier = 'archive'
          AND salience > $2::real
        `,
        [scope, env.MEMORY_TIER_COLD_BELOW],
        `
        SELECT id, type::text AS type, salience, slots->>'last_tier_transition_to' AS last_to
        FROM memory_nodes
        WHERE scope = $1
          AND tier = 'archive'
          AND salience > $2::real
        ORDER BY salience DESC
        LIMIT __LIMIT__
        `,
        [scope, env.MEMORY_TIER_COLD_BELOW],
        sampleLimit,
        "Archive tier should generally have low salience; high values indicate transition policy drift.",
      ),
    );

    out.push(
      await runCheck(
        client,
        "adaptive_feedback_quality_invalid",
        "warning",
        `
        SELECT count(*)::text AS n
        FROM memory_nodes
        WHERE scope = $1
          AND (slots ? 'feedback_quality')
          AND (
            NOT ((slots->>'feedback_quality') ~ '^-?[0-9]+(\\.[0-9]+)?$')
            OR (slots->>'feedback_quality')::real < -1
            OR (slots->>'feedback_quality')::real > 1
          )
        `,
        [scope],
        `
        SELECT id, type::text AS type, slots->>'feedback_quality' AS feedback_quality
        FROM memory_nodes
        WHERE scope = $1
          AND (slots ? 'feedback_quality')
          AND (
            NOT ((slots->>'feedback_quality') ~ '^-?[0-9]+(\\.[0-9]+)?$')
            OR (slots->>'feedback_quality')::real < -1
            OR (slots->>'feedback_quality')::real > 1
          )
        ORDER BY updated_at DESC
        LIMIT __LIMIT__
        `,
        [scope],
        sampleLimit,
        "feedback_quality should be numeric in [-1,1] when present.",
      ),
    );

    out.push(
      await runCheck(
        client,
        "adaptive_feedback_counts_invalid",
        "warning",
        `
        SELECT count(*)::text AS n
        FROM memory_nodes
        WHERE scope = $1
          AND (
            (slots ? 'feedback_positive' AND NOT ((slots->>'feedback_positive') ~ '^[0-9]+$'))
            OR (slots ? 'feedback_negative' AND NOT ((slots->>'feedback_negative') ~ '^[0-9]+$'))
          )
        `,
        [scope],
        `
        SELECT id, type::text AS type, slots->>'feedback_positive' AS feedback_positive, slots->>'feedback_negative' AS feedback_negative
        FROM memory_nodes
        WHERE scope = $1
          AND (
            (slots ? 'feedback_positive' AND NOT ((slots->>'feedback_positive') ~ '^[0-9]+$'))
            OR (slots ? 'feedback_negative' AND NOT ((slots->>'feedback_negative') ~ '^[0-9]+$'))
          )
        ORDER BY updated_at DESC
        LIMIT __LIMIT__
        `,
        [scope],
        sampleLimit,
        "feedback_positive/feedback_negative should be non-negative integers when present.",
      ),
    );

    if (env.MEMORY_SCOPE_HOT_NODE_BUDGET > 0) {
      out.push(
        await runCheck(
          client,
          "scope_hot_budget_exceeded",
          "warning",
          `
          WITH c AS (
            SELECT count(*)::int AS hot_n
            FROM memory_nodes
            WHERE scope = $1
              AND tier = 'hot'
          )
          SELECT CASE WHEN c.hot_n > $2::int THEN (c.hot_n - $2::int)::text ELSE '0' END AS n
          FROM c
          `,
          [scope, env.MEMORY_SCOPE_HOT_NODE_BUDGET],
          `
          WITH c AS (
            SELECT count(*)::int AS hot_n
            FROM memory_nodes
            WHERE scope = $1
              AND tier = 'hot'
          )
          SELECT n.id, n.type::text AS type, n.salience, COALESCE(n.last_activated, n.created_at) AS activity_at
          FROM memory_nodes n
          CROSS JOIN c
          WHERE n.scope = $1
            AND n.tier = 'hot'
            AND c.hot_n > $2::int
          ORDER BY salience ASC, COALESCE(last_activated, created_at) ASC
          LIMIT __LIMIT__
          `,
          [scope, env.MEMORY_SCOPE_HOT_NODE_BUDGET],
          sampleLimit,
          `Hot-tier budget exceeded (budget=${env.MEMORY_SCOPE_HOT_NODE_BUDGET}).`,
        ),
      );
    }

    if (env.MEMORY_SCOPE_ACTIVE_NODE_BUDGET > 0) {
      out.push(
        await runCheck(
          client,
          "scope_active_budget_exceeded",
          "warning",
          `
          WITH c AS (
            SELECT count(*)::int AS active_n
            FROM memory_nodes
            WHERE scope = $1
              AND tier IN ('hot', 'warm')
          )
          SELECT CASE WHEN c.active_n > $2::int THEN (c.active_n - $2::int)::text ELSE '0' END AS n
          FROM c
          `,
          [scope, env.MEMORY_SCOPE_ACTIVE_NODE_BUDGET],
          `
          WITH c AS (
            SELECT count(*)::int AS active_n
            FROM memory_nodes
            WHERE scope = $1
              AND tier IN ('hot', 'warm')
          )
          SELECT n.id, n.type::text AS type, n.tier::text AS tier, n.salience, COALESCE(n.last_activated, n.created_at) AS activity_at
          FROM memory_nodes n
          CROSS JOIN c
          WHERE n.scope = $1
            AND n.tier IN ('hot', 'warm')
            AND c.active_n > $2::int
          ORDER BY n.tier DESC, n.salience ASC, COALESCE(n.last_activated, n.created_at) ASC
          LIMIT __LIMIT__
          `,
          [scope, env.MEMORY_SCOPE_ACTIVE_NODE_BUDGET],
          sampleLimit,
          `Active-tier budget exceeded (hot+warm budget=${env.MEMORY_SCOPE_ACTIVE_NODE_BUDGET}).`,
        ),
      );
    }

    out.push(
      await runCheck(
        client,
        "compression_citations_invalid",
        "warning",
        `
        SELECT count(*)::text AS n
        FROM memory_nodes
        WHERE scope = $1
          AND type = 'concept'
          AND slots->>'summary_kind' = 'compression_rollup'
          AND (
            NOT (slots ? 'citations')
            OR jsonb_typeof(slots->'citations') <> 'array'
          )
        `,
        [scope],
        `
        SELECT id, title, slots->>'summary_kind' AS summary_kind
        FROM memory_nodes
        WHERE scope = $1
          AND type = 'concept'
          AND slots->>'summary_kind' = 'compression_rollup'
          AND (
            NOT (slots ? 'citations')
            OR jsonb_typeof(slots->'citations') <> 'array'
          )
        ORDER BY updated_at DESC
        LIMIT __LIMIT__
        `,
        [scope],
        sampleLimit,
        "Compression summaries should carry citations[] for traceability.",
      ),
    );

    out.push(
      await runCheck(
        client,
        "compression_citation_node_missing",
        "warning",
        `
        WITH expanded AS (
          SELECT
            n.id AS summary_id,
            (c->>'node_id') AS cited_node_id
          FROM memory_nodes n
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(n.slots->'citations', '[]'::jsonb)) c
          WHERE n.scope = $1
            AND n.type = 'concept'
            AND n.slots->>'summary_kind' = 'compression_rollup'
        )
        SELECT count(*)::text AS n
        FROM expanded x
        LEFT JOIN memory_nodes t ON t.id = CASE
          WHEN x.cited_node_id ~* '^[0-9a-f-]{36}$' THEN x.cited_node_id::uuid
          ELSE NULL
        END
        WHERE x.cited_node_id IS NOT NULL
          AND x.cited_node_id ~* '^[0-9a-f-]{36}$'
          AND t.id IS NULL
        `,
        [scope],
        `
        WITH expanded AS (
          SELECT
            n.id AS summary_id,
            (c->>'node_id') AS cited_node_id
          FROM memory_nodes n
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(n.slots->'citations', '[]'::jsonb)) c
          WHERE n.scope = $1
            AND n.type = 'concept'
            AND n.slots->>'summary_kind' = 'compression_rollup'
        )
        SELECT x.summary_id, x.cited_node_id
        FROM expanded x
        LEFT JOIN memory_nodes t ON t.id = CASE
          WHEN x.cited_node_id ~* '^[0-9a-f-]{36}$' THEN x.cited_node_id::uuid
          ELSE NULL
        END
        WHERE x.cited_node_id IS NOT NULL
          AND x.cited_node_id ~* '^[0-9a-f-]{36}$'
          AND t.id IS NULL
        ORDER BY x.summary_id
        LIMIT __LIMIT__
        `,
        [scope],
        sampleLimit,
        "Compression citations should reference existing nodes.",
      ),
    );

    out.push(
      await runCheck(
        client,
        "alias_self_reference",
        "error",
        `
        SELECT count(*)::text AS n
        FROM memory_nodes
        WHERE scope = $1
          AND (
            (
              (slots ? 'alias_of')
              AND (slots->>'alias_of') ~* '^[0-9a-f-]{36}$'
              AND (slots->>'alias_of')::uuid = id
            )
            OR (
              (slots ? 'superseded_by')
              AND (slots->>'superseded_by') ~* '^[0-9a-f-]{36}$'
              AND (slots->>'superseded_by')::uuid = id
            )
          )
        `,
        [scope],
        `
        SELECT id, type::text AS type, slots->>'alias_of' AS alias_of, slots->>'superseded_by' AS superseded_by
        FROM memory_nodes
        WHERE scope = $1
          AND (
            (
              (slots ? 'alias_of')
              AND (slots->>'alias_of') ~* '^[0-9a-f-]{36}$'
              AND (slots->>'alias_of')::uuid = id
            )
            OR (
              (slots ? 'superseded_by')
              AND (slots->>'superseded_by') ~* '^[0-9a-f-]{36}$'
              AND (slots->>'superseded_by')::uuid = id
            )
          )
        ORDER BY updated_at DESC
        LIMIT __LIMIT__
        `,
        [scope],
        sampleLimit,
        "alias_of/superseded_by must never point to the same node id.",
      ),
    );

    out.push(
      await runCheck(
        client,
        "alias_target_missing",
        "error",
        `
        WITH refs AS (
          SELECT
            id AS node_id,
            type::text AS node_type,
            (slots->>'alias_of') AS alias_of
          FROM memory_nodes
          WHERE scope = $1
            AND (slots ? 'alias_of')
            AND (slots->>'alias_of') ~* '^[0-9a-f-]{36}$'
        )
        SELECT count(*)::text AS n
        FROM refs r
        LEFT JOIN memory_nodes t
          ON t.id = r.alias_of::uuid
         AND t.scope = $1
        WHERE t.id IS NULL
        `,
        [scope],
        `
        WITH refs AS (
          SELECT
            id AS node_id,
            type::text AS node_type,
            (slots->>'alias_of') AS alias_of
          FROM memory_nodes
          WHERE scope = $1
            AND (slots ? 'alias_of')
            AND (slots->>'alias_of') ~* '^[0-9a-f-]{36}$'
        )
        SELECT r.node_id, r.node_type, r.alias_of
        FROM refs r
        LEFT JOIN memory_nodes t
          ON t.id = r.alias_of::uuid
         AND t.scope = $1
        WHERE t.id IS NULL
        ORDER BY r.node_id
        LIMIT __LIMIT__
        `,
        [scope],
        sampleLimit,
        "alias_of should point to an existing node in the same scope.",
      ),
    );

    out.push(
      await runCheck(
        client,
        "superseded_target_missing",
        "warning",
        `
        WITH refs AS (
          SELECT
            id AS node_id,
            type::text AS node_type,
            (slots->>'superseded_by') AS superseded_by
          FROM memory_nodes
          WHERE scope = $1
            AND (slots ? 'superseded_by')
            AND (slots->>'superseded_by') ~* '^[0-9a-f-]{36}$'
        )
        SELECT count(*)::text AS n
        FROM refs r
        LEFT JOIN memory_nodes t
          ON t.id = r.superseded_by::uuid
         AND t.scope = $1
        WHERE t.id IS NULL
        `,
        [scope],
        `
        WITH refs AS (
          SELECT
            id AS node_id,
            type::text AS node_type,
            (slots->>'superseded_by') AS superseded_by
          FROM memory_nodes
          WHERE scope = $1
            AND (slots ? 'superseded_by')
            AND (slots->>'superseded_by') ~* '^[0-9a-f-]{36}$'
        )
        SELECT r.node_id, r.node_type, r.superseded_by
        FROM refs r
        LEFT JOIN memory_nodes t
          ON t.id = r.superseded_by::uuid
         AND t.scope = $1
        WHERE t.id IS NULL
        ORDER BY r.node_id
        LIMIT __LIMIT__
        `,
        [scope],
        sampleLimit,
        "superseded_by should point to an existing node in the same scope.",
      ),
    );

    out.push(
      await runCheck(
        client,
        "alias_target_type_mismatch",
        "warning",
        `
        WITH refs AS (
          SELECT
            id AS node_id,
            type::text AS node_type,
            (slots->>'alias_of') AS alias_of
          FROM memory_nodes
          WHERE scope = $1
            AND (slots ? 'alias_of')
            AND (slots->>'alias_of') ~* '^[0-9a-f-]{36}$'
        )
        SELECT count(*)::text AS n
        FROM refs r
        JOIN memory_nodes t
          ON t.id = r.alias_of::uuid
         AND t.scope = $1
        WHERE t.type::text <> r.node_type
        `,
        [scope],
        `
        WITH refs AS (
          SELECT
            id AS node_id,
            type::text AS node_type,
            (slots->>'alias_of') AS alias_of
          FROM memory_nodes
          WHERE scope = $1
            AND (slots ? 'alias_of')
            AND (slots->>'alias_of') ~* '^[0-9a-f-]{36}$'
        )
        SELECT r.node_id, r.node_type, r.alias_of, t.type::text AS alias_type
        FROM refs r
        JOIN memory_nodes t
          ON t.id = r.alias_of::uuid
         AND t.scope = $1
        WHERE t.type::text <> r.node_type
        ORDER BY r.node_id
        LIMIT __LIMIT__
        `,
        [scope],
        sampleLimit,
        "alias_of should generally point to the same node type.",
      ),
    );

    out.push(
      await runCheck(
        client,
        "consolidation_conflict_detected_without_override",
        "error",
        `
        SELECT count(*)::text AS n
        FROM memory_nodes
        WHERE scope = $1
          AND lower(coalesce(slots->>'consolidation_conflict_detected', 'false')) IN ('true', '1', 'yes', 'on')
          AND lower(coalesce(slots->>'consolidation_conflict_override', 'false')) NOT IN ('true', '1', 'yes', 'on')
        `,
        [scope],
        `
        SELECT
          id,
          type::text AS type,
          slots->>'alias_of' AS alias_of,
          slots->>'consolidation_conflict_kind' AS conflict_kind,
          slots->'consolidation_conflict_reasons' AS conflict_reasons
        FROM memory_nodes
        WHERE scope = $1
          AND lower(coalesce(slots->>'consolidation_conflict_detected', 'false')) IN ('true', '1', 'yes', 'on')
          AND lower(coalesce(slots->>'consolidation_conflict_override', 'false')) NOT IN ('true', '1', 'yes', 'on')
        ORDER BY updated_at DESC
        LIMIT __LIMIT__
        `,
        [scope],
        sampleLimit,
        "Phase 3 contradiction policy should block these pairs unless explicit override is set.",
      ),
    );

    out.push(
      await runCheck(
        client,
        "aliased_nodes_with_incident_edges",
        "warning",
        `
        WITH aliased AS (
          SELECT id
          FROM memory_nodes
          WHERE scope = $1
            AND (slots ? 'alias_of')
            AND (slots->>'alias_of') ~* '^[0-9a-f-]{36}$'
            AND id <> (slots->>'alias_of')::uuid
        )
        SELECT count(*)::text AS n
        FROM memory_edges e
        JOIN aliased a ON a.id = e.src_id OR a.id = e.dst_id
        WHERE e.scope = $1
        `,
        [scope],
        `
        WITH aliased AS (
          SELECT id
          FROM memory_nodes
          WHERE scope = $1
            AND (slots ? 'alias_of')
            AND (slots->>'alias_of') ~* '^[0-9a-f-]{36}$'
            AND id <> (slots->>'alias_of')::uuid
        )
        SELECT e.id, e.type::text AS type, e.src_id, e.dst_id
        FROM memory_edges e
        JOIN aliased a ON a.id = e.src_id OR a.id = e.dst_id
        WHERE e.scope = $1
        ORDER BY e.created_at DESC
        LIMIT __LIMIT__
        `,
        [scope],
        sampleLimit,
        "After consolidation edge redirect, aliased nodes should no longer carry incident edges.",
      ),
    );

    // 7b) Multi-agent lane / rule-scope sanity.
    if (hasMemoryLane && hasOwnerAgentId && hasOwnerTeamId) {
      out.push(
        await runCheck(
          client,
          "private_rule_owner_constraint_not_validated",
          "error",
          `
          SELECT (
            CASE WHEN EXISTS (
              SELECT 1
              FROM pg_constraint c
              JOIN pg_class t ON t.oid = c.conrelid
              JOIN pg_namespace n ON n.oid = t.relnamespace
              WHERE n.nspname = 'public'
                AND t.relname = 'memory_nodes'
                AND c.conname = 'memory_nodes_private_rule_owner_ck'
                AND c.convalidated = true
            ) THEN 0 ELSE 1 END
          )::text AS n
          `,
          [],
          `
          SELECT c.conname, c.convalidated
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE n.nspname = 'public'
            AND t.relname = 'memory_nodes'
            AND c.conname = 'memory_nodes_private_rule_owner_ck'
          LIMIT __LIMIT__
          `,
          [],
          sampleLimit,
          "Should be validated after migration 0015_validate_private_rule_owner_guard.sql.",
          { sampleWhenZero: true },
        ),
      );

      out.push(
        await runCheck(
          client,
          "private_lane_without_owner",
          "warning",
          `
          SELECT count(*)::text AS n
          FROM memory_nodes
          WHERE scope = $1
            AND type <> 'rule'
            AND memory_lane = 'private'
            AND owner_agent_id IS NULL
            AND owner_team_id IS NULL
          `,
          [scope],
          `
          SELECT id, type::text AS type, memory_lane::text AS memory_lane, producer_agent_id, owner_agent_id, owner_team_id
          FROM memory_nodes
          WHERE scope = $1
            AND type <> 'rule'
            AND memory_lane = 'private'
            AND owner_agent_id IS NULL
            AND owner_team_id IS NULL
          ORDER BY updated_at DESC
          LIMIT __LIMIT__
          `,
          [scope],
          sampleLimit,
          "Private lane without owner may become unreachable once consumer_agent filters are enabled.",
        ),
      );

      out.push(
        await runCheck(
          client,
          "private_rule_without_owner",
          "error",
          `
          SELECT count(*)::text AS n
          FROM memory_nodes
          WHERE scope = $1
            AND type = 'rule'
            AND memory_lane = 'private'
            AND owner_agent_id IS NULL
            AND owner_team_id IS NULL
          `,
          [scope],
          `
          SELECT id, memory_lane::text AS memory_lane, producer_agent_id, owner_agent_id, owner_team_id, updated_at
          FROM memory_nodes
          WHERE scope = $1
            AND type = 'rule'
            AND memory_lane = 'private'
            AND owner_agent_id IS NULL
            AND owner_team_id IS NULL
          ORDER BY updated_at DESC
          LIMIT __LIMIT__
          `,
          [scope],
          sampleLimit,
          "Should be impossible for new writes after migration 0014_private_rule_owner_guard.sql. Legacy rows must be repaired with job:private-rule-owner-backfill.",
        ),
      );
    }

    if (hasRuleScope && hasTargetAgentId && hasTargetTeamId) {
      out.push(
        await runCheck(
          client,
          "rule_scope_target_missing",
          "error",
          `
          SELECT count(*)::text AS n
          FROM memory_rule_defs
          WHERE scope = $1
            AND (
              (rule_scope = 'agent' AND (target_agent_id IS NULL OR btrim(target_agent_id) = ''))
              OR
              (rule_scope = 'team' AND (target_team_id IS NULL OR btrim(target_team_id) = ''))
            )
          `,
          [scope],
          `
          SELECT rule_node_id, state::text AS state, rule_scope::text AS rule_scope, target_agent_id, target_team_id
          FROM memory_rule_defs
          WHERE scope = $1
            AND (
              (rule_scope = 'agent' AND (target_agent_id IS NULL OR btrim(target_agent_id) = ''))
              OR
              (rule_scope = 'team' AND (target_team_id IS NULL OR btrim(target_team_id) = ''))
            )
          ORDER BY updated_at DESC
          LIMIT __LIMIT__
          `,
          [scope],
          sampleLimit,
          "Scoped rules must declare their target id to avoid silent non-match.",
        ),
      );
    }

    // 7c) Execution provenance linkage sanity.
    if (hasExecutionDecisions && hasRuleFeedbackSource && hasRuleFeedbackDecisionId) {
      out.push(
        await runCheck(
          client,
          "tools_feedback_missing_decision_id",
          "error",
          `
          SELECT count(*)::text AS n
          FROM memory_rule_feedback
          WHERE scope = $1
            AND source = 'tools_feedback'
            AND decision_id IS NULL
          `,
          [scope],
          `
          SELECT id, rule_node_id, run_id, outcome, created_at
          FROM memory_rule_feedback
          WHERE scope = $1
            AND source = 'tools_feedback'
            AND decision_id IS NULL
          ORDER BY created_at DESC
          LIMIT __LIMIT__
          `,
          [scope],
          sampleLimit,
          "tools_feedback rows should always carry a decision_id for execution provenance.",
        ),
      );

      out.push(
        await runCheck(
          client,
          "tools_feedback_decision_link_broken",
          "error",
          `
          SELECT count(*)::text AS n
          FROM memory_rule_feedback f
          LEFT JOIN memory_execution_decisions d
            ON d.scope = f.scope
           AND d.id = f.decision_id
          WHERE f.scope = $1
            AND f.source = 'tools_feedback'
            AND f.decision_id IS NOT NULL
            AND d.id IS NULL
          `,
          [scope],
          `
          SELECT f.id, f.rule_node_id, f.decision_id, f.run_id, f.outcome, f.created_at
          FROM memory_rule_feedback f
          LEFT JOIN memory_execution_decisions d
            ON d.scope = f.scope
           AND d.id = f.decision_id
          WHERE f.scope = $1
            AND f.source = 'tools_feedback'
            AND f.decision_id IS NOT NULL
            AND d.id IS NULL
          ORDER BY f.created_at DESC
          LIMIT __LIMIT__
          `,
          [scope],
          sampleLimit,
          "Every tools_feedback decision_id should resolve to a decision record in the same scope.",
        ),
      );

      out.push(
        await runCheck(
          client,
          "tools_feedback_run_id_mismatch_with_decision",
          "warning",
          `
          SELECT count(*)::text AS n
          FROM memory_rule_feedback f
          JOIN memory_execution_decisions d
            ON d.scope = f.scope
           AND d.id = f.decision_id
          WHERE f.scope = $1
            AND f.source = 'tools_feedback'
            AND nullif(trim(COALESCE(f.run_id, '')), '') IS NOT NULL
            AND nullif(trim(COALESCE(d.run_id, '')), '') IS NOT NULL
            AND trim(f.run_id) <> trim(d.run_id)
          `,
          [scope],
          `
          SELECT f.id, f.rule_node_id, f.decision_id, f.run_id AS feedback_run_id, d.run_id AS decision_run_id, f.created_at
          FROM memory_rule_feedback f
          JOIN memory_execution_decisions d
            ON d.scope = f.scope
           AND d.id = f.decision_id
          WHERE f.scope = $1
            AND f.source = 'tools_feedback'
            AND nullif(trim(COALESCE(f.run_id, '')), '') IS NOT NULL
            AND nullif(trim(COALESCE(d.run_id, '')), '') IS NOT NULL
            AND trim(f.run_id) <> trim(d.run_id)
          ORDER BY f.created_at DESC
          LIMIT __LIMIT__
          `,
          [scope],
          sampleLimit,
          "Run ids should stay aligned between tools_feedback and linked decision records.",
        ),
      );

      out.push(
        await runCheck(
          client,
          "tools_decision_missing_run_id",
          "warning",
          `
          SELECT count(*)::text AS n
          FROM memory_execution_decisions
          WHERE scope = $1
            AND decision_kind = 'tools_select'
            AND nullif(trim(COALESCE(run_id, '')), '') IS NULL
          `,
          [scope],
          `
          SELECT id, selected_tool, created_at
          FROM memory_execution_decisions
          WHERE scope = $1
            AND decision_kind = 'tools_select'
            AND nullif(trim(COALESCE(run_id, '')), '') IS NULL
          ORDER BY created_at DESC
          LIMIT __LIMIT__
          `,
          [scope],
          sampleLimit,
          "Decisions without run_id reduce replayability across execution runs.",
        ),
      );
    } else {
      out.push(
        zeroCheck(
          "execution_provenance_schema_missing",
          "warning",
          "Missing execution provenance schema. Apply migration 0021_execution_decision_provenance.sql.",
        ),
      );
    }

    // 8) Commit linkage (auditability).
    // After migration 0010_commit_id_not_null.sql, this should be impossible.
    out.push(
      await runCheck(
        client,
        "nodes_missing_commit_id",
        "error",
        `
        SELECT count(*)::text AS n
        FROM memory_nodes
        WHERE scope = $1
          AND commit_id IS NULL
        `,
        [scope],
        `
        SELECT id, type::text AS type, created_at
        FROM memory_nodes
        WHERE scope = $1
          AND commit_id IS NULL
        ORDER BY created_at DESC
        LIMIT __LIMIT__
        `,
        [scope],
        sampleLimit,
        "Should be impossible after migration 0010_commit_id_not_null.sql. If non-zero, constraints are missing or data was written outside the API.",
      ),
    );

    out.push(
      await runCheck(
        client,
        "edges_missing_commit_id",
        "error",
        `
        SELECT count(*)::text AS n
        FROM memory_edges
        WHERE scope = $1
          AND commit_id IS NULL
        `,
        [scope],
        `
        SELECT id, type::text AS type, src_id, dst_id, created_at
        FROM memory_edges
        WHERE scope = $1
          AND commit_id IS NULL
        ORDER BY created_at DESC
        LIMIT __LIMIT__
        `,
        [scope],
        sampleLimit,
        "Should be impossible after migration 0010_commit_id_not_null.sql. If non-zero, constraints are missing or data was written outside the API.",
      ),
    );

    // 9) Outbox sanity (worker sweep should dead-letter these).
    if (hasFailedAt) {
      out.push(
        await runCheck(
          client,
          "outbox_should_be_failed_but_not_marked",
          "error",
          `
          SELECT count(*)::text AS n
          FROM memory_outbox
          WHERE scope = $1
            AND published_at IS NULL
            AND failed_at IS NULL
            AND attempts >= $2
          `,
          [scope, env.OUTBOX_MAX_ATTEMPTS],
          `
          SELECT id, event_type, attempts, claimed_at, left(coalesce(last_error,''),120) AS last_error
          FROM memory_outbox
          WHERE scope = $1
            AND published_at IS NULL
            AND failed_at IS NULL
            AND attempts >= $2
          ORDER BY id DESC
          LIMIT __LIMIT__
          `,
          [scope, env.OUTBOX_MAX_ATTEMPTS],
          sampleLimit,
          "Worker should mark these as failed (dead-letter).",
        ),
      );

      out.push(
        await runCheck(
          client,
          "outbox_claimed_too_old",
          "warning",
          `
          SELECT count(*)::text AS n
          FROM memory_outbox
          WHERE scope = $1
            AND published_at IS NULL
            AND failed_at IS NULL
            AND claimed_at IS NOT NULL
            AND claimed_at < now() - ($2::int * interval '1 millisecond')
          `,
          [scope, env.OUTBOX_CLAIM_TIMEOUT_MS],
          `
          SELECT id, event_type, attempts, claimed_at, left(coalesce(last_error,''),120) AS last_error
          FROM memory_outbox
          WHERE scope = $1
            AND published_at IS NULL
            AND failed_at IS NULL
            AND claimed_at IS NOT NULL
            AND claimed_at < now() - ($2::int * interval '1 millisecond')
          ORDER BY claimed_at ASC
          LIMIT __LIMIT__
          `,
          [scope, env.OUTBOX_CLAIM_TIMEOUT_MS],
          sampleLimit,
          "These should be claimable again (claim timeout). If they persist, worker may be stuck.",
        ),
      );
    } else {
      out.push({
        name: "outbox_failed_at_missing",
        severity: "warning",
        count: 0,
        sample: [],
        note: "missing memory_outbox.failed_at column; apply migrations (0007_outbox_failed.sql) for dead-letter support.",
      });
    }
    }

    return out;
  });

  let errors = 0;
  let warnings = 0;
  for (const c of checks) {
    if (c.error) errors += 1;
    if (c.count > 0) {
      if (c.severity === "error") errors += 1;
      else warnings += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        scope,
        check_set: checkSet,
        mode: checkMode,
        batch: checkBatchSize > 0 ? { size: checkBatchSize, index: checkBatchIndex, checks_seen: checkOrdinal } : null,
        strict,
        strict_warnings: strictWarnings,
        summary: { errors, warnings, sample_limit: sampleLimit },
        checks,
      },
      null,
      2,
    ),
  );

  if (strictWarnings) {
    if (errors > 0 || warnings > 0) process.exitCode = 1;
  } else if (strict) {
    if (errors > 0) process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb(db);
  });
