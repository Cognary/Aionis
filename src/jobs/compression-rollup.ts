import "dotenv/config";
import stableStringify from "fast-json-stable-stringify";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";
import { sha256Hex } from "../util/crypto.js";
import { toVectorLiteral } from "../util/pgvector.js";
import { normalizeText } from "../util/normalize.js";
import { redactPII } from "../util/redaction.js";
import { stableUuid } from "../util/uuid.js";

type CandidateRow = {
  topic_id: string;
  topic_title: string | null;
  topic_embedding_text: string;
  topic_embedding_model: string | null;
  total_events: number;
  event_id: string;
  event_summary: string | null;
  raw_ref: string | null;
  evidence_ref: string | null;
  event_commit_id: string | null;
  event_created_at: string;
  rn: number;
};

type GroupedTopic = {
  topic_id: string;
  topic_title: string | null;
  topic_embedding: number[];
  topic_embedding_model: string | null;
  total_events: number;
  events: Array<{
    event_id: string;
    event_summary: string | null;
    raw_ref: string | null;
    evidence_ref: string | null;
    event_commit_id: string | null;
    event_created_at: string;
  }>;
};

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

function parseVectorText(v: string): number[] {
  const s = v.trim();
  if (!s.startsWith("[") || !s.endsWith("]")) throw new Error("unexpected vector text");
  const body = s.slice(1, -1).trim();
  if (!body) return [];
  return body.split(",").map((x) => Number(x));
}

function buildSummaryText(topicTitle: string | null, totalEvents: number, eventSummaries: string[], maxTextLen: number): string {
  const label = normalizeText(topicTitle ?? "Untitled topic", 80);
  const lines: string[] = [];
  lines.push(`Topic summary: ${label} (${totalEvents} events)`);
  lines.push("Key points:");
  for (const s of eventSummaries.slice(0, 4)) {
    const compact = normalizeText(s, 110);
    if (!compact) continue;
    lines.push(`- ${compact}`);
  }
  const merged = normalizeText(lines.join("\n"), maxTextLen);
  return merged.length > 0 ? merged : `Topic summary: ${label}`;
}

