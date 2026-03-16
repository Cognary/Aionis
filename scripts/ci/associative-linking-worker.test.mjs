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

test("associative worker materializes shadow candidates with relation and feature metadata", () => {
  const output = runSnippet(`
    import { runAssociativeLinkingJob } from "./src/jobs/associative-linking-lib.ts";

    const sourceNodes = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        scope: "default",
        type: "event",
        title: "repair gateway token drift",
        text_summary: "Trace and repair gateway token drift",
        slots: {
          resume_anchor: {
            anchor: "repair-token-drift",
            repo_root: "/repo",
            file_path: "src/gateway/service-token.ts",
            symbol: "repairServiceTokenDrift",
          },
          execution_state_v1: {
            pending_validations: ["npm run build"],
            rollback_notes: ["preserve token refresh semantics"],
          },
        },
        embedding_text: "[1,0,0]",
        created_at: "2026-03-16T08:00:00.000Z",
        updated_at: "2026-03-16T08:00:00.000Z",
        commit_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      },
    ];

    const candidatePool = [
      {
        id: "22222222-2222-2222-2222-222222222222",
        scope: "default",
        type: "evidence",
        title: "gateway token smoke result",
        text_summary: "Service token drift validation on same file",
        slots: {
          resume_anchor: {
            anchor: "repair-token-drift",
            repo_root: "/repo",
            file_path: "src/gateway/service-token.ts",
            symbol: "repairServiceTokenDrift",
          },
          execution_ready_handoff: {
            acceptance_checks: ["npm run build"],
          },
        },
        embedding_text: "[0.98,0.02,0]",
        created_at: "2026-03-16T07:58:00.000Z",
        updated_at: "2026-03-16T07:58:00.000Z",
        commit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      },
      {
        id: "33333333-3333-3333-3333-333333333333",
        scope: "default",
        type: "procedure",
        title: "gateway rollback notes",
        text_summary: "Follow-on validation and rollback checklist",
        slots: {
          execution_state_v1: {
            completed_validations: ["npm run build"],
            rollback_notes: ["preserve token refresh semantics"],
          },
        },
        embedding_text: "[0.76,0.24,0]",
        created_at: "2026-03-16T08:03:00.000Z",
        updated_at: "2026-03-16T08:03:00.000Z",
        commit_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      },
    ];

    const upserts = [];

    const main = async () => {
      const out = await runAssociativeLinkingJob({
        payload: {
          origin: "memory_write",
          scope: "default",
          source_node_ids: ["11111111-1111-1111-1111-111111111111"],
          source_commit_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        },
        recallAccess: {
          async listAssociativeNodesByIds(scope, ids) {
            return sourceNodes.filter((row) => row.scope === scope && ids.includes(row.id));
          },
          async listAssociativeCandidatePool(scope, excludeIds) {
            return candidatePool.filter((row) => row.scope === scope && !excludeIds.includes(row.id));
          },
        },
        writeAccess: {
          async upsertAssociationCandidates(rows) {
            upserts.push(...rows);
          },
          async listAssociationCandidatesForSource() {
            return [];
          },
          async updateAssociationCandidateStatus() {},
        },
      });

      process.stdout.write(JSON.stringify({ out, upserts }));
    };

    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(output);
  assert.equal(parsed.out.shadow_created, 2);
  assert.equal(parsed.upserts.length, 2);
  assert.equal(parsed.upserts.every((row) => row.status === "shadow"), true);
  assert.equal(parsed.upserts.some((row) => row.relation_kind === "same_task"), true);
  assert.equal(parsed.upserts.some((row) => row.relation_kind === "supports" || row.relation_kind === "extends"), true);
  assert.equal(parsed.upserts.every((row) => typeof row.score === "number" && typeof row.confidence === "number"), true);
  assert.equal(parsed.upserts.every((row) => typeof row.feature_summary_json.embedding_similarity === "number"), true);
});

test("associative worker persists rejected candidates and expires stale shadow candidates", () => {
  const output = runSnippet(`
    import { runAssociativeLinkingJob } from "./src/jobs/associative-linking-lib.ts";

    const writes = [];
    const updates = [];

    const sourceNodes = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        scope: "default",
        type: "event",
        title: "repair gateway token drift",
        text_summary: "Trace and repair gateway token drift",
        slots: {
          resume_anchor: {
            anchor: "repair-token-drift",
            repo_root: "/repo",
            file_path: "src/gateway/service-token.ts",
            symbol: "repairServiceTokenDrift",
          },
        },
        embedding_text: "[1,0,0]",
        created_at: "2026-03-16T08:00:00.000Z",
        updated_at: "2026-03-16T08:00:00.000Z",
        commit_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      },
    ];

    const candidatePool = [
      {
        id: "22222222-2222-2222-2222-222222222222",
        scope: "default",
        type: "evidence",
        title: "gateway token smoke result",
        text_summary: "Service token drift validation on same file",
        slots: {
          resume_anchor: {
            anchor: "repair-token-drift",
            repo_root: "/repo",
            file_path: "src/gateway/service-token.ts",
            symbol: "repairServiceTokenDrift",
          },
        },
        embedding_text: "[0.98,0.02,0]",
        created_at: "2026-03-16T07:58:00.000Z",
        updated_at: "2026-03-16T07:58:00.000Z",
        commit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      },
      {
        id: "33333333-3333-3333-3333-333333333333",
        scope: "default",
        type: "procedure",
        title: "unrelated checklist",
        text_summary: "Document cafeteria badge pickup",
        slots: {},
        embedding_text: "[0,1,0]",
        created_at: "2026-03-15T08:03:00.000Z",
        updated_at: "2026-03-15T08:03:00.000Z",
        commit_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      },
    ];

    const main = async () => {
      const out = await runAssociativeLinkingJob({
        payload: {
          origin: "memory_write",
          scope: "default",
          source_node_ids: ["11111111-1111-1111-1111-111111111111"],
          source_commit_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        },
        recallAccess: {
          async listAssociativeNodesByIds(scope, ids) {
            return sourceNodes.filter((row) => row.scope === scope && ids.includes(row.id));
          },
          async listAssociativeCandidatePool(scope, excludeIds) {
            return candidatePool.filter((row) => row.scope === scope && !excludeIds.includes(row.id));
          },
        },
        writeAccess: {
          async upsertAssociationCandidates(rows) {
            writes.push(...rows);
          },
          async listAssociationCandidatesForSource() {
            return [
              {
                id: "assoc-stale",
                scope: "default",
                src_id: "11111111-1111-1111-1111-111111111111",
                dst_id: "44444444-4444-4444-4444-444444444444",
                relation_kind: "supports",
                status: "shadow",
                score: 0.73,
                confidence: 0.72,
                feature_summary_json: {},
                evidence_json: {},
                source_commit_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
                worker_run_id: null,
                promoted_edge_id: null,
                created_at: "2026-03-16T07:00:00.000Z",
                updated_at: "2026-03-16T07:00:00.000Z",
              },
            ];
          },
          async updateAssociationCandidateStatus(args) {
            updates.push(args);
          },
        },
      });

      process.stdout.write(JSON.stringify({ out, writes, updates }));
    };

    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(output);
  assert.equal(parsed.out.shadow_created, 1);
  assert.equal(parsed.out.rejected >= 1, true);
  assert.equal(parsed.writes.some((row) => row.status === "shadow" && row.dst_id === "22222222-2222-2222-2222-222222222222"), true);
  assert.equal(parsed.writes.some((row) => row.status === "rejected" && row.dst_id === "33333333-3333-3333-3333-333333333333"), true);
  assert.equal(parsed.updates.some((row) => row.status === "expired" && row.dst_id === "44444444-4444-4444-4444-444444444444"), true);
});

