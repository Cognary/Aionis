import stableStringify from "fast-json-stable-stringify";
import type pg from "pg";
import { sha256Hex } from "../util/crypto.js";
import { normalizeText } from "../util/normalize.js";
import { redactPII } from "../util/redaction.js";
import { assertDim, toVectorLiteral } from "../util/pgvector.js";
import { stableUuid } from "../util/uuid.js";

type EventRow = {
  id: string;
  scope: string;
  text_summary: string | null;
  embedding_text: string;
  memory_lane: "private" | "shared";
  producer_agent_id: string | null;
  owner_agent_id: string | null;
  owner_team_id: string | null;
  embedding_model: string | null;
  commit_id: string | null;
};

type TopicCandidate = {
  id: string;
  title: string | null;
  slots: any;
  embedding_text: string;
  similarity: number;
};

export type TopicClusterParams = {
  scope: string;
  eventIds: string[];
  simThreshold: number;
  minEventsPerTopic: number;
  maxCandidatesPerEvent: number;
  maxTextLen: number;
  piiRedaction: boolean;
  strategy?: TopicClusterStrategy;
};

export type TopicClusterStrategy = "online_knn" | "offline_hdbscan";

export type TopicClusterQuality = {
  cohesion: number;
  coverage: number;
  orphan_rate_after: number;
  merge_rate_30d: number;
};

export type TopicClusterResult = {
  topic_commit_id: string | null;
  topic_commit_hash: string | null;
  processed_events: number;
  assigned: number;
  created_topics: number;
  promoted: number;
  strategy_requested: TopicClusterStrategy;
  strategy_executed: TopicClusterStrategy;
  strategy_note: string | null;
  quality: TopicClusterQuality;
};

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function parseVectorText(v: string): number[] {
  const s = v.trim();
  if (!s.startsWith("[") || !s.endsWith("]")) throw new Error("unexpected vector text");
  const body = s.slice(1, -1).trim();
  if (!body) return [];
  const out = body.split(",").map((x) => Number(x));
  assertDim(out, 1536);
  return out;
}

function avgVec(a: number[], aCount: number, b: number[]): number[] {
  const out = new Array(a.length);
  const denom = aCount + 1;
  for (let i = 0; i < a.length; i++) out[i] = (a[i] * aCount + b[i]) / denom;
  return out;
}

function getTopicState(slots: any): "draft" | "active" {
  const s = slots?.topic_state;
  return s === "active" ? "active" : "draft";
}

