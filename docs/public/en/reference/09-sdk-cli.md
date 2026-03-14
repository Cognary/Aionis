---
title: "SDK CLI"
---

# SDK CLI

The TypeScript package now ships a Phase 1 local developer CLI.

Install:

```bash
npm install @aionis/sdk
```

Run without a global install:

```bash
npx aionis --help
```

## What It Is

The CLI is a local Lite developer entrypoint, not a hosted control-plane CLI.

Current commands:

1. `aionis dev`
2. `aionis stop`
3. `aionis health`
4. `aionis doctor`
5. `aionis selfcheck`

Phase 1 boundary:

1. it manages local Lite only
2. it does not manage server or cloud runtime lifecycles
3. `stop` only manages processes started and tracked by the CLI

## Quick Start

Start Lite:

```bash
npx aionis dev --runtime-root /path/to/Aionis
```

Check health:

```bash
npx aionis health --base-url http://127.0.0.1:3321
```

Run doctor:

```bash
npx aionis doctor --runtime-root /path/to/Aionis --base-url http://127.0.0.1:3321
```

Run selfcheck:

```bash
npx aionis selfcheck --base-url http://127.0.0.1:3321
```

Stop the tracked Lite process:

```bash
npx aionis stop --port 3321
```

## Command Notes

### `aionis dev`

`aionis dev` starts or attaches to a local Lite runtime.

Useful flags:

1. `--runtime-root /path/to/Aionis`
2. `--host 127.0.0.1`
3. `--port 3321`
4. `--foreground`
5. `--json`

If `--runtime-root` is omitted, the CLI searches:

1. the current working tree
2. parent directories
3. common local paths such as `~/Desktop/Aionis`

### `aionis doctor`

`doctor` checks:

1. `node:sqlite` support
2. runtime root discovery
3. `dist/index.js`
4. `scripts/start-lite.sh`
5. tracked pid file
6. pid liveness
7. log path
8. write and replay SQLite paths
9. runtime health

### `aionis selfcheck`

`selfcheck` runs a minimal end-to-end Lite probe:

1. `health`
2. `memory/write`
3. `memory/recall_text`
4. `handoff/store`
5. `handoff/recover`
6. `tools/select`
7. replay run + compile

Use `--json` when you want machine-readable output in CI or local setup scripts.

## Recommended Use

Use the SDK CLI when you want:

1. a fast local Aionis Lite bootstrap
2. a repeatable developer health check
3. an SDK-first workflow instead of separate runtime shell scripts

## Related

1. [SDK Guide](/public/en/reference/05-sdk)
2. [SDK Compatibility Matrix](/public/en/reference/06-sdk-compatibility-matrix)
3. [5-Minute Onboarding](/public/en/getting-started/02-onboarding-5min)
