import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import {
  doctorCodexProductShell,
  disableCodexProductShell,
  enableCodexProductShell,
  removeCodexProductShell,
  restoreCodexProductShellHooks,
  startCodexProductShellRuntime,
  writeCodexProductShellInstall,
} from "../../src/product/codex-product-shell.js";

test("codex product shell setup installs launchers and managed hooks", async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "aionis-codex-home-"));
  const { config, paths, install_state } = await writeCodexProductShellInstall({
    repo_root: "/Volumes/ziel/Aionisgo",
    codex_home: codexHome,
    base_url: "http://127.0.0.1:3111",
    scope: "codex-product-test",
  });

  assert.equal(install_state, "created");
  assert.equal(config.base_url, "http://127.0.0.1:3111");
  assert.equal(config.scope, "codex-product-test");
  assert.equal(paths.hooks_path.startsWith(codexHome), true);
  const doctor = await doctorCodexProductShell(codexHome);
  assert.equal(doctor.status.config_exists, true);
  assert.equal(doctor.status.hook_launcher_exists, true);
  assert.equal(doctor.status.shell_launcher_exists, true);
  assert.equal(doctor.status.user_launcher_exists, true);
  assert.equal(doctor.status.hooks_installed, true);
  assert.equal(doctor.status.hooks_enabled, true);
  assert.equal(doctor.status.hooks_backup_exists, false);
  assert.equal(doctor.status.hooks_managed_marker_present, true);
  assert.equal(doctor.status.hooks_backup_restorable, false);
});

test("codex product shell doctor reports healthy runtime when /health responds", async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "aionis-codex-home-"));
  const server = http.createServer((_req, res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await writeCodexProductShellInstall({
      repo_root: "/Volumes/ziel/Aionisgo",
      codex_home: codexHome,
      base_url: baseUrl,
      scope: "codex-product-test",
    });
    const result = await doctorCodexProductShell(codexHome);
    assert.equal(result.status.runtime_healthy, true);
    assert.equal(result.status.runtime_status_code, 200);
    assert.equal(result.status.hooks_enabled, true);
    assert.equal(result.status.hooks_managed_marker_present, true);
    assert.equal(result.status.hooks_backup_restorable, false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("codex product shell start spawns runtime when health is unavailable", async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "aionis-codex-home-"));
  await writeCodexProductShellInstall({
    repo_root: "/Volumes/ziel/Aionisgo",
    codex_home: codexHome,
    base_url: "http://127.0.0.1:3999",
    scope: "codex-product-test",
  });

  const calls: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = [];
  const result = await startCodexProductShellRuntime(codexHome, {
    spawnLike: ((command, args, options) => {
      calls.push({ command, args, options });
      return {
        pid: 43210,
        unref() {},
      } as any;
    }),
  });

  assert.equal(result.status, "started");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.command, "npm");
  assert.deepEqual(calls[0]?.args, ["run", "start:lite"]);
});

test("codex product shell can disable and re-enable managed hooks", async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "aionis-codex-home-"));
  await writeCodexProductShellInstall({
    repo_root: "/Volumes/ziel/Aionisgo",
    codex_home: codexHome,
    base_url: "http://127.0.0.1:3111",
    scope: "codex-product-test",
  });

  const disabled = await disableCodexProductShell(codexHome);
  assert.equal(disabled.paths.hooks_path.startsWith(codexHome), true);
  const afterDisable = await doctorCodexProductShell(codexHome);
  assert.equal(afterDisable.status.hooks_installed, true);
  assert.equal(afterDisable.status.hooks_enabled, false);
  assert.equal(afterDisable.status.hooks_managed_marker_present, false);

  await enableCodexProductShell(codexHome);
  const afterEnable = await doctorCodexProductShell(codexHome);
  assert.equal(afterEnable.status.hooks_enabled, true);
  assert.equal(afterEnable.status.hooks_managed_marker_present, true);
});

