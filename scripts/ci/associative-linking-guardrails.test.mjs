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

test("associative guardrails reject cross-scope rows, prevent self-loops, and expose worker metrics", () => {
  const output = runSnippet(`
    import {
      isValidAssociativeCandidateStatusTransition,
      promoteAssociativeCandidates,
      runAssociativeLinkingJob,
    } from "./src/jobs/associative-linking-lib.ts";

    const shadowRows = [];
    const edges = [];
    const promotionCandidates = [
      {
        id: "assoc-self-loop",
        scope: "default",
        src_id: "11111111-1111-1111-1111-111111111111",
        dst_id: "11111111-1111-1111-1111-111111111111",
        relation_kind: "same_task",
        status: "shadow",
        score: 0.97,
        confidence: 0.95,
        feature_summary_json: {},
        evidence_json: {},
        source_commit_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        worker_run_id: null,
        promoted_edge_id: null,
        created_at: "2026-03-16T10:00:00.000Z",
        updated_at: "2026-03-16T10:00:00.000Z",
      },
    ];

    const main = async () => {
      const workerOut = await runAssociativeLinkingJob({
        payload: {
          origin: "memory_write",
          scope: "default",
          source_node_ids: ["11111111-1111-1111-1111-111111111111"],
          source_commit_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        },
        recallAccess: {
          async listAssociativeNodesByIds() {
            return [
              {
                id: "11111111-1111-1111-1111-111111111111",
                scope: "default",
                type: "event",
                title: "repair token drift",
                text_summary: "Repair gateway token drift",
                slots: {
                  resume_anchor: {
                    anchor: "repair-token-drift",
                    repo_root: "/repo",
                    file_path: "src/gateway/service-token.ts",
                  },
                },
                embedding_text: "[1,0,0]",
                created_at: "2026-03-16T10:00:00.000Z",
                updated_at: "2026-03-16T10:00:00.000Z",
                commit_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
              },
            ];
          },
          async listAssociativeCandidatePool() {
            return [
              {
                id: "22222222-2222-2222-2222-222222222222",
                scope: "default",
                type: "evidence",
                title: "same scope evidence",
                text_summary: "Validation notes on same file",
                slots: {
                  resume_anchor: {
                    anchor: "repair-token-drift",
                    repo_root: "/repo",
                    file_path: "src/gateway/service-token.ts",
                  },
                },
                embedding_text: "[0.99,0.01,0]",
                created_at: "2026-03-16T09:58:00.000Z",
                updated_at: "2026-03-16T09:58:00.000Z",
                commit_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
              },
              {
                id: "33333333-3333-3333-3333-333333333333",
                scope: "other-scope",
                type: "evidence",
                title: "cross scope evidence",
                text_summary: "Should be rejected by guardrail",
                slots: {},
                embedding_text: "[0.97,0.03,0]",
                created_at: "2026-03-16T09:59:00.000Z",
                updated_at: "2026-03-16T09:59:00.000Z",
                commit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
              },
            ];
          },
        },
        writeAccess: {
          async upsertAssociationCandidates(rows) {
            shadowRows.push(...rows);
          },
          async listAssociationCandidatesForSource() {
            return [];
          },
          async updateAssociationCandidateStatus() {},
        },
      });

      const promotionOut = await promoteAssociativeCandidates({
        scope: "default",
        sourceNodeIds: ["11111111-1111-1111-1111-111111111111"],
        writeAccess: {
          async listAssociationCandidatesForSource() {
            return promotionCandidates;
          },
          async upsertEdge(edge) {
            edges.push(edge);
          },
          async markAssociationCandidatePromoted() {},
          async updateAssociationCandidateStatus() {},
        },
      });

      process.stdout.write(JSON.stringify({
        workerOut,
        shadowRows,
        promotionOut,
        edges,
        transitions: {
          shadow_to_promoted: isValidAssociativeCandidateStatusTransition("shadow", "promoted"),
          promoted_to_shadow: isValidAssociativeCandidateStatusTransition("promoted", "shadow"),
        },
      }));
    };

    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(output);
  assert.equal(parsed.workerOut.shadow_created, 1);
  assert.equal(parsed.workerOut.promoted, 0);
  assert.equal(parsed.workerOut.rejected >= 1, true);
  assert.equal(parsed.shadowRows.length, 1);
  assert.equal(parsed.shadowRows[0].scope, "default");
  assert.equal(parsed.promotionOut.promoted, 0);
  assert.equal(parsed.promotionOut.rejected >= 1, true);
  assert.equal(parsed.edges.length, 0);
  assert.equal(parsed.transitions.shadow_to_promoted, true);
  assert.equal(parsed.transitions.promoted_to_shadow, false);
});
