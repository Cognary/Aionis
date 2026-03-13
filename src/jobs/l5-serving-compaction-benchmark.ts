import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fakeEmbed } from "../embeddings/fake.js";
import { stableUuid } from "../util/uuid.js";

type RecordKind = "L1_evidence" | "L1_fact" | "L2_topic" | "L3_rollup";
type FixtureRecord = { key: string; kind?: RecordKind; title: string; text_summary: string };
type FixtureCase = { id: string; query_text: string; critical_facts: string[] };
type Fixture = {
  actor: string;
  context_char_budget: number;
  context_token_budget: number;
  records: FixtureRecord[];
  cases: FixtureCase[];
};

type EndpointName = "recall_text" | "planning_context" | "context_assemble";
type ArmName = "balanced_serving" | "aggressive_serving";
type SampleResult = {
  endpoint: EndpointName;
  status: number;
  ok: boolean;
  context_est_tokens: number;
  selected_memory_layers: string[];
  retrieved_memory_layers: string[];
  context_chars: number;
  critical_facts_found: string[];
  critical_facts_missing: string[];
  fact_recall_rate: number;
};
type CaseResult = { case_id: string; arm: ArmName; query_text: string; critical_facts: string[]; results: Record<EndpointName, SampleResult> };

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}
function rootDir(): string { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."); }
function nowTag(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
function readFixture(file: string): Fixture { return JSON.parse(readFileSync(file, "utf8")) as Fixture; }
function nodeId(scope: string, key: string): string { return stableUuid(`${scope}:l5-serving-compaction:${key}`); }
function edgeId(scope: string, src: string, dst: string): string { return stableUuid(`${scope}:l5-serving-compaction:edge:${src}:${dst}`); }

function makePayload(fixture: Fixture, scope: string, tenantId: string) {
  const eventRecords = fixture.records.filter((record) => !record.kind);
  const l1Records = fixture.records.filter((record) => record.kind === "L1_evidence" || record.kind === "L1_fact");
  const l2Records = fixture.records.filter((record) => record.kind === "L2_topic");
  const l3Records = fixture.records.filter((record) => record.kind === "L3_rollup");

  const events = eventRecords.map((record) => ({
    id: nodeId(scope, record.key), scope, type: "event", tier: "hot", title: record.title, text_summary: record.text_summary,
    raw_ref: `seed://l5-serving-compaction/${record.key}`,
    slots: { lifecycle_state: "active", compression_layer: "L0" }, salience: 0.92, importance: 0.9, confidence: 0.97,
    embedding_model: "fake:deterministic", embedding: fakeEmbed(record.text_summary), memory_lane: "shared",
  }));
  const l1Nodes = l1Records.map((record) => ({
    id: nodeId(scope, record.key), scope, type: record.kind === "L1_evidence" ? "evidence" : "concept", tier: "warm", title: record.title, text_summary: record.text_summary,
    slots: { compression_layer: "L1", summary_kind: record.kind === "L1_evidence" ? "write_distillation_evidence" : "write_distillation_fact", distillation_kind: record.kind === "L1_evidence" ? "write_distilled_evidence" : "write_distilled_fact", source_event_ids: events.map((e) => e.id), citations: events.map((e) => e.id), lifecycle_state: "active" },
    salience: 0.95, importance: 0.94, confidence: 0.99, embedding_model: "fake:deterministic", embedding: fakeEmbed(record.text_summary), memory_lane: "shared",
  }));
  const l2Nodes = l2Records.map((record) => ({
    id: nodeId(scope, record.key), scope, type: "topic", tier: "warm", title: record.title, text_summary: record.text_summary,
    slots: { compression_layer: "L2", summary_kind: "topic_cluster", source_event_ids: events.map((e) => e.id), citations: [...events.map((e) => e.id), ...l1Nodes.map((n) => n.id)], lifecycle_state: "active" },
    salience: 0.96, importance: 0.95, confidence: 0.98, embedding_model: "fake:deterministic", embedding: fakeEmbed(record.text_summary), memory_lane: "shared",
  }));
  const l3Nodes = l3Records.map((record) => ({
    id: nodeId(scope, record.key), scope, type: "concept", tier: "warm", title: record.title, text_summary: record.text_summary,
    slots: { compression_layer: "L3", summary_kind: "compression_rollup", source_event_ids: events.map((e) => e.id), citations: [...events.map((e) => e.id), ...l2Nodes.map((n) => n.id)], lifecycle_state: "active" },
    salience: 0.97, importance: 0.96, confidence: 0.99, embedding_model: "fake:deterministic", embedding: fakeEmbed(record.text_summary), memory_lane: "shared",
  }));
  const edges = [
    ...l1Nodes.flatMap((node) => events.map((event) => ({ id: edgeId(scope, node.id, event.id), scope, type: "derived_from", src: { id: node.id }, dst: { id: event.id }, weight: 0.92, confidence: 0.95 }))),
    ...l2Nodes.flatMap((node) => [...events, ...l1Nodes].map((source) => ({ id: edgeId(scope, node.id, source.id), scope, type: "derived_from", src: { id: node.id }, dst: { id: source.id }, weight: 0.9, confidence: 0.94 }))),
    ...l3Nodes.flatMap((node) => [...events, ...l2Nodes].map((source) => ({ id: edgeId(scope, node.id, source.id), scope, type: "derived_from", src: { id: node.id }, dst: { id: source.id }, weight: 0.91, confidence: 0.95 }))),
  ];
  return { tenant_id: tenantId, scope, actor: fixture.actor, auto_embed: false, memory_lane: "shared", input_text: "l5 serving compaction benchmark seed corpus", nodes: [...events, ...l1Nodes, ...l2Nodes, ...l3Nodes], edges };
}

async function postJson(baseUrl: string, endpoint: string, body: unknown) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}${endpoint}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let parsed: any = null; try { parsed = await response.json(); } catch { parsed = null; }
  return { status: response.status, ok: response.ok, ms: Date.now() - started, body: parsed };
}
function textForEndpoint(endpoint: EndpointName, body: any): string {
  if (endpoint === "recall_text") return typeof body?.context?.text === "string" ? body.context.text : "";
  if (endpoint === "planning_context") return typeof body?.recall?.context?.text === "string" ? body.recall.context.text : "";
  return typeof body?.layered_context?.merged_text === "string" ? body.layered_context.merged_text : "";
}
function costSignalsForEndpoint(endpoint: EndpointName, body: any): any {
  if (endpoint === "recall_text") return body?.cost_signals ?? null;
  if (endpoint === "planning_context") return body?.cost_signals ?? body?.planning_summary ?? null;
  return body?.cost_signals ?? body?.assembly_summary ?? null;
}
function selectionStatsForEndpoint(endpoint: EndpointName, body: any): any {
  if (endpoint === "recall_text") return body?.context?.selection_stats ?? null;
  if (endpoint === "planning_context") return body?.recall?.context?.selection_stats ?? null;
  return body?.recall?.context?.selection_stats ?? null;
}
function buildSampleResult(endpoint: EndpointName, criticalFacts: string[], body: any, status: number, ok: boolean): SampleResult {
  const text = textForEndpoint(endpoint, body);
  const costSignals = costSignalsForEndpoint(endpoint, body);
  const selectionStats = selectionStatsForEndpoint(endpoint, body);
  const found = criticalFacts.filter((fact) => text.includes(fact));
  const missing = criticalFacts.filter((fact) => !text.includes(fact));
  return {
    endpoint, status, ok,
    context_est_tokens: Number(costSignals?.context_est_tokens ?? body?.planning_summary?.context_est_tokens ?? body?.assembly_summary?.context_est_tokens ?? 0),
    selected_memory_layers: Array.isArray(costSignals?.selected_memory_layers) ? costSignals.selected_memory_layers.map((x: unknown) => String(x)) : [],
    retrieved_memory_layers: Array.isArray(selectionStats?.retrieved_memory_layers) ? selectionStats.retrieved_memory_layers.map((x: unknown) => String(x)) : [],
    context_chars: text.length,
    critical_facts_found: found,
    critical_facts_missing: missing,
    fact_recall_rate: criticalFacts.length > 0 ? Number((found.length / criticalFacts.length).toFixed(6)) : 1,
  };
}
function mean(values: number[]): number { return values.length ? Number((values.reduce((a,b)=>a+b,0)/values.length).toFixed(6)) : 0; }
function uniqueSorted(values: string[]): string[] { return Array.from(new Set(values)).sort(); }
function renderReport(summary: any): string {
  const lines = ["# L5 Serving-Side Compaction Benchmark", "", `- scope: \`${summary.scope}\``, `- fixture: \`${summary.fixture_file}\``, `- cases: \`${summary.cases}\``, ""];
  for (const arm of ["balanced_serving", "aggressive_serving"]) {
    const a = summary.arms[arm];
    lines.push(`## ${arm}`, "", `- avg_fact_recall_rate: \`${a.avg_fact_recall_rate}\``, `- avg_context_est_tokens: \`${a.avg_context_est_tokens}\``, `- avg_context_chars: \`${a.avg_context_chars}\``, `- selected_memory_layers: \`${a.selected_memory_layers.join(", ")}\``, "", "| endpoint | avg_fact_recall_rate | avg_context_est_tokens | avg_context_chars | selected_memory_layers |", "| --- | --- | --- | --- | --- |");
    for (const endpoint of ["recall_text", "planning_context", "context_assemble"]) {
      const s = a.endpoints[endpoint];
      lines.push(`| ${endpoint} | \`${s.avg_fact_recall_rate}\` | \`${s.avg_context_est_tokens}\` | \`${s.avg_context_chars}\` | \`${s.selected_memory_layers.join(", ")}\` |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const baseUrl = (argValue("--base-url") ?? "http://127.0.0.1:3321").replace(/\/$/, "");
  const fixtureFile = argValue("--fixture-file") ?? path.join(rootDir(), "src/jobs/fixtures/l5-serving-compaction-click-v1.json");
  const fixture = readFixture(fixtureFile);
  const scope = `bench:l5-serving-compaction:${path.basename(fixtureFile, ".json")}:${nowTag()}`;
  const tenantId = "bench-l5-serving-compaction";
  const outDir = path.join(rootDir(), "artifacts/benchmarks/l5-serving-compaction", nowTag() + "-" + path.basename(fixtureFile, ".json").replace(/^l5-serving-compaction-/, ""));
  mkdirSync(outDir, { recursive: true });

  const seed = makePayload(fixture, scope, tenantId);
  const writeResp = await postJson(baseUrl, "/v1/memory/write", seed);
  if (!writeResp.ok) throw new Error(`seed write failed: ${writeResp.status} ${JSON.stringify(writeResp.body)}`);

  const arms: Record<ArmName, { context_compaction_profile: "balanced" | "aggressive"; context_optimization_profile: "balanced" | "aggressive" }> = {
    balanced_serving: { context_compaction_profile: "balanced", context_optimization_profile: "balanced" },
    aggressive_serving: { context_compaction_profile: "aggressive", context_optimization_profile: "aggressive" },
  };
  const rows: CaseResult[] = [];

  for (const arm of Object.keys(arms) as ArmName[]) {
    const policy = arms[arm];
    for (const c of fixture.cases) {
      const common = {
        tenant_id: tenantId,
        scope,
        query_text: c.query_text,
        context_char_budget: fixture.context_char_budget,
        context_token_budget: fixture.context_token_budget,
        context_compaction_profile: policy.context_compaction_profile,
        memory_layer_preference: {
          allowed_layers: ["L0", "L1", "L2", "L3"],
        },
      };
      const recallResp = await postJson(baseUrl, "/v1/memory/recall_text", common);
      const planningResp = await postJson(baseUrl, "/v1/memory/planning/context", { ...common, context_optimization_profile: policy.context_optimization_profile, context: { objective: c.query_text } });
      const assembleResp = await postJson(baseUrl, "/v1/memory/context/assemble", { ...common, context_optimization_profile: policy.context_optimization_profile, context: { objective: c.query_text } });
      rows.push({
        case_id: c.id,
        arm,
        query_text: c.query_text,
        critical_facts: c.critical_facts,
        results: {
          recall_text: buildSampleResult("recall_text", c.critical_facts, recallResp.body, recallResp.status, recallResp.ok),
          planning_context: buildSampleResult("planning_context", c.critical_facts, planningResp.body, planningResp.status, planningResp.ok),
          context_assemble: buildSampleResult("context_assemble", c.critical_facts, assembleResp.body, assembleResp.status, assembleResp.ok),
        },
      });
    }
  }

  const summary: any = { benchmark: "l5_serving_compaction", scope, fixture_file: fixtureFile, cases: fixture.cases.length, arms: {} };
  for (const arm of Object.keys(arms) as ArmName[]) {
    const armRows = rows.filter((r) => r.arm === arm);
    const samples = armRows.flatMap((r) => Object.values(r.results));
    summary.arms[arm] = {
      avg_fact_recall_rate: mean(samples.map((s) => s.fact_recall_rate)),
      avg_context_est_tokens: mean(samples.map((s) => s.context_est_tokens)),
      avg_context_chars: mean(samples.map((s) => s.context_chars)),
      selected_memory_layers: uniqueSorted(samples.flatMap((s) => s.selected_memory_layers)),
      retrieved_memory_layers: uniqueSorted(samples.flatMap((s) => s.retrieved_memory_layers)),
      endpoints: Object.fromEntries((["recall_text", "planning_context", "context_assemble"] as EndpointName[]).map((endpoint) => {
        const endpointRows = armRows.map((r) => r.results[endpoint]);
        return [endpoint, {
          avg_fact_recall_rate: mean(endpointRows.map((s) => s.fact_recall_rate)),
          avg_context_est_tokens: mean(endpointRows.map((s) => s.context_est_tokens)),
          avg_context_chars: mean(endpointRows.map((s) => s.context_chars)),
          selected_memory_layers: uniqueSorted(endpointRows.flatMap((s) => s.selected_memory_layers)),
        }];
      })),
    };
  }
  writeFileSync(path.join(outDir, "cases.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(path.join(outDir, "report.md"), renderReport(summary));
  console.log(JSON.stringify({ out_dir: outDir, summary }, null, 2));
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
