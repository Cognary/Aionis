import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const execFileAsync = promisify(execFile);

test("aionis_replay_run_get uses /v1/memory/replay/runs/get", async () => {
  let seenPath = null;
  let seenBody = null;

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      seenPath = req.url;
      seenBody = raw.length > 0 ? JSON.parse(raw) : null;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ run: { run_id: seenBody?.run_id ?? null, status: "success" } }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const { stdout } = await execFileAsync(
      "npx",
      [
        "tsx",
        "-e",
        `
          import { invokeTool } from "./src/mcp/dev/tools.ts";
          const env = {
            AIONIS_BASE_URL: ${JSON.stringify(baseUrl)},
            AIONIS_SCOPE: "test",
            AIONIS_TIMEOUT_MS: 5000,
            AIONIS_MAX_TOOL_TEXT_CHARS: 12000,
          };
          (async () => {
            const result = await invokeTool(env, "aionis_replay_run_get", {
              run_id: "83e481e3-a732-4500-b95d-642551143b39",
              include_steps: true,
            });
            process.stdout.write(JSON.stringify(result));
          })().catch((err) => {
            console.error(err);
            process.exit(1);
          });
        `,
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
      },
    );

    const parsed = JSON.parse(stdout.trim());
    assert.equal(parsed.isError, undefined);
    assert.equal(seenPath, "/v1/memory/replay/runs/get");
    assert.equal(seenBody?.scope, "test");
    assert.equal(seenBody?.run_id, "83e481e3-a732-4500-b95d-642551143b39");
    assert.equal(seenBody?.include_steps, true);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
