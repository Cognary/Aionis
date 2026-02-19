import assert from "node:assert/strict";
import { MemoryRecallRequest, ToolsFeedbackRequest, ToolsSelectRequest } from "../memory/schemas.js";
import { HttpError } from "../util/http.js";
import { memoryRecallParsed, type RecallAuth } from "../memory/recall.js";
import { ruleMatchesContext } from "../memory/rule-engine.js";
import { buildAppliedPolicy, parsePolicyPatch } from "../memory/rule-policy.js";
import { applyToolPolicy } from "../memory/tool-selector.js";
import { computeEffectiveToolPolicy } from "../memory/tool-policy.js";

type QueryResult<T> = { rows: T[]; rowCount: number };

class FakePgClient {
  private readonly fixtures: {
    stage1: any[];
    edges: any[];
    nodeIds: { id: string }[];
    nodes: any[];
    ruleDefs: any[];
    debugEmbeddings: { id: string; embedding_text: string }[];
  };

  constructor(fixtures: FakePgClient["fixtures"]) {
    this.fixtures = fixtures;
  }

  async query<T>(sql: string): Promise<QueryResult<T>> {
    const s = sql.replace(/\s+/g, " ").trim();

    if (s.includes("embedding::text AS embedding_text")) {
      return { rows: this.fixtures.debugEmbeddings as T[], rowCount: this.fixtures.debugEmbeddings.length };
    }

    if (s.includes("WITH knn AS") && s.includes("FROM memory_nodes n") && s.includes("embedding <=>")) {
      return { rows: this.fixtures.stage1 as T[], rowCount: this.fixtures.stage1.length };
    }

    if (s.includes("FROM hop2") && s.includes("FROM memory_edges")) {
      return { rows: this.fixtures.edges as T[], rowCount: this.fixtures.edges.length };
    }

    if (s.includes("SELECT DISTINCT id FROM")) {
      return { rows: this.fixtures.nodeIds as T[], rowCount: this.fixtures.nodeIds.length };
    }

    if (s.includes("FROM memory_nodes") && s.includes("id = ANY")) {
      return { rows: this.fixtures.nodes as T[], rowCount: this.fixtures.nodes.length };
    }

    if (s.includes("FROM memory_rule_defs d") || s.includes("FROM memory_rule_defs")) {
      return { rows: this.fixtures.ruleDefs as T[], rowCount: this.fixtures.ruleDefs.length };
    }

    throw new Error(`FakePgClient: unhandled query shape: ${s.slice(0, 200)}...`);
  }
}

function keys(o: any): string[] {
  return Object.keys(o).sort();
}

function assertSubset(actual: string[], expected: string[]) {
  for (const k of actual) assert.ok(expected.includes(k), `unexpected key: ${k} (allowed=${expected.join(",")})`);
}

