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

test("memory write defers associative_link into embed follow-up when relevant nodes are still pending embeddings", () => {
  const output = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import { DatabaseSync } from "node:sqlite";
    import { tmpdir } from "node:os";
    import path from "node:path";
    import { applyMemoryWrite, prepareMemoryWrite } from "./src/memory/write.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";

    const main = async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "aionis-associative-outbox-"));
      const sqlitePath = path.join(dir, "memory.sqlite");
      const store = createLiteWriteStore(sqlitePath);
      try {
        const prepared = await prepareMemoryWrite(
          {
            input_text: "Repair gateway session token drift",
            distill: { enabled: false },
            nodes: [
              {
                type: "event",
                title: "repair gateway token drift",
                text_summary: "Trace and repair the gateway session token drift",
                slots: {
                  resume_anchor: {
                    anchor: "repair-token-drift",
                    file_path: "src/gateway/service-token.ts",
                    repo_root: "/repo",
                    symbol: "repairServiceTokenDrift",
                  },
                },
              },
            ],
          },
          "default",
          "default",
          {
            maxTextLen: 4096,
            piiRedaction: false,
            allowCrossScopeEdges: false,
          },
          {},
        );

        const out = await store.withTx(() =>
          applyMemoryWrite({} as any, prepared, {
            maxTextLen: 4096,
            piiRedaction: false,
            allowCrossScopeEdges: false,
            shadowDualWriteEnabled: false,
            shadowDualWriteStrict: false,
            write_access: store as any,
          }),
        );

        const db = new DatabaseSync(sqlitePath);
        const rows = db.prepare("SELECT event_type, payload_json FROM lite_memory_outbox ORDER BY row_id ASC").all();
        db.close();

        process.stdout.write(JSON.stringify({ commit_id: out.commit_id, rows }));
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

  const parsed = JSON.parse(output);
  const eventTypes = parsed.rows.map((row) => row.event_type);
  assert.equal(eventTypes.includes("embed_nodes"), true);
  assert.equal(eventTypes.includes("associative_link"), false);
  const payload = JSON.parse(parsed.rows.find((row) => row.event_type === "embed_nodes").payload_json);
  assert.equal(payload.after_associative_link.origin, "memory_write");
  assert.equal(payload.after_associative_link.source_commit_id, parsed.commit_id);
  assert.ok(payload.after_associative_link.source_node_ids.length >= 1);
});

test("memory write enqueues immediate associative_link when source nodes already have embeddings", () => {
  const output = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import { DatabaseSync } from "node:sqlite";
    import { tmpdir } from "node:os";
    import path from "node:path";
    import { applyMemoryWrite, prepareMemoryWrite } from "./src/memory/write.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";

    const main = async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "aionis-associative-outbox-ready-"));
      const sqlitePath = path.join(dir, "memory.sqlite");
      const store = createLiteWriteStore(sqlitePath);
      try {
        const prepared = await prepareMemoryWrite(
          {
            input_text: "Repair gateway session token drift",
            distill: { enabled: false },
            nodes: [
              {
                type: "event",
                title: "repair gateway token drift",
                text_summary: "Trace and repair the gateway session token drift",
                embedding: Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0)),
                slots: {
                  resume_anchor: {
                    anchor: "repair-token-drift",
                    file_path: "src/gateway/service-token.ts",
                    repo_root: "/repo",
                    symbol: "repairServiceTokenDrift",
                  },
                },
              },
            ],
          },
          "default",
          "default",
          {
            maxTextLen: 4096,
            piiRedaction: false,
            allowCrossScopeEdges: false,
          },
          {},
        );

        const out = await store.withTx(() =>
          applyMemoryWrite({} as any, prepared, {
            maxTextLen: 4096,
            piiRedaction: false,
            allowCrossScopeEdges: false,
            shadowDualWriteEnabled: false,
            shadowDualWriteStrict: false,
            write_access: store as any,
          }),
        );

        const db = new DatabaseSync(sqlitePath);
        const rows = db.prepare("SELECT event_type, payload_json FROM lite_memory_outbox ORDER BY row_id ASC").all();
        db.close();

        process.stdout.write(JSON.stringify({ commit_id: out.commit_id, rows }));
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

  const parsed = JSON.parse(output);
  const eventTypes = parsed.rows.map((row) => row.event_type);
  assert.equal(eventTypes.includes("embed_nodes"), false);
  assert.equal(eventTypes.includes("associative_link"), true);
  const payload = JSON.parse(parsed.rows.find((row) => row.event_type === "associative_link").payload_json);
  assert.equal(payload.origin, "memory_write");
  assert.equal(payload.source_commit_id, parsed.commit_id);
  assert.ok(payload.source_node_ids.length >= 1);
});

