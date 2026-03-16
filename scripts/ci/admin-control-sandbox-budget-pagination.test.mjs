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

test("sandbox budget admin list returns 400 for invalid limit", () => {
  const out = runSnippet(`
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerAdminControlConfigRoutes } from "./src/routes/admin-control-config.ts";
    import { createSandboxBudgetService } from "./src/app/sandbox-budget.ts";

    const main = async () => {
      const app = createHttpApp({ TRUST_PROXY: false });
      registerHostErrorHandler(app);
      let queryCalls = 0;
      const service = createSandboxBudgetService({
        env: { MEMORY_SCOPE: "default", MEMORY_TENANT_ID: "default" },
        db: {
          pool: {
            async query() {
              queryCalls += 1;
              return { rows: [], rowCount: 0 };
            },
          },
        },
        sandboxTenantBudgetPolicy: new Map(),
      });

      try {
        registerAdminControlConfigRoutes({
          app,
          db: { pool: { async query() { return { rows: [], rowCount: 0 }; } } },
          embeddingSurfacePolicy: {
            provider_configured: false,
            enabled_surfaces: [],
          },
          embeddingProviderName: null,
          requireAdminToken: () => {},
          emitControlAudit: async () => {},
          tenantQuotaResolver: { invalidate() {} },
          ...service,
        });

        const res = await app.inject({
          method: "GET",
          url: "/v1/admin/control/sandbox-budgets?limit=abc",
        });

        process.stdout.write("__RESULT__" + JSON.stringify({
          status: res.statusCode,
          body: JSON.parse(res.body),
          queryCalls,
        }));
      } finally {
        await app.close();
      }
    };

    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(out);
  assert.equal(parsed.status, 400);
  assert.equal(parsed.body.error, "invalid_request");
  assert.match(parsed.body.message, /limit must be a finite number/);
  assert.equal(parsed.queryCalls, 0);
});

test("sandbox project budget admin list returns 400 for invalid offset", () => {
  const out = runSnippet(`
    import { createHttpApp } from "./src/host/bootstrap.ts";
    import { registerHostErrorHandler } from "./src/host/http-host.ts";
    import { registerAdminControlConfigRoutes } from "./src/routes/admin-control-config.ts";
    import { createSandboxBudgetService } from "./src/app/sandbox-budget.ts";

    const main = async () => {
      const app = createHttpApp({ TRUST_PROXY: false });
      registerHostErrorHandler(app);
      let queryCalls = 0;
      const service = createSandboxBudgetService({
        env: { MEMORY_SCOPE: "default", MEMORY_TENANT_ID: "default" },
        db: {
          pool: {
            async query() {
              queryCalls += 1;
              return { rows: [], rowCount: 0 };
            },
          },
        },
        sandboxTenantBudgetPolicy: new Map(),
      });

      try {
        registerAdminControlConfigRoutes({
          app,
          db: { pool: { async query() { return { rows: [], rowCount: 0 }; } } },
          embeddingSurfacePolicy: {
            provider_configured: false,
            enabled_surfaces: [],
          },
          embeddingProviderName: null,
          requireAdminToken: () => {},
          emitControlAudit: async () => {},
          tenantQuotaResolver: { invalidate() {} },
          ...service,
        });

        const res = await app.inject({
          method: "GET",
          url: "/v1/admin/control/sandbox-project-budgets?offset=oops",
        });

        process.stdout.write("__RESULT__" + JSON.stringify({
          status: res.statusCode,
          body: JSON.parse(res.body),
          queryCalls,
        }));
      } finally {
        await app.close();
      }
    };

    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  `);

  const parsed = JSON.parse(out);
  assert.equal(parsed.status, 400);
  assert.equal(parsed.body.error, "invalid_request");
  assert.match(parsed.body.message, /offset must be a finite number/);
  assert.equal(parsed.queryCalls, 0);
});
