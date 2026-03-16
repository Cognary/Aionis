import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const require = createRequire(import.meta.url);

const LITE_SQLITE_UNAVAILABLE =
  (() => {
    try {
      const mod = require("node:sqlite");
      return typeof mod?.DatabaseSync !== "function";
    } catch {
      return true;
    }
  })()
    ? "requires Node.js with node:sqlite support"
    : false;

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

test("postgres write access persists associative candidates with upsert semantics", () => {
  const output = runSnippet(`
    import { createPostgresWriteStoreAccess } from "./src/store/write-access.ts";

    class AssociationCandidateFixturePgClient {
      #rows = new Map();

      async query(sql, params = []) {
        const normalized = sql.replace(/\\s+/g, " ").trim();

        if (normalized.includes("INSERT INTO memory_association_candidates")) {
          const key = [params[0], params[1], params[2], params[3]].join(":");
          const current = this.#rows.get(key);
          const preservePromoted = current?.status === "promoted" && String(params[4]) === "shadow";
          this.#rows.set(key, {
            id: current?.id ?? \`assoc-\${this.#rows.size + 1}\`,
            scope: String(params[0]),
            src_id: String(params[1]),
            dst_id: String(params[2]),
            relation_kind: String(params[3]),
            status: preservePromoted ? current.status : String(params[4]),
            score: Number(params[5]),
            confidence: Number(params[6]),
            feature_summary_json: params[7] ?? {},
            evidence_json: params[8] ?? {},
            source_commit_id: params[9] == null ? null : String(params[9]),
            worker_run_id: params[10] == null ? null : String(params[10]),
            promoted_edge_id: preservePromoted ? current.promoted_edge_id : (params[11] == null ? null : String(params[11])),
            created_at: current?.created_at ?? "2026-03-16T00:00:00.000Z",
            updated_at: "2026-03-16T00:00:01.000Z",
          });
          return { rows: [], rowCount: 1 };
        }

        if (normalized.includes("SELECT id::text, scope, src_id::text, dst_id::text")) {
          const scope = String(params[0]);
          const srcId = String(params[1]);
          const rows = [...this.#rows.values()]
            .filter((row) => row.scope === scope && row.src_id === srcId)
            .sort((a, b) => b.score - a.score || b.confidence - a.confidence)
            .map((row) => ({ ...row }));
          return { rows, rowCount: rows.length };
        }

        if (normalized.includes("UPDATE memory_association_candidates")) {
          const key = [params[0], params[1], params[2], params[3]].join(":");
          const current = this.#rows.get(key);
          if (!current) return { rows: [], rowCount: 0 };
          this.#rows.set(key, {
            ...current,
            status: "promoted",
            promoted_edge_id: String(params[4]),
            updated_at: "2026-03-16T00:00:02.000Z",
          });
          return { rows: [], rowCount: 1 };
        }

        throw new Error(\`AssociationCandidateFixturePgClient: unhandled query shape: \${normalized.slice(0, 200)}...\`);
      }
    }

    const main = async () => {
      const store = createPostgresWriteStoreAccess(new AssociationCandidateFixturePgClient());
      await store.upsertAssociationCandidates([
        {
          scope: "default",
          src_id: "11111111-1111-1111-1111-111111111111",
          dst_id: "22222222-2222-2222-2222-222222222222",
          relation_kind: "same_task",
          status: "shadow",
          score: 0.91,
          confidence: 0.88,
          feature_summary_json: { repo_root: "/repo", file_path: "src/a.ts" },
          evidence_json: { validation_targets: ["npm run build"] },
          source_commit_id: "33333333-3333-3333-3333-333333333333",
          worker_run_id: "worker-1",
          promoted_edge_id: null,
        },
      ]);

      await store.upsertAssociationCandidates([
        {
          scope: "default",
          src_id: "11111111-1111-1111-1111-111111111111",
          dst_id: "22222222-2222-2222-2222-222222222222",
          relation_kind: "same_task",
          status: "shadow",
          score: 0.93,
          confidence: 0.9,
          feature_summary_json: { repo_root: "/repo", file_path: "src/a.ts", symbol: "repairToken" },
          evidence_json: { validation_targets: ["npm run build"] },
          source_commit_id: "33333333-3333-3333-3333-333333333333",
          worker_run_id: "worker-2",
          promoted_edge_id: null,
        },
      ]);

      await store.markAssociationCandidatePromoted({
        scope: "default",
        src_id: "11111111-1111-1111-1111-111111111111",
        dst_id: "22222222-2222-2222-2222-222222222222",
        relation_kind: "same_task",
        promoted_edge_id: "44444444-4444-4444-4444-444444444444",
      });

      await store.upsertAssociationCandidates([
        {
          scope: "default",
          src_id: "11111111-1111-1111-1111-111111111111",
          dst_id: "22222222-2222-2222-2222-222222222222",
          relation_kind: "same_task",
          status: "shadow",
          score: 0.99,
          confidence: 0.97,
          feature_summary_json: { repo_root: "/repo", file_path: "src/a.ts", symbol: "repairTokenLater" },
          evidence_json: { validation_targets: ["npm run build", "npm test"] },
          source_commit_id: "55555555-5555-5555-5555-555555555555",
          worker_run_id: "worker-3",
          promoted_edge_id: null,
        },
      ]);

      const rows = await store.listAssociationCandidatesForSource({
        scope: "default",
        src_id: "11111111-1111-1111-1111-111111111111",
      });

      process.stdout.write(JSON.stringify(rows));
    };

    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const rows = JSON.parse(output);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].score, 0.99);
  assert.equal(rows[0].status, "promoted");
  assert.equal(rows[0].promoted_edge_id, "44444444-4444-4444-4444-444444444444");
  assert.deepEqual(rows[0].feature_summary_json, {
    repo_root: "/repo",
    file_path: "src/a.ts",
    symbol: "repairTokenLater",
  });
});

test("lite write store persists associative candidates with upsert semantics", { skip: LITE_SQLITE_UNAVAILABLE }, () => {
  const output = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import { tmpdir } from "node:os";
    import path from "node:path";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";

    const main = async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "aionis-associative-store-"));
      const sqlitePath = path.join(dir, "memory.sqlite");
      const store = createLiteWriteStore(sqlitePath);
      try {
        await store.upsertAssociationCandidates([
          {
            scope: "default",
            src_id: "11111111-1111-1111-1111-111111111111",
            dst_id: "22222222-2222-2222-2222-222222222222",
            relation_kind: "same_task",
            status: "shadow",
            score: 0.91,
            confidence: 0.88,
            feature_summary_json: { repo_root: "/repo", file_path: "src/a.ts" },
            evidence_json: { validation_targets: ["npm run build"] },
            source_commit_id: "33333333-3333-3333-3333-333333333333",
            worker_run_id: "worker-1",
            promoted_edge_id: null,
          },
        ]);

        await store.upsertAssociationCandidates([
          {
            scope: "default",
            src_id: "11111111-1111-1111-1111-111111111111",
            dst_id: "22222222-2222-2222-2222-222222222222",
            relation_kind: "same_task",
            status: "shadow",
            score: 0.93,
            confidence: 0.9,
            feature_summary_json: { repo_root: "/repo", file_path: "src/a.ts", symbol: "repairToken" },
            evidence_json: { validation_targets: ["npm run build"] },
            source_commit_id: "33333333-3333-3333-3333-333333333333",
            worker_run_id: "worker-2",
            promoted_edge_id: null,
          },
        ]);

        await store.markAssociationCandidatePromoted({
          scope: "default",
          src_id: "11111111-1111-1111-1111-111111111111",
          dst_id: "22222222-2222-2222-2222-222222222222",
          relation_kind: "same_task",
          promoted_edge_id: "44444444-4444-4444-4444-444444444444",
        });

        await store.upsertAssociationCandidates([
          {
            scope: "default",
            src_id: "11111111-1111-1111-1111-111111111111",
            dst_id: "22222222-2222-2222-2222-222222222222",
            relation_kind: "same_task",
            status: "shadow",
            score: 0.99,
            confidence: 0.97,
            feature_summary_json: { repo_root: "/repo", file_path: "src/a.ts", symbol: "repairTokenLater" },
            evidence_json: { validation_targets: ["npm run build", "npm test"] },
            source_commit_id: "55555555-5555-5555-5555-555555555555",
            worker_run_id: "worker-3",
            promoted_edge_id: null,
          },
        ]);

        const rows = await store.listAssociationCandidatesForSource({
          scope: "default",
          src_id: "11111111-1111-1111-1111-111111111111",
        });

        process.stdout.write(JSON.stringify(rows));
      } finally {
        await store.close();
        rmSync(dir, { recursive: true, force: true });
      }
    };

    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const rows = JSON.parse(output);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].score, 0.99);
  assert.equal(rows[0].status, "promoted");
  assert.equal(rows[0].promoted_edge_id, "44444444-4444-4444-4444-444444444444");
  assert.deepEqual(rows[0].feature_summary_json, {
    repo_root: "/repo",
    file_path: "src/a.ts",
    symbol: "repairTokenLater",
  });
});