async function run() {
  // Schema hard cap: max_edges <= 100
  assert.throws(
    () => MemoryRecallRequest.parse({ query_embedding: [0], max_edges: 101 }),
    /less than or equal to 100/i,
  );
  assert.equal(
    ToolsSelectRequest.parse({ context: { x: 1 }, candidates: ["curl"], run_id: "run_demo_1" }).run_id,
    "run_demo_1",
  );
  assert.throws(
    () =>
      ToolsFeedbackRequest.parse({
        context: { x: 1 },
        candidates: ["curl"],
        selected_tool: "curl",
        outcome: "positive",
        input_text: "x",
        decision_id: "not-a-uuid",
      }),
    /Invalid uuid/i,
  );

  const seedEventId = "00000000-0000-0000-0000-000000000001";
  const seedTopicId = "00000000-0000-0000-0000-000000000002";

  const fake = new FakePgClient({
    stage1: [
      {
        id: seedEventId,
        type: "event",
        title: null,
        text_summary: "seed event",
        tier: "hot",
        salience: 0.5,
        confidence: 0.8,
        similarity: 0.9,
      },
    ],
    edges: [
      {
        id: "00000000-0000-0000-0000-0000000000e1",
        scope: "default",
        type: "part_of",
        src_id: seedEventId,
        dst_id: seedTopicId,
        weight: 0.9,
        confidence: 0.9,
        decay_rate: 0.01,
        last_activated: null,
        created_at: new Date().toISOString(),
        commit_id: "00000000-0000-0000-0000-0000000000c1",
      },
    ],
    nodeIds: [{ id: seedEventId }, { id: seedTopicId }],
    nodes: [
      {
        id: seedEventId,
        scope: "default",
        type: "event",
        tier: "hot",
        title: null,
        text_summary: "seed event",
        slots: null,
        embedding_status: "ready",
        embedding_model: "minimax:embo-01",
        topic_state: null,
        member_count: null,
        raw_ref: null,
        evidence_ref: null,
        salience: 0.5,
        importance: 0.5,
        confidence: 0.8,
        last_activated: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        commit_id: "00000000-0000-0000-0000-0000000000c2",
      },
      {
        id: seedTopicId,
        scope: "default",
        type: "topic",
        tier: "hot",
        title: "T",
        text_summary: "topic",
        slots: { topic_state: "draft", member_count: 1, b: 2, a: 1 },
        embedding_status: "ready",
        embedding_model: "minimax:embo-01",
        topic_state: "draft",
        member_count: 1,
        raw_ref: null,
        evidence_ref: null,
        salience: 0.4,
        importance: 0.4,
        confidence: 0.7,
        last_activated: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        commit_id: "00000000-0000-0000-0000-0000000000c3",
      },
    ],
    ruleDefs: [],
    debugEmbeddings: [{ id: seedEventId, embedding_text: "[0.1,0.2,0.3,0.4]" }],
  });

  const baseReq = MemoryRecallRequest.parse({
    scope: "default",
    query_embedding: Array.from({ length: 1536 }, () => 0),
    limit: 20,
    neighborhood_hops: 2,
  });

  // Empty-seed contract: return public scope + tenant_id (never internal scope key), and keep stable response shape.
  const empty = new FakePgClient({
    stage1: [],
    edges: [],
    nodeIds: [],
    nodes: [],
    ruleDefs: [],
    debugEmbeddings: [],
  });
  const emptyOut = await memoryRecallParsed(
    empty as any,
    MemoryRecallRequest.parse({
      scope: "project-alpha",
      tenant_id: "tenant-a",
      query_embedding: Array.from({ length: 1536 }, () => 0),
    }),
    "default",
    "default",
    { allow_debug_embeddings: false },
  );
  assert.equal(emptyOut.scope, "project-alpha");
  assert.equal((emptyOut as any).tenant_id, "tenant-a");
  assert.equal(emptyOut.subgraph.nodes.length, 0);
  assert.equal(emptyOut.subgraph.edges.length, 0);
  assert.equal(emptyOut.ranked.length, 0);
  assert.equal(emptyOut.context.text, "");

  // Default contract: no embeddings in subgraph node DTO.
  const out = await memoryRecallParsed(fake as any, baseReq, "default", "default", { allow_debug_embeddings: false });
  assert.equal(out.subgraph.edges.length, 1);
  assert.equal(out.subgraph.nodes.length, 2);
  for (const n of out.subgraph.nodes) {
    assert.ok(!("embedding" in (n as any)));
    assertSubset(keys(n), ["id", "type", "title", "text_summary", "topic_state", "member_count"].filter(Boolean));
  }
  assertSubset(keys(out.subgraph.edges[0]), ["from_id", "to_id", "type", "weight"]);

  // return_debug alone must NOT widen the response contract (meta still requires include_meta).
  const outDebugNoMeta = await memoryRecallParsed(
    fake as any,
    MemoryRecallRequest.parse({ ...baseReq, return_debug: true }),
    "default",
    "default",
    { allow_debug_embeddings: false },
  );
  for (const n of outDebugNoMeta.subgraph.nodes as any[]) {
    assert.ok(!("created_at" in n));
    assert.ok(!("commit_id" in n));
  }
  for (const e of outDebugNoMeta.subgraph.edges as any[]) {
    assert.ok(!("commit_id" in e));
  }

  // Slots preview: sorted keys, limited.
  const outSlotsPreview = await memoryRecallParsed(
    fake as any,
    MemoryRecallRequest.parse({ ...baseReq, include_slots_preview: true, slots_preview_keys: 2 }),
    "default",
    "default",
    { allow_debug_embeddings: false },
  );
  const t = outSlotsPreview.subgraph.nodes.find((n: any) => n.type === "topic") as any;
  assert.deepEqual(Object.keys(t.slots_preview), ["a", "b"]); // sorted + limited

  // Meta should be behind include_meta or return_debug.
  const outMeta = await memoryRecallParsed(
    fake as any,
    MemoryRecallRequest.parse({ ...baseReq, include_meta: true }),
    "default",
    "default",
    { allow_debug_embeddings: false },
  );
  const e = outMeta.subgraph.nodes.find((n: any) => n.type === "event") as any;
  assert.ok("created_at" in e);
  assert.ok("commit_id" in e);
  assert.ok("embedding_model" in e);

  // Debug embeddings must be privileged + bounded.
  const wantDbg = MemoryRecallRequest.parse({ ...baseReq, return_debug: true, include_embeddings: true });
  await assert.rejects(
    () => memoryRecallParsed(fake as any, wantDbg, "default", "default", { allow_debug_embeddings: false }),
    (err: any) => err instanceof HttpError && err.statusCode === 400,
  );

  const allow: RecallAuth = { allow_debug_embeddings: true };
  const outDbg = await memoryRecallParsed(fake as any, wantDbg, "default", "default", allow);
  const outDbgAny = outDbg as any;
  assert.ok(outDbgAny.debug);
  assert.ok(Array.isArray(outDbgAny.debug.embeddings));
  assert.ok(outDbgAny.debug.embeddings.length <= 5);
  assert.ok(outDbgAny.debug.embeddings[0].preview.length <= 16);

  // limit>20 should be rejected in debug embeddings mode.
  const badLimit = MemoryRecallRequest.parse({ ...baseReq, limit: 21, return_debug: true, include_embeddings: true });
  await assert.rejects(
    () => memoryRecallParsed(fake as any, badLimit, "default", "default", allow),
    (err: any) => err instanceof HttpError && err.code === "debug_embeddings_limit_too_high",
  );

  // Rule engine basics (no DB needed).
  assert.equal(ruleMatchesContext({ intent: "json" }, [], { intent: "json" }), true);
  assert.equal(ruleMatchesContext({ intent: "json" }, [], { intent: "text" }), false);
  assert.equal(ruleMatchesContext({ "tool.name": "psql" }, [], { tool: { name: "psql" } }), true);
  assert.equal(ruleMatchesContext({ provider: { $in: ["openai", "minimax"] } }, [], { provider: "minimax" }), true);
  assert.equal(ruleMatchesContext({ provider: { $in: ["openai"] } }, [], { provider: "minimax" }), false);
  assert.equal(ruleMatchesContext({ intent: "json" }, [{ user: "lucio" }], { intent: "json", user: "lucio" }), false);

  // Policy patch schema + merging.
  const p1 = parsePolicyPatch({ output: { format: "json", strict: true }, tool: { allow: ["psql"] } });
  const p2 = parsePolicyPatch({ tool: { deny: ["rm"], allow: ["psql"] } });
  const applied = buildAppliedPolicy([
    { rule_node_id: "r1", state: "active", commit_id: "c1", then_patch: p1 },
    { rule_node_id: "r2", state: "active", commit_id: "c2", then_patch: p2 },
  ]);
  assert.deepEqual(applied.policy.tool?.allow, ["psql"]);
  assert.deepEqual(applied.policy.tool?.deny, ["rm"]);

  // Tool selector: allow/deny/prefer should deterministically filter and order candidates.
  const sel = applyToolPolicy(
    ["rm", "curl", "psql", "psql"],
    parsePolicyPatch({ tool: { allow: ["psql", "curl"], deny: ["rm"], prefer: ["psql"] } }),
    { strict: true },
  );
  assert.deepEqual(sel.candidates, ["rm", "curl", "psql"]);
  assert.deepEqual(sel.allowed, ["curl", "psql"]);
  assert.deepEqual(sel.preferred, ["psql"]);
  assert.deepEqual(sel.ordered, ["psql", "curl"]);
  assert.equal(sel.selected, "psql");

  // Tool selector fallback: strict=false should fall back to deny-only when allowlist filters out everything.
  const selFb = applyToolPolicy(
    ["psql", "curl"],
    parsePolicyPatch({ tool: { allow: ["nonexistent"], deny: ["curl"], prefer: ["psql"] } }),
    { strict: false },
  );
  assert.deepEqual(selFb.allowed, ["psql"]); // allowlist ignored, deny still applied
  assert.equal(selFb.selected, "psql");
  assert.equal(selFb.fallback?.applied, true);
  assert.equal(selFb.fallback?.reason, "allowlist_filtered_all");

  // Tool policy semantics (score-aware): deny=union, allow=intersection, prefer=score-desc priority list.
  const toolPolicy = computeEffectiveToolPolicy([
    { rule_node_id: "r_low", score: 1, tool: { prefer: ["psql"], allow: ["psql", "curl"] } },
    { rule_node_id: "r_high", score: 10, tool: { prefer: ["curl"], allow: ["curl"], deny: ["rm"] } },
  ]);
  assert.deepEqual(toolPolicy.tool.allow, ["curl"]); // intersection
  assert.deepEqual(toolPolicy.tool.deny, ["rm"]);
  assert.deepEqual(toolPolicy.tool.prefer, ["curl", "psql"]); // high score first
  assert.ok(Array.isArray(toolPolicy.explain.conflicts));
  assert.equal(toolPolicy.explain.contributions[0].priority, 0);
  assert.equal(toolPolicy.explain.contributions[0].weight, 1);
  const preferConflict = toolPolicy.explain.conflicts.find((c: any) => c.code === "prefer_competing_top_choice");
  assert.equal(preferConflict?.winner_rule_node_id, "r_high");
}

run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, suite: "contract-smoke" }));
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  });
