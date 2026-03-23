# Aionis SDK Quickstart

This guide is the fastest way to get from a running Aionis Lite runtime to a working `@aionis/sdk` integration.

## 1. Start the runtime

From the repository:

```bash
cd /Volumes/ziel/Aionisgo
npm install
npm run start:lite:sdk-demo
```

The default local SDK target is:

1. `http://127.0.0.1:3001`

## 2. Install the SDK

In your own project:

```bash
npm install @aionis/sdk
```

## 3. Create a client

```ts
import { createAionisClient } from "@aionis/sdk";

const aionis = createAionisClient({
  baseUrl: "http://127.0.0.1:3001",
});
```

## 4. Write execution memory

```ts
await aionis.memory.write({
  tenant_id: "default",
  scope: "demo-sdk-quickstart",
  actor: "sdk-demo",
  run_id: "sdk-run-1",
  observations: [
    {
      kind: "workflow_step",
      summary: "Fetched a CSV report and normalized the rows",
    },
  ],
});
```

## 5. Read planner-visible memory

```ts
const planning = await aionis.memory.planningContext({
  tenant_id: "default",
  scope: "demo-sdk-quickstart",
});

console.log(planning);
```

## 6. Record tool feedback

```ts
await aionis.memory.tools.feedback({
  tenant_id: "default",
  scope: "demo-sdk-quickstart",
  actor: "sdk-demo",
  tool_name: "fetch_report",
  feedback: "The fetch_report tool worked and returned clean rows.",
  outcome: "positive",
});
```

## 7. Explore the rest of the v1 surface

Current stable SDK v1 methods:

1. `memory.write`
2. `memory.planningContext`
3. `memory.contextAssemble`
4. `memory.executionIntrospect`
5. `memory.tools.select`
6. `memory.tools.feedback`
7. `memory.replay.repairReview`
8. `memory.anchors.rehydratePayload`

## 8. Run repository examples

If you are working from this repository instead of npm:

```bash
cd /Volumes/ziel/Aionisgo
npm run sdk:build
npm run start:lite:sdk-demo
```

Then in another terminal:

```bash
npm run sdk:example:workflow
npm run sdk:example:tools-feedback
npm run sdk:example:introspect
npm run sdk:example:context-assemble
```

Repository examples are documented here:

1. [examples/sdk/README.md](/Volumes/ziel/Aionisgo/examples/sdk/README.md)
