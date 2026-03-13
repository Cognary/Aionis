import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fakeEmbed } from "../embeddings/fake.js";
import { stableUuid } from "../util/uuid.js";

type RecordKind = "L1_evidence" | "L1_fact" | "L2_topic" | "L3_rollup";
type FixtureRecord = {
  key: string;
  kind?: RecordKind;
  title: string;
  text_summary: string;
};

type FixtureCase = {
  id: string;
  query_text: string;
  critical_facts: string[];
};

type Fixture = {
  actor: string;
  context_char_budget: number;
  context_token_budget: number;
  records: FixtureRecord[];
  cases: FixtureCase[];
};

type EndpointName = "recall_text" | "planning_context" | "context_assemble";
type ArmName = "l0_plus_l1_plus_l2" | "l0_plus_l1_plus_l2_plus_l3";

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

type CaseResult = {
  case_id: string;
  arm: ArmName;
  query_text: string;
  critical_facts: string[];
  results: Record<EndpointName, SampleResult>;
};

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}

function rootDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function nowTag(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function readFixture(file: string): Fixture {
  return JSON.parse(readFileSync(file, "utf8")) as Fixture;
}

function nodeId(scope: string, key: string): string {
  return stableUuid(`${scope}:l3-deterministic-compression:${key}`);
}

function edgeId(scope: string, src: string, dst: string): string {
  return stableUuid(`${scope}:l3-deterministic-compression:edge:${src}:${dst}`);
}

function makePayload(fixture: Fixture, scope: string, tenantId: string) {
  const eventRecords = fixture.records.filter((record) => !record.kind);
  const l1Records = fixture.records.filter((record) => record.kind === "L1_evidence" || record.kind === "L1_fact");
  const l2Records = fixture.records.filter((record) => record.kind === "L2_topic");
  const l3Records = fixture.records.filter((record) => record.kind === "L3_rollup");

  const events = eventRecords.map((record) => ({
    id: nodeId(scope, record.key),
    scope,
    type: "event",
    tier: "hot",
    title: record.title,
    text_summary: record.text_summary,
    raw_ref: `seed://l3-deterministic-compression/${record.key}`,
    slots: { lifecycle_state: "active", compression_layer: "L0" },
    salience: 0.92,
    importance: 0.9,
    confidence: 0.97,
    embedding_model: "fake:deterministic",
    embedding: fakeEmbed(record.text_summary),
    memory_lane: "shared",
  }));

  const l1Nodes = l1Records.map((record) => ({
    id: nodeId(scope, record.key),
    scope,
    type: record.kind === "L1_evidence" ? "evidence" : "concept",
    tier: "warm",
    title: record.title,
    text_summary: record.text_summary,
    slots: {
      compression_layer: "L1",
      summary_kind: record.kind === "L1_evidence" ? "write_distillation_evidence" : "write_distillation_fact",
      distillation_kind: record.kind === "L1_evidence" ? "write_distilled_evidence" : "write_distilled_fact",
      source_event_ids: events.map((event) => event.id),
      citations: events.map((event) => event.id),
      lifecycle_state: "active",
    },
    salience: 0.95,
    importance: 0.94,
    confidence: 0.99,
    embedding_model: "fake:deterministic",
    embedding: fakeEmbed(record.text_summary),
    memory_lane: "shared",
  }));

  const l2Nodes = l2Records.map((record) => ({
    id: nodeId(scope, record.key),
    scope,
    type: "topic",
    tier: "warm",
    title: record.title,
    text_summary: record.text_summary,
    slots: {
      compression_layer: "L2",
      summary_kind: "topic_cluster",
      source_event_ids: events.map((event) => event.id),
      citations: [...events.map((event) => event.id), ...l1Nodes.map((node) => node.id)],
      lifecycle_state: "active",
    },
    salience: 0.96,
    importance: 0.95,
    confidence: 0.98,
    embedding_model: "fake:deterministic",
    embedding: fakeEmbed(record.text_summary),
    memory_lane: "shared",
  }));

  const l3Nodes = l3Records.map((record) => ({
    id: nodeId(scope, record.key),
    scope,
    type: "concept",
    tier: "warm",
    title: record.title,
    text_summary: record.text_summary,
    slots: {
      compression_layer: "L3",
      summary_kind: "compression_rollup",
      source_event_ids: events.map((event) => event.id),
      citations: [...events.map((event) => event.id), ...l2Nodes.map((node) => node.id)],
      lifecycle_state: "active",
    },
    salience: 0.97,
    importance: 0.96,
    confidence: 0.99,
    embedding_model: "fake:deterministic",
    embedding: fakeEmbed(record.text_summary),
    memory_lane: "shared",
  }));

  const edges = [
    ...l1Nodes.flatMap((node) => events.map((event) => ({ id: edgeId(scope, node.id, event.id), scope, type: "derived_from", src: { id: node.id }, dst: { id: event.id }, weight: 0.92, confidence: 0.95 }))),
    ...l2Nodes.flatMap((node) => [...events, ...l1Nodes].map((source) => ({ id: edgeId(scope, node.id, source.id), scope, type: "derived_from", src: { id: node.id }, dst: { id: source.id }, weight: 0.9, confidence: 0.94 }))),
    ...l3Nodes.flatMap((node) => [...events, ...l2Nodes].map((source) => ({ id: edgeId(scope, node.id, source.id), scope, type: "derived_from", src: { id: node.id }, dst: { id: source.id }, weight: 0.91, confidence: 0.95 }))),
  ];

  return {
    tenant_id: tenantId,
    scope,
    actor: fixture.actor,
    auto_embed: false,
    memory_lane: "shared",
    input_text: "l3 deterministic compression benchmark seed corpus",
    nodes: [...events, ...l1Nodes, ...l2Nodes, ...l3Nodes],
    edges,
  };
}

async function postJson(baseUrl: string, endpoint: string, body: unknown, extraHeaders?: Record<string, string>) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(extraHeaders ?? {}) },
    body: JSON.stringify(body),
  });
  let parsed: any = null;
  try { parsed = await response.json(); } catch { parsed = null; }
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
  const selectedLayers = Array.isArray(costSignals?.selected_memory_layers) ? costSignals.selected_memory_layers.map((entry: unknown) => String(entry)) : [];
  const retrievedLayers = Array.isArray(selectionStats?.retrieved_memory_layers) ? selectionStats.retrieved_memory_layers.map((entry: unknown) => String(entry)) : [];
  return {
    endpoint,
    status,
    ok,
    context_est_tokens: Number(costSignals?.context_est_tokens ?? body?.planning_summary?.context_est_tokens ?? body?.assembly_summary?.context_est_tokens ?? 0),
    selected_memory_layers: selectedLayers,
    retrieved_memory_layers: retrievedLayers,
    context_chars: text.length,
    critical_facts_found: found,
    critical_facts_missing: missing,
    fact_recall_rate: criticalFacts.length > 0 ? Number((found.length / criticalFacts.length).toFixed(6)) : 1,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6));
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function renderReport(summary: any): string {
  const lines: string[] = [];
  lines.push("# L3 Deterministic Compression Benchmark");
  lines.push("");
  lines.push(`- scope: \`${summary.scope}\``);
  lines.push(`- fixture: \`${summary.fixture_file}\``);
  lines.push(`- cases: \`${summary.cases}\``);
  lines.push("");
  for (const arm of ["l0_plus_l1_plus_l2", "l0_plus_l1_plus_l2_plus_l3"] as ArmName[]) {
    const armSummary = summary.arms[arm];
    lines.push(`## ${arm}`);
    lines.push("");
    lines.push(`- avg_fact_recall_rate: \`${armSummary.avg_fact_recall_rate}\``);
    lines.push(`- avg_context_est_tokens: \`${armSummary.avg_context_est_tokens}\``);
    lines.push(`- avg_context_chars: \`${armSummary.avg_context_chars}\``);
    lines.push(`- selected_memory_layers: \`${armSummary.selected_memory_layers.join(", ")}\``);
    lines.push("");
    lines.push("| endpoint | avg_fact_recall_rate | avg_context_est_tokens | avg_context_chars | selected_memory_layers |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const endpoint of ["recall_text", "planning_context", "context_assemble"] as EndpointName[]) {
      const endpointSummary = armSummary.endpoint_breakdown[endpoint];
      lines.push(`| ${endpoint} | \`${endpointSummary.avg_fact_recall_rate}\` | \`${endpointSummary.avg_context_est_tokens}\` | \`${endpointSummary.avg_context_chars}\` | \`${endpointSummary.selected_memory_layers.join(", ")}\` |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const root = rootDir();
  const baseUrl = (argValue("--base-url") ?? "http://127.0.0.1:3321").replace(/\/$/, "");
  const fixtureFile = path.resolve(argValue("--fixture-file") ?? path.join(root, "src/jobs/fixtures/l3-deterministic-compression-click-v1.json"));
  const tenantId = argValue("--tenant-id") ?? "default";
  const scope = argValue("--scope") ?? `l3_deterministic_compression_${nowTag()}`;
  const outputDir = path.resolve(argValue("--output-dir") ?? path.join(root, "artifacts/benchmarks/l3-deterministic-compression", nowTag()));
  mkdirSync(outputDir, { recursive: true });

  const fixture = readFixture(fixtureFile);
  const writePayload = makePayload(fixture, scope, tenantId);
  const writeOut = await postJson(baseUrl, "/v1/memory/write", writePayload);
  if (!writeOut.ok) throw new Error(`write failed: status=${writeOut.status} body=${JSON.stringify(writeOut.body)}`);

  const arms: Record<ArmName, string[]> = {
    l0_plus_l1_plus_l2: ["L0", "L1", "L2"],
    l0_plus_l1_plus_l2_plus_l3: ["L0", "L1", "L2", "L3"],
  };

  const caseRows: CaseResult[] = [];
  for (const [arm, allowedLayers] of Object.entries(arms) as Array<[ArmName, string[]]>) {
    for (const item of fixture.cases) {
      const common = {
        tenant_id: tenantId,
        scope,
        query_text: item.query_text,
        memory_layer_preference: { allowed_layers: allowedLayers },
        context_char_budget: fixture.context_char_budget,
        context_token_budget: fixture.context_token_budget,
      };
      const layerIsolationHeaders = {
        "x-aionis-internal-allow-drop-trust-anchors": "true",
        "x-aionis-internal-apply-layer-policy-to-retrieval": "true",
      };
      const recallOut = await postJson(baseUrl, "/v1/memory/recall_text", { ...common, return_debug: true }, layerIsolationHeaders);
      const planningOut = await postJson(baseUrl, "/v1/memory/planning/context", { ...common, tool_candidates: ["rg", "pytest"], context: { intent: "analysis", repo: "benchmark" } }, layerIsolationHeaders);
      const assembleOut = await postJson(baseUrl, "/v1/memory/context/assemble", { ...common, tool_candidates: ["rg", "pytest"], context: { intent: "analysis", repo: "benchmark" }, return_layered_context: true }, layerIsolationHeaders);
      caseRows.push({
        case_id: item.id,
        arm,
        query_text: item.query_text,
        critical_facts: item.critical_facts,
        results: {
          recall_text: buildSampleResult("recall_text", item.critical_facts, recallOut.body, recallOut.status, recallOut.ok),
          planning_context: buildSampleResult("planning_context", item.critical_facts, planningOut.body, planningOut.status, planningOut.ok),
          context_assemble: buildSampleResult("context_assemble", item.critical_facts, assembleOut.body, assembleOut.status, assembleOut.ok),
        },
      });
    }
  }

  const summary: any = {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    tenant_id: tenantId,
    scope,
    fixture_file: fixtureFile,
    cases: fixture.cases.length,
    write_status: writeOut.status,
    arms: {},
  };

  for (const arm of Object.keys(arms) as ArmName[]) {
    const armRows = caseRows.filter((row) => row.arm === arm);
    const samples = armRows.flatMap((row) => Object.values(row.results));
    summary.arms[arm] = {
      avg_fact_recall_rate: mean(samples.map((sample) => sample.fact_recall_rate)),
      avg_context_est_tokens: mean(samples.map((sample) => sample.context_est_tokens)),
      avg_context_chars: mean(samples.map((sample) => sample.context_chars)),
      selected_memory_layers: uniqueSorted(samples.flatMap((sample) => sample.selected_memory_layers)),
      retrieved_memory_layers: uniqueSorted(samples.flatMap((sample) => sample.retrieved_memory_layers)),
      endpoint_breakdown: Object.fromEntries(
        (["recall_text", "planning_context", "context_assemble"] as EndpointName[]).map((endpoint) => {
          const endpointRows = armRows.map((row) => row.results[endpoint]);
          return [endpoint, {
            avg_fact_recall_rate: mean(endpointRows.map((sample) => sample.fact_recall_rate)),
            avg_context_est_tokens: mean(endpointRows.map((sample) => sample.context_est_tokens)),
            avg_context_chars: mean(endpointRows.map((sample) => sample.context_chars)),
            selected_memory_layers: uniqueSorted(endpointRows.flatMap((sample) => sample.selected_memory_layers)),
          }];
        }),
      ),
    };
  }

  writeFileSync(path.join(outputDir, "cases.jsonl"), `${caseRows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  writeFileSync(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeFileSync(path.join(outputDir, "report.md"), renderReport(summary), "utf8");
  process.stdout.write(`${JSON.stringify({ output_dir: outputDir, scope, summary }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
