import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fakeEmbed } from "../embeddings/fake.js";
import { sha256Hex } from "../util/crypto.js";
import { stableUuid } from "../util/uuid.js";

type SeedNode = {
  id: string;
  type: "event" | "evidence" | "concept" | "topic" | "entity";
  tier: "hot" | "warm" | "cold" | "archive";
  title?: string;
  text_summary?: string;
  raw_ref?: string;
  slots?: Record<string, unknown>;
  salience?: number;
  confidence?: number;
  embedding_model: string;
  embedding: number[];
  scope: string;
  memory_lane: "shared";
};

type SeedEdge = {
  id: string;
  type: "part_of" | "related_to" | "derived_from";
  src: { id: string };
  dst: { id: string };
  scope: string;
  weight?: number;
  confidence?: number;
};

type WritePayload = {
  tenant_id: string;
  scope: string;
  actor: string;
  input_text: string;
  auto_embed: false;
  memory_lane: "shared";
  nodes: SeedNode[];
  edges: SeedEdge[];
};

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function nodeId(scope: string, key: string): string {
  return stableUuid(`${scope}:layer-policy-seed:${key}`);
}

function edgeId(scope: string, type: SeedEdge["type"], src: string, dst: string): string {
  return stableUuid(`${scope}:layer-policy-seed:${type}:${src}:${dst}`);
}

function makeNode(scope: string, key: string, input: Omit<SeedNode, "id" | "scope" | "memory_lane" | "embedding_model" | "embedding"> & { embed_text?: string }): SeedNode {
  const embedText = input.embed_text ?? input.title ?? input.text_summary ?? key;
  return {
    id: nodeId(scope, key),
    type: input.type,
    tier: input.tier,
    title: input.title,
    text_summary: input.text_summary,
    raw_ref: input.raw_ref,
    slots: input.slots ?? {},
    salience: input.salience ?? 0.8,
    confidence: input.confidence ?? 0.95,
    embedding_model: "fake:deterministic",
    embedding: fakeEmbed(embedText),
    scope,
    memory_lane: "shared",
  };
}

function makeEdge(scope: string, type: SeedEdge["type"], src: string, dst: string, weight = 0.95, confidence = 0.95): SeedEdge {
  return {
    id: edgeId(scope, type, src, dst),
    type,
    src: { id: src },
    dst: { id: dst },
    scope,
    weight,
    confidence,
  };
}

