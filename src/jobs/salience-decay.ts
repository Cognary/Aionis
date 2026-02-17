import "dotenv/config";
import stableStringify from "fast-json-stable-stringify";
import type pg from "pg";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";
import { sha256Hex } from "../util/crypto.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const PROTECTED_EXPR = `
  (
    lower(coalesce(slots->>'pin', 'false')) IN ('true', '1', 'yes', 'on')
    OR lower(coalesce(slots->>'legal_hold', 'false')) IN ('true', '1', 'yes', 'on')
  )
`;

type Tier = "hot" | "warm" | "cold" | "archive";

async function fetchTierCounts(client: pg.PoolClient, scope: string): Promise<{ hot: number; warm: number; cold: number; archive: number }> {
  const r = await client.query<{ hot: string; warm: string; cold: string; archive: string }>(
    `
    SELECT
      count(*) FILTER (WHERE tier = 'hot')::text AS hot,
      count(*) FILTER (WHERE tier = 'warm')::text AS warm,
      count(*) FILTER (WHERE tier = 'cold')::text AS cold,
      count(*) FILTER (WHERE tier = 'archive')::text AS archive
    FROM memory_nodes
    WHERE scope = $1
    `,
    [scope],
  );
  const x = r.rows[0] ?? { hot: "0", warm: "0", cold: "0", archive: "0" };
  return {
    hot: Number(x.hot ?? "0"),
    warm: Number(x.warm ?? "0"),
    cold: Number(x.cold ?? "0"),
    archive: Number(x.archive ?? "0"),
  };
}

async function transitionTier(
  client: pg.PoolClient,
  params: {
    scope: string;
    fromTier: Exclude<Tier, "archive">;
    toTier: Tier;
    salienceBelow: number;
    inactiveDays: number;
    startedAtIso: string;
    limit: number;
    transitionMs: number;
  },
): Promise<number> {
  if (params.limit <= 0) return 0;

  const q = `
    WITH candidate AS (
      SELECT id
      FROM memory_nodes
      WHERE scope = $1
        AND tier = '${params.fromTier}'::memory_tier
        AND salience < $2::real
        AND COALESCE(last_activated, created_at) < now() - ($3::text || ' days')::interval
        AND updated_at < $4::timestamptz
        AND NOT ${PROTECTED_EXPR}
      ORDER BY salience ASC, COALESCE(last_activated, created_at) ASC
      LIMIT $5
    ),
    moved AS (
      UPDATE memory_nodes n
      SET
        tier = '${params.toTier}'::memory_tier,
        slots = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                n.slots,
                '{last_tier_transition_ms}',
                to_jsonb($6::bigint),
                true
              ),
              '{last_tier_transition_from}',
              to_jsonb('${params.fromTier}'::text),
              true
            ),
            '{last_tier_transition_to}',
            to_jsonb('${params.toTier}'::text),
            true
          ),
          '{last_tier_transition_job}',
          to_jsonb('salience_decay'::text),
          true
        )
      FROM candidate c
      WHERE n.id = c.id
      RETURNING 1
    )
    SELECT count(*)::int AS moved
    FROM moved
  `;

  const r = await client.query<{ moved: number }>(q, [
    params.scope,
    params.salienceBelow,
    String(params.inactiveDays),
    params.startedAtIso,
    params.limit,
    params.transitionMs,
  ]);
  return Number(r.rows[0]?.moved ?? 0);
}

async function run() {
  const scope = env.MEMORY_SCOPE;
  const startedAt = new Date().toISOString();
  const transitionMs = Date.now();
  const dayAgoMs = transitionMs - 24 * 60 * 60 * 1000;

  const result = await withTx(db, async (client) => {
    const parentRes = await client.query<{ id: string; commit_hash: string }>(
      "SELECT id, commit_hash FROM memory_commits WHERE scope = $1 ORDER BY created_at DESC LIMIT 1",
      [scope],
    );
    const parentHash = parentRes.rowCount ? parentRes.rows[0].commit_hash : "";
    const parentId = parentRes.rowCount ? parentRes.rows[0].id : null;

    const inputSha = sha256Hex(`job:salience_decay:${scope}:${startedAt}`);

    // Decay active tiers only; archive is immutable by default.
    const updateRes = await client.query<{
      updated: string;
      recent_nodes: string | null;
      feedback_positive_nodes: string | null;
      feedback_negative_nodes: string | null;
      avg_decay_scale: string | null;
      min_decay_scale: string | null;
      max_decay_scale: string | null;
    }>(
      `
      WITH candidate AS (
        SELECT
          id,
          salience,
          CASE
            WHEN COALESCE(last_activated, created_at) >= now() - ($3::text || ' days')::interval THEN 1
            ELSE 0
          END AS is_recent,
          CASE
            WHEN (slots ? 'feedback_quality')
              AND (slots->>'feedback_quality') ~ '^-?[0-9]+(\\.[0-9]+)?$'
              THEN GREATEST(-1::real, LEAST(1::real, (slots->>'feedback_quality')::real))
            WHEN (slots ? 'feedback_positive')
              AND (slots->>'feedback_positive') ~ '^[0-9]+$'
              AND (slots ? 'feedback_negative')
              AND (slots->>'feedback_negative') ~ '^[0-9]+$'
              THEN (
                ((slots->>'feedback_positive')::real - (slots->>'feedback_negative')::real)
                / GREATEST(1::real, ((slots->>'feedback_positive')::real + (slots->>'feedback_negative')::real))
              )
            ELSE 0::real
          END AS feedback_score
        FROM memory_nodes
        WHERE scope = $1
          AND tier IN ('hot', 'warm', 'cold')
          AND NOT ${PROTECTED_EXPR}
      ),
      scaled AS (
        SELECT
          id,
          is_recent,
          feedback_score,
          GREATEST(
            $6::real,
            LEAST(
              $7::real,
              (CASE WHEN $8::bool AND is_recent = 1 THEN $4::real ELSE 1::real END)
              *
              (CASE
                WHEN $8::bool AND feedback_score > 0
                  THEN GREATEST($6::real, 1::real - feedback_score * $5::real)
                WHEN $8::bool AND feedback_score < 0
                  THEN LEAST($7::real, 1::real + abs(feedback_score) * $9::real)
                ELSE 1::real
              END)
            )
          ) AS decay_scale
        FROM candidate
      ),
      updated AS (
        UPDATE memory_nodes n
        SET salience = GREATEST(
          0::real,
          LEAST(1::real, n.salience * (1::real - (1::real - $2::real) * s.decay_scale))
        )
        FROM scaled s
        WHERE n.id = s.id
        RETURNING s.is_recent, s.feedback_score, s.decay_scale
      )
      SELECT
        count(*)::text AS updated,
        coalesce(sum(is_recent), 0)::text AS recent_nodes,
        coalesce(sum(CASE WHEN feedback_score > 0 THEN 1 ELSE 0 END), 0)::text AS feedback_positive_nodes,
        coalesce(sum(CASE WHEN feedback_score < 0 THEN 1 ELSE 0 END), 0)::text AS feedback_negative_nodes,
        avg(decay_scale)::text AS avg_decay_scale,
        min(decay_scale)::text AS min_decay_scale,
        max(decay_scale)::text AS max_decay_scale
      FROM updated
      `,
      [
        scope,
        env.MEMORY_SALIENCE_DECAY_FACTOR,
        env.MEMORY_ADAPTIVE_RECENT_DAYS,
        env.MEMORY_ADAPTIVE_RECENT_SCALE,
        env.MEMORY_ADAPTIVE_FEEDBACK_POS_STRENGTH,
        env.MEMORY_ADAPTIVE_DECAY_SCALE_MIN,
        env.MEMORY_ADAPTIVE_DECAY_SCALE_MAX,
        env.MEMORY_ADAPTIVE_DECAY_ENABLED,
        env.MEMORY_ADAPTIVE_FEEDBACK_NEG_STRENGTH,
      ],
    );

    const mutableRes = await client.query<{ n: string }>(
      `
      SELECT count(*)::text AS n
      FROM memory_nodes
      WHERE scope = $1
        AND tier IN ('hot', 'warm', 'cold')
        AND NOT ${PROTECTED_EXPR}
      `,
      [scope],
    );
    const totalMutable = Number(mutableRes.rows[0]?.n ?? 0);
    const maxDailyMutations = Math.max(1, Math.floor(totalMutable * env.MEMORY_TIER_MAX_DAILY_MUTATION_RATIO));

    const usedTodayRes = await client.query<{ n: string }>(
      `
      SELECT count(*)::text AS n
      FROM memory_nodes
      WHERE scope = $1
        AND (slots ? 'last_tier_transition_ms')
        AND (slots->>'last_tier_transition_ms') ~ '^[0-9]+$'
        AND (slots->>'last_tier_transition_ms')::bigint >= $2::bigint
      `,
      [scope, dayAgoMs],
    );
    const usedToday = Number(usedTodayRes.rows[0]?.n ?? 0);
    const initialRemainingBudget = Math.max(0, maxDailyMutations - usedToday);
    let remainingBudget = initialRemainingBudget;

    const movedHotToWarm = await transitionTier(client, {
      scope,
      fromTier: "hot",
      toTier: "warm",
      salienceBelow: env.MEMORY_TIER_WARM_BELOW,
      inactiveDays: env.MEMORY_TIER_WARM_INACTIVE_DAYS,
      startedAtIso: startedAt,
      limit: remainingBudget,
      transitionMs,
    });
    remainingBudget = Math.max(0, remainingBudget - movedHotToWarm);

    const movedWarmToCold = await transitionTier(client, {
      scope,
      fromTier: "warm",
      toTier: "cold",
      salienceBelow: env.MEMORY_TIER_COLD_BELOW,
      inactiveDays: env.MEMORY_TIER_COLD_INACTIVE_DAYS,
      startedAtIso: startedAt,
      limit: remainingBudget,
      transitionMs,
    });
    remainingBudget = Math.max(0, remainingBudget - movedWarmToCold);

    const movedColdToArchive = await transitionTier(client, {
      scope,
      fromTier: "cold",
      toTier: "archive",
      salienceBelow: env.MEMORY_TIER_ARCHIVE_BELOW,
      inactiveDays: env.MEMORY_TIER_ARCHIVE_INACTIVE_DAYS,
      startedAtIso: startedAt,
      limit: remainingBudget,
      transitionMs,
    });
    remainingBudget = Math.max(0, remainingBudget - movedColdToArchive);

    const hotBudget = Math.max(0, env.MEMORY_SCOPE_HOT_NODE_BUDGET);
    const activeBudget = Math.max(0, env.MEMORY_SCOPE_ACTIVE_NODE_BUDGET);
    const budgetsEnabled = hotBudget > 0 || activeBudget > 0;
    let movedBudgetHotToWarm = 0;
    let movedBudgetWarmToCold = 0;
    let movedBudgetHotToCold = 0;

    const beforeBudgetCounts = await fetchTierCounts(client, scope);
    const overflowHotBefore = hotBudget > 0 ? Math.max(0, beforeBudgetCounts.hot - hotBudget) : 0;
    const overflowActiveBefore = activeBudget > 0 ? Math.max(0, beforeBudgetCounts.hot + beforeBudgetCounts.warm - activeBudget) : 0;

    if (budgetsEnabled && remainingBudget > 0) {
      if (overflowHotBefore > 0 && hotBudget > 0) {
        movedBudgetHotToWarm = await transitionTier(client, {
          scope,
          fromTier: "hot",
          toTier: "warm",
          salienceBelow: 1.000001,
          inactiveDays: 0,
          startedAtIso: startedAt,
          limit: Math.min(remainingBudget, overflowHotBefore),
          transitionMs,
        });
        remainingBudget = Math.max(0, remainingBudget - movedBudgetHotToWarm);
      }

      if (remainingBudget > 0 && activeBudget > 0) {
        const mid = await fetchTierCounts(client, scope);
        const overflowActiveNow = Math.max(0, mid.hot + mid.warm - activeBudget);
        if (overflowActiveNow > 0) {
          movedBudgetWarmToCold = await transitionTier(client, {
            scope,
            fromTier: "warm",
            toTier: "cold",
            salienceBelow: 1.000001,
            inactiveDays: 0,
            startedAtIso: startedAt,
            limit: Math.min(remainingBudget, overflowActiveNow),
            transitionMs,
          });
          remainingBudget = Math.max(0, remainingBudget - movedBudgetWarmToCold);
        }
      }

      if (remainingBudget > 0 && activeBudget > 0) {
        const mid2 = await fetchTierCounts(client, scope);
        const overflowActiveStill = Math.max(0, mid2.hot + mid2.warm - activeBudget);
        if (overflowActiveStill > 0) {
          movedBudgetHotToCold = await transitionTier(client, {
            scope,
            fromTier: "hot",
            toTier: "cold",
            salienceBelow: 1.000001,
            inactiveDays: 0,
            startedAtIso: startedAt,
            limit: Math.min(remainingBudget, overflowActiveStill),
            transitionMs,
          });
          remainingBudget = Math.max(0, remainingBudget - movedBudgetHotToCold);
        }
      }
    }

    const tiers = await fetchTierCounts(client, scope);
    const overflowHotAfter = hotBudget > 0 ? Math.max(0, tiers.hot - hotBudget) : 0;
    const overflowActiveAfter = activeBudget > 0 ? Math.max(0, tiers.hot + tiers.warm - activeBudget) : 0;

    const transitionsPolicyTotal = movedHotToWarm + movedWarmToCold + movedColdToArchive;
    const transitionsBudgetTotal = movedBudgetHotToWarm + movedBudgetWarmToCold + movedBudgetHotToCold;
    const transitionsTotal = transitionsPolicyTotal + transitionsBudgetTotal;

    const policy = {
      decay_factor: env.MEMORY_SALIENCE_DECAY_FACTOR,
      adaptive_decay_enabled: env.MEMORY_ADAPTIVE_DECAY_ENABLED,
      adaptive_recent_days: env.MEMORY_ADAPTIVE_RECENT_DAYS,
      adaptive_recent_scale: env.MEMORY_ADAPTIVE_RECENT_SCALE,
      adaptive_feedback_pos_strength: env.MEMORY_ADAPTIVE_FEEDBACK_POS_STRENGTH,
      adaptive_feedback_neg_strength: env.MEMORY_ADAPTIVE_FEEDBACK_NEG_STRENGTH,
      adaptive_decay_scale_min: env.MEMORY_ADAPTIVE_DECAY_SCALE_MIN,
      adaptive_decay_scale_max: env.MEMORY_ADAPTIVE_DECAY_SCALE_MAX,
      warm_below: env.MEMORY_TIER_WARM_BELOW,
      cold_below: env.MEMORY_TIER_COLD_BELOW,
      archive_below: env.MEMORY_TIER_ARCHIVE_BELOW,
      warm_inactive_days: env.MEMORY_TIER_WARM_INACTIVE_DAYS,
      cold_inactive_days: env.MEMORY_TIER_COLD_INACTIVE_DAYS,
      archive_inactive_days: env.MEMORY_TIER_ARCHIVE_INACTIVE_DAYS,
      max_daily_mutation_ratio: env.MEMORY_TIER_MAX_DAILY_MUTATION_RATIO,
      scope_hot_node_budget: hotBudget,
      scope_active_node_budget: activeBudget,
    };

    const diff = {
      job: "salience_decay",
      params: { ...policy },
      result: {
        updated_salience: Number(updateRes.rows[0]?.updated ?? 0),
        adaptive_decay_enabled: env.MEMORY_ADAPTIVE_DECAY_ENABLED,
        adaptive_recent_nodes: Number(updateRes.rows[0]?.recent_nodes ?? 0),
        adaptive_feedback_positive_nodes: Number(updateRes.rows[0]?.feedback_positive_nodes ?? 0),
        adaptive_feedback_negative_nodes: Number(updateRes.rows[0]?.feedback_negative_nodes ?? 0),
        adaptive_decay_scale_avg: Number(updateRes.rows[0]?.avg_decay_scale ?? 1),
        adaptive_decay_scale_min: Number(updateRes.rows[0]?.min_decay_scale ?? 1),
        adaptive_decay_scale_max: Number(updateRes.rows[0]?.max_decay_scale ?? 1),
        total_mutable: totalMutable,
        used_today: usedToday,
        max_daily_mutations: maxDailyMutations,
        initial_remaining_budget: initialRemainingBudget,
        remaining_budget: remainingBudget,
        budgets_enabled: budgetsEnabled,
        transitions_policy_total: transitionsPolicyTotal,
        transitions_budget_total: transitionsBudgetTotal,
        transitions_total: transitionsTotal,
        moved_hot_to_warm: movedHotToWarm,
        moved_warm_to_cold: movedWarmToCold,
        moved_cold_to_archive: movedColdToArchive,
        moved_hot_to_warm_budget: movedBudgetHotToWarm,
        moved_warm_to_cold_budget: movedBudgetWarmToCold,
        moved_hot_to_cold_budget: movedBudgetHotToCold,
        scope_budget: {
          hot_node_budget: hotBudget,
          active_node_budget: activeBudget,
          overflow_hot_before: overflowHotBefore,
          overflow_active_before: overflowActiveBefore,
          overflow_hot_after: overflowHotAfter,
          overflow_active_after: overflowActiveAfter,
        },
        tier_counts: {
          hot: tiers.hot,
          warm: tiers.warm,
          cold: tiers.cold,
          archive: tiers.archive,
        },
      },
      started_at: startedAt,
    };

    const diffSha = sha256Hex(stableStringify(diff));

    const commitHash = sha256Hex(
      stableStringify({ parentHash, inputSha, diffSha, scope: env.MEMORY_SCOPE, actor: "job", kind: "salience_decay" }),
    );

    const commitRes = await client.query<{ id: string }>(
      `INSERT INTO memory_commits (scope, parent_id, input_sha256, diff_json, actor, commit_hash)
       VALUES ($1, $2, $3, $4::jsonb, 'job', $5)
       ON CONFLICT (commit_hash) DO UPDATE SET diff_json = memory_commits.diff_json
       RETURNING id`,
      [scope, parentId, inputSha, JSON.stringify(diff), commitHash],
    );

    return { commit_id: commitRes.rows[0].id, commit_hash: commitHash, ...diff.result };
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, scope, ...result }, null, 2));
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
