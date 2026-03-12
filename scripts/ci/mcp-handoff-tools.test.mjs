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
          nodes: [{ id: "node-1", uri: "aionis://default/test/event/node-1", type: "event" }],
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
  assert.equal(parsed.requests[0].url, "http://127.0.0.1:3101/v1/memory/write");
  assert.equal(parsed.requests[0].body.memory_lane, "shared");
  assert.equal(parsed.requests[0].body.nodes[0].type, "event");
  assert.equal(parsed.requests[0].body.nodes[0].slots.summary_kind, "handoff");
  assert.equal(parsed.requests[0].body.nodes[0].slots.handoff_kind, "patch_handoff");
  assert.equal(parsed.requests[0].body.nodes[0].slots.anchor, "ab-anchor");
  assert.equal(parsed.requests[0].body.nodes[0].slots.file_path, "/repo/foo.py");
  assert.equal(parsed.requests[0].body.nodes[0].slots.symbol, "parse_foo");
  assert.equal(parsed.requests[0].body.nodes[0].slots.handoff_text, "Only normalize () in the narrow envvar-backed variadic case.");
});

test("aionis_recover_handoff uses recall, find, and resolve to recover exact handoff text", () => {
  const out = runSnippet(`
    import { invokeTool } from "./src/mcp/dev/tools.ts";

    const requests = [];
    globalThis.fetch = async (url, init) => {
      const request = { url: String(url), body: JSON.parse(String(init?.body ?? "{}")) };
      requests.push(request);

      if (request.url.endsWith("/v1/memory/recall_text")) {
        return new Response(
          JSON.stringify({ context: { text: "# Supporting Events / Evidence\\n- anchor handoff cited" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (request.url.endsWith("/v1/memory/find")) {
        return new Response(
          JSON.stringify({
            find_summary: { summary_version: "find_summary_v1", returned_nodes: 1, has_more: false },
            nodes: [
              {
                uri: "aionis://default/test/event/node-1",
                id: "node-1",
                type: "event",
                updated_at: "2026-03-12T00:00:00.000Z",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (request.url.endsWith("/v1/memory/resolve")) {
        return new Response(
          JSON.stringify({
            node: {
              uri: "aionis://default/test/event/node-1",
              commit_id: "commit-1",
              text_summary: "Preserve empty tuple semantics",
              slots: {
                summary_kind: "handoff",
                handoff_kind: "patch_handoff",
                anchor: "ab-anchor",
                file_path: "/repo/foo.py",
                symbol: "parse_foo",
                risk: "Empty tuple collapses to UNSET too broadly.",
                handoff_text: "Only normalize () in the narrow envvar-backed variadic case.",
                acceptance_checks: ["Add regression for nargs == -1"],
              },
            },
            resolve_summary: {
              summary_version: "resolve_summary_v1",
              payload_kind: "node",
              resolved_type: "event",
              related_uri_count: 2,
              related_uris: ["aionis://default/test/event/node-1", "aionis://default/test/commit/commit-1"],
              object_keys: ["id", "uri"],
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
        file_path: "/repo/foo.py",
        symbol: "parse_foo",
      });
      process.stdout.write(JSON.stringify({ result, requests }));
    })().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(out);
  assert.equal(parsed.result.isError, undefined);
  assert.equal(parsed.requests.length, 3);
  assert.equal(parsed.requests[0].url, "http://127.0.0.1:3101/v1/memory/recall_text");
  assert.equal(parsed.requests[1].url, "http://127.0.0.1:3101/v1/memory/find");
  assert.equal(parsed.requests[2].url, "http://127.0.0.1:3101/v1/memory/resolve");
  assert.equal(parsed.requests[1].body.slots_contains.summary_kind, "handoff");
  assert.equal(parsed.requests[1].body.slots_contains.anchor, "ab-anchor");
  assert.equal(parsed.requests[1].body.slots_contains.file_path, "/repo/foo.py");
  assert.match(parsed.result.content[0].text, /handoff_text: Only normalize \(\) in the narrow envvar-backed variadic case\./);
  assert.match(parsed.result.content[0].text, /source_uri: aionis:\/\/default\/test\/event\/node-1/);
  assert.match(parsed.result.content[0].text, /supporting_recall: # Supporting Events \/ Evidence/);
});
