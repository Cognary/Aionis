import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function extractFirstJsonObject(text) {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (start === -1) {
      if (ch === "{") {
        start = i;
        depth = 1;
      }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.trim();
}

function runSnippet(source) {
  const out = execFileSync("npx", ["tsx", "-e", source], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const marker = "__RESULT__";
  const idx = out.lastIndexOf(marker);
  if (idx >= 0) return extractFirstJsonObject(out.slice(idx + marker.length));
  const lines = out.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

test("lite export imports through server pack write path", () => {
  const out = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { exportMemoryPack, importMemoryPack } from "./src/memory/packs.ts";
    import { applyMemoryWrite, prepareMemoryWrite } from "./src/memory/write.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";

    class ServerImportPgClient {
      nodeInserts = [];
      edgeUpserts = [];
      outboxEvents = [];

      async query(sql, params = []) {
        const s = sql.replace(/\\s+/g, " ").trim();

        if (s.includes("SELECT id, scope FROM memory_nodes WHERE id = ANY($1::uuid[])")) {
          return { rows: [], rowCount: 0 };
        }

        if (s.includes("SELECT commit_hash FROM memory_commits WHERE id = $1 AND scope = $2")) {
          return { rows: [], rowCount: 0 };
        }

        if (s.includes("INSERT INTO memory_commits") && s.includes("RETURNING id")) {
          return { rows: [{ id: "20000000-0000-0000-0000-000000000001" }], rowCount: 1 };
        }

        if (s.includes("INSERT INTO memory_nodes") && s.includes("ON CONFLICT (id) DO NOTHING")) {
          this.nodeInserts.push({
            id: params[0],
            client_id: params[2],
            type: params[3],
            title: params[5],
          });
          return { rows: [], rowCount: 1 };
        }

        if (s.includes("INSERT INTO memory_rule_defs")) {
          return { rows: [], rowCount: 1 };
        }

        if (s.includes("INSERT INTO memory_edges") && s.includes("ON CONFLICT (scope, type, src_id, dst_id) DO UPDATE")) {
          this.edgeUpserts.push({
            id: params[0],
            type: params[2],
            src_id: params[3],
            dst_id: params[4],
          });
          return { rows: [], rowCount: 1 };
        }

        if (s.includes("SELECT id FROM memory_nodes") && s.includes("embedding_status = 'ready'")) {
          return { rows: [], rowCount: 0 };
        }

        if (s.includes("INSERT INTO memory_outbox")) {
          this.outboxEvents.push({
            event_type: params[2],
            job_key: params[3],
          });
          return { rows: [], rowCount: 1 };
        }

        if (s.includes("UPDATE memory_outbox")) {
          return { rows: [], rowCount: 1 };
        }

        throw new Error("ServerImportPgClient: unhandled query shape: " + s.slice(0, 200));
      }
    }

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-lite-pack-compat-"));
      const sqlitePath = path.join(tmpDir, "memory.sqlite");
      const liteWriteStore = createLiteWriteStore(sqlitePath);

      try {
        const prepared = await prepareMemoryWrite(
          {
            tenant_id: "default",
            scope: "default",
            actor: "lite-pack-compat",
            input_text: "lite source graph",
            auto_embed: false,
            nodes: [
              {
                client_id: "lite_event",
                type: "event",
                title: "Lite Event",
                text_summary: "Lite export event",
                memory_lane: "shared",
                slots: {},
                embedding: Array.from({ length: 1536 }, () => 0),
                embedding_model: "client",
              },
              {
                client_id: "lite_topic",
                type: "topic",
                title: "Lite Topic",
                text_summary: "Lite export topic",
                memory_lane: "shared",
                slots: { topic_state: "active" },
                embedding: Array.from({ length: 1536 }, () => 0),
                embedding_model: "client",
              },
            ],
            edges: [
              {
                type: "part_of",
                src: { client_id: "lite_event" },
                dst: { client_id: "lite_topic" },
                weight: 0.9,
                confidence: 0.8,
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

        await liteWriteStore.withTx(() => applyMemoryWrite({} as any, prepared, {
          maxTextLen: 4096,
          piiRedaction: false,
          allowCrossScopeEdges: false,
          shadowDualWriteEnabled: false,
          shadowDualWriteStrict: false,
          write_access: liteWriteStore,
        }));

        const exportBody = await exportMemoryPack({} as any, {
          tenant_id: "default",
          scope: "default",
          include_nodes: true,
          include_edges: true,
          include_commits: true,
          include_decisions: true,
          include_meta: true,
          max_rows: 50,
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
          embeddedRuntime: null,
          liteWriteStore,
        });

        const serverClient = new ServerImportPgClient();
        const importBody = await importMemoryPack(serverClient as any, {
          tenant_id: "default",
          scope: "default",
          actor: "server-pack-import",
          auto_embed: false,
          pack: exportBody.pack,
          manifest_sha256: exportBody.manifest.sha256,
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
          embeddedRuntime: null,
          liteWriteStore: null,
        });

        process.stdout.write("__RESULT__" + JSON.stringify({
          importBody,
          nodeInserts: serverClient.nodeInserts,
          edgeUpserts: serverClient.edgeUpserts,
          packCounts: exportBody.manifest.counts,
        }));
      } finally {
        await liteWriteStore.close();
        rmSync(tmpDir, { recursive: true, force: true });
      }
    };

    main().catch((err) => {
      console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(out);
  assert.equal(parsed.packCounts.nodes, 2);
  assert.equal(parsed.packCounts.edges, 1);
  assert.equal(parsed.importBody.imported, true);
  assert.equal(parsed.importBody.nodes, 2);
  assert.equal(parsed.importBody.edges, 1);
  assert.equal(parsed.nodeInserts.length, 2);
  assert.equal(parsed.edgeUpserts.length, 1);
  assert.deepEqual(parsed.nodeInserts.map((row) => row.client_id).sort(), ["lite_event", "lite_topic"]);
});

test("server export imports through lite sqlite pack path", () => {
  const out = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { exportMemoryPack, importMemoryPack } from "./src/memory/packs.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";
    import { stableUuid } from "./src/util/uuid.ts";

    const EVENT_ID = stableUuid("default:node:server_event");
    const TOPIC_ID = stableUuid("default:node:server_topic");

    class ServerExportPgClient {
      async query(sql) {
        const s = sql.replace(/\\s+/g, " ").trim();

        if (s.includes("FROM memory_nodes n") && s.includes("ORDER BY n.created_at ASC")) {
          return {
            rows: [
              {
                id: EVENT_ID,
                client_id: "server_event",
                type: "event",
                tier: "hot",
                memory_lane: "shared",
                producer_agent_id: null,
                owner_agent_id: null,
                owner_team_id: null,
                title: "Server Event",
                text_summary: "Server export event",
                slots: {},
                raw_ref: null,
                evidence_ref: null,
                salience: 0.5,
                importance: 0.5,
                confidence: 0.5,
                created_at: "2026-03-12T00:00:00.000Z",
                updated_at: "2026-03-12T00:00:00.000Z",
                commit_id: "30000000-0000-0000-0000-000000000001",
              },
              {
                id: TOPIC_ID,
                client_id: "server_topic",
                type: "topic",
                tier: "hot",
                memory_lane: "shared",
                producer_agent_id: null,
                owner_agent_id: null,
                owner_team_id: null,
                title: "Server Topic",
                text_summary: "Server export topic",
                slots: { topic_state: "active" },
                raw_ref: null,
                evidence_ref: null,
                salience: 0.5,
                importance: 0.5,
                confidence: 0.5,
                created_at: "2026-03-12T00:00:01.000Z",
                updated_at: "2026-03-12T00:00:01.000Z",
                commit_id: "30000000-0000-0000-0000-000000000001",
              },
            ],
            rowCount: 2,
          };
        }

        if (s.includes("FROM memory_edges e") && s.includes("JOIN memory_nodes s")) {
          return {
            rows: [
              {
                id: "30000000-0000-0000-0000-000000000010",
                type: "part_of",
                src_id: EVENT_ID,
                dst_id: TOPIC_ID,
                src_type: "event",
                dst_type: "topic",
                src_client_id: "server_event",
                dst_client_id: "server_topic",
                weight: 0.95,
                confidence: 0.9,
                decay_rate: 0.01,
                created_at: "2026-03-12T00:00:02.000Z",
                commit_id: "30000000-0000-0000-0000-000000000001",
              },
            ],
            rowCount: 1,
          };
        }

        if (s.includes("FROM memory_commits c")) {
          return {
            rows: [
              {
                id: "30000000-0000-0000-0000-000000000001",
                parent_id: null,
                  input_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                actor: "server-pack-export",
                model_version: null,
                prompt_version: null,
                created_at: "2026-03-12T00:00:00.000Z",
                commit_hash: "server-pack-commit-hash",
              },
            ],
            rowCount: 1,
          };
        }

        if (s.includes("FROM memory_execution_decisions d")) {
          return {
            rows: [
              {
                id: "30000000-0000-0000-0000-000000000020",
                decision_kind: "tools_select",
                run_id: "run_server",
                selected_tool: "deploy_tool",
                candidates_json: [{ name: "deploy_tool", confidence: 0.9 }],
                  context_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                  policy_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                source_rule_ids: [TOPIC_ID],
                metadata_json: { source: "server" },
                created_at: "2026-03-12T00:00:03.000Z",
                commit_id: "30000000-0000-0000-0000-000000000001",
              },
            ],
            rowCount: 1,
          };
        }

        throw new Error("ServerExportPgClient: unhandled query shape: " + s.slice(0, 200));
      }
    }

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-server-pack-compat-"));
      const sqlitePath = path.join(tmpDir, "memory.sqlite");
      const liteWriteStore = createLiteWriteStore(sqlitePath);

      try {
        const exportBody = await exportMemoryPack(new ServerExportPgClient() as any, {
          tenant_id: "default",
          scope: "default",
          include_nodes: true,
          include_edges: true,
          include_commits: true,
          include_decisions: true,
          include_meta: true,
          max_rows: 50,
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
          embeddedRuntime: null,
          liteWriteStore: null,
        });

        const importBody = await importMemoryPack({} as any, {
          tenant_id: "default",
          scope: "default",
          actor: "lite-pack-import",
          auto_embed: false,
          pack: exportBody.pack,
          manifest_sha256: exportBody.manifest.sha256,
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
          embeddedRuntime: null,
          liteWriteStore,
        });

        const snapshot = await liteWriteStore.exportPackSnapshot({
          scope: "default",
          includeNodes: true,
          includeEdges: true,
          includeCommits: true,
          includeDecisions: true,
          maxRows: 50,
        });

        process.stdout.write("__RESULT__" + JSON.stringify({
          importBody,
          exportCounts: exportBody.manifest.counts,
          snapshot,
        }));
      } finally {
        await liteWriteStore.close();
        rmSync(tmpDir, { recursive: true, force: true });
      }
    };

    main().catch((err) => {
      console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(out);
  assert.equal(parsed.exportCounts.nodes, 2);
  assert.equal(parsed.exportCounts.edges, 1);
  assert.equal(parsed.exportCounts.decisions, 1);
  assert.equal(parsed.importBody.imported, true);
  assert.equal(parsed.importBody.nodes, 2);
  assert.equal(parsed.importBody.edges, 1);
  assert.equal(parsed.snapshot.nodes.length, 2);
  assert.equal(parsed.snapshot.edges.length, 1);
  assert.equal(parsed.snapshot.commits.length, 1);
  assert.deepEqual(parsed.snapshot.nodes.map((row) => row.client_id).sort(), ["server_event", "server_topic"]);
});
