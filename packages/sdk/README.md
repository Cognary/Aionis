# @aionis/sdk

First-party SDK for the Aionis execution-memory runtime.

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

const result = await aionis.memory.planningContext({
  tenant_id: "default",
  scope: "default",
});
```

This package is intentionally small at first.
It wraps the most stable route-level product surfaces without exposing every internal runtime capability.

Repository examples live in [examples/sdk](/Volumes/ziel/Aionisgo/examples/sdk).
Inside this repository they import the locally built `dist` artifact first; after publish they should import `@aionis/sdk`.

The SDK now also exports first-party typed request/response contracts for the v1 surface, while still allowing additive passthrough fields on route responses.

Local package verification:

```bash
npm --prefix packages/sdk run test
```
