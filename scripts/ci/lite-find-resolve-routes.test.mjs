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

test("lite find and resolve routes use sqlite inspection path", () => {
  const out = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerMemoryAccessRoutes } from "./src/routes/memory-access.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-lite-inspect-"));
      const sqlitePath = path.join(tmpDir, "memory.sqlite");
      const liteWriteStore = createLiteWriteStore(sqlitePath);

      const commitId = await liteWriteStore.insertCommit({
        scope: "default",
        parentCommitId: null,
        inputSha256: "lite-find-resolve",
        diffJson: JSON.stringify({ nodes: [], edges: [] }),
        actor: "lite-inspect-test",
        modelVersion: null,
        promptVersion: null,
        commitHash: "lite-find-resolve-commit",
      });
      await liteWriteStore.insertNode({
        id: "60000000-0000-0000-0000-000000000001",
        scope: "default",
        clientId: "topic_a",
        type: "topic",
        tier: "hot",
        title: "Deploy topology",
        textSummary: "deploy graph and rollback scope",
        slotsJson: JSON.stringify({ topic_state: "active", member_count: 3 }),
        rawRef: null,
        evidenceRef: null,
        embeddingVector: JSON.stringify(Array.from({ length: 1536 }, () => 0)),
        embeddingModel: "client",
        memoryLane: "shared",
        producerAgentId: null,
        ownerAgentId: null,
        ownerTeamId: null,
        embeddingStatus: "ready",
        embeddingLastError: null,
        salience: 0.9,
        importance: 0.9,
        confidence: 0.9,
        redactionVersion: 1,
        commitId,
      });
      await liteWriteStore.insertNode({
        id: "60000000-0000-0000-0000-000000000002",
        scope: "default",
        clientId: "event_a",
        type: "event",
        tier: "hot",
        title: "Deploy rollback",
        textSummary: "rollback sequence for deploy incident",
        slotsJson: JSON.stringify({ severity: "high" }),
        rawRef: null,
        evidenceRef: null,
        embeddingVector: JSON.stringify(Array.from({ length: 1536 }, () => 0)),
        embeddingModel: "client",
        memoryLane: "shared",
        producerAgentId: null,
        ownerAgentId: null,
        ownerTeamId: null,
        embeddingStatus: "ready",
        embeddingLastError: null,
        salience: 0.8,
        importance: 0.8,
        confidence: 0.85,
        redactionVersion: 1,
        commitId,
      });
      await liteWriteStore.upsertEdge({
        id: "60000000-0000-0000-0000-0000000000e1",
        scope: "default",
        type: "part_of",
        srcId: "60000000-0000-0000-0000-000000000002",
        dstId: "60000000-0000-0000-0000-000000000001",
        weight: 0.95,
        confidence: 0.95,
        decayRate: 0.01,
        commitId,
      });
      await liteWriteStore.insertExecutionDecision({
        id: "70000000-0000-0000-0000-0000000000d1",
        scope: "default",
        decisionKind: "tools_select",
        runId: "lite-run-1",
        selectedTool: "kubectl",
        candidatesJson: ["terraform", "kubectl"],
        contextSha256: "ctx-sha-lite",
        policySha256: "policy-sha-lite",
        sourceRuleIds: [],
        metadataJson: { source: "find-resolve-test" },
        commitId,
      });
      const privateCommitId = await liteWriteStore.insertCommit({
        scope: "default",
        parentCommitId: commitId,
        inputSha256: "lite-find-resolve-private",
        diffJson: JSON.stringify({ nodes: ["private"] }),
        actor: "lite-inspect-test",
        modelVersion: null,
        promptVersion: null,
        commitHash: "lite-find-resolve-private-commit",
      });
      await liteWriteStore.insertNode({
        id: "60000000-0000-0000-0000-000000000003",
        scope: "default",
        clientId: "private_event",
        type: "event",
        tier: "hot",
        title: "Private rollback",
        textSummary: "owner only rollback trace",
        slotsJson: JSON.stringify({ severity: "critical" }),
        rawRef: null,
        evidenceRef: null,
        embeddingVector: JSON.stringify(Array.from({ length: 1536 }, () => 0)),
        embeddingModel: "client",
        memoryLane: "private",
        producerAgentId: "owner-agent",
        ownerAgentId: "owner-agent",
        ownerTeamId: null,
        embeddingStatus: "ready",
        embeddingLastError: null,
        salience: 0.8,
        importance: 0.9,
        confidence: 0.95,
        redactionVersion: 1,
        commitId: privateCommitId,
      });
      await liteWriteStore.insertNode({
        id: "60000000-0000-0000-0000-000000000004",
        scope: "default",
        clientId: "private_topic",
        type: "topic",
        tier: "hot",
        title: "Private deploy topic",
        textSummary: "owner only deploy thread",
        slotsJson: JSON.stringify({ topic_state: "active", member_count: 1 }),
        rawRef: null,
        evidenceRef: null,
        embeddingVector: JSON.stringify(Array.from({ length: 1536 }, () => 0)),
        embeddingModel: "client",
        memoryLane: "private",
        producerAgentId: "owner-agent",
        ownerAgentId: "owner-agent",
        ownerTeamId: null,
        embeddingStatus: "ready",
        embeddingLastError: null,
        salience: 0.8,
        importance: 0.9,
        confidence: 0.95,
        redactionVersion: 1,
        commitId: privateCommitId,
      });
      await liteWriteStore.upsertEdge({
        id: "60000000-0000-0000-0000-0000000000e2",
        scope: "default",
        type: "part_of",
        srcId: "60000000-0000-0000-0000-000000000003",
        dstId: "60000000-0000-0000-0000-000000000004",
        weight: 0.9,
        confidence: 0.9,
        decayRate: 0.02,
        commitId: privateCommitId,
      });
      await liteWriteStore.insertExecutionDecision({
        id: "70000000-0000-0000-0000-0000000000d2",
        scope: "default",
        decisionKind: "tools_select",
        runId: "lite-run-private",
        selectedTool: "kubectl",
        candidatesJson: ["kubectl"],
        contextSha256: "ctx-sha-private",
        policySha256: "policy-sha-private",
        sourceRuleIds: ["60000000-0000-0000-0000-000000000004"],
        metadataJson: { source: "find-resolve-private-test" },
        commitId: privateCommitId,
      });

      const app = createHttpApp({ TRUST_PROXY: false });
      registerHostErrorHandler(app);
      try {
        registerMemoryAccessRoutes({
          app,
          env: {
            MEMORY_SCOPE: "default",
            MEMORY_TENANT_ID: "default",
            MAX_TEXT_LEN: 4096,
            PII_REDACTION: false,
            ALLOW_CROSS_SCOPE_EDGES: false,
            MEMORY_SHADOW_DUAL_WRITE_ENABLED: false,
            MEMORY_SHADOW_DUAL_WRITE_STRICT: false,
          },
          store: {
            withTx: async () => { throw new Error("lite inspection should not use store.withTx"); },
            withClient: async () => { throw new Error("lite inspection should not use store.withClient"); },
          },
          embedder: null,
          embeddedRuntime: null,
          liteWriteStore,
          writeAccessShadowMirrorV2: false,
          requireAdminToken: () => {},
          requireStoreFeatureCapability: () => {},
          requireMemoryPrincipal: async () => ({ sub: "tester" }),
          withIdentityFromRequest: (_req, body) => body,
          enforceRateLimit: async () => {},
          enforceTenantQuota: async () => {},
          tenantFromBody: () => "default",
          acquireInflightSlot: async () => ({ release() {} }),
        });

        const findRes = await app.inject({
          method: "POST",
          url: "/v1/memory/find",
          payload: {
            tenant_id: "default",
            scope: "default",
            title_contains: "deploy",
            include_meta: true,
            include_slots_preview: true,
            limit: 10,
            offset: 0,
          },
        });
        const resolveNodeRes = await app.inject({
          method: "POST",
          url: "/v1/memory/resolve",
          payload: {
            uri: "aionis://default/default/topic/60000000-0000-0000-0000-000000000001",
            include_meta: true,
            include_slots_preview: true,
          },
        });
        const resolveEdgeRes = await app.inject({
          method: "POST",
          url: "/v1/memory/resolve",
          payload: {
            uri: "aionis://default/default/edge/60000000-0000-0000-0000-0000000000e1",
          },
        });
        const resolveCommitRes = await app.inject({
          method: "POST",
          url: "/v1/memory/resolve",
          payload: {
            uri: "aionis://default/default/commit/" + commitId,
          },
        });
        const resolveDecisionRes = await app.inject({
          method: "POST",
          url: "/v1/memory/resolve",
          payload: {
            uri: "aionis://default/default/decision/70000000-0000-0000-0000-0000000000d1",
          },
        });
        const resolvePrivateEdgeBlocked = await app.inject({
          method: "POST",
          url: "/v1/memory/resolve",
          payload: {
            uri: "aionis://default/default/edge/60000000-0000-0000-0000-0000000000e2",
          },
        });
        const resolvePrivateEdgeOwner = await app.inject({
          method: "POST",
          url: "/v1/memory/resolve",
          payload: {
            uri: "aionis://default/default/edge/60000000-0000-0000-0000-0000000000e2",
            consumer_agent_id: "owner-agent",
          },
        });
        const resolvePrivateCommitBlocked = await app.inject({
          method: "POST",
          url: "/v1/memory/resolve",
          payload: {
            uri: "aionis://default/default/commit/" + privateCommitId,
          },
        });
        const resolvePrivateCommitOwner = await app.inject({
          method: "POST",
          url: "/v1/memory/resolve",
          payload: {
            uri: "aionis://default/default/commit/" + privateCommitId,
            consumer_agent_id: "owner-agent",
          },
        });
        const resolvePrivateDecisionBlocked = await app.inject({
          method: "POST",
          url: "/v1/memory/resolve",
          payload: {
            uri: "aionis://default/default/decision/70000000-0000-0000-0000-0000000000d2",
          },
        });
        const resolvePrivateDecisionOwner = await app.inject({
          method: "POST",
          url: "/v1/memory/resolve",
          payload: {
            uri: "aionis://default/default/decision/70000000-0000-0000-0000-0000000000d2",
            consumer_agent_id: "owner-agent",
          },
        });

        process.stdout.write("__RESULT__" + JSON.stringify({
          findStatus: findRes.statusCode,
          findBody: JSON.parse(findRes.body),
          resolveNodeStatus: resolveNodeRes.statusCode,
          resolveNodeBody: JSON.parse(resolveNodeRes.body),
          resolveEdgeStatus: resolveEdgeRes.statusCode,
          resolveEdgeBody: JSON.parse(resolveEdgeRes.body),
          resolveCommitStatus: resolveCommitRes.statusCode,
          resolveCommitBody: JSON.parse(resolveCommitRes.body),
          resolveDecisionStatus: resolveDecisionRes.statusCode,
          resolveDecisionBody: JSON.parse(resolveDecisionRes.body),
          resolvePrivateEdgeBlockedStatus: resolvePrivateEdgeBlocked.statusCode,
          resolvePrivateEdgeOwnerStatus: resolvePrivateEdgeOwner.statusCode,
          resolvePrivateCommitBlockedStatus: resolvePrivateCommitBlocked.statusCode,
          resolvePrivateCommitOwnerStatus: resolvePrivateCommitOwner.statusCode,
          resolvePrivateDecisionBlockedStatus: resolvePrivateDecisionBlocked.statusCode,
          resolvePrivateDecisionOwnerStatus: resolvePrivateDecisionOwner.statusCode,
        }));
      } finally {
        await app.close();
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
  assert.equal(parsed.findStatus, 200);
  assert.equal(parsed.findBody.find_summary.summary_version, "find_summary_v1");
  assert.equal(parsed.findBody.find_summary.returned_nodes, 2);
  assert.equal(parsed.findBody.find_summary.type_counts.event, 1);
  assert.equal(parsed.findBody.find_summary.type_counts.topic, 1);

  assert.equal(parsed.resolveNodeStatus, 200);
  assert.equal(parsed.resolveNodeBody.resolve_summary.payload_kind, "node");
  assert.equal(parsed.resolveNodeBody.node.topic_state, "active");
  assert.equal(parsed.resolveNodeBody.node.member_count, 3);

  assert.equal(parsed.resolveEdgeStatus, 200);
  assert.equal(parsed.resolveEdgeBody.resolve_summary.payload_kind, "edge");
  assert.equal(parsed.resolveEdgeBody.edge.type, "part_of");

  assert.equal(parsed.resolveCommitStatus, 200);
  assert.equal(parsed.resolveCommitBody.resolve_summary.payload_kind, "commit");
  assert.equal(parsed.resolveCommitBody.commit.linked_object_counts.nodes, 2);
  assert.equal(parsed.resolveCommitBody.commit.linked_object_counts.edges, 1);
  assert.equal(parsed.resolveCommitBody.commit.linked_object_counts.decisions, 1);

  assert.equal(parsed.resolveDecisionStatus, 200);
  assert.equal(parsed.resolveDecisionBody.resolve_summary.payload_kind, "decision");
  assert.equal(parsed.resolveDecisionBody.decision.selected_tool, "kubectl");
  assert.equal(parsed.resolveDecisionBody.decision.commit_id, parsed.resolveCommitBody.commit.id);
  assert.equal(parsed.resolvePrivateEdgeBlockedStatus, 404);
  assert.equal(parsed.resolvePrivateEdgeOwnerStatus, 200);
  assert.equal(parsed.resolvePrivateCommitBlockedStatus, 404);
  assert.equal(parsed.resolvePrivateCommitOwnerStatus, 200);
  assert.equal(parsed.resolvePrivateDecisionBlockedStatus, 404);
  assert.equal(parsed.resolvePrivateDecisionOwnerStatus, 200);
});
