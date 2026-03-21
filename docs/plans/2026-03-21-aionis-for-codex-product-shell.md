# Aionis for Codex Product Shell Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the first actual Aionis-for-Codex product shell with install, status, startup, restore, and removal commands.

**Architecture:** Build one source-owned product-shell CLI that manages Codex install state under `~/.codex/aionis`, writes Aionis-managed hook launchers, merges `hooks.json`, and provides a runtime health/start surface. Reuse the existing Codex hook bridge and shell bridge instead of exposing them directly to users.

**Tech Stack:** TypeScript, node:fs, node:path, node:child_process, zod, node:test.

---

### Task 1: Define the product-shell contracts

**Files:**
- Create: `/Volumes/ziel/Aionisgo/src/product/codex-product-shell.ts`
- Test: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-codex-product-shell.test.ts`

**Step 1: Add config and path helpers**

Define:

1. product-shell config shape
2. codex home resolver
3. generated path resolver

**Step 2: Add hook merge helpers**

Implement helpers that:

1. load existing `hooks.json`
2. merge or replace only the Aionis-managed handlers
3. preserve unrelated Codex hook entries

**Step 3: Add launcher generation helpers**

Implement helpers that write:

1. `aionis-codex-hook.sh`
2. `aionis-codex-shell.sh`

### Task 2: Implement `setup`

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/src/product/codex-product-shell.ts`
- Test: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-codex-product-shell.test.ts`

**Step 1: Write config**

Persist:

1. repo root
2. base URL
3. scope
4. codex home

**Step 2: Write launchers**

Create the generated shell launchers in the Aionis subfolder under Codex home.

**Step 3: Merge hooks**

Install Aionis-managed handlers into `hooks.json` for:

1. `SessionStart`
2. `UserPromptSubmit`
3. `Stop`

**Step 4: Make setup idempotent**

Return whether the product shell was:

1. `created`
2. `updated`
3. `unchanged`

### Task 3: Implement `doctor`

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/src/product/codex-product-shell.ts`
- Test: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-codex-product-shell.test.ts`

**Step 1: Check installation state**

Return structured status for:

1. config
2. launcher files
3. hook installation

**Step 2: Check runtime health**

Call `/health` on the configured base URL and report:

1. healthy
2. unreachable

### Task 4: Implement `start`

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/src/product/codex-product-shell.ts`
- Test: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-codex-product-shell.test.ts`

**Step 1: Health-check first**

If runtime is already healthy, return `already_running`.

**Step 2: Spawn the runtime**

If runtime is not healthy, spawn detached:

```bash
npm run start:lite
```

with the configured port derived from the base URL.

**Step 3: Return structured result**

Return:

1. requested command
2. port
3. detached pid when available

### Task 5: Add CLI entrypoint and script

**Files:**
- Create: `/Volumes/ziel/Aionisgo/src/product/aionis-for-codex.ts`
- Modify: `/Volumes/ziel/Aionisgo/package.json`
- Test: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-codex-product-shell-entry.test.ts`

**Step 1: Parse subcommands**

Support:

1. `setup`
2. `doctor`
3. `status`
4. `enable`
5. `disable`
6. `restore`
7. `remove`
8. `start`

**Step 2: Emit structured JSON**

Keep the entrypoint easy to automate and debug.

**Step 3: Add package script**

Add:

1. `product:codex`

### Task 6: Surface the product shell

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/README.md`
- Create: `/Volumes/ziel/Aionisgo/docs/AIONIS_FOR_CODEX_PRODUCT_SHELL_GUIDE.md`

**Step 1: Add the actual user path**

Document:

1. `setup`
2. `doctor`
3. `status`
4. `enable`
5. `disable`
6. `restore`
7. `remove`
8. `start`

**Step 2: Stop leading with low-level bridges**

Keep hook/shell bridge commands as internals; lead with the product-shell command.

### Verification

Run:

```bash
npx tsx --test scripts/ci/aionis-codex-product-shell.test.ts scripts/ci/aionis-codex-product-shell-entry.test.ts
npx tsc --noEmit
npm run -s test:lite
```

### Done Looks Like

This work is done when:

1. Aionis for Codex has one install-style entrypoint
2. Codex hook wiring no longer requires manual file editing
3. runtime startup no longer requires hand-assembled shell commands
4. a user can discover misconfiguration from `doctor`
5. a user can safely restore or remove the integration
6. product-shell commands become the new recommended path