test("handoff store and replay write enqueue origin-specific associative_link events", () => {
  const output = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import { DatabaseSync } from "node:sqlite";
    import { tmpdir } from "node:os";
    import path from "node:path";
    import { buildHandoffWriteBody } from "./src/memory/handoff.ts";
    import { applyReplayMemoryWrite } from "./src/memory/replay-write.ts";
    import { applyMemoryWrite, prepareMemoryWrite } from "./src/memory/write.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";

    const collectOrigins = (sqlitePath) => {
      const db = new DatabaseSync(sqlitePath);
      const rows = db.prepare("SELECT event_type, payload_json FROM lite_memory_outbox ORDER BY row_id ASC").all();
      db.close();
      return rows
        .filter((row) => row.event_type === "associative_link")
        .map((row) => JSON.parse(row.payload_json).origin);
    };

    const main = async () => {
      const handoffDir = mkdtempSync(path.join(tmpdir(), "aionis-associative-handoff-"));
      const handoffPath = path.join(handoffDir, "memory.sqlite");
      const handoffStore = createLiteWriteStore(handoffPath);

      const replayDir = mkdtempSync(path.join(tmpdir(), "aionis-associative-replay-"));
      const replayPath = path.join(replayDir, "memory.sqlite");
      const replayStore = createLiteWriteStore(replayPath);

        try {
          const handoffBody = buildHandoffWriteBody({
            anchor: "repair-token-drift",
            handoff_kind: "task_handoff",
            summary: "Continue repair for gateway session token drift",
            handoff_text: "Resume token drift repair from the accepted anchor.",
            file_path: "src/gateway/service-token.ts",
          repo_root: "/repo",
          symbol: "repairServiceTokenDrift",
          acceptance_checks: ["npm run build"],
        });

        const prepared = await prepareMemoryWrite(
          handoffBody,
          "default",
          "default",
          {
            maxTextLen: 4096,
            piiRedaction: false,
            allowCrossScopeEdges: false,
          },
          null,
        );

        await handoffStore.withTx(() =>
          applyMemoryWrite({} as any, prepared, {
            maxTextLen: 4096,
            piiRedaction: false,
            allowCrossScopeEdges: false,
            shadowDualWriteEnabled: false,
            shadowDualWriteStrict: false,
            write_access: handoffStore as any,
            associativeLinkOrigin: "handoff_store",
          }),
        );

        await replayStore.withTx(() =>
          applyReplayMemoryWrite({} as any, {
            input_text: "Persist replay run state for gateway token repair",
            distill: { enabled: false },
            nodes: [
              {
                client_id: "replay-run-node",
                type: "event",
                title: "replay run snapshot",
                text_summary: "Replay run for gateway token repair",
                slots: {
                  replay_kind: "run",
                  run_id: "55555555-5555-5555-5555-555555555555",
                  resume_anchor: {
                    anchor: "repair-token-drift",
                    file_path: "src/gateway/service-token.ts",
                    repo_root: "/repo",
                  },
                },
              },
            ],
          }, {
            defaultScope: "default",
            defaultTenantId: "default",
            maxTextLen: 4096,
            piiRedaction: false,
            allowCrossScopeEdges: false,
            shadowDualWriteEnabled: false,
            shadowDualWriteStrict: false,
            writeAccessShadowMirrorV2: false,
            embedder: null,
            writeAccess: replayStore as any,
          }),
        );

        process.stdout.write(JSON.stringify({
          handoff_origins: collectOrigins(handoffPath),
          replay_origins: collectOrigins(replayPath),
        }));
      } finally {
        await handoffStore.close();
        await replayStore.close();
        rmSync(handoffDir, { recursive: true, force: true });
        rmSync(replayDir, { recursive: true, force: true });
      }
    };

    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(output);
  assert.deepEqual(parsed.handoff_origins, ["handoff_store"]);
  assert.deepEqual(parsed.replay_origins, ["replay_write"]);
});

test("irrelevant writes do not enqueue associative_link", () => {
  const output = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import { DatabaseSync } from "node:sqlite";
    import { tmpdir } from "node:os";
    import path from "node:path";
    import { applyMemoryWrite, prepareMemoryWrite } from "./src/memory/write.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";

    const main = async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "aionis-associative-irrelevant-"));
      const sqlitePath = path.join(dir, "memory.sqlite");
      const store = createLiteWriteStore(sqlitePath);
      try {
        const prepared = await prepareMemoryWrite(
          {
            input_text: "Store a generic entity record",
            distill: { enabled: false },
            nodes: [
              {
                type: "entity",
                title: "gateway service",
                text_summary: "Service catalog entry",
                slots: { kind: "service" },
              },
            ],
          },
          "default",
          "default",
          {
            maxTextLen: 4096,
            piiRedaction: false,
            allowCrossScopeEdges: false,
          },
          null,
        );

        await store.withTx(() =>
          applyMemoryWrite({} as any, prepared, {
            maxTextLen: 4096,
            piiRedaction: false,
            allowCrossScopeEdges: false,
            shadowDualWriteEnabled: false,
            shadowDualWriteStrict: false,
            write_access: store as any,
          }),
        );

        const db = new DatabaseSync(sqlitePath);
        const countRow = db.prepare(
          "SELECT COUNT(*) AS count FROM lite_memory_outbox WHERE event_type = 'associative_link'",
        ).get();
        db.close();

        process.stdout.write(JSON.stringify(countRow));
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

  const parsed = JSON.parse(output);
  assert.equal(parsed.count, 0);
});
