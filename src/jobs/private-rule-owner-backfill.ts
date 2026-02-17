import "dotenv/config";
import stableStringify from "fast-json-stable-stringify";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";
import { sha256Hex } from "../util/crypto.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

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

function trimOrNull(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

async function run() {
  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const limit = clampInt(Number(argValue("--limit") ?? "5000"), 1, 50_000);
  const dryRun = hasFlag("--dry-run");
  const sampleLimit = clampInt(Number(argValue("--sample") ?? "20"), 1, 200);
  const defaultOwnerAgent = trimOrNull(argValue("--default-owner-agent"));
  const defaultOwnerTeam = trimOrNull(argValue("--default-owner-team"));
  const sharedFallback = !hasFlag("--no-shared-fallback");
  const startedAt = new Date().toISOString();

  const out = await withTx(db, async (client) => {
    const statsRes = await client.query<{
      matched: string;
      will_set_owner: string;
      will_move_shared: string;
      unresolved: string;
    }>(
      `
      WITH target AS (
        SELECT id, producer_agent_id
        FROM memory_nodes
        WHERE scope = $1
          AND type = 'rule'
          AND memory_lane = 'private'
          AND owner_agent_id IS NULL
          AND owner_team_id IS NULL
        ORDER BY updated_at DESC
        LIMIT $2
      ),
      planned AS (
        SELECT
          id,
          COALESCE(NULLIF(btrim(producer_agent_id), ''), $3::text) AS candidate_owner_agent,
          CASE
            WHEN COALESCE(NULLIF(btrim(producer_agent_id), ''), $3::text) IS NULL THEN $4::text
            ELSE NULL
          END AS candidate_owner_team
        FROM target
      )
      SELECT
        count(*)::text AS matched,
        count(*) FILTER (
          WHERE candidate_owner_agent IS NOT NULL OR candidate_owner_team IS NOT NULL
        )::text AS will_set_owner,
        count(*) FILTER (
          WHERE candidate_owner_agent IS NULL
            AND candidate_owner_team IS NULL
            AND $5::boolean
        )::text AS will_move_shared,
        count(*) FILTER (
          WHERE candidate_owner_agent IS NULL
            AND candidate_owner_team IS NULL
            AND NOT $5::boolean
        )::text AS unresolved
      FROM planned
      `,
      [scope, limit, defaultOwnerAgent, defaultOwnerTeam, sharedFallback],
    );

    const planned = {
      matched: Number(statsRes.rows[0]?.matched ?? 0),
      will_set_owner: Number(statsRes.rows[0]?.will_set_owner ?? 0),
      will_move_shared: Number(statsRes.rows[0]?.will_move_shared ?? 0),
      unresolved: Number(statsRes.rows[0]?.unresolved ?? 0),
    };

    const sampleRes = await client.query<{
      id: string;
      producer_agent_id: string | null;
      action: "set_owner" | "move_shared" | "unresolved";
      candidate_owner_agent: string | null;
      candidate_owner_team: string | null;
    }>(
      `
      WITH target AS (
        SELECT id, producer_agent_id
        FROM memory_nodes
        WHERE scope = $1
          AND type = 'rule'
          AND memory_lane = 'private'
          AND owner_agent_id IS NULL
          AND owner_team_id IS NULL
        ORDER BY updated_at DESC
        LIMIT $2
      ),
      planned AS (
        SELECT
          id,
          producer_agent_id,
          COALESCE(NULLIF(btrim(producer_agent_id), ''), $3::text) AS candidate_owner_agent,
          CASE
            WHEN COALESCE(NULLIF(btrim(producer_agent_id), ''), $3::text) IS NULL THEN $4::text
            ELSE NULL
          END AS candidate_owner_team
        FROM target
      )
      SELECT
        id,
        producer_agent_id,
        CASE
          WHEN candidate_owner_agent IS NOT NULL OR candidate_owner_team IS NOT NULL THEN 'set_owner'
          WHEN $5::boolean THEN 'move_shared'
          ELSE 'unresolved'
        END::text AS action,
        candidate_owner_agent,
        candidate_owner_team
      FROM planned
      ORDER BY id
      LIMIT $6
      `,
      [scope, limit, defaultOwnerAgent, defaultOwnerTeam, sharedFallback, sampleLimit],
    );

    if (dryRun || planned.matched === 0) {
      const remainingRes = await client.query<{ n: string }>(
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
      );
      return {
        dry_run: dryRun,
        scope,
        limit,
        shared_fallback: sharedFallback,
        default_owner_agent: defaultOwnerAgent,
        default_owner_team: defaultOwnerTeam,
        planned,
        updated: 0,
        remaining_unfixed: Number(remainingRes.rows[0]?.n ?? 0),
        commit_id: null as string | null,
        commit_hash: null as string | null,
        sample: sampleRes.rows,
      };
    }

    const updRes = await client.query<{ id: string; action: "set_owner" | "move_shared" }>(
      `
      WITH target AS (
        SELECT id, producer_agent_id
        FROM memory_nodes
        WHERE scope = $1
          AND type = 'rule'
          AND memory_lane = 'private'
          AND owner_agent_id IS NULL
          AND owner_team_id IS NULL
        ORDER BY updated_at DESC
        LIMIT $2
        FOR UPDATE
      ),
      planned AS (
        SELECT
          id,
          COALESCE(NULLIF(btrim(producer_agent_id), ''), $3::text) AS candidate_owner_agent,
          CASE
            WHEN COALESCE(NULLIF(btrim(producer_agent_id), ''), $3::text) IS NULL THEN $4::text
            ELSE NULL
          END AS candidate_owner_team,
          CASE
            WHEN COALESCE(NULLIF(btrim(producer_agent_id), ''), $3::text) IS NOT NULL THEN 'set_owner'
            WHEN $5::boolean THEN 'move_shared'
            ELSE 'unresolved'
          END::text AS action
        FROM target
      )
      UPDATE memory_nodes n
      SET
        owner_agent_id = COALESCE(p.candidate_owner_agent, n.owner_agent_id),
        owner_team_id = COALESCE(p.candidate_owner_team, n.owner_team_id),
        memory_lane = CASE WHEN p.action = 'move_shared' THEN 'shared'::memory_lane ELSE n.memory_lane END
      FROM planned p
      WHERE n.id = p.id
        AND p.action IN ('set_owner', 'move_shared')
      RETURNING n.id, p.action
      `,
      [scope, limit, defaultOwnerAgent, defaultOwnerTeam, sharedFallback],
    );

    const setOwner = updRes.rows.filter((r) => r.action === "set_owner").length;
    const movedShared = updRes.rows.filter((r) => r.action === "move_shared").length;

    const remainingRes = await client.query<{ n: string }>(
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
    );
    const remainingUnfixed = Number(remainingRes.rows[0]?.n ?? 0);

    const parentRes = await client.query<{ id: string; commit_hash: string }>(
      "SELECT id, commit_hash FROM memory_commits WHERE scope = $1 ORDER BY created_at DESC LIMIT 1",
      [scope],
    );
    const parentHash = parentRes.rowCount ? parentRes.rows[0].commit_hash : "";
    const parentId = parentRes.rowCount ? parentRes.rows[0].id : null;

    const inputSha = sha256Hex(
      `job:private_rule_owner_backfill:${scope}:${startedAt}:${limit}:${String(sharedFallback)}:${defaultOwnerAgent ?? ""}:${defaultOwnerTeam ?? ""}`,
    );

    const diff = {
      job: "private_rule_owner_backfill",
      params: {
        scope,
        limit,
        shared_fallback: sharedFallback,
        default_owner_agent: defaultOwnerAgent,
        default_owner_team: defaultOwnerTeam,
      },
      result: {
        planned,
        updated: updRes.rowCount ?? 0,
        set_owner: setOwner,
        moved_shared: movedShared,
        unresolved: Math.max(0, planned.matched - Number(updRes.rowCount ?? 0)),
        remaining_unfixed: remainingUnfixed,
      },
      started_at: startedAt,
    };
    const diffSha = sha256Hex(stableStringify(diff));
    const commitHash = sha256Hex(
      stableStringify({ parentHash, inputSha, diffSha, scope, actor: "job", kind: "private_rule_owner_backfill" }),
    );

    const commitRes = await client.query<{ id: string }>(
      `INSERT INTO memory_commits (scope, parent_id, input_sha256, diff_json, actor, commit_hash)
       VALUES ($1, $2, $3, $4::jsonb, 'job', $5)
       ON CONFLICT (commit_hash) DO UPDATE SET diff_json = memory_commits.diff_json
       RETURNING id`,
      [scope, parentId, inputSha, JSON.stringify(diff), commitHash],
    );

    return {
      dry_run: false,
      scope,
      limit,
      shared_fallback: sharedFallback,
      default_owner_agent: defaultOwnerAgent,
      default_owner_team: defaultOwnerTeam,
      planned,
      updated: updRes.rowCount ?? 0,
      updated_set_owner: setOwner,
      updated_moved_shared: movedShared,
      unresolved_after_limit_window: Math.max(0, planned.matched - Number(updRes.rowCount ?? 0)),
      remaining_unfixed: remainingUnfixed,
      commit_id: commitRes.rows[0]?.id ?? null,
      commit_hash: commitHash,
      sample: sampleRes.rows,
    };
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, ...out }, null, 2));
}

run()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb(db);
  });
