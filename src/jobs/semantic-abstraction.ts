import "dotenv/config";
import stableStringify from "fast-json-stable-stringify";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";
import { sha256Hex } from "../util/crypto.js";
import { normalizeText } from "../util/normalize.js";
import { stableUuid } from "../util/uuid.js";
import { buildSemanticAbstractions, type SemanticAbstractionKind } from "./semantic-abstraction-lib.js";

type CandidateRow = {
  summary_id: string;
  summary_title: string | null;
  summary_text: string | null;
  summary_embedding_text: string | null;
  summary_embedding_model: string | null;
  source_topic_id: string | null;
  source_topic_title: string | null;
  source_event_count: number;
  source_event_hash: string | null;
  source_event_ids_json: any;
  citations_json: any;
};

type SourceSummary = {
  summary_id: string;
  summary_title: string | null;
  summary_text: string | null;
  summary_embedding: number[];
  summary_embedding_model: string | null;
  source_topic_id: string | null;
  source_topic_title: string | null;
  source_event_count: number;
  source_event_hash: string | null;
  source_event_ids: string[];
  source_event_summaries: string[];
  citations: Array<Record<string, unknown>>;
};

const MAX_SUMMARIES_PER_RUN = 50;
const MAX_TEXT_LEN = 700;

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

function parseVectorText(v: string | null): number[] {
  const s = String(v ?? "").trim();
  if (!s.startsWith("[") || !s.endsWith("]")) return [];
  const body = s.slice(1, -1).trim();
  if (!body) return [];
  return body.split(",").map((x) => Number(x));
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    const s = item.trim();
    if (!s) continue;
    out.push(s);
  }
  return out;
}

function asCitationArray(v: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(v)) return [];
  return v.filter((item) => item && typeof item === "object" && !Array.isArray(item)) as Array<Record<string, unknown>>;
}

function ensureCitations(citations: Array<Record<string, unknown>>, sourceEventIds: string[]): Array<Record<string, unknown>> {
  if (citations.length > 0) return citations;
  return sourceEventIds.map((nodeId) => ({ node_id: nodeId }));
}

function abstractionNodeId(scope: string, sourceSummaryId: string, kind: SemanticAbstractionKind): string {
  return stableUuid(`${scope}:semantic_abstraction:${sourceSummaryId}:${kind}`);
}

