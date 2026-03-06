---
title: How Aionis works under the hood
description: A practical walkthrough of the Aionis runtime model, from memory writes to replay reconstruction.
pubDate: 2026-03-06
category: Engineering
tags:
  - memory
  - replay
  - architecture
featured: false
---

Aionis is not just a retrieval layer. Under the hood, it combines memory, context assembly, policy, provenance, and replay into a single execution model.

## The problem Aionis is solving

Most AI systems start with logs, traces, and prompt history. That is enough for a demo, but it breaks down in production.

Teams quickly run into questions like:

1. What did the agent actually write into memory?
2. Why did the system choose this tool and not another one?
3. Which decision was made under which context?
4. Can we replay the same workflow after a fix and compare behavior?

Aionis exists to answer those questions with structured runtime data instead of forensic guesswork.

## The high-level runtime model

At a high level, Aionis exposes four connected surfaces:

1. Memory APIs record execution facts and resolve stored objects later.
2. Context APIs assemble relevant history for the next step.
3. Policy APIs evaluate rules and constrain tool or action selection.
4. Replay APIs reconstruct a prior run and let teams inspect or rerun it.

That means the system is not only storing information. It is preserving execution structure.

<div class="flow-card">
  <div class="flow-row">
    <div class="flow-step">Memory write</div>
    <div class="flow-connector"></div>
    <div class="flow-step">Context assembly</div>
    <div class="flow-connector"></div>
    <div class="flow-step">Policy evaluation</div>
  </div>
  <div class="flow-row" style="margin-top: 10px;">
    <div class="flow-step">Decision persist</div>
    <div class="flow-connector"></div>
    <div class="flow-step">Replay and audit</div>
    <div></div>
    <div></div>
  </div>
</div>

## Memory is stored as execution data, not just text

The first important idea is that Aionis writes memory as explicit runtime objects.

When a caller uses `POST /v1/memory/write`, the point is not only to keep some text around. The write creates a durable record of something that happened in the workflow.

In practice, that means:

1. Callers send explicit `nodes[]` that describe recallable memory units.
2. Aionis returns identifiers such as `commit_id` and `commit_uri`.
3. Those identifiers later become part of provenance and replay.

This is why Aionis documentation keeps emphasizing that `input_text` alone is not enough. If you want useful retrieval later, the system needs structured recallable nodes.

## Context assembly is a separate step for a reason

Many agent stacks blur together storage and prompt construction. Aionis treats them as different jobs.

That separation matters because the question "what should we store?" is different from the question "what should the next step see right now?"

Under the hood, context assembly exists to:

1. Pull relevant memory from the current tenant and scope.
2. Bound the amount of context returned to the runtime.
3. Keep the retrieval layer inspectable and repeatable.

This is what makes later debugging easier. You can inspect what was stored, what was recalled, and what was assembled for the decision path.

## Policy sits in the execution path, not outside it

Aionis does not treat policy as a documentation concern or an afterthought. It treats policy as part of runtime behavior.

The policy loop generally looks like this:

1. `rules/evaluate` checks what rules match the current context.
2. `tools/select` narrows tool candidates.
3. Decision and run linkage are persisted.
4. `tools/feedback` can later be used to tune behavior.

The important detail is that policy decisions are tied to stable identifiers such as `request_id`, `run_id`, and `decision_id`.

Those IDs are what let you prove how the system arrived at an action instead of only observing the action afterward.

## Provenance is the connective tissue

The real power of Aionis comes from keeping the execution chain intact.

The chain usually includes:

1. `request_id` for request-level tracing.
2. `run_id` for workflow-level correlation.
3. `decision_id` for policy and tool decisions.
4. `commit_uri` for memory lineage.

Without those fields, memory, policy, and replay stay disconnected. With them, you can move from "this request failed" to "this specific decision was made using this context and this memory write."

That is the difference between observability and provenance.

## Replay works because the system kept the chain

Replay does not work by magic. It works because earlier steps already preserved the data required to reconstruct the workflow.

Under the hood, replay typically depends on:

1. Finding the failed or interesting `run_id`.
2. Loading the run timeline.
3. Resolving related decisions and commits.
4. Comparing the reconstructed path with the expected path.

This is why the docs repeatedly tell integrators to log `request_id`, `run_id`, `decision_id`, and `commit_uri`. Those are the minimum inputs for reliable replay and incident analysis.

## Tenant and scope isolation shape every layer

Aionis is built around explicit isolation. In practice, that means the system expects callers to keep `tenant_id` and `scope` explicit across write, recall, policy, and replay.

This has two important effects:

1. Memory and decisions stay attached to the correct environment boundary.
2. Debugging does not drift into the wrong dataset.

For production systems, this is not a minor implementation detail. It is a necessary condition for trustworthy memory and replay behavior.

## Why this design matters in production

Aionis is opinionated because production agent systems are messy.

The design choices above are there to make the system more reliable under real operating conditions:

1. Memory writes are durable and recallable.
2. Context assembly is inspectable.
3. Policy decisions are explicit.
4. Provenance is preserved.
5. Replay becomes operationally useful.

That combination gives teams a practical operating model:

1. Write meaningful memory.
2. Assemble the right context.
3. Apply policy before action.
4. Preserve decision lineage.
5. Replay the workflow when behavior must be explained or verified.

## A simple mental model

If you want one compact way to think about Aionis under the hood, use this:

1. Memory records what happened.
2. Context assembly decides what the next step should see.
3. Policy constrains what is allowed or preferred.
4. Provenance links all of it together.
5. Replay turns that chain into something debuggable and repeatable.

That is the core of the system.

## Where to go next

1. Read the [Aionis docs](https://doc.aionisos.com/guide/overview).
2. Read the [Replay APIs](https://doc.aionisos.com/api/replay).
3. Use the [Quickstart](https://doc.aionisos.com/guide/quickstart) if you want the first working integration.