function buildPayload(scope: string): WritePayload {
  const queryText = "prepare production deploy context";
  const events = [
    makeNode(scope, "event_canary", {
      type: "event",
      tier: "hot",
      text_summary: "Prepare production deploy context: canary rollout triggered API latency spike on api-gateway.",
      raw_ref: "seed://layer-policy-benchmark/event/canary",
      slots: { lifecycle_state: "active" },
      salience: 0.93,
      confidence: 0.98,
    }),
    makeNode(scope, "event_rollback", {
      type: "event",
      tier: "hot",
      text_summary: "Prepare production deploy context: rollback path required cache flag disable before traffic recovery.",
      raw_ref: "seed://layer-policy-benchmark/event/rollback",
      slots: { lifecycle_state: "active" },
      salience: 0.91,
      confidence: 0.97,
    }),
    makeNode(scope, "event_pool", {
      type: "event",
      tier: "hot",
      text_summary: "Prepare production deploy context: root cause was postgres connection pool saturation after deploy.",
      raw_ref: "seed://layer-policy-benchmark/event/pool",
      slots: { lifecycle_state: "active" },
      salience: 0.89,
      confidence: 0.97,
    }),
    makeNode(scope, "event_verify", {
      type: "event",
      tier: "hot",
      text_summary: "Prepare production deploy context: post-deploy verification now requires latency, pool, and rollback checks.",
      raw_ref: "seed://layer-policy-benchmark/event/verify",
      slots: { lifecycle_state: "active" },
      salience: 0.88,
      confidence: 0.96,
    }),
  ];

  const topic = makeNode(scope, "topic_deploy", {
    type: "topic",
    tier: "warm",
    title: "Prepare production deploy context topic",
    text_summary: "Topic grouping for deploy incident, rollback path, and verification steps.",
    slots: { topic_state: "active" },
    salience: 0.9,
    confidence: 0.97,
  });

  const eventIds = events.map((node) => node.id);
  const eventHash = sha256Hex(JSON.stringify(eventIds));

  const l1Evidence = makeNode(scope, "evidence_deploy", {
    type: "evidence",
    tier: "hot",
    title: "Prepare production deploy context evidence",
    text_summary: "Evidence distillation: verify canary health, connection pool headroom, and rollback command set before production deploy.",
    slots: {
      summary_kind: "write_distillation_evidence",
      compression_layer: "L1",
      citations: eventIds,
      source_event_ids: eventIds,
      lifecycle_state: "active",
    },
    salience: 0.94,
    confidence: 0.98,
  });

  const l1Fact = makeNode(scope, "fact_deploy", {
    type: "concept",
    tier: "hot",
    title: "Prepare production deploy context fact",
    text_summary: "Deploy verification fact: production deploy context must include canary latency, connection pool, and rollback checks.",
    slots: {
      summary_kind: "write_distillation_fact",
      compression_layer: "L1",
      citations: [l1Evidence.id, ...eventIds],
      source_event_ids: eventIds,
      lifecycle_state: "active",
    },
    salience: 0.95,
    confidence: 0.99,
  });

  const l3Rollup = makeNode(scope, "rollup_deploy", {
    type: "concept",
    tier: "warm",
    title: "Prepare production deploy context rollup",
    text_summary:
      "Compression rollup: production deploy context centers on canary latency, rollback safety, connection pool limits, and post-deploy verification.",
    slots: {
      summary_kind: "compression_rollup",
      compression_layer: "L3",
      source_topic_id: topic.id,
      source_event_count: eventIds.length,
      source_event_ids: eventIds,
      source_event_hash: eventHash,
      citations: eventIds,
      generated_by: "seed:layer-policy-benchmark-v2",
      lifecycle_state: "active",
    },
    salience: 0.92,
    confidence: 0.98,
  });

  const entity = makeNode(scope, "entity_api_gateway", {
    type: "entity",
    tier: "warm",
    title: "api-gateway",
    text_summary: "Service affected by deploy latency regression.",
    slots: { lifecycle_state: "active" },
    salience: 0.7,
    confidence: 0.94,
  });

  const nodes = [...events, topic, l1Evidence, l1Fact, l3Rollup, entity];
  const edges: SeedEdge[] = [
    ...events.map((event) => makeEdge(scope, "part_of", event.id, topic.id)),
    makeEdge(scope, "part_of", l1Evidence.id, topic.id),
    makeEdge(scope, "part_of", l1Fact.id, topic.id),
    makeEdge(scope, "part_of", l3Rollup.id, topic.id),
    makeEdge(scope, "related_to", entity.id, topic.id, 0.75, 0.9),
    ...events.map((event) => makeEdge(scope, "derived_from", l3Rollup.id, event.id)),
    ...events.map((event) => makeEdge(scope, "derived_from", l1Evidence.id, event.id)),
    makeEdge(scope, "derived_from", l1Fact.id, l1Evidence.id),
  ];

  return {
    tenant_id: "default",
    scope,
    actor: "benchmark_seed_v2",
    input_text: `${queryText} seed corpus`,
    auto_embed: false,
    memory_lane: "shared",
    nodes,
    edges,
  };
}

function main(): void {
  const scope = argValue("--scope") ?? "layer_policy_bench_seeded_v2_20260313";
  const output = argValue("--output") ?? path.resolve("artifacts/benchmarks/layer-policy-seeded-v2/seed_payload.json");
  const payload = buildPayload(scope);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${output}\n`);
}

main();
