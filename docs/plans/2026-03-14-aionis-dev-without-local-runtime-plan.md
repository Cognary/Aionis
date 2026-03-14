# Aionis `aionis dev` Without Local Runtime Root Plan

## Goal

Make this developer experience work on a machine that does **not** already have the Aionis repository checked out:

```bash
npm install @aionis/sdk@0.2.18
npx @aionis/sdk@0.2.18 dev
```

The command should be able to bootstrap a local Lite runtime, start it, wait for health, and print a usable base URL.

---

## Current Constraint

Today `aionis dev` is a thin Lite launcher.
It assumes one of the following is already true:

1. the user has a local Aionis repo
2. the CLI can resolve `--runtime-root`
3. the repo already contains `dist/index.js` and `scripts/start-lite.sh`

That is acceptable for internal development, but it is not a real SDK-first product experience.

The missing capability is:

**runtime acquisition and local bootstrap**.

---

## Product Requirement

A user who installs the SDK should not need to understand:

1. where the Aionis repo lives
2. how Lite is built
3. how SQLite files are laid out
4. how to manually start `scripts/start-lite.sh`

The CLI should own those steps.

Expected UX:

```bash
npx @aionis/sdk@0.2.18 dev
```

Possible first-run output:

```text
Aionis Lite runtime not found locally.
Downloading runtime bundle v0.2.18 for darwin-arm64...
Verifying checksum...
Starting Lite on http://127.0.0.1:3321
Health OK.
```

---

## Recommendation

Use a **downloaded prebuilt Lite bundle** as the Phase 2 default.

Do **not** require a local repo.
Do **not** bundle the entire runtime directly inside `@aionis/sdk`.
Do **not** make Docker the primary path.

### Why this is the right choice

### Option A: bundle runtime inside `@aionis/sdk`

Pros:

1. one package install
2. simplest mental model

Cons:

1. npm package becomes large
2. runtime and SDK releases get tightly coupled
3. every SDK install drags a platform runtime whether or not the user needs it
4. native/platform differences become awkward

This is not a good long-term packaging boundary.

### Option B: require Docker

Pros:

1. operationally simple once Docker exists
2. image-based runtime is reproducible

Cons:

1. poor first-run developer experience
2. Docker is not installed everywhere
3. this moves the burden instead of removing it

Good fallback, bad default.

### Option C: CLI downloads a platform-specific Lite runtime bundle

Pros:

1. preserves a thin SDK package
2. keeps `aionis dev` product-simple
3. allows versioned runtime artifacts
4. supports checksum verification and caching
5. works without a local repo

Cons:

1. requires release artifact infrastructure
2. needs per-platform packaging
3. CLI must manage cache and upgrades

This is the best trade-off.

---

## Proposed Product Shape

Three layers remain separate:

1. **SDK package**
   - `@aionis/sdk`
   - TypeScript client + CLI

2. **Runtime bundle**
   - platform-specific Lite bundle
   - downloaded on demand

3. **Local state**
   - pid/log/sqlite/cache under `~/.aionis/`

The CLI becomes a bootstrap orchestrator, not a runtime compiler.

---

## Runtime Bundle Format

Each release should publish Lite runtime bundles per target platform.

Recommended targets for Phase 2:

1. `darwin-arm64`
2. `darwin-x64`
3. `linux-x64`

Bundle contents:

1. `dist/index.js`
2. `scripts/start-lite.sh`
3. `package.json`
4. any runtime-only assets needed for Lite startup
5. a small manifest file

Recommended artifact name:

```text
aionis-lite-v0.2.18-darwin-arm64.tar.gz
```

Recommended manifest fields:

1. `version`
2. `platform`
3. `arch`
4. `sha256`
5. `entrypoint`
6. `min_node_version`

---

## Download and Cache Layout

Use a deterministic cache root:

```text
~/.aionis/runtime/
```

Suggested layout:

```text
~/.aionis/
  runtime/
    0.2.18/
      darwin-arm64/
        manifest.json
        dist/index.js
        scripts/start-lite.sh
  dev/
    lite-3321.pid
    lite-3321.log
    lite-write-3321.sqlite
    lite-replay-3321.sqlite
```

Rules:

1. one runtime cache per version and platform
2. `aionis dev` reuses cached runtime if present
3. no rebuild from source during normal first-run
4. explicit force-refresh flag can replace cache later

---

## CLI Behavior Changes

## `aionis dev`

New behavior order:

1. if `--runtime-root` is given, current Phase 1 behavior still works
2. else check cached runtime bundle under `~/.aionis/runtime/<version>/<platform>`
3. if missing, download runtime bundle for current version/platform
4. verify checksum
5. expand bundle into cache dir
6. launch Lite from cached runtime root
7. wait for `/health`
8. print ready output

This preserves backward compatibility while adding a zero-repo path.

