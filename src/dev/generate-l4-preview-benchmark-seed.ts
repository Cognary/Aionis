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
  return stableUuid(`${scope}:l4-preview-seed:${key}`);
}

function edgeId(scope: string, type: SeedEdge["type"], src: string, dst: string): string {
  return stableUuid(`${scope}:l4-preview-seed:${type}:${src}:${dst}`);
}

function makeNode(
  scope: string,
  key: string,
  input: Omit<SeedNode, "id" | "scope" | "memory_lane" | "embedding_model" | "embedding"> & { embed_text?: string },
): SeedNode {
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
  const queryText = "prepare production deploy context cache drain before recovery";
  const events = [
    makeNode(scope, "event_cache_flag", {
      type: "event",
      tier: "hot",
      text_summary: "Prepare production deploy context: cache flag remained enabled and blocked traffic recovery until manual drain started.",
      raw_ref: "seed://l4-preview-benchmark/event/cache-flag",
      slots: { lifecycle_state: "active" },
      salience: 0.95,
      confidence: 0.99,
      embed_text: `${queryText} cache flag remained enabled blocked traffic recovery manual drain`,
    }),
    makeNode(scope, "event_manual_drain", {
      type: "event",
      tier: "hot",
      text_summary: "Prepare production deploy context: operator drained cache traffic before retry and recovery completed without a second rollback.",
      raw_ref: "seed://l4-preview-benchmark/event/manual-drain",
      slots: { lifecycle_state: "active" },
      salience: 0.94,
      confidence: 0.98,
      embed_text: `${queryText} operator drained cache traffic before retry recovery completed`,
    }),
    makeNode(scope, "event_verification", {
      type: "event",
      tier: "hot",
      text_summary: "Prepare production deploy context: post-deploy verification now includes explicit cache-drain confirmation before recovery retry.",
      raw_ref: "seed://l4-preview-benchmark/event/verification",
      slots: { lifecycle_state: "active" },
      salience: 0.9,
      confidence: 0.97,
      embed_text: `${queryText} verification includes explicit cache drain confirmation before recovery retry`,
    }),
  ];

  const topic = makeNode(scope, "topic_cache_recovery", {
    type: "topic",
    tier: "warm",
    title: "Cache recovery deploy topic",
    text_summary: "Topic grouping for cache-drain recovery lessons during production deploy incidents.",
    slots: { topic_state: "active" },
    salience: 0.88,
    confidence: 0.97,
    embed_text: `${queryText} cache recovery deploy topic`,
  });

  const eventIds = events.map((node) => node.id);
  const eventHash = sha256Hex(JSON.stringify(eventIds));

  const l1Evidence = makeNode(scope, "evidence_cache_recovery", {
    type: "evidence",
    tier: "hot",
    title: "Cache recovery evidence",
    text_summary: "Evidence distillation: when cache flag stays enabled, drain cache traffic before retrying recovery.",
    slots: {
      summary_kind: "write_distillation_evidence",
      compression_layer: "L1",
      citations: [events[0]!.id, events[1]!.id],
      source_event_ids: [events[0]!.id, events[1]!.id],
      lifecycle_state: "active",
    },
    salience: 0.93,
    confidence: 0.98,
    embed_text: `${queryText} evidence drain cache traffic before retrying recovery`,
  });

  const l1Fact = makeNode(scope, "fact_cache_recovery", {
    type: "concept",
    tier: "hot",
    title: "Cache recovery fact",
    text_summary: "Deploy fact: recovery retries require cache-drain confirmation before re-enabling traffic.",
    slots: {
      summary_kind: "write_distillation_fact",
      compression_layer: "L1",
      citations: [l1Evidence.id, ...eventIds],
      source_event_ids: eventIds,
      lifecycle_state: "active",
    },
    salience: 0.91,
    confidence: 0.98,
    embed_text: `${queryText} fact recovery retries require cache drain confirmation`,
  });

  const l4Lesson = makeNode(scope, "lesson_cache_recovery", {
    type: "concept",
    tier: "warm",
    title: "Cache recovery lesson",
    text_summary: "Semantic abstraction: treat cache-drain confirmation as a required precondition before any recovery retry after deploy rollback.",
    slots: {
      summary_kind: "semantic_abstraction",
      abstraction_kind: "lesson",
      compression_layer: "L4",
      shadow_mode: true,
      source_summary_kind: "seed:l4_preview_benchmark",
      source_event_count: eventIds.length,
      source_event_ids: eventIds,
      source_event_hash: eventHash,
      citations: [events[0]!.id, events[1]!.id, events[2]!.id],
      quality: {
        faithfulness: 0.98,
        coverage: 0.84,
        contradiction_risk: 0.04,
      },
      lifecycle_state: "active",
      generated_by: "seed:l4_preview_benchmark",
    },
    salience: 0.96,
    confidence: 0.98,
    embed_text: `${queryText} semantic abstraction lesson cache drain confirmation required precondition before retry`,
  });

  const entity = makeNode(scope, "entity_cache_controller", {
    type: "entity",
    tier: "warm",
    title: "cache-controller",
    text_summary: "Component responsible for drain confirmation prior to traffic recovery.",
    slots: { lifecycle_state: "active" },
    salience: 0.72,
    confidence: 0.94,
    embed_text: `${queryText} cache controller`,
  });

  const nodes = [...events, topic, l1Evidence, l1Fact, l4Lesson, entity];
  const edges: SeedEdge[] = [
    ...events.map((event) => makeEdge(scope, "part_of", event.id, topic.id)),
    makeEdge(scope, "part_of", l1Evidence.id, topic.id),
    makeEdge(scope, "part_of", l1Fact.id, topic.id),
    makeEdge(scope, "part_of", l4Lesson.id, topic.id),
    makeEdge(scope, "related_to", entity.id, topic.id, 0.76, 0.9),
    ...events.map((event) => makeEdge(scope, "derived_from", l1Evidence.id, event.id)),
    makeEdge(scope, "derived_from", l1Fact.id, l1Evidence.id),
    ...events.map((event) => makeEdge(scope, "derived_from", l4Lesson.id, event.id)),
  ];

  return {
    tenant_id: "default",
    scope,
    actor: "l4_preview_benchmark_seed",
    input_text: `${queryText} seed corpus`,
    auto_embed: false,
    memory_lane: "shared",
    nodes,
    edges,
  };
}

function main(): void {
  const scope = argValue("--scope") ?? "l4_preview_bench_seeded_v1_20260313";
  const output = argValue("--output") ?? path.resolve("artifacts/benchmarks/l4-preview-seeded-v1/seed_payload.json");
  const payload = buildPayload(scope);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${output}\n`);
}

main();