async function run() {
  const scope = env.MEMORY_SCOPE;
  const startedAt = new Date().toISOString();

  const result = await withTx(db, async (client) => {
    const parentRes = await client.query<{ id: string; commit_hash: string }>(
      "SELECT id, commit_hash FROM memory_commits WHERE scope = $1 ORDER BY created_at DESC LIMIT 1",
      [scope],
    );
    const parentHash = parentRes.rowCount ? parentRes.rows[0].commit_hash : "";
    const parentId = parentRes.rowCount ? parentRes.rows[0].id : null;

    const candidateRes = await client.query<CandidateRow>(
      `
      SELECT
        s.id AS summary_id,
        s.title AS summary_title,
        s.text_summary AS summary_text,
        s.embedding::text AS summary_embedding_text,
        s.embedding_model AS summary_embedding_model,
        s.slots->>'source_topic_id' AS source_topic_id,
        t.title AS source_topic_title,
        COALESCE(NULLIF(s.slots->>'source_event_count', '')::int, 0) AS source_event_count,
        s.slots->>'source_event_hash' AS source_event_hash,
        COALESCE(s.slots->'source_event_ids', '[]'::jsonb) AS source_event_ids_json,
        COALESCE(s.slots->'citations', '[]'::jsonb) AS citations_json
      FROM memory_nodes s
      LEFT JOIN memory_nodes t
        ON t.scope = s.scope
       AND t.id = CASE
         WHEN (s.slots->>'source_topic_id') ~* '^[0-9a-f-]{36}$' THEN (s.slots->>'source_topic_id')::uuid
         ELSE NULL
       END
      WHERE s.scope = $1
        AND s.type = 'concept'
        AND s.slots->>'summary_kind' = 'compression_rollup'
        AND s.tier IN ('hot', 'warm')
      ORDER BY s.updated_at DESC, s.id
      LIMIT $2
      `,
      [scope, MAX_SUMMARIES_PER_RUN],
    );

    const summaries: SourceSummary[] = candidateRes.rows.map((row) => ({
      summary_id: row.summary_id,
      summary_title: row.summary_title,
      summary_text: row.summary_text,
      summary_embedding: parseVectorText(row.summary_embedding_text),
      summary_embedding_model: row.summary_embedding_model,
      source_topic_id: row.source_topic_id,
      source_topic_title: row.source_topic_title,
      source_event_count: Number(row.source_event_count),
      source_event_hash: row.source_event_hash,
      source_event_ids: asStringArray(row.source_event_ids_json),
      source_event_summaries: [],
      citations: asCitationArray(row.citations_json),
    }));

    const eventIds = Array.from(new Set(summaries.flatMap((summary) => summary.source_event_ids)));
    const eventSummaryById = new Map<string, string>();
    if (eventIds.length > 0) {
      const eventSummaryRes = await client.query<{ id: string; text_summary: string | null }>(
        `
        SELECT id::text AS id, text_summary
        FROM memory_nodes
        WHERE scope = $1
          AND type = 'event'
          AND id = ANY($2::uuid[])
        `,
        [scope, eventIds],
      );
      for (const row of eventSummaryRes.rows) {
        const textSummary = normalizeText(row.text_summary ?? "", 180);
        if (!textSummary) continue;
        eventSummaryById.set(row.id, textSummary);
      }
      for (const summary of summaries) {
        summary.source_event_summaries = summary.source_event_ids
          .map((eventId) => eventSummaryById.get(eventId) ?? "")
          .filter((text) => text.length > 0);
      }
    }

    const planned = summaries.flatMap((summary) =>
      buildSemanticAbstractions({
        topicTitle: summary.source_topic_title ?? summary.summary_title,
        sourceSummaryText: summary.summary_text,
        sourceEventSummaries: summary.source_event_summaries,
        sourceEventCount: summary.source_event_count,
        maxTextLen: MAX_TEXT_LEN,
      }).map((draft) => ({
        abstraction_kind: draft.abstraction_kind,
        abstraction_id: abstractionNodeId(scope, summary.summary_id, draft.abstraction_kind),
        source_summary_id: summary.summary_id,
        source_topic_id: summary.source_topic_id,
        source_event_count: summary.source_event_count,
        source_event_hash: summary.source_event_hash,
      })),
    );

    const diff = {
      job: "semantic_abstraction",
      started_at: startedAt,
      params: {
        max_summaries_per_run: MAX_SUMMARIES_PER_RUN,
        max_text_len: MAX_TEXT_LEN,
        source_summary_kind: "compression_rollup",
        shadow_mode: true,
      },
      planned,
    };
    const inputSha = sha256Hex(`job:semantic_abstraction:${scope}:${startedAt}:${planned.length}`);
    const diffSha = sha256Hex(stableStringify(diff));
    const commitHash = sha256Hex(stableStringify({ parentHash, inputSha, diffSha, scope, actor: "job", kind: "semantic_abstraction" }));

    const commitRes = await client.query<{ id: string }>(
      `INSERT INTO memory_commits (scope, parent_id, input_sha256, diff_json, actor, commit_hash)
       VALUES ($1, $2, $3, $4::jsonb, 'job', $5)
       ON CONFLICT (commit_hash) DO UPDATE SET diff_json = memory_commits.diff_json
       RETURNING id`,
      [scope, parentId, inputSha, JSON.stringify(diff), commitHash],
    );
    const commitId = commitRes.rows[0].id;

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const byKind: Record<string, number> = {};

    for (const summary of summaries) {
      const drafts = buildSemanticAbstractions({
        topicTitle: summary.source_topic_title ?? summary.summary_title,
        sourceSummaryText: summary.summary_text,
        sourceEventSummaries: summary.source_event_summaries,
        sourceEventCount: summary.source_event_count,
        maxTextLen: MAX_TEXT_LEN,
      });
      if (drafts.length === 0) continue;

      for (const draft of drafts) {
        const abstractionId = abstractionNodeId(scope, summary.summary_id, draft.abstraction_kind);
        const citations = ensureCitations(summary.citations, summary.source_event_ids);
        const slots = {
          compression_layer: "L4",
          summary_kind: "semantic_abstraction",
          abstraction_kind: draft.abstraction_kind,
          shadow_mode: true,
          source_summary_id: summary.summary_id,
          source_topic_id: summary.source_topic_id,
          source_event_count: summary.source_event_count,
          source_event_ids: summary.source_event_ids,
          source_event_hash: summary.source_event_hash,
          citations,
          quality: draft.quality,
          generated_by: "job:semantic_abstraction",
          generated_at: startedAt,
        };

        const existing = await client.query<{ source_event_hash: string | null; text_summary: string | null; citations_json: any; memory_lane: string | null }>(
          `SELECT slots->>'source_event_hash' AS source_event_hash,
                  text_summary,
                  COALESCE(slots->'citations', '[]'::jsonb) AS citations_json,
                  memory_lane
           FROM memory_nodes
           WHERE scope = $1 AND id = $2 AND type = 'concept'
           LIMIT 1`,
          [scope, abstractionId],
        );
        if (
          existing.rowCount === 1 &&
          existing.rows[0].source_event_hash === summary.source_event_hash &&
          normalizeText(existing.rows[0].text_summary ?? "", MAX_TEXT_LEN) === draft.text_summary &&
          stableStringify(asCitationArray(existing.rows[0].citations_json)) === stableStringify(citations) &&
          existing.rows[0].memory_lane === "shared"
        ) {
          unchanged += 1;
          byKind[draft.abstraction_kind] = (byKind[draft.abstraction_kind] ?? 0) + 1;
          continue;
        }

        await client.query(
          `
          INSERT INTO memory_nodes
            (id, scope, type, tier, memory_lane, title, text_summary, slots, embedding, embedding_status, embedding_model,
             salience, importance, confidence, commit_id, embedding_ready_at)
          VALUES
            ($1, $2, 'concept', 'warm', 'shared', $3, $4, $5::jsonb, $6::vector(1536), 'ready', $7,
             0.45, 0.65, 0.72, $8, now())
          ON CONFLICT (id) DO UPDATE SET
            tier = 'warm',
            memory_lane = 'shared',
            title = EXCLUDED.title,
            text_summary = EXCLUDED.text_summary,
            slots = EXCLUDED.slots,
            embedding = EXCLUDED.embedding,
            embedding_status = 'ready',
            embedding_model = EXCLUDED.embedding_model,
            commit_id = EXCLUDED.commit_id,
            embedding_ready_at = now()
          `,
          [
            abstractionId,
            scope,
            draft.title,
            draft.text_summary,
            JSON.stringify(slots),
            `[${summary.summary_embedding.join(",")}]`,
            summary.summary_embedding_model ?? "semantic_abstraction:source_summary_embedding",
            commitId,
          ],
        );

        if (existing.rowCount === 0) created += 1;
        else updated += 1;
        byKind[draft.abstraction_kind] = (byKind[draft.abstraction_kind] ?? 0) + 1;

        if (summary.source_topic_id) {
          const partOfId = stableUuid(`${scope}:edge:semantic_abstraction:part_of:${abstractionId}:${summary.source_topic_id}`);
          await client.query(
            `
            INSERT INTO memory_edges
              (id, scope, type, src_id, dst_id, weight, confidence, decay_rate, commit_id, last_activated)
            VALUES
              ($1, $2, 'part_of', $3, $4, 0.88, 0.86, 0.0, $5, now())
            ON CONFLICT (scope, type, src_id, dst_id) DO UPDATE SET
              weight = EXCLUDED.weight,
              confidence = EXCLUDED.confidence,
              commit_id = EXCLUDED.commit_id,
              last_activated = now()
            `,
            [partOfId, scope, abstractionId, summary.source_topic_id, commitId],
          );
        }

        const expectedDerivedTargets = [summary.summary_id, ...summary.source_event_ids];
        for (const targetId of expectedDerivedTargets) {
          const edgeId = stableUuid(`${scope}:edge:semantic_abstraction:derived_from:${abstractionId}:${targetId}`);
          await client.query(
            `
            INSERT INTO memory_edges
              (id, scope, type, src_id, dst_id, weight, confidence, decay_rate, commit_id, last_activated)
            VALUES
              ($1, $2, 'derived_from', $3, $4, 0.95, 0.9, 0.0, $5, now())
            ON CONFLICT (scope, type, src_id, dst_id) DO UPDATE SET
              commit_id = EXCLUDED.commit_id,
              last_activated = now()
            `,
            [edgeId, scope, abstractionId, targetId, commitId],
          );
        }

        await client.query(
          `
          DELETE FROM memory_edges
          WHERE scope = $1
            AND type = 'derived_from'
            AND src_id = $2
            AND NOT (dst_id = ANY($3::uuid[]))
          `,
          [scope, abstractionId, expectedDerivedTargets],
        );
      }
    }

    return {
      commit_id: commitId,
      commit_hash: commitHash,
      scanned_summaries: summaries.length,
      abstraction_nodes_written: created + updated,
      created_abstractions: created,
      updated_abstractions: updated,
      unchanged_abstractions: unchanged,
      by_kind: byKind,
    };
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, scope, shadow_mode: true, ...result }, null, 2));
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
