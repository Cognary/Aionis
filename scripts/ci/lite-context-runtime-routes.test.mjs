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
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
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

test("lite context runtime routes use sqlite recall + policy path without store.withClient", () => {
  const out = runSnippet(`
    import { DatabaseSync } from "node:sqlite";
    import { mkdtempSync, rmSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerMemoryContextRuntimeRoutes } from "./src/routes/memory-context-runtime.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";
    import { createLiteRecallStore } from "./src/store/lite-recall-store.ts";

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-lite-context-"));
      const sqlitePath = path.join(tmpDir, "memory.sqlite");
      const liteWriteStore = createLiteWriteStore(sqlitePath);
      const liteRecallStore = createLiteRecallStore(sqlitePath);
      const vector = Array.from({ length: 1536 }, (_, idx) => (idx === 0 ? 1 : 0));

      try {
        await liteWriteStore.withTx(async () => {
          const commitId = await liteWriteStore.insertCommit({
            scope: "default",
            parentCommitId: null,
            inputSha256: "lite-context-sha",
            diffJson: JSON.stringify({ nodes: [], edges: [] }),
            actor: "lite-context-test",
            modelVersion: null,
            promptVersion: null,
            commitHash: "lite-context-commit",
          });
          await liteWriteStore.insertNode({
            id: "52000000-0000-0000-0000-000000000001",
            scope: "default",
            clientId: "event:deploy",
            type: "event",
            tier: "hot",
            title: "deploy memory",
            textSummary: "kubectl rollback steps for deploy workflow",
            slotsJson: JSON.stringify({ intent: "deploy" }),
            rawRef: null,
            evidenceRef: null,
              embeddingVector: JSON.stringify(vector),
            embeddingModel: "lite-test",
            memoryLane: "shared",
            producerAgentId: null,
            ownerAgentId: null,
            ownerTeamId: null,
            embeddingStatus: "ready",
            embeddingLastError: null,
            salience: 0.9,
            importance: 0.9,
            confidence: 0.95,
            redactionVersion: 1,
            commitId,
          });
          await liteWriteStore.insertNode({
            id: "52000000-0000-0000-0000-000000000002",
            scope: "default",
            clientId: "rule:deploy",
            type: "rule",
            tier: "hot",
            title: "deploy tool rule",
            textSummary: "prefer kubectl for deploy workflow",
            slotsJson: JSON.stringify({ priority: 5 }),
            rawRef: null,
            evidenceRef: null,
            embeddingVector: null,
            embeddingModel: null,
            memoryLane: "shared",
            producerAgentId: null,
            ownerAgentId: null,
            ownerTeamId: null,
            embeddingStatus: "skipped",
            embeddingLastError: null,
            salience: 0.9,
            importance: 0.9,
            confidence: 0.95,
            redactionVersion: 1,
            commitId,
          });
          await liteWriteStore.insertRuleDef({
            ruleNodeId: "52000000-0000-0000-0000-000000000002",
            scope: "default",
            ifJson: JSON.stringify({ intent: "deploy" }),
            thenJson: JSON.stringify({ tool: { prefer: ["kubectl"] } }),
            exceptionsJson: JSON.stringify([]),
            ruleScope: "global",
            targetAgentId: null,
            targetTeamId: null,
            commitId,
          });
        });

        const db = new DatabaseSync(sqlitePath);
        db.prepare("UPDATE lite_memory_rule_defs SET state = 'active' WHERE rule_node_id = ?").run(
          "52000000-0000-0000-0000-000000000002",
        );
        db.close();

        const app = createHttpApp({ TRUST_PROXY: false });
        registerHostErrorHandler(app);
        registerMemoryContextRuntimeRoutes({
          app,
          env: {
            AIONIS_EDITION: "lite",
            MEMORY_SCOPE: "default",
            MEMORY_TENANT_ID: "default",
            MAX_TEXT_LEN: 4096,
            PII_REDACTION: false,
            MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT: 0,
            MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY: true,
            MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT: "off",
            MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT: "off",
          },
          store: {
            withClient: async () => { throw new Error("lite context runtime should not use store.withClient"); },
          },
          embedder: { name: "lite-test-embedder" },
          embeddedRuntime: null,
          liteWriteStore,
          recallTextEmbedBatcher: null,
          recallAccessForClient: () => liteRecallStore.createRecallAccess(),
          requireMemoryPrincipal: async () => ({ sub: "tester" }),
          withIdentityFromRequest: (_req, body) => body,
          enforceRateLimit: async () => {},
          enforceTenantQuota: async () => {},
          enforceRecallTextEmbedQuota: async () => {},
          buildRecallAuth: () => ({ allow_debug_embeddings: false }),
          tenantFromBody: () => "default",
          acquireInflightSlot: async () => ({ release() {}, wait_ms: 0 }),
          hasExplicitRecallKnobs: () => false,
          resolveRecallProfile: () => ({ profile: "strict_edges", source: "test" }),
          resolveExplicitRecallMode: () => ({ mode: null, profile: "strict_edges", applied: false, reason: null, source: "none" }),
          resolveClassAwareRecallProfile: () => ({
            profile: "strict_edges",
            defaults: {},
            enabled: false,
            applied: false,
            reason: null,
            source: "disabled",
            workload_class: null,
            signals: {},
          }),
          withRecallProfileDefaults: (body) => body,
          resolveRecallStrategy: () => ({ applied: false, strategy: null, defaults: {} }),
          resolveAdaptiveRecallProfile: (profile) => ({ profile, applied: false, reason: null }),
          resolveAdaptiveRecallHardCap: () => ({ applied: false, reason: null, defaults: {} }),
          inferRecallStrategyFromKnobs: () => "strict_edges",
          buildRecallTrajectory: (args) => ({ strategy: args.strategy, seeds: args.seeds }),
          embedRecallTextQuery: async () => ({
            vec: vector,
            ms: 1,
            cache_hit: false,
            singleflight_join: false,
            queue_wait_ms: 0,
            batch_size: 1,
          }),
          mapRecallTextEmbeddingError: () => ({ statusCode: 500, code: "embed_error", message: "embed failed" }),
          recordContextAssemblyTelemetryBestEffort: async () => {},
        });

        try {
          const recallTextRes = await app.inject({
            method: "POST",
            url: "/v1/memory/recall_text",
            payload: {
              query_text: "deploy workflow",
              rules_context: {
                intent: "deploy",
                agent: { id: "agent-lite", team_id: "team-lite" },
              },
            },
          });
          const planningRes = await app.inject({
            method: "POST",
            url: "/v1/memory/planning/context",
            payload: {
              query_text: "deploy workflow",
              context: {
                intent: "deploy",
                agent: { id: "agent-lite", team_id: "team-lite" },
              },
              tool_candidates: ["terraform", "kubectl"],
              include_shadow: false,
              rules_limit: 50,
              tool_strict: true,
            },
          });
          const assembleRes = await app.inject({
            method: "POST",
            url: "/v1/memory/context/assemble",
            payload: {
              query_text: "deploy workflow",
              context: {
                intent: "deploy",
                agent: { id: "agent-lite", team_id: "team-lite" },
              },
              include_rules: true,
              tool_candidates: ["terraform", "kubectl"],
              include_shadow: false,
              rules_limit: 50,
              tool_strict: true,
            },
          });
          process.stdout.write("__RESULT__" + JSON.stringify({
            recallTextStatus: recallTextRes.statusCode,
            recallTextBody: JSON.parse(recallTextRes.body),
            planningStatus: planningRes.statusCode,
            planningBody: JSON.parse(planningRes.body),
            assembleStatus: assembleRes.statusCode,
            assembleBody: JSON.parse(assembleRes.body),
          }));
        } finally {
          await app.close();
        }
      } finally {
        await liteRecallStore.close();
        await liteWriteStore.close();
        rmSync(tmpDir, { recursive: true, force: true });
      }
    };

    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(out);
  assert.equal(parsed.recallTextStatus, 200);
  assert.equal(parsed.recallTextBody.rules.matched, 1);
  assert.ok(parsed.recallTextBody.context.text.includes("kubectl rollback"));

  assert.equal(parsed.planningStatus, 200);
  assert.equal(parsed.planningBody.rules.matched, 1);
  assert.equal(parsed.planningBody.tools.selection.selected, "kubectl");
  assert.equal(parsed.planningBody.planning_summary.selected_tool, "kubectl");

  assert.equal(parsed.assembleStatus, 200);
  assert.equal(parsed.assembleBody.rules.matched, 1);
  assert.equal(parsed.assembleBody.tools.selection.selected, "kubectl");
  assert.equal(parsed.assembleBody.assembly_summary.selected_tool, "kubectl");
  assert.equal(parsed.assembleBody.assembly_summary.rules_matched, 1);
});
