---
title: "SDK CLI"
---

# SDK CLI

The TypeScript package now ships a runtime-oriented CLI surface.

Install:

```bash
npm install @aionis/sdk@0.2.20
```

Run without a global install:

```bash
npx @aionis/sdk@0.2.20 --help
```

## What It Is

The CLI is the command-line surface for:

1. operating local Lite runtime
2. checking runtime health and environment state
3. inspecting execution eval outputs
4. enforcing execution eval gates in CI

Current implemented command groups:

1. `aionis runtime ...`
2. `aionis eval ...`

Compatibility aliases still work:

1. `aionis dev`
2. `aionis stop`
3. `aionis health`
4. `aionis doctor`
5. `aionis selfcheck`

Current boundary:

1. runtime lifecycle covers local Lite only
2. eval commands operate on local artifact directories or precomputed eval summaries
3. this is still not a hosted control-plane CLI

Bootstrap path when no local repo is available:

1. search local runtime roots
2. reuse cached runtime under `~/.aionis/runtime`
3. download a versioned runtime bundle when available
4. fall back to a GitHub source archive bootstrap path

## Quick Start

Start Lite:

```bash
npx @aionis/sdk@0.2.20 runtime dev
```

Check health:

```bash
npx @aionis/sdk@0.2.20 runtime health --base-url http://127.0.0.1:3321
```

Run doctor:

```bash
npx @aionis/sdk@0.2.20 runtime doctor --base-url http://127.0.0.1:3321
```

Run selfcheck:

```bash
npx @aionis/sdk@0.2.20 runtime selfcheck --base-url http://127.0.0.1:3321
```

Stop the tracked Lite process:

```bash
npx @aionis/sdk@0.2.20 runtime stop --port 3321
```

Inspect execution eval output from a benchmark artifact:

```bash
npx @aionis/sdk@0.2.20 eval inspect --artifact-dir /path/to/artifact
```

Compare two eval sources:

```bash
npx @aionis/sdk@0.2.20 eval compare --baseline /path/to/baseline --treatment /path/to/treatment
```

Gate a nightly or regression artifact:

```bash
npx @aionis/sdk@0.2.20 eval gate --artifact-dir /path/to/artifact
```

## Command Notes

### `aionis runtime dev`

`aionis runtime dev` starts or attaches to a local Lite runtime.

Useful flags:

1. `--runtime-root /path/to/Aionis`
2. `--host 127.0.0.1`
3. `--port 3321`
4. `--runtime-version 0.2.20`
5. `--runtime-cache-dir ~/.aionis/runtime`
6. `--force-download`
7. `--offline`
8. `--foreground`
9. `--json`

If `--runtime-root` is omitted, the CLI searches:

1. the current working tree
2. parent directories
3. common local paths such as `~/Desktop/Aionis`
4. cached runtime bootstrap output
5. remote runtime bootstrap sources

### `aionis runtime doctor`

`runtime doctor` checks:

1. `node:sqlite` support
2. runtime root discovery
3. runtime cache root
4. runtime manifest
5. `dist/index.js`
6. `scripts/start-lite.sh`
7. tracked pid file
8. pid liveness
9. log path
10. write and replay SQLite paths
11. runtime health

### `aionis runtime selfcheck`

`runtime selfcheck` runs a minimal end-to-end Lite probe:

1. `health`
2. `memory/write`
3. `memory/recall_text`
4. `handoff/store`
5. `handoff/recover`
6. `tools/select`
7. replay run + compile

### `aionis eval inspect`

`eval inspect` loads either:

1. a precomputed `execution_eval_summary.json`
2. or a raw artifact directory containing `summary.json` and `cases.jsonl`

Use it when you want a stable execution-eval summary from the CLI.

### `aionis eval compare`

`eval compare` compares two eval sources and reports:

1. treatment result changes
2. treatment score changes
3. delta changes

### `aionis eval gate`

`eval gate` applies the current execution gate rules and returns:

1. exit code `0` on pass
2. exit code `5` on gate failure

Use `--json` when you want machine-readable output in CI or local setup scripts.

## Recommended Use

Use the SDK CLI when you want:

1. a fast local Aionis Lite bootstrap
2. a repeatable runtime health check
3. a stable execution-eval inspection surface
4. a scriptable execution gate in CI

## Related

1. [SDK Guide](/public/en/reference/05-sdk)
2. [SDK Compatibility Matrix](/public/en/reference/06-sdk-compatibility-matrix)
3. [5-Minute Onboarding](/public/en/getting-started/02-onboarding-5min)