test("embed follow-up helper enqueues deferred associative_link after successful embedding", () => {
  const output = runSnippet(`
    import { enqueueDeferredAssociativeLinkFollowup } from "./src/jobs/associative-linking-lib.ts";

    const inserts = [];

    const main = async () => {
      const enqueued = await enqueueDeferredAssociativeLinkFollowup({
        scope: "default",
        commitId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        embedPayload: {
          nodes: [
            { id: "11111111-1111-1111-1111-111111111111", text: "repair token drift" },
          ],
          after_associative_link: {
            origin: "memory_write",
            source_node_ids: ["11111111-1111-1111-1111-111111111111"],
            source_commit_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
          },
        },
        writeAccess: {
          async insertOutboxEvent(args) {
            inserts.push(args);
          },
        },
      });

      process.stdout.write(JSON.stringify({ enqueued, inserts }));
    };

    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(output);
  assert.equal(parsed.enqueued, true);
  assert.equal(parsed.inserts.length, 1);
  assert.equal(parsed.inserts[0].eventType, "associative_link");
  const payload = JSON.parse(parsed.inserts[0].payloadJson);
  assert.equal(payload.origin, "memory_write");
  assert.equal(payload.scope, "default");
  assert.equal(payload.source_commit_id, "dddddddd-dddd-dddd-dddd-dddddddddddd");
  assert.deepEqual(payload.source_node_ids, ["11111111-1111-1111-1111-111111111111"]);
});
