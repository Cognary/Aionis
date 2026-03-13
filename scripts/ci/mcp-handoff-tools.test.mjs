import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function runSnippet(source) {
  return execFileSync("npx", ["tsx", "-e", source], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
}

test("aionis_store_handoff writes a standardized handoff artifact", () => {
  const out = runSnippet(`
    import { invokeTool } from "./src/mcp/dev/tools.ts";

    const requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(
        JSON.stringify({
          tenant_id: "default",
          scope: "test",
          commit_id: "commit-1",
          commit_uri: "aionis://default/test/commit/commit-1",
          handoff: {
            id: "node-1",
            uri: "aionis://default/test/event/node-1",
            type: "event",
            client_id: null,
            handoff_kind: "patch_handoff",
            anchor: "ab-anchor",
            file_path: "/repo/foo.py",
            repo_root: null,
            symbol: "parse_foo",
            summary: "Preserve empty tuple semantics",
            handoff_text: "Only normalize () in the narrow envvar-backed variadic case.",
            risk: "Empty tuple collapses to UNSET too broadly.",
            acceptance_checks: ["Add regression for nargs == -1"],
            tags: [],
            target_files: ["/repo/foo.py", "/repo/tests/test_options.py"],
            next_action: "Patch parse_foo and extend regression coverage.",
            must_change: ["touch parser logic"],
            must_remove: ["TODO: investigate later"],
            must_keep: ["existing tuple semantics outside envvar path"],
            memory_lane: "shared",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const env = {
      AIONIS_BASE_URL: "http://127.0.0.1:3101",
      AIONIS_SCOPE: "test",
      AIONIS_TIMEOUT_MS: 15000,
      AIONIS_MAX_TOOL_TEXT_CHARS: 10000,
    };

    (async () => {
      const result = await invokeTool(env, "aionis_store_handoff", {
        anchor: "ab-anchor",
        file_path: "/repo/foo.py",
        symbol: "parse_foo",
        summary: "Preserve empty tuple semantics",
        handoff_text: "Only normalize () in the narrow envvar-backed variadic case.",
        risk: "Empty tuple collapses to UNSET too broadly.",
        acceptance_checks: ["Add regression for nargs == -1"],
        target_files: ["/repo/foo.py", "/repo/tests/test_options.py"],
        next_action: "Patch parse_foo and extend regression coverage.",
        must_change: ["touch parser logic"],
        must_remove: ["TODO: investigate later"],
        must_keep: ["existing tuple semantics outside envvar path"],
      });
      process.stdout.write(JSON.stringify({ result, requests }));
    })().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(out);
  assert.equal(parsed.result.isError, undefined);
  assert.match(parsed.result.content[0].text, /commit_id: commit-1/);
  assert.equal(parsed.requests.length, 1);
  assert.equal(parsed.requests[0].url, "http://127.0.0.1:3101/v1/handoff/store");
  assert.equal(parsed.requests[0].body.memory_lane, undefined);
  assert.equal(parsed.requests[0].body.handoff_kind, "patch_handoff");
  assert.equal(parsed.requests[0].body.anchor, "ab-anchor");
  assert.equal(parsed.requests[0].body.file_path, "/repo/foo.py");
  assert.equal(parsed.requests[0].body.symbol, "parse_foo");
  assert.equal(parsed.requests[0].body.handoff_text, "Only normalize () in the narrow envvar-backed variadic case.");
  assert.deepEqual(parsed.requests[0].body.target_files, ["/repo/foo.py", "/repo/tests/test_options.py"]);
  assert.equal(parsed.requests[0].body.next_action, "Patch parse_foo and extend regression coverage.");
});

test("aionis_recover_handoff uses native handoff recover endpoint to recover exact handoff text", () => {
  const out = runSnippet(`
    import { invokeTool } from "./src/mcp/dev/tools.ts";

    const requests = [];
    globalThis.fetch = async (url, init) => {
      const request = { url: String(url), body: JSON.parse(String(init?.body ?? "{}")) };
      requests.push(request);

      if (request.url.endsWith("/v1/handoff/recover")) {
        return new Response(
          JSON.stringify({
            tenant_id: "default",
            scope: "test",
            handoff_kind: "patch_handoff",
            anchor: "ab-anchor",
            matched_nodes: 1,
            handoff: {
              id: "node-1",
              uri: "aionis://default/test/event/node-1",
              title: "Handoff ab-anchor",
              summary: "Preserve empty tuple semantics",
              handoff_text: "Only normalize () in the narrow envvar-backed variadic case.",
              file_path: "/repo/foo.py",
              repo_root: "/repo",
              symbol: "parse_foo",
              risk: "Empty tuple collapses to UNSET too broadly.",
              acceptance_checks: ["Add regression for nargs == -1"],
              tags: [],
              target_files: ["/repo/foo.py", "/repo/tests/test_options.py"],
              next_action: "Patch parse_foo and extend regression coverage.",
              must_change: ["touch parser logic"],
              must_remove: ["TODO: investigate later"],
              must_keep: ["existing tuple semantics outside envvar path"],
              memory_lane: "shared",
              commit_id: "commit-1",
              commit_uri: "aionis://default/test/commit/commit-1",
            },
            execution_ready_handoff: {
              anchor: "ab-anchor",
              handoff_kind: "patch_handoff",
              file_path: "/repo/foo.py",
              repo_root: "/repo",
              symbol: "parse_foo",
              target_files: ["/repo/foo.py", "/repo/tests/test_options.py"],
              next_action: "Patch parse_foo and extend regression coverage.",
              summary: "Preserve empty tuple semantics",
              handoff_text: "Only normalize () in the narrow envvar-backed variadic case.",
              risk: "Empty tuple collapses to UNSET too broadly.",
              must_change: ["touch parser logic"],
              must_remove: ["TODO: investigate later"],
              must_keep: ["existing tuple semantics outside envvar path"],
              acceptance_checks: ["Add regression for nargs == -1"],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      throw new Error("unexpected url " + request.url);
    };

    const env = {
      AIONIS_BASE_URL: "http://127.0.0.1:3101",
      AIONIS_SCOPE: "test",
      AIONIS_TIMEOUT_MS: 15000,
      AIONIS_MAX_TOOL_TEXT_CHARS: 10000,
    };

    (async () => {
      const result = await invokeTool(env, "aionis_recover_handoff", {
        anchor: "ab-anchor",
        repo_root: "/repo",
        file_path: "/repo/foo.py",
        symbol: "parse_foo",
        recall_limit: 17,
      });
      process.stdout.write(JSON.stringify({ result, requests }));
    })().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(out);
  assert.equal(parsed.result.isError, undefined);
  assert.equal(parsed.requests.length, 1);
  assert.equal(parsed.requests[0].url, "http://127.0.0.1:3101/v1/handoff/recover");
  assert.equal(parsed.requests[0].body.anchor, "ab-anchor");
  assert.equal(parsed.requests[0].body.repo_root, "/repo");
  assert.equal(parsed.requests[0].body.file_path, "/repo/foo.py");
  assert.equal(parsed.requests[0].body.recall_limit, undefined);
  assert.match(parsed.result.content[0].text, /handoff_text: Only normalize \(\) in the narrow envvar-backed variadic case\./);
  assert.match(parsed.result.content[0].text, /repo_root: \/repo/);
  assert.match(parsed.result.content[0].text, /next_action: Patch parse_foo and extend regression coverage\./);
  assert.match(parsed.result.content[0].text, /source_uri: aionis:\/\/default\/test\/event\/node-1/);
  assert.match(parsed.result.content[0].text, /commit_id: commit-1/);
});

test("aionis_store_handoff allows task_handoff without file_path", () => {
  const out = runSnippet(`
    import { invokeTool } from "./src/mcp/dev/tools.ts";

    const requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(
        JSON.stringify({
          tenant_id: "default",
          scope: "test",
          commit_id: "commit-task-1",
          handoff: {
            id: "node-task-1",
            uri: "aionis://default/test/event/node-task-1",
            handoff_kind: "task_handoff",
            anchor: "task-anchor",
            file_path: null,
            repo_root: null,
            symbol: null,
            summary: "Resume deploy checklist",
            handoff_text: "Continue from approval step 2.",
            risk: null,
            acceptance_checks: [],
            tags: [],
            target_files: [],
            next_action: "Request final approval",
            must_change: [],
            must_remove: [],
            must_keep: [],
            memory_lane: "shared",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const env = {
      AIONIS_BASE_URL: "http://127.0.0.1:3101",
      AIONIS_SCOPE: "test",
      AIONIS_TIMEOUT_MS: 15000,
      AIONIS_MAX_TOOL_TEXT_CHARS: 10000,
    };

    (async () => {
      const result = await invokeTool(env, "aionis_store_handoff", {
        anchor: "task-anchor",
        handoff_kind: "task_handoff",
        summary: "Resume deploy checklist",
        handoff_text: "Continue from approval step 2.",
        next_action: "Request final approval",
      });
      process.stdout.write(JSON.stringify({ result, requests }));
    })().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(out);
  assert.equal(parsed.result.isError, undefined);
  assert.equal(parsed.requests[0].body.handoff_kind, "task_handoff");
  assert.equal(parsed.requests[0].body.file_path, undefined);
  assert.equal(parsed.requests[0].body.next_action, "Request final approval");
});