test("codex product shell setup backs up an existing hooks.json before patching it", async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "aionis-codex-home-"));
  const hooksPath = path.join(codexHome, "hooks.json");
  await writeFile(
    hooksPath,
    JSON.stringify({
      hooks: {
        Stop: [{
          hooks: [{
            type: "command",
            command: "python3 /tmp/existing-stop-hook.py",
          }],
        }],
      },
    }, null, 2),
    "utf8",
  );

  const { paths } = await writeCodexProductShellInstall({
    repo_root: "/Volumes/ziel/Aionisgo",
    codex_home: codexHome,
    base_url: "http://127.0.0.1:3111",
    scope: "codex-product-test",
  });

  const doctor = await doctorCodexProductShell(codexHome);
  assert.equal(doctor.status.hooks_backup_exists, true);
  assert.equal(doctor.status.hooks_backup_restorable, true);
  const backupRaw = await readFile(paths.hooks_backup_path, "utf8");
  assert.match(backupRaw, /existing-stop-hook/);
});

test("codex product shell setup reports unchanged for idempotent reruns and updated for config changes", async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "aionis-codex-home-"));
  const created = await writeCodexProductShellInstall({
    repo_root: "/Volumes/ziel/Aionisgo",
    codex_home: codexHome,
    base_url: "http://127.0.0.1:3111",
    scope: "codex-product-test",
  });
  assert.equal(created.install_state, "created");

  const unchanged = await writeCodexProductShellInstall({
    repo_root: "/Volumes/ziel/Aionisgo",
    codex_home: codexHome,
    base_url: "http://127.0.0.1:3111",
    scope: "codex-product-test",
  });
  assert.equal(unchanged.install_state, "unchanged");

  const updated = await writeCodexProductShellInstall({
    repo_root: "/Volumes/ziel/Aionisgo",
    codex_home: codexHome,
    base_url: "http://127.0.0.1:3222",
    scope: "codex-product-test-2",
  });
  assert.equal(updated.install_state, "updated");
  assert.equal(updated.config.base_url, "http://127.0.0.1:3222");
  assert.equal(updated.config.scope, "codex-product-test-2");
});

test("codex product shell restore writes the original hooks backup back to hooks.json", async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "aionis-codex-home-"));
  const hooksPath = path.join(codexHome, "hooks.json");
  await writeFile(
    hooksPath,
    JSON.stringify({
      hooks: {
        Stop: [{
          hooks: [{
            type: "command",
            command: "python3 /tmp/original-hook.py",
          }],
        }],
      },
    }, null, 2),
    "utf8",
  );

  await writeCodexProductShellInstall({
    repo_root: "/Volumes/ziel/Aionisgo",
    codex_home: codexHome,
    base_url: "http://127.0.0.1:3111",
    scope: "codex-product-test",
  });
  await disableCodexProductShell(codexHome);
  const restored = await restoreCodexProductShellHooks(codexHome);
  assert.equal(restored.restored, true);

  const hooksRaw = await readFile(hooksPath, "utf8");
  assert.match(hooksRaw, /original-hook/);
  assert.doesNotMatch(hooksRaw, /Aionis warming execution memory/);
});

test("codex product shell remove deletes Aionis-managed launchers and config after disabling hooks", async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "aionis-codex-home-"));
  const { paths } = await writeCodexProductShellInstall({
    repo_root: "/Volumes/ziel/Aionisgo",
    codex_home: codexHome,
    base_url: "http://127.0.0.1:3111",
    scope: "codex-product-test",
  });

  const removed = await removeCodexProductShell(codexHome);
  assert.equal(removed.removed, true);
  assert.deepEqual(
    removed.removed_paths.sort(),
    [paths.config_path, paths.hook_launcher_path, paths.shell_launcher_path, paths.user_launcher_path].sort(),
  );

  const doctor = await doctorCodexProductShell(codexHome);
  assert.equal(doctor.status.config_exists, false);
  assert.equal(doctor.status.hook_launcher_exists, false);
  assert.equal(doctor.status.shell_launcher_exists, false);
  assert.equal(doctor.status.user_launcher_exists, false);
  assert.equal(doctor.status.hooks_enabled, false);
  assert.equal(doctor.status.hooks_managed_marker_present, false);
});
