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
  const lines = out.split("\\n").map((line) => line.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

test("lite edition rejects server-only admin control routes with stable 501 contract", () => {
  const out = runSnippet(`
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerLiteServerOnlyRoutes } from "./src/host/lite-edition.ts";

    const app = createHttpApp({ TRUST_PROXY: false });
    registerHostErrorHandler(app);
    registerLiteServerOnlyRoutes(app);

    const run = async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/admin/control/tenants",
        payload: {},
      });
      process.stdout.write("__RESULT__" + JSON.stringify({ status: res.statusCode, body: JSON.parse(res.body) }));
      await app.close();
    };
    run().catch(async (err) => {
      console.error(err);
      try { await app.close(); } catch {}
      process.exit(1);
    });
  `);
  const parsed = JSON.parse(out);
  assert.equal(parsed.status, 501);
  assert.equal(parsed.body.error, "server_only_in_lite");
  assert.equal(parsed.body.details.edition, "lite");
  assert.equal(parsed.body.details.route_group, "admin_control");
});

test("lite edition rejects automation routes with stable 501 contract", () => {
  const out = runSnippet(`
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerLiteServerOnlyRoutes } from "./src/host/lite-edition.ts";

    const app = createHttpApp({ TRUST_PROXY: false });
    registerHostErrorHandler(app);
    registerLiteServerOnlyRoutes(app);

    const run = async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/automations/list",
        payload: {},
      });
      process.stdout.write("__RESULT__" + JSON.stringify({ status: res.statusCode, body: JSON.parse(res.body) }));
      await app.close();
    };
    run().catch(async (err) => {
      console.error(err);
      try { await app.close(); } catch {}
      process.exit(1);
    });
  `);
  const parsed = JSON.parse(out);
  assert.equal(parsed.status, 501);
  assert.equal(parsed.body.error, "server_only_in_lite");
  assert.equal(parsed.body.details.edition, "lite");
  assert.equal(parsed.body.details.route_group, "automations");
});

test("lite edition route matrix advertises kernel and server-only split", () => {
  const out = runSnippet(`
    import { buildLiteRouteMatrix } from "./src/host/lite-edition.ts";
    process.stdout.write("__RESULT__" + JSON.stringify(buildLiteRouteMatrix()));
  `);
  const parsed = JSON.parse(out);
  assert.ok(parsed.kernel_required_routes.includes("memory-write"));
  assert.ok(parsed.server_only_route_groups.some((entry) => entry.group === "admin_control"));
  assert.ok(parsed.server_only_route_groups.some((entry) => entry.group === "automations"));
});
