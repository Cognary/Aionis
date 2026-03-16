import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function extractFirstJsonObject(text) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let started = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (!started) {
      if (ch === "{") {
        started = true;
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
      if (depth === 0) return text.slice(text.indexOf("{"), i + 1);
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
  if (idx >= 0) {
    return extractFirstJsonObject(out.slice(idx + marker.length));
  }
  const lines = out.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

test("lite replay routes round-trip through sqlite mirror", () => {
  const out = runSnippet(`
    import { mkdtempSync, rmSync } from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerMemoryReplayCoreRoutes } from "./src/routes/memory-replay-core.ts";
    import { registerMemoryReplayGovernedRoutes } from "./src/routes/memory-replay-governed.ts";
    import { createLiteReplayStore } from "./src/store/lite-replay-store.ts";
    import { createLiteWriteStore } from "./src/store/lite-write-store.ts";

    const main = async () => {
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aionis-lite-replay-routes-"));
      const liteReplayStore = createLiteReplayStore(path.join(tmpDir, "replay.sqlite"));
      const liteWriteStore = createLiteWriteStore(path.join(tmpDir, "write.sqlite"));
      const liteReplayAccess = liteReplayStore.createReplayAccess();
      const store = {
        withTx: async (fn) => await fn({}),
        withClient: async (fn) => await fn({}),
      };
      const env = {
        AIONIS_EDITION: "lite",
        MEMORY_SCOPE: "default",
        MEMORY_TENANT_ID: "default",
        MAX_TEXT_LEN: 4096,
        PII_REDACTION: false,
        ALLOW_CROSS_SCOPE_EDGES: false,
        MEMORY_SHADOW_DUAL_WRITE_ENABLED: false,
        MEMORY_SHADOW_DUAL_WRITE_STRICT: false,
        SANDBOX_ENABLED: false,
        SANDBOX_EXECUTOR_MODE: "disabled",
      };

      const noOpGate = async () => ({ release() {} });
      const principal = { sub: "tester", team_id: "team-alpha" };
      const withReplayIdentity = (_req, body, authPrincipal, kind) => {
        const out = { ...(body ?? {}) };
        const readKinds = new Set([
          "replay_run_start",
          "replay_step_before",
          "replay_step_after",
          "replay_run_end",
          "replay_run_get",
          "replay_playbook_compile",
          "replay_playbook_get",
          "replay_playbook_candidate",
          "replay_playbook_promote",
          "replay_playbook_repair",
          "replay_playbook_repair_review",
          "replay_playbook_run",
          "replay_playbook_dispatch",
        ]);
        const writeKinds = new Set([
          "replay_run_start",
          "replay_step_before",
          "replay_step_after",
          "replay_run_end",
          "replay_playbook_compile",
          "replay_playbook_promote",
          "replay_playbook_repair",
          "replay_playbook_repair_review",
          "replay_playbook_run",
          "replay_playbook_dispatch",
        ]);
        if (readKinds.has(kind)) {
          out.consumer_agent_id ??= authPrincipal.sub;
          out.consumer_team_id ??= authPrincipal.team_id;
        }
        if (writeKinds.has(kind)) {
          out.memory_lane ??= "private";
          out.producer_agent_id ??= authPrincipal.sub;
          out.owner_agent_id ??= authPrincipal.sub;
          out.owner_team_id ??= authPrincipal.team_id;
        }
        return out;
      };
      const app = createHttpApp({ TRUST_PROXY: false });
      registerHostErrorHandler(app);
      try {
        registerMemoryReplayCoreRoutes({
          app,
          env,
          store,
          embedder: null,
          embeddedRuntime: { applyWrite: async () => {} },
          liteReplayAccess,
          liteReplayStore,
          liteWriteStore,
          writeAccessShadowMirrorV2: true,
          requireMemoryPrincipal: async () => principal,
          withIdentityFromRequest: withReplayIdentity,
          enforceRateLimit: async () => {},
          enforceTenantQuota: async () => {},
          tenantFromBody: () => "default",
          acquireInflightSlot: noOpGate,
        });

        registerMemoryReplayGovernedRoutes({
          app,
          env,
          store,
          liteWriteStore,
          requireMemoryPrincipal: async () => principal,
          withIdentityFromRequest: withReplayIdentity,
          enforceRateLimit: async () => {},
          enforceTenantQuota: async () => {},
          tenantFromBody: () => "default",
          acquireInflightSlot: noOpGate,
          withReplayRepairReviewDefaults: (body) => ({ body, resolution: { source: "test" } }),
          buildReplayRepairReviewOptions: () => ({
            defaultScope: "default",
            defaultTenantId: "default",
            maxTextLen: 4096,
            piiRedaction: false,
            allowCrossScopeEdges: false,
            shadowDualWriteEnabled: false,
            shadowDualWriteStrict: false,
            writeAccessShadowMirrorV2: true,
            embedder: null,
            embeddedRuntime: { applyWrite: async () => {} },
            replayAccess: liteReplayAccess,
            replayMirror: liteReplayStore,
            writeAccess: liteWriteStore,
          }),
          buildReplayPlaybookRunOptions: () => ({
            defaultScope: "default",
            defaultTenantId: "default",
            embeddedRuntime: { applyWrite: async () => {} },
            replayAccess: liteReplayAccess,
            writeOptions: {
              defaultScope: "default",
              defaultTenantId: "default",
              maxTextLen: 4096,
              piiRedaction: false,
              allowCrossScopeEdges: false,
              shadowDualWriteEnabled: false,
              shadowDualWriteStrict: false,
              writeAccessShadowMirrorV2: true,
              embedder: null,
              embeddedRuntime: { applyWrite: async () => {} },
              replayAccess: liteReplayAccess,
              replayMirror: liteReplayStore,
              writeAccess: liteWriteStore,
            },
            localExecutor: {
              enabled: false,
              mode: "disabled",
              allowedCommands: new Set(),
              workdir: process.cwd(),
              timeoutMs: 1000,
              stdioMaxBytes: 1024,
            },
          }),
        });

        const post = async (url, payload) => {
          const res = await app.inject({ method: "POST", url, payload });
          return { status: res.statusCode, body: JSON.parse(res.body) };
        };

        const runStart = await post("/v1/memory/replay/run/start", {
          goal: "lite replay smoke",
        });
        const runId = runStart.body.run_id;
        const stepBefore = await post("/v1/memory/replay/step/before", {
          run_id: runId,
          step_index: 1,
          tool_name: "echo",
          tool_input: { text: "hello" },
          preconditions: [],
          safety_level: "auto_ok",
        });
        await post("/v1/memory/replay/step/after", {
          run_id: runId,
          step_id: stepBefore.body.step_id,
          step_index: 1,
          status: "success",
          postconditions: [],
          artifact_refs: [],
          repair_applied: false,
        });
        await post("/v1/memory/replay/run/end", {
          run_id: runId,
          status: "success",
          summary: "done",
          success_criteria: {},
          metrics: {},
        });
        const runGet = await post("/v1/memory/replay/runs/get", {
          run_id: runId,
          include_steps: true,
        });
        const compile = await post("/v1/memory/replay/playbooks/compile_from_run", {
          run_id: runId,
          playbook_id: "00000000-0000-0000-0000-000000000777",
          matchers: {},
          risk_profile: "medium",
          metadata: {},
        });
        const promote = await post("/v1/memory/replay/playbooks/promote", {
          playbook_id: "00000000-0000-0000-0000-000000000777",
          target_status: "shadow",
          note: "lite promote smoke",
        });
        const repair = await post("/v1/memory/replay/playbooks/repair", {
          playbook_id: "00000000-0000-0000-0000-000000000777",
          patch: { remove_step_indices: [1] },
          note: "lite repair smoke",
        });
        const repairReview = await post("/v1/memory/replay/playbooks/repair/review", {
          playbook_id: "00000000-0000-0000-0000-000000000777",
          action: "approve",
          auto_shadow_validate: false,
          note: "lite review smoke",
        });
        const playbookGet = await post("/v1/memory/replay/playbooks/get", {
          playbook_id: "00000000-0000-0000-0000-000000000777",
        });
        const candidate = await post("/v1/memory/replay/playbooks/candidate", {
          playbook_id: "00000000-0000-0000-0000-000000000777",
          deterministic_gate: { enabled: false },
        });
        const run = await post("/v1/memory/replay/playbooks/run", {
          playbook_id: "00000000-0000-0000-0000-000000000777",
          mode: "simulate",
        });
        const dispatch = await post("/v1/memory/replay/playbooks/dispatch", {
          playbook_id: "00000000-0000-0000-0000-000000000777",
          deterministic_gate: { enabled: false },
          execute_fallback: false,
        });

        process.stdout.write("__RESULT__" + JSON.stringify({
          runStart,
          runGet,
          compile,
          promote,
          repair,
          repairReview,
          playbookGet,
          candidate,
          run,
          dispatch,
          liteRunTitle: (await liteReplayAccess.findRunNodeByRunId("default", runId, { consumerAgentId: "tester", consumerTeamId: "team-alpha" }))?.title ?? null,
          litePlaybookVersion: (await liteReplayAccess.listReplayPlaybookVersions("default", "00000000-0000-0000-0000-000000000777", { consumerAgentId: "tester", consumerTeamId: "team-alpha" }))[0]?.version_num ?? null,
          foreignRunTitle: (await liteReplayAccess.findRunNodeByRunId("default", runId, { consumerAgentId: "intruder", consumerTeamId: null }))?.title ?? null,
          foreignPlaybookVersion: (await liteReplayAccess.listReplayPlaybookVersions("default", "00000000-0000-0000-0000-000000000777", { consumerAgentId: "intruder", consumerTeamId: null }))[0]?.version_num ?? null,
        }));
      } finally {
        await app.close();
        await liteWriteStore.close();
        await liteReplayStore.close();
        rmSync(tmpDir, { recursive: true, force: true });
      }
    };

    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(out);
  assert.equal(parsed.runStart.status, 200);
  assert.equal(parsed.runGet.status, 200);
  assert.equal(parsed.compile.status, 200);
  assert.equal(parsed.promote.status, 200);
  assert.equal(parsed.repair.status, 200);
  assert.equal(parsed.repairReview.status, 200);
  assert.equal(parsed.playbookGet.status, 200);
  assert.equal(parsed.candidate.status, 200);
  assert.equal(parsed.run.status, 200);
  assert.equal(parsed.dispatch.status, 200);
  assert.equal(parsed.runGet.body.run.status, "success");
  assert.equal(parsed.runGet.body.steps.length, 1);
  assert.equal(parsed.promote.body.to_version, 2);
  assert.equal(parsed.repair.body.to_version, 3);
  assert.equal(parsed.repairReview.body.to_version, 4);
  assert.equal(parsed.repairReview.body.review_state, "approved");
  assert.equal(parsed.playbookGet.body.playbook.version, 4);
  assert.equal(parsed.playbookGet.body.playbook.status, "shadow");
  assert.equal(parsed.candidate.body.playbook.version, 4);
  assert.equal(parsed.dispatch.body.dispatch.decision, "candidate_only");
  assert.equal(parsed.liteRunTitle, "Replay Run " + parsed.runStart.body.run_id.slice(0, 8));
  assert.equal(parsed.litePlaybookVersion, 4);
  assert.equal(parsed.foreignRunTitle, null);
  assert.equal(parsed.foreignPlaybookVersion, null);
});