## `aionis doctor`

Doctor should now report:

1. SDK version
2. expected runtime version
3. cached runtime status
4. bundle manifest status
5. checksum status
6. current process health

## `aionis selfcheck`

No change in product scope.
It should run against the bootstrapped runtime once `dev` succeeds.

---

## Version Binding Strategy

The simplest first rule:

**SDK patch/minor version expects the same runtime version by default.**

Example:

- `@aionis/sdk@0.2.18`
- default runtime bundle: `0.2.18`

This avoids ambiguous compatibility at first.

Later, you can add a compatibility table such as:

- SDK `0.2.x` supports runtime `0.2.x`

But Phase 2 should start strict.

---

## Distribution Source

Recommended source of truth:

1. GitHub Releases on `Cognary/Aionis`
2. release assets per platform
3. signed checksum file in the same release

CLI resolution flow:

1. detect SDK version from package metadata
2. build release asset URL
3. fetch bundle + checksum
4. verify SHA256
5. extract to cache

This keeps runtime provenance clear.

---

## Security and Integrity

Do not download and execute unsigned or unchecked runtime blobs.

Minimum integrity requirements:

1. SHA256 verification
2. exact version pin in CLI
3. exact platform match
4. explicit failure if checksum mismatches
5. no silent fallback to arbitrary URLs

Later improvements:

1. signature verification
2. release manifest signing
3. enterprise mirror override

---

## Failure and Fallback Paths

If runtime bootstrap fails, the CLI should fail explicitly and offer the next-best path.

Recommended fallback order:

1. cached runtime reuse if healthy
2. retry download once
3. suggest `--runtime-root /path/to/Aionis` if user has source locally
4. suggest Docker only as a secondary manual path

Do not silently attempt complex build-from-source in the SDK CLI.
That will make first-run failures harder to reason about.

---

## New CLI Flags

Recommended additions:

1. `--runtime-version <version>`
2. `--runtime-channel stable|beta`
3. `--runtime-cache-dir <path>`
4. `--force-download`
5. `--offline`

Phase 2 minimum:

1. `--runtime-version`
2. `--force-download`
3. `--offline`

---

## Implementation Phases

## Phase 2A: Internal bootstrap path

Goal:

Make `aionis dev` support runtime cache lookup and local extracted bundles.

Work:

1. define bundle manifest format
2. extend CLI runtime resolution to look in cache
3. add checksum verification helper
4. add extraction helper
5. add doctor output for cached runtime

No public promise yet.

## Phase 2B: GitHub Release artifact flow

Goal:

Make runtime bundles publishable and downloadable.

Work:

1. add CI packaging job for Lite bundles
2. attach platform artifacts to GitHub release
3. publish checksum manifest
4. test CLI download against release assets

## Phase 2C: Public no-repo UX

Goal:

Support:

```bash
npm install @aionis/sdk
npx @aionis/sdk dev
```

without any local repo.

Work:

1. enable default remote bundle acquisition
2. update docs and SDK CLI guide
3. add install + first-run smoke in release checklist

---

## Release Engineering Changes Required

You need one new release output in addition to npm and PyPI:

1. npm package: `@aionis/sdk`
2. PyPI package: `aionis-sdk`
3. GitHub release assets: Lite runtime bundles per platform

Recommended release checklist additions:

1. build runtime bundles
2. generate checksums
3. upload release assets
4. run `npx @aionis/sdk@<version> dev --offline` against a pre-seeded cache
5. run `npx @aionis/sdk@<version> dev` against clean cache

---

## Testing Matrix

Minimum matrix:

1. macOS arm64 clean machine, no local repo
2. macOS arm64 cached runtime reuse
3. macOS arm64 offline mode with cached runtime
4. version mismatch failure case
5. checksum mismatch failure case

Phase 2 does not need every platform on day one, but the product should be designed for multi-platform from the start.

---

## What Not To Do

1. do not make the CLI compile the runtime from source on first-run
2. do not make Docker the primary experience
3. do not silently mix SDK version and arbitrary runtime version
4. do not leave integrity verification optional
5. do not merge all runtime files directly into the npm package

---

## Recommendation Summary

The right implementation path is:

1. keep `@aionis/sdk` as the developer-facing package
2. keep `aionis dev` as the CLI entrypoint
3. add a versioned, downloaded Lite runtime bundle
4. cache it under `~/.aionis/runtime`
5. verify checksum before execution
6. preserve `--runtime-root` as an override for source-based development

That gives you the product story you actually want:

```bash
npm install @aionis/sdk
npx @aionis/sdk dev
```

with no local Aionis repository required.

---

## Immediate Next Step

If this direction is accepted, the next concrete implementation item should be:

**Phase 2A design + code plan for runtime bundle resolution, download, verification, and extraction inside `packages/sdk/src/cli.ts`.**
