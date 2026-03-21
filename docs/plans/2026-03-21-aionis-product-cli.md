# Aionis Product CLI Implementation Plan

**Goal:** Add one branded top-level `aionis` CLI that becomes the user-facing entrypoint above the Codex product shell.

**Architecture:** Keep the existing Codex product shell as the host-specific implementation layer, but add a top-level CLI and generated launcher that make `aionis` the branded user command.

**Tech Stack:** TypeScript, node:child_process, node:fs, node:test.

---

### Task 1: Add the top-level Aionis CLI

**Files:**
- Create: `/Volumes/ziel/Aionisgo/src/product/aionis.ts`
- Modify: `/Volumes/ziel/Aionisgo/package.json`
- Test: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-product-cli-entry.test.ts`

**Step 1: Add a branded command surface**

Support:

1. `aionis`
2. `aionis codex setup`
3. `aionis codex doctor`
4. `aionis codex status`
5. `aionis codex enable`
6. `aionis codex disable`
7. `aionis codex restore`
8. `aionis codex remove`
9. `aionis codex start`

**Step 2: Keep Codex-specific logic delegated**

Do not duplicate Codex product-shell behavior in the new CLI. Delegate to the existing product-shell helpers.

### Task 2: Generate the user launcher

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/src/product/codex-product-shell.ts`
- Test: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-codex-product-shell.test.ts`

**Step 1: Add launcher paths**

Generate:

1. `~/.local/bin/aionis`

**Step 2: Write the launcher during setup**

The launcher should execute the top-level product CLI rather than the host-specific shell directly.

**Step 3: Remove it during uninstall**

`remove` should delete the generated user launcher.

### Task 3: Expose launcher health

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/src/product/codex-product-shell.ts`
- Modify: `/Volumes/ziel/Aionisgo/docs/AIONIS_FOR_CODEX_PRODUCT_SHELL_GUIDE.md`
- Modify: `/Volumes/ziel/Aionisgo/README.md`

**Step 1: Extend doctor/status**

Report:

1. whether the generated user launcher exists
2. whether its bin directory is on `PATH`

### Verification

Run:

```bash
npx tsx --test scripts/ci/aionis-codex-product-shell.test.ts scripts/ci/aionis-codex-product-shell-entry.test.ts scripts/ci/aionis-product-cli-entry.test.ts
npx tsc --noEmit
npm run -s test:lite
```
