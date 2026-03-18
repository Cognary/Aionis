---
title: "Aionis Doc CLI Workflow"
---

# Aionis Doc CLI Workflow

The official CLI path for Aionis Doc is:

1. `aionis doc compile`
2. `aionis doc runtime-handoff`
3. `aionis doc store-request`
4. `aionis doc publish`
5. `aionis doc recover`

## Compile

Use `compile` when you want compiler artifacts.

```bash
npx @aionis/sdk@0.2.20 doc compile ./workflow.aionis.md --emit all
```

Supported emit modes:

1. `all`
2. `ast`
3. `ir`
4. `graph`
5. `diagnostics`

## Runtime Handoff

Use `runtime-handoff` when you want execution continuity payloads derived from a document.

```bash
npx @aionis/sdk@0.2.20 doc runtime-handoff ./workflow.aionis.md --scope default
```

This produces a versioned runtime handoff envelope with:

1. `execution_state_v1`
2. `execution_packet_v1`
3. `execution_ready_handoff`
4. `graph_summary`

## Store Request

Use `store-request` when you want the explicit `/v1/handoff/store` payload.

```bash
npx @aionis/sdk@0.2.20 doc store-request ./runtime-handoff.json --scope default
```

This is useful for:

1. inspection
2. pipeline handoff
3. native handoff-store integration

## Publish

Use `publish` when you want to persist the document into Aionis handoff memory.

```bash
npx @aionis/sdk@0.2.20 doc publish ./workflow.aionis.md --base-url http://127.0.0.1:3001 --scope default
```

Supported input kinds:

1. `source`
2. `runtime-handoff`
3. `handoff-store-request`

## Recover

Use `recover` when you want the native recovered handoff and continuity payload back.

```bash
npx @aionis/sdk@0.2.20 doc recover ./workflow.aionis.md --base-url http://127.0.0.1:3001 --scope default
```

Supported input kinds:

1. `source`
2. `runtime-handoff`
3. `handoff-store-request`
4. `publish-result`

The `publish-result` mode is useful when publish already happened earlier and you only want the recover step.

## Practical Flow

For authoring:

1. `doc compile`
2. `doc runtime-handoff`

For persistence:

1. `doc publish`

For continuity recovery:

1. `doc recover`

## Current Product Boundary

Today, the CLI gives you a source-to-handoff workflow. It does not yet directly start full runtime execution from the document itself.

The current public boundary is:

1. compile the document
2. convert it into runtime continuity
3. publish it into handoff memory
4. recover it through the native recover endpoint

## Read Next

1. [Aionis Doc Contracts](/public/en/reference/14-aionis-doc-contracts)
2. [Aionis Doc Examples](/public/en/reference/15-aionis-doc-examples)
3. [Aionis Doc Diagnostics](/public/en/reference/16-aionis-doc-diagnostics)
