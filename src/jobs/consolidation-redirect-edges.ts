import "dotenv/config";
import stableStringify from "fast-json-stable-stringify";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";
import { sha256Hex } from "../util/crypto.js";
import { stableUuid } from "../util/uuid.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

type AliasRow = {
  alias_id: string;
  canonical_id: string;
};

type EdgeRow = {
  id: string;
  type: string;
  src_id: string;
  dst_id: string;
  weight: number;
  confidence: number;
  decay_rate: number;
  last_activated: string | null;
};

type RedirectAggregate = {
  id: string;
  type: string;
  src_id: string;
  dst_id: string;
  weight: number;
  confidence: number;
  decay_rate: number;
  last_activated: string | null;
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

function maxTs(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

async function main() {
  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const apply = hasFlag("--apply");
  const maxAliases = clampInt(
    Number(argValue("--max-aliases") ?? String(env.MEMORY_CONSOLIDATION_REDIRECT_MAX_ALIASES)),
    1,
    5000,
  );
  const maxEdgesPerAlias = clampInt(
    Number(argValue("--max-edges-per-alias") ?? String(env.MEMORY_CONSOLIDATION_REDIRECT_MAX_EDGES_PER_ALIAS)),
    1,
    20000,
  );

  const startedAt = new Date().toISOString();

  const out = await withTx(db, async (client) => {
    const aliasRes = await client.query<AliasRow>(
      `
      SELECT
        n.id::text AS alias_id,
        (n.slots->>'alias_of')::uuid::text AS canonical_id
      FROM memory_nodes n
      JOIN memory_nodes c
        ON c.id = (n.slots->>'alias_of')::uuid
       AND c.scope = n.scope
      WHERE n.scope = $1
        AND (n.slots ? 'alias_of')
        AND (n.slots->>'alias_of') ~* '^[0-9a-f-]{36}$'
        AND n.id <> (n.slots->>'alias_of')::uuid
      ORDER BY n.updated_at DESC, n.id
      LIMIT $2
      `,
      [scope, maxAliases],
    );
    const aliases = aliasRes.rows;

    const perAlias: Array<{
      alias_id: string;
      canonical_id: string;
      touched_edges: number;
      redirected_edges: number;
      dropped_self_loops: number;
      deleted_alias_edges: number;
    }> = [];

    let totalTouched = 0;
    let totalRedirected = 0;
    let totalDroppedLoops = 0;
    let totalDeleted = 0;

    const touchedNodeIds = new Set<string>();
    const redirectMap = new Map<string, RedirectAggregate>();

    for (const a of aliases) {
      const er = await client.query<EdgeRow>(
        `
        SELECT
          id::text AS id,
          type::text AS type,
          src_id::text AS src_id,
          dst_id::text AS dst_id,
          weight,
          confidence,
          decay_rate,
          last_activated::text AS last_activated
        FROM memory_edges
        WHERE scope = $1
          AND (src_id = $2::uuid OR dst_id = $2::uuid)
        ORDER BY id
        LIMIT $3
        `,
        [scope, a.alias_id, maxEdgesPerAlias],
      );

      const touched = er.rows.length;
      let redirected = 0;
      let droppedLoops = 0;

      for (const e of er.rows) {
        const newSrc = e.src_id === a.alias_id ? a.canonical_id : e.src_id;
        const newDst = e.dst_id === a.alias_id ? a.canonical_id : e.dst_id;
        if (newSrc === newDst) {
          droppedLoops += 1;
          continue;
        }
        const key = `${scope}|${e.type}|${newSrc}|${newDst}`;
        const prev = redirectMap.get(key);
        const next: RedirectAggregate = {
          id: stableUuid(`${scope}:edge:consolidation_redirect:${e.type}:${newSrc}:${newDst}`),
          type: e.type,
          src_id: newSrc,
          dst_id: newDst,
          weight: prev ? Math.max(prev.weight, e.weight) : e.weight,
          confidence: prev ? Math.max(prev.confidence, e.confidence) : e.confidence,
          decay_rate: prev ? Math.min(prev.decay_rate, e.decay_rate) : e.decay_rate,
          last_activated: prev ? maxTs(prev.last_activated, e.last_activated) : e.last_activated,
        };
        redirectMap.set(key, next);
        redirected += 1;
      }

      perAlias.push({
        alias_id: a.alias_id,
        canonical_id: a.canonical_id,
        touched_edges: touched,
        redirected_edges: redirected,
        dropped_self_loops: droppedLoops,
        deleted_alias_edges: touched,
      });

      totalTouched += touched;
      totalRedirected += redirected;
      totalDroppedLoops += droppedLoops;
      totalDeleted += touched;
      touchedNodeIds.add(a.alias_id);
      touchedNodeIds.add(a.canonical_id);
    }

    if (!apply || aliases.length === 0 || totalTouched === 0) {
      return {
        dry_run: !apply,
        commit_id: null as string | null,
        commit_hash: null as string | null,
        scanned_aliases: aliases.length,
        touched_edges: totalTouched,
        redirected_edges: totalRedirected,
        dropped_self_loops: totalDroppedLoops,
        deleted_alias_edges: totalDeleted,
        upsert_edges: redirectMap.size,
        aliases: perAlias,
      };
    }

    const parentRes = await client.query<{ id: string; commit_hash: string }>(
      "SELECT id, commit_hash FROM memory_commits WHERE scope = $1 ORDER BY created_at DESC LIMIT 1",
      [scope],
    );
    const parentHash = parentRes.rowCount ? parentRes.rows[0].commit_hash : "";
    const parentId = parentRes.rowCount ? parentRes.rows[0].id : null;

    const diff = {
      job: "consolidation_redirect_edges",
      started_at: startedAt,
      scope,
      scanned_aliases: aliases.length,
      touched_edges: totalTouched,
      redirected_edges: totalRedirected,
      dropped_self_loops: totalDroppedLoops,
      deleted_alias_edges: totalDeleted,
      upsert_edges: redirectMap.size,
      aliases: perAlias,
    };

    const inputSha = sha256Hex(`job:consolidation_redirect_edges:${scope}:${startedAt}:${aliases.length}:${totalTouched}`);
    const diffSha = sha256Hex(stableStringify(diff));
    const commitHash = sha256Hex(
      stableStringify({ parentHash, inputSha, diffSha, scope, actor: "job", kind: "consolidation_redirect_edges" }),
    );

    const commitRes = await client.query<{ id: string }>(
      `INSERT INTO memory_commits (scope, parent_id, input_sha256, diff_json, actor, commit_hash)
       VALUES ($1, $2, $3, $4::jsonb, 'job', $5)
       ON CONFLICT (commit_hash) DO UPDATE SET diff_json = memory_commits.diff_json
       RETURNING id`,
      [scope, parentId, inputSha, JSON.stringify(diff), commitHash],
    );
    const commitId = commitRes.rows[0].id;

    for (const e of redirectMap.values()) {
      await client.query(
        `
        INSERT INTO memory_edges
          (id, scope, type, src_id, dst_id, weight, confidence, decay_rate, last_activated, commit_id)
        VALUES
          ($1, $2, $3::memory_edge_type, $4::uuid, $5::uuid, $6, $7, $8, $9::timestamptz, $10)
        ON CONFLICT (scope, type, src_id, dst_id) DO UPDATE SET
          weight = GREATEST(memory_edges.weight, EXCLUDED.weight),
          confidence = GREATEST(memory_edges.confidence, EXCLUDED.confidence),
          decay_rate = LEAST(memory_edges.decay_rate, EXCLUDED.decay_rate),
          last_activated = COALESCE(
            GREATEST(memory_edges.last_activated, EXCLUDED.last_activated),
            memory_edges.last_activated,
            EXCLUDED.last_activated
          ),
          commit_id = EXCLUDED.commit_id
        `,
        [e.id, scope, e.type, e.src_id, e.dst_id, e.weight, e.confidence, e.decay_rate, e.last_activated, commitId],
      );
    }

    for (const a of aliases) {
      await client.query(
        `
        DELETE FROM memory_edges
        WHERE scope = $1
          AND (src_id = $2::uuid OR dst_id = $2::uuid)
        `,
        [scope, a.alias_id],
      );
    }

    if (touchedNodeIds.size > 0) {
      await client.query(
        `
        UPDATE memory_nodes
        SET
          commit_id = $1,
          slots = jsonb_set(
            jsonb_set(
              slots,
              '{last_edge_redirect_at}',
              to_jsonb($2::text),
              true
            ),
            '{last_edge_redirect_job}',
            to_jsonb('consolidation_redirect_edges'::text),
            true
          )
        WHERE scope = $3
          AND id = ANY($4::uuid[])
        `,
        [commitId, startedAt, scope, Array.from(touchedNodeIds)],
      );
    }

    return {
      dry_run: false,
      commit_id: commitId,
      commit_hash: commitHash,
      scanned_aliases: aliases.length,
      touched_edges: totalTouched,
      redirected_edges: totalRedirected,
      dropped_self_loops: totalDroppedLoops,
      deleted_alias_edges: totalDeleted,
      upsert_edges: redirectMap.size,
      aliases: perAlias,
    };
  });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        scope,
        kind: "consolidation_redirect_edges",
        dry_run: out.dry_run,
        commit_id: out.commit_id,
        commit_hash: out.commit_hash,
        scanned_aliases: out.scanned_aliases,
        touched_edges: out.touched_edges,
        redirected_edges: out.redirected_edges,
        dropped_self_loops: out.dropped_self_loops,
        deleted_alias_edges: out.deleted_alias_edges,
        upsert_edges: out.upsert_edges,
        aliases: out.aliases,
      },
      null,
      2,
    ),
  );
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

