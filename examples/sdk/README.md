# Aionis SDK Examples

These examples are meant to be run from the repository before `@aionis/sdk` is published.

They import the locally built SDK artifact from [packages/sdk/dist](/Volumes/ziel/Aionisgo/packages/sdk/dist), so build the SDK first:

```bash
cd /Volumes/ziel/Aionisgo
npm run sdk:build
```

Start the Lite runtime in another terminal:

```bash
cd /Volumes/ziel/Aionisgo
npm run start:lite:sdk-demo
```

Defaults:

1. `AIONIS_BASE_URL=http://127.0.0.1:3001`
2. `AIONIS_TENANT_ID=default`
3. `AIONIS_SCOPE=default`
4. `AIONIS_ACTOR=local-user`

Recommended public-demo runtime:

1. `npm run start:lite:sdk-demo`
2. this profile keeps the route surface closer to the future public demo shell

Examples:

1. `npx tsx examples/sdk/01-workflow-guidance.ts`
   Shows `memory.write` plus `memory.planningContext` promoting repeated continuity into stable workflow guidance.
2. `npx tsx examples/sdk/02-tools-feedback-pattern.ts`
   Shows `memory.tools.select` plus `memory.tools.feedback` growing a reusable tool-memory pattern from repeated positive runs.
3. `npx tsx examples/sdk/03-execution-introspect-and-rehydrate.ts`
   Shows `memory.executionIntrospect` plus `memory.anchors.rehydratePayload` on a workflow anchor created by the example itself.
4. `npx tsx examples/sdk/04-context-assemble-debug.ts`
   Shows `memory.contextAssemble` on the explicit debug path with `return_layered_context=true`.
5. `AIONIS_PLAYBOOK_ID=<pending-playbook-id> npx tsx examples/sdk/05-replay-repair-review.ts`
   Shows `memory.replay.repairReview` on an existing pending playbook, including governed learning projection output.

Notes:

1. The replay example is the only one that is not fully self-seeding. It assumes you already have a pending replay playbook id.
2. The examples intentionally stay on the route-level SDK surface. They do not reach into runtime internals or Lite stores directly.
3. Once `@aionis/sdk` is published, the example imports should move from local `dist` paths to `@aionis/sdk`.
