import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function extractLastJsonLine(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

function runSnippet(source) {
  const out = execFileSync("npx", ["tsx", "-e", source], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  return extractLastJsonLine(out);
}

test("promotion only upgrades high-confidence candidates into canonical related_to edges", () => {
  const output = runSnippet(`
    import { promoteAssociativeCandidates } from "./src/jobs/associative-linking-lib.ts";

    const candidateRows = [
      {
        id: "assoc-1",
        scope: "default",
        src_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        dst_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        relation_kind: "same_task",
        status: "shadow",
        score: 0.95,
        confidence: 0.93,
        feature_summary_json: { embedding_similarity: 0.99 },
        evidence_json: {},
        source_commit_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        worker_run_id: null,
        promoted_edge_id: null,
        created_at: "2026-03-16T09:00:00.000Z",
        updated_at: "2026-03-16T09:00:00.000Z",
      },
      {
        id: "assoc-2",
        scope: "default",
        src_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        dst_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        relation_kind: "supports",
        status: "shadow",
        score: 0.61,
        confidence: 0.7,
        feature_summary_json: { embedding_similarity: 0.78 },
        evidence_json: {},
        source_commit_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        worker_run_id: null,
        promoted_edge_id: null,
        created_at: "2026-03-16T09:01:00.000Z",
        updated_at: "2026-03-16T09:01:00.000Z",
      },
    ];

    const edges = [];

    const main = async () => {
      const out = await promoteAssociativeCandidates({
        scope: "default",
        sourceNodeIds: ["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"],
        writeAccess: {
          async listAssociationCandidatesForSource({ scope, src_id }) {
            return candidateRows.filter((row) => row.scope === scope && row.src_id === src_id);
          },
          async upsertEdge(edge) {
            edges.push(edge);
          },
          async markAssociationCandidatePromoted({ scope, src_id, dst_id, relation_kind, promoted_edge_id }) {
            const row = candidateRows.find(
              (candidate) =>
                candidate.scope === scope
                && candidate.src_id === src_id
                && candidate.dst_id === dst_id
                && candidate.relation_kind === relation_kind,
            );
            if (!row) return;
            row.status = "promoted";
            row.promoted_edge_id = promoted_edge_id;
          },
          async updateAssociationCandidateStatus({ scope, src_id, dst_id, relation_kind, status }) {
            const row = candidateRows.find(
              (candidate) =>
                candidate.scope === scope
                && candidate.src_id === src_id
                && candidate.dst_id === dst_id
                && candidate.relation_kind === relation_kind,
            );
            if (!row) return;
            row.status = status;
          },
        },
      });

      process.stdout.write(JSON.stringify({ out, edges, candidateRows }));
    };

    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(output);
  assert.equal(parsed.out.promoted, 1);
  assert.equal(parsed.edges.length, 1);
  assert.equal(parsed.edges[0].type, "related_to");
  assert.equal(parsed.edges[0].srcId, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  assert.equal(parsed.edges[0].dstId, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
  const promoted = parsed.candidateRows.find((row) => row.id === "assoc-1");
  const lowConfidence = parsed.candidateRows.find((row) => row.id === "assoc-2");
  assert.equal(promoted.status, "promoted");
  assert.equal(typeof promoted.promoted_edge_id, "string");
  assert.equal(lowConfidence.status, "rejected");
  assert.equal(lowConfidence.promoted_edge_id, null);
});
