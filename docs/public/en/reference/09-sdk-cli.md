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
2. compiling, directly executing, and operationalizing Aionis Doc workflows
3. inspecting tool runs, replay state, and artifact outputs
4. checking runtime health and environment state
5. inspecting execution eval outputs
6. enforcing execution eval gates in CI

Current implemented command groups:

1. `aionis runtime ...`
2. `aionis doc ...`
3. `aionis eval ...`
4. `aionis runs ...`
5. `aionis playbooks ...`
6. `aionis replay inspect-run`
7. `aionis replay inspect-playbook`
8. `aionis replay recover`
9. `aionis replay explain`
10. `aionis artifacts ...`

Compatibility aliases still work:

1. `aionis dev`
2. `aionis stop`
3. `aionis health`
4. `aionis doctor`
5. `aionis selfcheck`

Current boundary:

1. runtime lifecycle covers local Lite only
2. Aionis Doc commands currently cover compile, minimal direct execution, handoff, publish, and recover flows
3. eval commands operate on local artifact directories or precomputed eval summaries
4. this is still not a hosted control-plane CLI

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

Compile one Aionis Doc into graph output:

```bash
npx @aionis/sdk@0.2.20 doc compile ./workflow.aionis.md --emit graph
```

Execute one Aionis Doc directly:

```bash
npx @aionis/sdk@0.2.20 doc execute ./workflow.aionis.md
```

Publish one Aionis Doc into the native handoff store:

```bash
npx @aionis/sdk@0.2.20 doc publish ./workflow.aionis.md --base-url http://127.0.0.1:3001 --scope default
```

Recover the handoff continuity for one Aionis Doc:

```bash
npx @aionis/sdk@0.2.20 doc recover ./workflow.aionis.md --base-url http://127.0.0.1:3001 --scope default
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

List recent tool-lifecycle runs:

```bash
npx @aionis/sdk@0.2.20 runs list --limit 20
```

Inspect one run timeline:

```bash
npx @aionis/sdk@0.2.20 runs timeline --run-id <run_id>
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

Inspect the read-only recovery plan for one replay run:

```bash
npx @aionis/sdk@0.2.20 replay recover --run-id <run_id> --allow-partial
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

### `aionis doc ...`

`aionis doc ...` is the executable-document workflow surface for Aionis Doc.

This refers to the integrated command surface inside the main `@aionis/sdk` CLI, not the standalone binary names exposed by `@aionis/doc` itself.

Use it when you want one human-readable document to move through:

1. compile
2. direct execution
3. runtime handoff shaping
4. handoff-store request generation
5. publish into `/v1/handoff/store`
6. recover from `/v1/handoff/recover`
7. continue into `context/assemble -> tools/select -> tools/decision -> tools/run`

The underlying standalone binaries are:

1. `compile-aionis-doc`
2. `execute-aionis-doc`
3. `build-aionis-doc-runtime-handoff`
4. `build-aionis-doc-handoff-store-request`
5. `publish-aionis-doc-handoff`
6. `recover-aionis-doc-handoff`
7. `resume-aionis-doc-runtime`

Current V1 commands:

1. `aionis doc compile <input-file>`
2. `aionis doc execute <input-file>`
3. `aionis doc runtime-handoff <input-file>`
4. `aionis doc store-request <runtime-handoff.json>`
5. `aionis doc publish <input-file>`
6. `aionis doc recover <input-file>`
7. `aionis doc resume <input-file>`

Recommended flow:

1. use `doc compile` when you want AST / IR / graph inspection
2. use `doc execute` when you want a minimal execution result directly from the document
3. use `doc runtime-handoff` when you want an execution continuity carrier
4. use `doc store-request` when you want an explicit native handoff/store payload
5. use `doc publish` when you want to persist the workflow into Aionis handoff memory
6. use `doc recover` when you want the recovered handoff, execution state, and next action back through the native recover endpoint
7. use `doc resume` when you want recovered continuity to continue directly into `context/assemble -> tools/select -> tools/decision -> tools/run`
8. add `--feedback-outcome` when you also want to write one governance feedback record

Important input modes:

1. `doc execute` supports `source|compile-envelope|plan`
2. `doc runtime-handoff` supports `source|compile-envelope`
3. `doc publish` supports `source|runtime-handoff|handoff-store-request`
4. `doc recover` supports `source|runtime-handoff|handoff-store-request|publish-result`
5. `doc resume` supports `source|runtime-handoff|handoff-store-request|publish-result|recover-result`

This means the SDK CLI now exposes a full Aionis Doc path from source document to recovered continuity and post-recover resume without dropping to raw `context/assemble`, `tools/select`, `tools/decision`, or `tools/run` calls. When `--feedback-outcome` is set, it can also append one `tools/feedback` write and return before/after run lifecycle snapshots.

The documentation defaults to `aionis doc ...` because that is the surface already integrated into the main product CLI. The standalone `@aionis/doc` package is still better described today as a repo-internal lower-level entrypoint than as a fully released standalone public package.

### `aionis runs ...`

`aionis runs ...` inspects recorded tool-selection runs and their decision / feedback history.

Current V1 commands:

1. `aionis runs list`
2. `aionis runs get`
3. `aionis runs timeline`
4. `aionis runs decisions`
5. `aionis runs feedback`

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

### `aionis replay ...`

`aionis replay ...` inspects replay runs and replay-derived recovery state.

Current V1 commands:

1. `aionis replay inspect-run`
2. `aionis replay inspect-playbook`
3. `aionis replay recover`
4. `aionis replay explain`

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

### `aionis replay recover`

`replay recover` returns a read-only recovery plan for one replay run.

Current V1 support:

1. `--run-id <id>`
2. optional `--scope <scope>`
3. optional `--allow-partial`
4. `--json`

Current behavior:

1. fetches the replay run with steps included
2. determines whether the run is recoverable right now
3. returns `recovery_path`, `blockers`, and `next_action` in one envelope
4. does not mutate replay state or auto-compile anything

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

### `aionis runs list`

`runs list` returns recent tool-lifecycle runs from the real execution-decision store.

Current V1 support:

1. optional `--scope <scope>`
2. optional `--limit <n>`
3. `--json`

Current behavior:

1. rolls up recent runs from persisted execution decisions
2. reports decision count, feedback total, latest decision time, and latest selected tool
3. does not expose fake scenario filters or cursor semantics

### `aionis runs timeline`

`runs timeline` returns a real ordered event stream for one tool-lifecycle run.

Current V1 support:

1. `--run-id <id>`
2. optional `--scope <scope>`
3. optional `--decision-limit <n>`
4. optional `--feedback-limit <n>`
5. `--json`

Current behavior:

1. fetches one run through `tools/run`
2. merges decisions and recent feedback into one ordered event stream
3. exposes a narrow tool-lifecycle timeline, not a universal runtime event log

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
3. a documented executable-document workflow through `aionis doc ...`
4. a stable execution-eval inspection surface
5. a scriptable execution gate in CI
6. replay/playbook/run inspection without dropping to raw API calls

## Related

1. [SDK Guide](/public/en/reference/05-sdk)
2. [SDK Compatibility Matrix](/public/en/reference/06-sdk-compatibility-matrix)
3. [5-Minute Onboarding](/public/en/getting-started/02-onboarding-5min)
