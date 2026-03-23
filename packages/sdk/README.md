# @aionis/sdk

First-party SDK for the Aionis execution-memory runtime.

This package is meant to stay as the primary open developer surface for Aionis, even when stronger runtime learning and governance layers are distributed more selectively.

Install:

```bash
npm install @aionis/sdk
```

This package is intended to become the primary developer-facing surface for:

1. writing execution continuity
2. reading planner-visible workflow and pattern guidance
3. recording tool feedback
4. driving replay-governed learning
5. rehydrating anchor payloads

Current v1 SDK surface:

1. `memory.write`
2. `memory.planningContext`
3. `memory.contextAssemble`
4. `memory.executionIntrospect`
5. `memory.tools.select`
6. `memory.tools.feedback`
7. `memory.replay.repairReview`
8. `memory.anchors.rehydratePayload`

Example:

```ts
import { createAionisClient } from "@aionis/sdk";

const aionis = createAionisClient({
  baseUrl: "http://127.0.0.1:3001",
});

await aionis.memory.write({
  tenant_id: "default",
  scope: "default",
  actor: "sdk-demo",
  run_id: "run-1",
  observations: [
    {
      kind: "workflow_step",
      summary: "Fetched a report and normalized it",
    },
  ],
});

const result = await aionis.memory.planningContext({
  tenant_id: "default",
  scope: "default",
});
```

Quickstart docs:

1. [SDK Quickstart](/Volumes/ziel/Aionisgo/docs/SDK_QUICKSTART.md)
2. [SDK Publishing Guide](/Volumes/ziel/Aionisgo/docs/SDK_PUBLISHING.md)
3. [Repository SDK examples](/Volumes/ziel/Aionisgo/examples/sdk/README.md)
4. [Open-core boundary](/Volumes/ziel/Aionisgo/docs/OPEN_CORE_BOUNDARY.md)

This package is intentionally small at first.
It wraps the most stable route-level product surfaces without exposing every internal runtime capability.

Repository examples live in [examples/sdk](/Volumes/ziel/Aionisgo/examples/sdk).
Inside this repository they import the locally built `dist` artifact first; after publish they should import `@aionis/sdk`.

The SDK now also exports first-party typed request/response contracts for the v1 surface, while still allowing additive passthrough fields on route responses.

Local package verification:

```bash
npm --prefix packages/sdk run test
```

Release baseline verification:

```bash
npm run sdk:release:check
```

That flow builds the SDK, runs package tests, creates a tarball from `packages/sdk`, and verifies a clean install/import smoke test in an isolated `/tmp` workspace outside the repository.

Repository example verification:

```bash
npm run sdk:build
npm run start:lite
```

Then in another terminal:

```bash
npm run sdk:example:workflow
npm run sdk:example:tools-feedback
npm run sdk:example:introspect
npm run sdk:example:context-assemble
```
