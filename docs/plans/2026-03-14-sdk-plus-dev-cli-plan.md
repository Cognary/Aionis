# Aionis SDK + `aionis dev` CLI Plan

## Goal

Make Aionis feel like a developer product, not a loose collection of SDK packages and runtime scripts.

Desired first-run experience:

```bash
npm i @aionis/sdk
npx aionis dev
```

or

```bash
npm i -g @aionis/sdk
aionis dev
```

The CLI should start a local Aionis development runtime, print a usable base URL, run a health check, and guide the user into the SDK or HTTP flow without requiring them to manually discover `npm run start:lite`.

---

## Current State

Aionis already has:

1. a TypeScript SDK: `@aionis/sdk`
2. a Python SDK: `aionis-sdk`
3. a Lite runtime entrypoint: `npm run start:lite`
4. multiple dev and MCP scripts

What it does **not** currently have:

1. a unified `aionis` CLI entrypoint
2. a product-level separation between SDK, CLI, and runtime
3. a simple “install SDK, start dev runtime” workflow

Today the mental model is:

1. install SDK
2. separately discover how to start Lite
3. separately discover health or smoke commands

This is functional, but not yet productized.

---

## Product Shape

The recommended packaging model is:

1. **SDK**
   - developer-facing client libraries
   - TypeScript and Python

2. **CLI**
   - local developer control surface
   - `aionis dev`, `aionis doctor`, `aionis health`, `aionis selfcheck`

3. **Runtime**
   - Lite for local development
   - Server for self-hosted production

The CLI is the bridge between the SDK and the runtime.

---

## Proposed Commands

### `aionis dev`

Purpose:

1. start or attach to a local Lite runtime
2. print the resolved base URL
3. run a health check
4. emit a ready-to-copy SDK snippet

Expected behavior:

1. detect Node version and `node:sqlite` support
2. detect whether a Lite process is already running
3. if no process is running, start Lite
4. wait for `/health`
5. print:
   - base URL
   - edition
   - backend
   - suggested SDK usage

Optional flags:

1. `--port`
2. `--host`
3. `--sqlite-dir`
4. `--foreground`
5. `--open`

### `aionis health`

Purpose:

1. call `/health`
2. print concise health status
3. return non-zero on failure

### `aionis doctor`

Purpose:

1. validate Node version
2. validate SQLite support
3. validate Lite directories and permissions
4. detect stale or conflicting processes
5. validate SDK/runtime compatibility

### `aionis selfcheck`

Purpose:

1. run minimal memory, handoff, policy, and replay probes
2. produce a simple pass/fail summary

---

## Packaging Options

### Option A: CLI lives inside `@aionis/sdk`

Pros:

1. one package to install
2. easiest user mental model
3. fastest path to `npm i @aionis/sdk && npx aionis dev`

Cons:

1. runtime bootstrap responsibilities enter the SDK package
2. package weight and release surface grow

### Option B: Separate CLI package, e.g. `@aionis/cli`

Pros:

1. cleaner separation of concerns
2. SDK remains a pure client package
3. CLI can evolve independently

Cons:

1. slightly worse onboarding:
   - install SDK
   - install CLI
2. weaker product simplicity

### Recommendation

Start with **Option A**:

1. keep `@aionis/sdk` as the primary developer entrypoint
2. add a `bin` for `aionis`
3. let `aionis dev` manage Lite for local development

If the CLI surface grows too large, split it later.

---

## Execution Model

`aionis dev` should not reimplement the runtime.
It should orchestrate the existing Lite runtime:

1. resolve runtime config
2. launch `start:lite` or the equivalent runtime module
3. manage pid/log/state for local dev
4. expose a stable base URL for SDK users

This keeps one runtime implementation and one CLI orchestration layer.

---

## User Experience Target

### TypeScript

```bash
npm i @aionis/sdk
npx aionis dev
```

```ts
import { AionisClient } from "@aionis/sdk";

const client = new AionisClient({ baseUrl: "http://127.0.0.1:3321" });
```

### Python

```bash
pip install aionis-sdk
npx aionis dev
```

```py
from aionis_sdk import AionisClient

client = AionisClient(base_url="http://127.0.0.1:3321")
```

---

## Scope for Phase 1

Phase 1 should be deliberately narrow:

1. local Lite only
2. one command: `aionis dev`
3. plus:
   - `aionis health`
   - `aionis doctor`
4. no attempt to manage Server mode
5. no attempt to bundle Docker or hosted control plane flows

The goal is to make local development obvious.

---

## Non-Goals

Phase 1 is not trying to:

1. replace all existing scripts
2. fully abstract server deployment
3. merge SDK and runtime codebases
4. solve hosted or operator workflows

---

## Risks

1. CLI inside the SDK may make package boundaries less clean
2. process management can become a source of local reliability issues if not done carefully
3. if Lite startup is still unstable, `aionis dev` can inherit that pain and make the product look worse

This means:

1. `aionis dev` should stay thin
2. health reporting must be explicit
3. pid/log handling must be deterministic

---

## Recommended Implementation Order

1. add a `bin` entry for `aionis`
2. implement `aionis dev` as a thin Lite launcher + health waiter
3. implement `aionis health`
4. implement `aionis doctor`
5. update SDK README and onboarding docs
6. only then consider expanding command scope

---

## Success Criteria

Phase 1 is successful if a new developer can:

1. install the SDK
2. run `aionis dev`
3. get a local healthy Lite runtime
4. copy a working SDK snippet
5. avoid reading `start:lite` internals

That is the product bar.
