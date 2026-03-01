import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { chromium } from "playwright";

const HOST = "127.0.0.1";
const PORT = Number(process.env.OPS_E2E_PORT || 3310);
const BASE_URL = `http://${HOST}:${PORT}`;
const START_TIMEOUT_MS = 60_000;
const STOP_GRACE_MS = 5_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return true;
  return await new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(ok);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
  });
}

async function stopChildProcess(child) {
  if (!child) return;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const canGroupKill = process.platform !== "win32" && Number.isFinite(child.pid) && child.pid > 0;
  if (canGroupKill) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  } else {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
  const exitedAfterTerm = await waitForChildExit(child, STOP_GRACE_MS);
  if (exitedAfterTerm) return;
  if (canGroupKill) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
  } else {
    try {
      child.kill("SIGKILL");
    } catch {}
  }
  await waitForChildExit(child, STOP_GRACE_MS);
}

async function waitForHttpReady(url, timeoutMs = START_TIMEOUT_MS) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
      lastError = new Error(`status=${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(`ops e2e timeout waiting for ${url}; lastError=${String(lastError?.message || lastError || "unknown")}`);
}

function createFixtureFiles() {
  const dir = mkdtempSync(path.join(tmpdir(), "aionis-ops-e2e-"));
  const invalidPath = path.join(dir, "invalid.json");
  const versionedPath = path.join(dir, "versioned.json");
  const legacyPath = path.join(dir, "legacy.json");

  writeFileSync(invalidPath, JSON.stringify({ bad: "format" }, null, 2), "utf8");
  writeFileSync(
    versionedPath,
    JSON.stringify(
      {
        schema_version: 1,
        items: [
          {
            at: "2026-03-01T00:00:00.000Z",
            op: "incident_replay",
            status: 200,
            request_id: "req-a",
            payload: { tenant_id: "default", dry_run: true },
          },
          {
            at: "2026-03-01T00:01:00.000Z",
            op: "tenant_quota_upsert",
            status: 202,
            request_id: "req-b",
            payload: { tenant_id: "default" },
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(
    legacyPath,
    JSON.stringify(
      [
        {
          at: "2026-03-01T00:02:00.000Z",
          op: "alert_route_create",
          status: 201,
          request_id: "req-c",
          payload: { tenant_id: "default", channel: "webhook" },
        },
      ],
      null,
      2,
    ),
    "utf8",
  );

  return { dir, invalidPath, versionedPath, legacyPath };
}

function startOpsServer() {
  const env = {
    ...process.env,
    AIONIS_BASE_URL: process.env.AIONIS_BASE_URL || "http://127.0.0.1:3999",
    AIONIS_ADMIN_TOKEN: process.env.AIONIS_ADMIN_TOKEN || "test-admin-token",
    OPS_BASIC_AUTH_ENABLED: "false",
    OPS_IP_ALLOWLIST: "",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const hasLocalNextBin = existsSync(nextBin);
  const cmd = hasLocalNextBin ? process.execPath : process.platform === "win32" ? "npx.cmd" : "npx";
  const args = hasLocalNextBin
    ? [nextBin, "dev", "--hostname", HOST, "--port", String(PORT)]
    : ["next", "dev", "--hostname", HOST, "--port", String(PORT)];
  const child = spawn(cmd, args, {
    cwd: process.cwd(),
    env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs = [];
  const onData = (chunk) => {
    const line = String(chunk || "");
    logs.push(line);
    if (logs.length > 120) logs.shift();
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(`[ops-e2e] next dev exited with code=${code} signal=${String(signal || "")}`);
    }
  });

  return { child, logs };
}

async function waitForText(page, text, timeout = 12_000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout });
}

async function waitForWarnLine(page, timeout = 12_000) {
  const warn = page.locator(".warn-line").first();
  await warn.waitFor({ state: "visible", timeout });
  const text = (await warn.textContent()) || "";
  return text.trim();
}

async function buttonDisabled(locator, expected, label) {
  const actual = await locator.isDisabled();
  assert.equal(actual, expected, `${label} disabled expected ${String(expected)} got ${String(actual)}`);
}

async function waitForReactBinding(locator, timeoutMs = 20_000) {
  await locator.evaluate(
    (el, timeout) =>
      new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const timer = setInterval(() => {
          const bound = Object.keys(el || {}).some((key) => key.startsWith("__reactProps"));
          if (bound) {
            clearInterval(timer);
            resolve(true);
            return;
          }
          if (Date.now() - startedAt > Number(timeout || 20_000)) {
            clearInterval(timer);
            reject(new Error("react client binding timeout"));
          }
        }, 80);
      }),
    timeoutMs,
  );
}

async function run() {
  const fixtures = createFixtureFiles();
  const { child, logs } = startOpsServer();
  let browser = null;
  try {
    await waitForHttpReady(`${BASE_URL}/actions`);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`${BASE_URL}/actions`, { waitUntil: "domcontentloaded" });
    await waitForText(page, "Local Action Breadcrumbs");

    const prevButton = page.getByRole("button", { name: "Prev" });
    const nextButton = page.getByRole("button", { name: "Next" });
    const copyButton = page.getByRole("button", { name: "Copy Current Item" });
    const clearButton = page.getByRole("button", { name: "Clear Import" });
    const fileInput = page.getByLabel(/import replay json/i);
    await waitForReactBinding(fileInput);

    await buttonDisabled(prevButton, true, "Prev(initial)");
    await buttonDisabled(nextButton, true, "Next(initial)");
    await buttonDisabled(copyButton, true, "Copy(initial)");
    await buttonDisabled(clearButton, true, "Clear(initial)");

    await fileInput.setInputFiles(fixtures.invalidPath);
    const warnText = await waitForWarnLine(page);
    assert.match(warnText, /(invalid breadcrumb|import failed)/i, `unexpected warn-line text: ${warnText}`);
    await buttonDisabled(clearButton, true, "Clear(after-invalid)");

    await fileInput.setInputFiles(fixtures.versionedPath);
    await waitForText(page, "Replay position: 1 / 2");
    await waitForText(page, "Import format: versioned_object, schema_version=v1");
    await buttonDisabled(prevButton, true, "Prev(first-item)");
    await buttonDisabled(nextButton, false, "Next(first-item)");
    await buttonDisabled(copyButton, false, "Copy(first-item)");
    await buttonDisabled(clearButton, false, "Clear(first-item)");

    await nextButton.click();
    await waitForText(page, "Replay position: 2 / 2");
    await buttonDisabled(prevButton, false, "Prev(last-item)");
    await buttonDisabled(nextButton, true, "Next(last-item)");

    await prevButton.click();
    await waitForText(page, "Replay position: 1 / 2");

    await clearButton.click();
    await waitForText(page, "No imported replay data.");
    await buttonDisabled(prevButton, true, "Prev(after-clear)");
    await buttonDisabled(nextButton, true, "Next(after-clear)");
    await buttonDisabled(copyButton, true, "Copy(after-clear)");
    await buttonDisabled(clearButton, true, "Clear(after-clear)");

    await fileInput.setInputFiles(fixtures.legacyPath);
    await waitForText(page, "Import format: array, schema_version=legacy");
    await waitForText(page, "Replay position: 1 / 1");
    await buttonDisabled(prevButton, true, "Prev(legacy)");
    await buttonDisabled(nextButton, true, "Next(legacy)");
    await buttonDisabled(copyButton, false, "Copy(legacy)");
    await buttonDisabled(clearButton, false, "Clear(legacy)");

    console.log(
      JSON.stringify({
        ok: true,
        base_url: BASE_URL,
        checks: [
          "invalid-import-error-visible",
          "versioned-import-meta-and-navigation",
          "clear-resets-buttons",
          "legacy-import-meta",
        ],
      }),
    );
  } catch (error) {
    const tail = logs.slice(-30).join("");
    console.error("[ops-e2e] failure:", error);
    if (tail) {
      console.error("[ops-e2e] next dev log tail:");
      console.error(tail);
    }
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    rmSync(fixtures.dir, { recursive: true, force: true });
    await stopChildProcess(child);
  }
}

await run();
process.exit(process.exitCode || 0);
