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
3. `aionis runs ...`
4. `aionis playbooks ...`
5. `aionis replay inspect-run`
6. `aionis replay inspect-playbook`
7. `aionis replay explain`
8. `aionis artifacts ...`

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

Inspect one run lifecycle:

```bash
npx @aionis/sdk@0.2.20 runs get --run-id <run_id> --include-feedback
```

Inspect decisions linked to one run:

```bash
npx @aionis/sdk@0.2.20 runs decisions --run-id <run_id>
```

Inspect feedback linked to one run:

```bash
npx @aionis/sdk@0.2.20 runs feedback --run-id <run_id>
```

Inspect one replay playbook:

```bash
npx @aionis/sdk@0.2.20 playbooks get --playbook-id <playbook_id>
```

Inspect replay candidacy for one playbook:

```bash
npx @aionis/sdk@0.2.20 playbooks candidate --playbook-id <playbook_id> --mode strict
```

Inspect governed replay dispatch for one playbook:

```bash
npx @aionis/sdk@0.2.20 playbooks dispatch --playbook-id <playbook_id> --mode simulate
```

Inspect one replay run:

```bash
npx @aionis/sdk@0.2.20 replay inspect-run --run-id <run_id> --include-steps --include-artifacts
```

Inspect one replay playbook:

```bash
npx @aionis/sdk@0.2.20 replay inspect-playbook --playbook-id <playbook_id> --mode strict
```

Explain replay compile readiness for one run:

```bash
npx @aionis/sdk@0.2.20 replay explain --run-id <run_id>
```

List artifact contents:

```bash
npx @aionis/sdk@0.2.20 artifacts list --artifact-dir /path/to/artifact
```

Show one artifact file:

```bash
npx @aionis/sdk@0.2.20 artifacts show --artifact-dir /path/to/artifact --name execution_eval_summary.json
```

Export one artifact directory:

```bash
npx @aionis/sdk@0.2.20 artifacts export --artifact-dir /path/to/artifact --out /tmp/artifact-copy
```

Pack one artifact directory:

```bash
npx @aionis/sdk@0.2.20 artifacts pack --artifact-dir /path/to/artifact --out /tmp/artifact.tgz
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

### `aionis runs get`

`runs get` inspects one run through the current tools lifecycle surface.

Current V1 support:

1. `--run-id <id>`
2. optional `--scope <scope>`
3. optional `--decision-limit <n>`
4. optional `--include-feedback`
5. optional `--feedback-limit <n>`
6. `--json`

Current boundary:

1. this is a real run-inspection surface backed by `/v1/memory/tools/run`
2. it is not yet a generic all-runtime run model

### `aionis runs decisions`

`runs decisions` inspects decisions linked to one run.

Current V1 support:

1. `--run-id <id>`
2. optional `--scope <scope>`
3. optional `--decision-limit <n>`
4. `--json`

Current behavior:

1. reads run decisions from `tools/run`
2. also fetches the latest decision for the run from `tools/decision`

### `aionis runs feedback`

`runs feedback` inspects feedback linked to one run.

Current V1 support:

1. `--run-id <id>`
2. optional `--scope <scope>`
3. optional `--feedback-limit <n>`
4. `--json`

### `aionis playbooks get`

`playbooks get` fetches one replay playbook by id.

Current V1 support:

1. `--playbook-id <id>`
2. optional `--scope <scope>`
3. `--json`

### `aionis playbooks candidate`

`playbooks candidate` inspects whether a playbook is eligible for deterministic replay.

Current V1 support:

1. `--playbook-id <id>`
2. optional `--scope <scope>`
3. optional `--version <n>`
4. optional `--mode simulate|strict|guided`
5. `--json`

### `aionis playbooks dispatch`

`playbooks dispatch` inspects the governed replay dispatch response for one playbook.

Current V1 support:

1. `--playbook-id <id>`
2. optional `--scope <scope>`
3. optional `--version <n>`
4. optional `--mode simulate|strict|guided`
5. `--json`

### `aionis replay inspect-run`

`replay inspect-run` fetches one replay run and can request steps and artifacts.

Current V1 support:

1. `--run-id <id>`
2. optional `--scope <scope>`
3. optional `--include-steps`
4. optional `--include-artifacts`
5. `--json`

### `aionis replay inspect-playbook`

`replay inspect-playbook` inspects one playbook by combining:

1. `playbooks/get`
2. `playbooks/candidate`

Current V1 support:

1. `--playbook-id <id>`
2. optional `--scope <scope>`
3. optional `--version <n>`
4. optional `--mode simulate|strict|guided`
5. `--json`

Current behavior:

1. fetches playbook metadata and state
2. evaluates deterministic replay candidacy for the same playbook
3. returns candidate, deterministic gate, and cost signals in one envelope

### `aionis replay explain`

`replay explain` gives a read-only explanation of whether a replay run is currently compile-ready for playbook generation.

Current V1 support:

1. `--run-id <id>`
2. optional `--scope <scope>`
3. optional `--allow-partial`
4. `--json`

Current behavior:

1. fetches the replay run with steps included
2. explains whether `compile_from_run` would be blocked right now
3. returns blockers, next action, and step status frequency in one envelope

### `aionis artifacts list`

`artifacts list` recursively lists files and subdirectories under one artifact directory.

Current V1 support:

1. `--artifact-dir <path>`
2. `--json`

### `aionis artifacts show`

`artifacts show` loads one file under an artifact directory and prints either UTF-8 text or base64 content.

Current V1 support:

1. `--artifact-dir <path>`
2. `--name <relative-file>`
3. `--json`

### `aionis artifacts export`

`artifacts export` copies one artifact directory to another local path.

Current V1 support:

1. `--artifact-dir <path>`
2. `--out <path>`
3. `--json`

### `aionis artifacts pack`

`artifacts pack` creates a `.tar.gz` bundle for one artifact directory.

Current V1 support:

1. `--artifact-dir <path>`
2. `--out <path>`
3. `--json`

## Recommended Use

Use the SDK CLI when you want:

1. a fast local Aionis Lite bootstrap
2. a repeatable runtime health check
3. a stable execution-eval inspection surface
4. a scriptable execution gate in CI
5. replay/playbook inspection without dropping to raw API calls

## Related

1. [SDK Guide](/public/en/reference/05-sdk)
2. [SDK Compatibility Matrix](/public/en/reference/06-sdk-compatibility-matrix)
3. [5-Minute Onboarding](/public/en/getting-started/02-onboarding-5min)