function summaryNodeId(scope: string, topicId: string): string {
  return stableUuid(`${scope}:compression:topic:${topicId}`);
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
      WITH candidate_topics AS (
        SELECT
          t.id,
          t.title,
          t.embedding::text AS topic_embedding_text,
          t.embedding_model,
          count(e.id)::int AS total_events
        FROM memory_nodes t
        JOIN memory_edges pe ON pe.scope = t.scope AND pe.type = 'part_of' AND pe.dst_id = t.id
        JOIN memory_nodes e ON e.id = pe.src_id AND e.scope = t.scope AND e.type = 'event'
        WHERE t.scope = $1
          AND t.type = 'topic'
          AND t.tier IN ('hot', 'warm')
          AND t.embedding IS NOT NULL
          AND t.embedding_status = 'ready'
          AND COALESCE(t.slots->>'topic_state', 'active') = 'active'
          AND e.created_at >= now() - ($2::text || ' days')::interval
        GROUP BY t.id, t.title, t.embedding, t.embedding_model
        HAVING count(e.id) >= $3
        ORDER BY count(e.id) DESC, t.id
        LIMIT $4
      ),
      ranked_events AS (
        SELECT
          ct.id AS topic_id,
          ct.title AS topic_title,
          ct.topic_embedding_text,
          ct.embedding_model AS topic_embedding_model,
          ct.total_events,
          e.id AS event_id,
          e.text_summary AS event_summary,
          e.raw_ref,
          e.evidence_ref,
          e.commit_id AS event_commit_id,
          e.created_at AS event_created_at,
          row_number() OVER (PARTITION BY ct.id ORDER BY e.created_at DESC, e.id) AS rn
        FROM candidate_topics ct
        JOIN memory_edges pe ON pe.scope = $1 AND pe.type = 'part_of' AND pe.dst_id = ct.id
        JOIN memory_nodes e ON e.id = pe.src_id AND e.scope = $1 AND e.type = 'event'
        WHERE e.created_at >= now() - ($2::text || ' days')::interval
      )
      SELECT
        topic_id,
        topic_title,
        topic_embedding_text,
        topic_embedding_model,
        total_events,
        event_id,
        event_summary,
        raw_ref,
        evidence_ref,
        event_commit_id,
        event_created_at::text AS event_created_at,
        rn
      FROM ranked_events
      WHERE rn <= $5
      ORDER BY topic_id, rn
      `,
      [
        scope,
        String(env.MEMORY_COMPRESSION_LOOKBACK_DAYS),
        env.MEMORY_COMPRESSION_TOPIC_MIN_EVENTS,
        env.MEMORY_COMPRESSION_MAX_TOPICS_PER_RUN,
        env.MEMORY_COMPRESSION_MAX_EVENTS_PER_TOPIC,
      ],
    );

    const grouped = new Map<string, GroupedTopic>();
    for (const row of candidateRes.rows) {
      if (!grouped.has(row.topic_id)) {
        grouped.set(row.topic_id, {
          topic_id: row.topic_id,
          topic_title: row.topic_title,
          topic_embedding: parseVectorText(row.topic_embedding_text),
          topic_embedding_model: row.topic_embedding_model,
          total_events: Number(row.total_events),
          events: [],
        });
      }
      const g = grouped.get(row.topic_id)!;
      g.events.push({
        event_id: row.event_id,
        event_summary: row.event_summary,
        raw_ref: row.raw_ref,
        evidence_ref: row.evidence_ref,
        event_commit_id: row.event_commit_id,
        event_created_at: row.event_created_at,
      });
    }

    const planned = Array.from(grouped.values()).map((g) => {
      const summaryId = summaryNodeId(scope, g.topic_id);
      const sourceEventIds = g.events.map((e) => e.event_id);
      const sourceEventHash = sha256Hex(stableStringify(sourceEventIds));
      return { topic_id: g.topic_id, summary_id: summaryId, source_event_count: g.total_events, source_event_hash: sourceEventHash };
    });

    const diff = {
      job: "compression_rollup",
      started_at: startedAt,
      params: {
        lookback_days: env.MEMORY_COMPRESSION_LOOKBACK_DAYS,
        min_events_per_topic: env.MEMORY_COMPRESSION_TOPIC_MIN_EVENTS,
        max_topics_per_run: env.MEMORY_COMPRESSION_MAX_TOPICS_PER_RUN,
        max_events_per_topic: env.MEMORY_COMPRESSION_MAX_EVENTS_PER_TOPIC,
        max_text_len: env.MEMORY_COMPRESSION_MAX_TEXT_LEN,
      },
      planned,
    };
    const inputSha = sha256Hex(`job:compression_rollup:${scope}:${startedAt}:${planned.length}`);
    const diffSha = sha256Hex(stableStringify(diff));
    const commitHash = sha256Hex(stableStringify({ parentHash, inputSha, diffSha, scope, actor: "job", kind: "compression_rollup" }));

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
    let citationsWritten = 0;

    for (const topic of grouped.values()) {
      const summaryId = summaryNodeId(scope, topic.topic_id);
      const sourceEventIds = topic.events.map((e) => e.event_id);
      const sourceEventHash = sha256Hex(stableStringify(sourceEventIds));
      const eventSummaries = topic.events.map((e) => e.event_summary ?? "").filter((s) => s.length > 0);

      let summaryText = buildSummaryText(topic.topic_title, topic.total_events, eventSummaries, env.MEMORY_COMPRESSION_MAX_TEXT_LEN);
      if (env.PII_REDACTION) summaryText = redactPII(summaryText).text;

      const title = normalizeText(`Compression: ${topic.topic_title ?? topic.topic_id}`, 180);
      const citations = topic.events.slice(0, 10).map((e) => ({
        node_id: e.event_id,
        commit_id: e.event_commit_id,
        raw_ref: e.raw_ref,
        evidence_ref: e.evidence_ref,
        created_at: e.event_created_at,
      }));
      const slots = {
        summary_kind: "compression_rollup",
        summary_scope: "topic",
        source_topic_id: topic.topic_id,
        source_event_count: topic.total_events,
        source_event_ids: sourceEventIds,
        source_event_hash: sourceEventHash,
        citations,
        generated_by: "job:compression_rollup",
        generated_at: startedAt,
      };

      const existing = await client.query<{ source_event_hash: string | null; text_summary: string | null }>(
        `SELECT slots->>'source_event_hash' AS source_event_hash, text_summary
         FROM memory_nodes
         WHERE scope = $1 AND id = $2 AND type = 'concept'
         LIMIT 1`,
        [scope, summaryId],
      );

      if (
        existing.rowCount === 1 &&
        existing.rows[0].source_event_hash === sourceEventHash &&
        normalizeText(existing.rows[0].text_summary ?? "", env.MEMORY_COMPRESSION_MAX_TEXT_LEN) === summaryText
      ) {
        unchanged += 1;
        continue;
      }

      await client.query(
        `
        INSERT INTO memory_nodes
          (id, scope, type, tier, title, text_summary, slots, embedding, embedding_status, embedding_model,
           salience, importance, confidence, commit_id, embedding_ready_at)
        VALUES
          ($1, $2, 'concept', 'warm', $3, $4, $5::jsonb, $6::vector(1536), 'ready', $7,
           0.5, 0.6, 0.7, $8, now())
        ON CONFLICT (id) DO UPDATE SET
          tier = 'warm',
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
          summaryId,
          scope,
          title,
          summaryText,
          JSON.stringify(slots),
          toVectorLiteral(topic.topic_embedding),
          topic.topic_embedding_model ?? "compression:topic_embedding",
          commitId,
        ],
      );

      if (existing.rowCount === 0) created += 1;
      else updated += 1;

      const partOfId = stableUuid(`${scope}:edge:compression:part_of:${summaryId}:${topic.topic_id}`);
      await client.query(
        `
        INSERT INTO memory_edges
          (id, scope, type, src_id, dst_id, weight, confidence, decay_rate, commit_id, last_activated)
        VALUES
          ($1, $2, 'part_of', $3, $4, 0.9, 0.9, 0.0, $5, now())
        ON CONFLICT (scope, type, src_id, dst_id) DO UPDATE SET
          weight = EXCLUDED.weight,
          confidence = EXCLUDED.confidence,
          commit_id = EXCLUDED.commit_id,
          last_activated = now()
        `,
        [partOfId, scope, summaryId, topic.topic_id, commitId],
      );

      for (const e of topic.events) {
        const edgeId = stableUuid(`${scope}:edge:compression:derived_from:${summaryId}:${e.event_id}`);
        await client.query(
          `
          INSERT INTO memory_edges
            (id, scope, type, src_id, dst_id, weight, confidence, decay_rate, commit_id, last_activated)
          VALUES
            ($1, $2, 'derived_from', $3, $4, 1.0, 0.9, 0.0, $5, now())
          ON CONFLICT (scope, type, src_id, dst_id) DO UPDATE SET
            commit_id = EXCLUDED.commit_id,
            last_activated = now()
          `,
          [edgeId, scope, summaryId, e.event_id, commitId],
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
        [scope, summaryId, sourceEventIds],
      );

      citationsWritten += citations.length;
    }

    return {
      commit_id: commitId,
      commit_hash: commitHash,
      scanned_topics: grouped.size,
      compressed_topics: created + updated,
      created_summaries: created,
      updated_summaries: updated,
      unchanged_summaries: unchanged,
      citations_written: citationsWritten,
    };
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
