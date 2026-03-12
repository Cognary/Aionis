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

test("lite tools/feedback persists feedback and updates tools/run lifecycle", () => {
  const out = runSnippet(`
    import { DatabaseSync } from "node:sqlite";
    import { mkdtempSync, rmSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerMemoryFeedbackToolRoutes } from "./src/routes/memory-feedback-tools.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-lite-tools-feedback-"));
      const sqlitePath = path.join(tmpDir, "memory.sqlite");
      const liteWriteStore = createLiteWriteStore(sqlitePath);

      try {
        await liteWriteStore.withTx(async () => {
          const commitId = await liteWriteStore.insertCommit({
            scope: "default",
            parentCommitId: null,
            inputSha256: "lite-tools-feedback-sha",
            diffJson: JSON.stringify({ nodes: [], edges: [] }),
            actor: "lite-tools-feedback-test",
            modelVersion: null,
            promptVersion: null,
            commitHash: "lite-tools-feedback-commit",
          });
          await liteWriteStore.insertNode({
            id: "53000000-0000-0000-0000-000000000001",
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
            ruleNodeId: "53000000-0000-0000-0000-000000000001",
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
          "53000000-0000-0000-0000-000000000001",
        );
        db.close();

        const app = createHttpApp({ TRUST_PROXY: false });
        registerHostErrorHandler(app);
        registerMemoryFeedbackToolRoutes({
          app,
          env: {
            MEMORY_SCOPE: "default",
            MEMORY_TENANT_ID: "default",
            MAX_TEXT_LEN: 4096,
            PII_REDACTION: false,
          },
          store: {
            withTx: async () => { throw new Error("lite tools/feedback should not use store.withTx"); },
            withClient: async () => { throw new Error("lite tools/feedback should not use store.withClient"); },
          },
          embeddedRuntime: null,
          liteWriteStore,
          requireMemoryPrincipal: async () => ({ sub: "tester" }),
          withIdentityFromRequest: (_req, body) => body,
          enforceRateLimit: async () => {},
          enforceTenantQuota: async () => {},
          tenantFromBody: () => "default",
          acquireInflightSlot: async () => ({ release() {} }),
        });

        try {
          const selectRes = await app.inject({
            method: "POST",
            url: "/v1/memory/tools/select",
            payload: {
              context: {
                intent: "deploy",
                agent: { id: "agent-lite", team_id: "team-lite" },
              },
              run_id: "lite-run-3",
              candidates: ["terraform", "kubectl"],
              include_shadow: false,
              strict: true,
              rules_limit: 50,
            },
          });
          const selectBody = JSON.parse(selectRes.body);

          const feedbackRes = await app.inject({
            method: "POST",
            url: "/v1/memory/tools/feedback",
            payload: {
              run_id: "lite-run-3",
              decision_id: selectBody.decision.decision_id,
              outcome: "positive",
              context: {
                intent: "deploy",
                agent: { id: "agent-lite", team_id: "team-lite" },
              },
              candidates: ["terraform", "kubectl"],
              selected_tool: "kubectl",
              include_shadow: false,
              rules_limit: 50,
              target: "tool",
              note: "kubectl was correct",
              input_text: "feedback for deploy selection",
            },
          });
          const feedbackBody = JSON.parse(feedbackRes.body);

          const runRes = await app.inject({
            method: "POST",
            url: "/v1/memory/tools/run",
            payload: {
              run_id: "lite-run-3",
              include_feedback: true,
            },
          });
          const runBody = JSON.parse(runRes.body);

          const sqlite = new DatabaseSync(sqlitePath);
          const feedbackCount = Number(sqlite.prepare(
            "SELECT COUNT(*) AS count FROM lite_memory_rule_feedback WHERE scope = ?"
          ).get("default").count ?? 0);
          const positiveCount = Number(sqlite.prepare(
            "SELECT positive_count AS count FROM lite_memory_rule_defs WHERE rule_node_id = ?"
          ).get("53000000-0000-0000-0000-000000000001").count ?? 0);
          sqlite.close();

          process.stdout.write("__RESULT__" + JSON.stringify({
            selectStatus: selectRes.statusCode,
            feedbackStatus: feedbackRes.statusCode,
            runStatus: runRes.statusCode,
            feedbackBody,
            runBody,
            feedbackCount,
            positiveCount,
          }));
        } finally {
          await app.close();
        }
      } finally {
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
  assert.equal(parsed.selectStatus, 200);
  assert.equal(parsed.feedbackStatus, 200);
  assert.equal(parsed.runStatus, 200);
  assert.equal(parsed.feedbackCount, 1);
  assert.equal(parsed.positiveCount, 1);
  assert.equal(parsed.feedbackBody.updated_rules, 1);
  assert.equal(parsed.feedbackBody.decision_link_mode, "provided");
  assert.equal(parsed.runBody.feedback.total, 1);
  assert.equal(parsed.runBody.feedback.tools_feedback_count, 1);
  assert.equal(parsed.runBody.feedback.linked_decision_count, 1);
  assert.equal(parsed.runBody.feedback.by_outcome.positive, 1);
  assert.equal(parsed.runBody.lifecycle.status, "feedback_linked");
});