function getMemberCount(slots: any): number {
  const n = slots?.member_count;
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function autoTitleFromEvent(summary: string | null, maxLen: number): string {
  const base = normalizeText(summary ?? "Untitled topic", maxLen);
  return base.length > 60 ? base.slice(0, 60) : base;
}

function resolveTopicVisibilityFromEvent(event: EventRow): {
  memory_lane: "private" | "shared";
  producer_agent_id: string | null;
  owner_agent_id: string | null;
  owner_team_id: string | null;
} {
  const producerAgentId = event.producer_agent_id ?? null;
  const ownerAgentId = event.owner_agent_id ?? producerAgentId;
  const ownerTeamId = event.owner_team_id ?? null;
  // Hard guard: private lane without owner creates visibility ambiguity.
  // Fallback to shared if owner context is unavailable.
  const lane = event.memory_lane === "private" && !ownerAgentId && !ownerTeamId ? "shared" : event.memory_lane;
  return {
    memory_lane: lane,
    producer_agent_id: producerAgentId,
    owner_agent_id: ownerAgentId,
    owner_team_id: ownerTeamId,
  };
}

async function fetchEventsByIds(client: pg.PoolClient, scope: string, eventIds: string[]): Promise<EventRow[]> {
  if (eventIds.length === 0) return [];
  const r = await client.query<EventRow>(
    `
    SELECT
      e.id,
      e.scope,
      e.text_summary,
      e.embedding::text AS embedding_text,
      e.memory_lane::text AS memory_lane,
      e.producer_agent_id,
      e.owner_agent_id,
      e.owner_team_id,
      e.embedding_model,
      e.commit_id
    FROM memory_nodes e
    WHERE e.scope = $1
      AND e.type = 'event'
      AND e.tier = 'hot'
      AND e.embedding IS NOT NULL
      AND e.id = ANY($2::uuid[])
      AND NOT EXISTS (
        SELECT 1
        FROM memory_edges x
        JOIN memory_nodes t ON t.id = x.dst_id
        WHERE x.scope = e.scope
          AND x.type = 'part_of'
          AND x.src_id = e.id
          AND t.type = 'topic'
      )
    ORDER BY e.created_at ASC
    `,
    [scope, eventIds],
  );
  return r.rows;
}

export async function findUnassignedEventIds(client: pg.PoolClient, scope: string, batchSize: number): Promise<string[]> {
  const r = await client.query<{ id: string }>(
    `
    SELECT e.id
    FROM memory_nodes e
    WHERE e.scope = $1
      AND e.type = 'event'
      AND e.tier = 'hot'
      AND e.embedding IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM memory_edges x
        JOIN memory_nodes t ON t.id = x.dst_id
        WHERE x.scope = e.scope
          AND x.type = 'part_of'
          AND x.src_id = e.id
          AND t.type = 'topic'
      )
    ORDER BY e.created_at ASC
    LIMIT $2
    `,
    [scope, batchSize],
  );
  return r.rows.map((x) => x.id);
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

async function computeTopicClusterQuality(client: pg.PoolClient, scope: string, cohesion: number, coverage: number): Promise<TopicClusterQuality> {
  const orphanRes = await client.query<{ eligible_total: string; orphan_total: string }>(
    `
    WITH eligible AS (
      SELECT e.id
      FROM memory_nodes e
      WHERE e.scope = $1
        AND e.type = 'event'
        AND e.tier IN ('hot', 'warm')
        AND e.embedding IS NOT NULL
        AND e.embedding_status = 'ready'
    ),
    orphan AS (
      SELECT e.id
      FROM eligible e
      WHERE NOT EXISTS (
        SELECT 1
        FROM memory_edges x
        JOIN memory_nodes t ON t.id = x.dst_id
        WHERE x.scope = $1
          AND x.type = 'part_of'
          AND x.src_id = e.id
          AND t.type = 'topic'
      )
    )
    SELECT
      (SELECT count(*)::text FROM eligible) AS eligible_total,
      (SELECT count(*)::text FROM orphan) AS orphan_total
    `,
    [scope],
  );
  const eligible = Number(orphanRes.rows[0]?.eligible_total ?? "0");
  const orphan = Number(orphanRes.rows[0]?.orphan_total ?? "0");
  const orphanRateAfter = eligible > 0 ? orphan / eligible : 0;

  const mergeRes = await client.query<{ dedupe_total: string; merged_30d: string }>(
    `
    SELECT
      count(*)::text AS dedupe_total,
      count(*) FILTER (
        WHERE (slots ? 'alias_of')
          AND updated_at >= now() - interval '30 days'
      )::text AS merged_30d
    FROM memory_nodes
    WHERE scope = $1
      AND type IN ('topic', 'concept', 'entity', 'procedure', 'self_model')
    `,
    [scope],
  );
  const dedupeTotal = Number(mergeRes.rows[0]?.dedupe_total ?? "0");
  const merged30d = Number(mergeRes.rows[0]?.merged_30d ?? "0");
  const mergeRate30d = dedupeTotal > 0 ? merged30d / dedupeTotal : 0;

  return {
    cohesion: round4(cohesion),
    coverage: round4(coverage),
    orphan_rate_after: round4(orphanRateAfter),
    merge_rate_30d: round4(mergeRate30d),
  };
}

async function nearestTopics(client: pg.PoolClient, scope: string, vecLit: string, k: number): Promise<TopicCandidate[]> {
  const r = await client.query<TopicCandidate>(
    `
    SELECT
      t.id,
      t.title,
      t.slots,
      t.embedding::text AS embedding_text,
      1.0 - (t.embedding <=> $1::vector(1536)) AS similarity
    FROM memory_nodes t
    WHERE t.scope = $2
      AND t.type = 'topic'
      AND t.tier = 'hot'
      AND t.embedding IS NOT NULL
    ORDER BY t.embedding <=> $1::vector(1536)
    LIMIT $3
    `,
    [vecLit, scope, k],
  );
  return r.rows;
}

async function insertEdgePartOf(
  client: pg.PoolClient,
  scope: string,
  eventId: string,
  topicId: string,
  weight: number,
  commitId: string,
) {
  const edgeId = stableUuid(`${scope}:edge:topic_cluster:part_of:${eventId}:${topicId}`);
  await client.query(
    `
    INSERT INTO memory_edges (id, scope, type, src_id, dst_id, weight, confidence, decay_rate, commit_id, last_activated)
    VALUES ($1, $2, 'part_of', $3, $4, $5, $6, $7, $8, now())
    ON CONFLICT (scope, type, src_id, dst_id) DO UPDATE SET
      weight = GREATEST(memory_edges.weight, EXCLUDED.weight),
      confidence = GREATEST(memory_edges.confidence, EXCLUDED.confidence),
      commit_id = EXCLUDED.commit_id,
      last_activated = now()
    `,
    [edgeId, scope, eventId, topicId, weight, clamp01(weight), 0.01, commitId],
  );
}

async function insertEdgeDerivedFrom(client: pg.PoolClient, scope: string, topicId: string, eventId: string, commitId: string) {
  const edgeId = stableUuid(`${scope}:edge:topic_cluster:derived_from:${topicId}:${eventId}`);
  await client.query(
    `
    INSERT INTO memory_edges (id, scope, type, src_id, dst_id, weight, confidence, decay_rate, commit_id, last_activated)
    VALUES ($1, $2, 'derived_from', $3, $4, 1.0, 0.8, 0.0, $5, now())
    ON CONFLICT (scope, type, src_id, dst_id) DO UPDATE SET
      commit_id = EXCLUDED.commit_id,
      last_activated = now()
    `,
    [edgeId, scope, topicId, eventId, commitId],
  );
}

async function updateTopicAfterAdd(
  client: pg.PoolClient,
  params: TopicClusterParams,
  topicId: string,
  event: EventRow,
  newEmbedding: number[],
  clusterCommitHash: string,
  sourceEmbeddingModel: string | null,
  clusterCommitId: string,
): Promise<{ state: "draft" | "active"; member_count: number }> {
  const r = await client.query<{ slots: any; embedding_text: string; title: string | null }>(
    `SELECT slots, embedding::text AS embedding_text, title
     FROM memory_nodes
     WHERE scope = $1 AND id = $2 AND type = 'topic'
     LIMIT 1`,
    [params.scope, topicId],
  );
  if (r.rowCount !== 1) throw new Error(`topic not found: ${topicId}`);

  const slots = r.rows[0].slots ?? {};
  const memberCount = getMemberCount(slots);
  const state = getTopicState(slots);
  const oldEmb = parseVectorText(r.rows[0].embedding_text);
  const nextEmb = memberCount <= 0 ? newEmbedding : avgVec(oldEmb, memberCount, newEmbedding);

  const nextCount = memberCount + 1;
  const nextState: "draft" | "active" = state === "active" ? "active" : nextCount >= params.minEventsPerTopic ? "active" : "draft";

  const nextSlots = {
    ...slots,
    topic_state: nextState,
    member_count: nextCount,
    last_cluster_commit_hash: clusterCommitHash,
    last_member_added_at: new Date().toISOString(),
  };

  let title = r.rows[0].title;
  if (!title) {
    let t = autoTitleFromEvent((typeof slots?.seed_summary === "string" ? slots.seed_summary : null) ?? "Topic", params.maxTextLen);
    if (params.piiRedaction) t = redactPII(t).text;
    title = t;
  }
  const visibility = resolveTopicVisibilityFromEvent(event);

  await client.query(
    `
    UPDATE memory_nodes
    SET
      title = $3,
      slots = $4::jsonb,
      embedding = $5::vector(1536),
      embedding_status = 'ready',
      embedding_model = COALESCE(NULLIF(embedding_model, ''), $6),
      producer_agent_id = COALESCE(producer_agent_id, $8),
      owner_agent_id = CASE
        WHEN memory_lane = 'private' AND owner_agent_id IS NULL AND owner_team_id IS NULL THEN $9
        ELSE owner_agent_id
      END,
      owner_team_id = CASE
        WHEN memory_lane = 'private' AND owner_agent_id IS NULL AND owner_team_id IS NULL THEN $10
        ELSE owner_team_id
      END,
      memory_lane = CASE
        WHEN memory_lane = 'private' AND owner_agent_id IS NULL AND owner_team_id IS NULL THEN $11::memory_lane
        ELSE memory_lane
      END,
      commit_id = $7
    WHERE scope = $1 AND id = $2 AND type = 'topic'
    `,
    [
      params.scope,
      topicId,
      title,
      JSON.stringify(nextSlots),
      toVectorLiteral(nextEmb),
      sourceEmbeddingModel && sourceEmbeddingModel.trim()
        ? sourceEmbeddingModel.trim()
        : "topic_cluster:event_embedding",
      clusterCommitId,
      visibility.producer_agent_id,
      visibility.owner_agent_id,
      visibility.owner_team_id,
      visibility.memory_lane,
    ],
  );

  return { state: nextState, member_count: nextCount };
}

async function createDraftTopic(
  client: pg.PoolClient,
  params: TopicClusterParams,
  event: EventRow,
  eventEmbedding: number[],
  clusterCommitId: string,
  clusterCommitHash: string,
): Promise<string> {
  const seed = event.text_summary ?? `event:${event.id}`;
  const seedNorm = normalizeText(seed, params.maxTextLen);
  const seedRedacted = params.piiRedaction ? redactPII(seedNorm).text : seedNorm;

  const topicId = stableUuid(`${params.scope}:topic:draft:${sha256Hex(seedRedacted)}:${event.id}`);
  const title = autoTitleFromEvent(seedRedacted, params.maxTextLen);
  const visibility = resolveTopicVisibilityFromEvent(event);

  const slots = {
    topic_state: params.minEventsPerTopic <= 1 ? "active" : "draft",
    member_count: 0,
    seed_event_id: event.id,
    seed_summary: seedRedacted,
    created_by: "job:topic_cluster",
    last_cluster_commit_hash: clusterCommitHash,
  };

  await client.query(
    `
    INSERT INTO memory_nodes
      (id, scope, type, tier, title, text_summary, slots, embedding, embedding_status, embedding_model,
       memory_lane, producer_agent_id, owner_agent_id, owner_team_id,
       salience, importance, confidence, commit_id, embedding_ready_at)
    VALUES
      ($1, $2, 'topic', 'hot', $3, $4, $5::jsonb, $6::vector(1536), 'ready', $7, $8::memory_lane, $9, $10, $11, 0.5, 0.5, 0.5, $12, now())
    ON CONFLICT (id) DO NOTHING
    `,
    [
      topicId,
      params.scope,
      title,
      `Auto-clustered candidate topic (${slots.topic_state}).`,
      JSON.stringify(slots),
      toVectorLiteral(eventEmbedding),
      event.embedding_model && event.embedding_model.trim()
        ? event.embedding_model.trim()
        : "topic_cluster:event_embedding",
      visibility.memory_lane,
      visibility.producer_agent_id,
      visibility.owner_agent_id,
      visibility.owner_team_id,
      clusterCommitId,
    ],
  );

  return topicId;
}

async function runTopicClusterOnlineKnnCore(
  client: pg.PoolClient,
  params: TopicClusterParams,
): Promise<{
  topic_commit_id: string | null;
  topic_commit_hash: string | null;
  processed_events: number;
  assigned: number;
  created_topics: number;
  promoted: number;
  quality: TopicClusterQuality;
}> {
  const startedAt = new Date().toISOString();
  const events = await fetchEventsByIds(client, params.scope, params.eventIds);
  if (events.length === 0) {
    // No-op: nothing eligible to cluster.
    return {
      topic_commit_id: null,
      topic_commit_hash: null,
      processed_events: 0,
      assigned: 0,
      created_topics: 0,
      promoted: 0,
      quality: { cohesion: 0, coverage: 0, orphan_rate_after: 0, merge_rate_30d: 0 },
    };
  }

  const parentRes = await client.query<{ id: string; commit_hash: string }>(
    "SELECT id, commit_hash FROM memory_commits WHERE scope = $1 ORDER BY created_at DESC LIMIT 1",
    [params.scope],
  );
  const parentHash = parentRes.rowCount ? parentRes.rows[0].commit_hash : "";
  const parentId = parentRes.rowCount ? parentRes.rows[0].id : null;

  const planned: Array<{ kind: string; event_id: string; topic_id: string; similarity?: number; new_topic?: boolean }> = [];
  for (const e of events) {
    const vec = parseVectorText(e.embedding_text);
    const candidates = await nearestTopics(client, params.scope, toVectorLiteral(vec), params.maxCandidatesPerEvent);
    const best = candidates[0];
    if (best && best.similarity >= params.simThreshold) {
      planned.push({ kind: "assign", event_id: e.id, topic_id: best.id, similarity: best.similarity });
    } else {
      const seed = e.text_summary ?? `event:${e.id}`;
      const seedNorm = normalizeText(seed, params.maxTextLen);
      const seedRedacted = params.piiRedaction ? redactPII(seedNorm).text : seedNorm;
      const draftTopicId = stableUuid(`${params.scope}:topic:draft:${sha256Hex(seedRedacted)}:${e.id}`);
      planned.push({ kind: "create_and_assign", event_id: e.id, topic_id: draftTopicId, new_topic: true });
    }
  }

  const diff = {
    job: "topic_cluster",
    started_at: startedAt,
    params: {
      TOPIC_SIM_THRESHOLD: params.simThreshold,
      TOPIC_MIN_EVENTS_PER_TOPIC: params.minEventsPerTopic,
      TOPIC_MAX_CANDIDATES_PER_EVENT: params.maxCandidatesPerEvent,
      TOPIC_CLUSTER_STRATEGY: "online_knn",
    },
    planned,
  };
  const inputSha = sha256Hex(`job:topic_cluster:${params.scope}:${startedAt}:${events.length}`);
  const diffSha = sha256Hex(stableStringify(diff));
  const commitHash = sha256Hex(stableStringify({ parentHash, inputSha, diffSha, scope: params.scope, actor: "job", kind: "topic_cluster" }));

  const commitRes = await client.query<{ id: string }>(
    `INSERT INTO memory_commits (scope, parent_id, input_sha256, diff_json, actor, commit_hash)
     VALUES ($1, $2, $3, $4::jsonb, 'job', $5)
     ON CONFLICT (commit_hash) DO UPDATE SET diff_json = memory_commits.diff_json
     RETURNING id`,
    [params.scope, parentId, inputSha, JSON.stringify(diff), commitHash],
  );
  const commitId = commitRes.rows[0].id;

  let assigned = 0;
  let createdTopics = 0;
  let promoted = 0;
  let totalAssignedWeight = 0;

  for (const p of planned) {
    const event = events.find((x) => x.id === p.event_id);
    if (!event) continue;
    const vec = parseVectorText(event.embedding_text);

    if (p.new_topic) {
      await createDraftTopic(client, params, event, vec, commitId, commitHash);
      createdTopics += 1;
    }

    const before = await client.query<{ slots: any }>("SELECT slots FROM memory_nodes WHERE scope=$1 AND id=$2", [params.scope, p.topic_id]);
    const beforeState = before.rowCount ? getTopicState(before.rows[0].slots) : "draft";
    const beforeCount = before.rowCount ? getMemberCount(before.rows[0].slots) : 0;

    const weight = clamp01(p.similarity ?? 0.5);
    await insertEdgePartOf(client, params.scope, p.event_id, p.topic_id, weight, commitId);
    await insertEdgeDerivedFrom(client, params.scope, p.topic_id, p.event_id, commitId);
    assigned += 1;
    totalAssignedWeight += weight;

    const after = await updateTopicAfterAdd(client, params, p.topic_id, event, vec, commitHash, event.embedding_model, commitId);
    if (beforeState === "draft" && after.state === "active" && beforeCount < params.minEventsPerTopic) promoted += 1;
  }

  const cohesion = assigned > 0 ? totalAssignedWeight / assigned : 0;
  const coverage = events.length > 0 ? assigned / events.length : 0;
  const quality = await computeTopicClusterQuality(client, params.scope, cohesion, coverage);

  return {
    topic_commit_id: commitId,
    topic_commit_hash: commitHash,
    processed_events: events.length,
    assigned,
    created_topics: createdTopics,
    promoted,
    quality,
  };
}

export async function runTopicClusterForEventIds(client: pg.PoolClient, params: TopicClusterParams): Promise<TopicClusterResult> {
  const requested = params.strategy ?? "online_knn";

  // Offline strategy is reserved for a future batch pipeline.
  // For operational safety, we currently execute online_kNN and explicitly annotate fallback.
  if (requested === "offline_hdbscan") {
    const out = await runTopicClusterOnlineKnnCore(client, { ...params, strategy: "online_knn" });
    return {
      ...out,
      strategy_requested: "offline_hdbscan",
      strategy_executed: "online_knn",
      strategy_note: "offline_hdbscan is not enabled yet; fallback to online_knn",
    };
  }

  const out = await runTopicClusterOnlineKnnCore(client, { ...params, strategy: "online_knn" });
  return {
    ...out,
    strategy_requested: "online_knn",
    strategy_executed: "online_knn",
    strategy_note: null,
  };
}
