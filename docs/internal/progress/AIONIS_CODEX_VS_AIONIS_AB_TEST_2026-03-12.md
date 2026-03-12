# Aionis vs Plain Codex A/B Test (Codex CLI, Lite, Project Scope)

Date: 2026-03-12  
Workspace under test: [/Volumes/ziel/Test](/Volumes/ziel/Test)  
Repository under test file: [/Volumes/ziel/Test/github_click_parser.py](/Volumes/ziel/Test/github_click_parser.py)

## Goal

Measure whether Aionis adds practical value to Codex in a real cross-session workflow, not just as an MCP connectivity check.

The specific claim under test was:

> Can a second fresh Codex session continue a repository inspection task without reopening the file, using Aionis as the project memory layer?

## Test Setup

Two execution modes were compared:

1. Plain Codex CLI without Aionis MCP
2. Codex CLI launched through [codex-aionis-project.sh](/Users/lucio/Desktop/Aionis/scripts/codex-aionis-project.sh), connected to local Lite at `http://127.0.0.1:3101`

The Aionis-backed mode derived:

- `tenant_id = default`
- `scope = test`

from the project root `/Volumes/ziel/Test`.

The input file was downloaded from GitHub:

- Source: [pallets/click `src/click/parser.py`](https://raw.githubusercontent.com/pallets/click/main/src/click/parser.py)
- Local copy: [/Volumes/ziel/Test/github_click_parser.py](/Volumes/ziel/Test/github_click_parser.py)

Unique experiment anchor:

- `aionis-ab-5a1eb0afd336`

## Method

### Baseline: Plain Codex

Session 1:

- Read the file
- Identify one concrete maintainability or correctness risk
- Produce a compact patch handoff tagged with the experiment anchor

Session 2:

- Start a fresh Codex session
- Do not reopen the file
- Do not use session logs, transcript history, or any historical source
- Attempt to continue only from prior handoff context

### Treatment: Codex + Aionis

Session 1:

- Read the file
- Identify one concrete risk
- Store a compact handoff in Aionis under project scope `test`

Session 2:

- Start a fresh Codex session
- Do not reopen the file
- Do not use session logs, transcript history, or any historical source
- Recover context through Aionis MCP only

## Results

## 1. Plain Codex baseline failed at cross-session continuation

The first session completed repository inspection and produced a defensible handoff:

- Target function: `_OptionParser.add_option`
- Risk: normalized option aliases can silently collide and overwrite earlier registrations

However, the second fresh session could not continue under the experiment constraints. Its result was effectively:

> prior session context unavailable; cannot continue

This is the expected failure mode for plain Codex under a strict no-history, no-reread restart.

## 2. Aionis-backed Codex established real project-scoped continuity

The Aionis-backed path did not just connect; it successfully exercised live runtime surfaces in `scope=test`:

- `aionis_codex_planning_context`
- `aionis_memory_remember`
- `aionis_memory_recall_text`
- replay lifecycle:
  - `run_start`
  - `step_before`
  - `step_after`
  - `run_end`
  - `run_get`
- `compile_from_run`
- `playbook_get`

Concrete evidence from the same scope:

- planning decision id: `9bc16ce9-0db8-4112-b547-0eb2efbd4f1f`
- memory write commit id: `cd2a1313-6e08-5d08-8492-ff10a5d03575`
- replay run id: `83e481e3-a732-4500-b95d-642551143b39`
- playbook id: `28b72f8d-10cf-4ef4-9af5-74d585ec9256`

The controlled A/B anchor was also successfully written into Aionis:

- handoff commit id: `200b0b1e-22a5-5efd-a1d6-457cab19fa7d`
- handoff node URI:
  - `aionis://default/test/event/22222222-2222-4222-8222-222222222222`

The second Aionis-backed session was able to recover project-scoped evidence through:

- `aionis_memory_recall_text`
- `aionis_codex_planning_context`

and retrieve citations pointing at both the original inspection node and the stored handoff node.

## 3. What Aionis proved, and what it did not

What this experiment proved:

- Aionis gives Codex real project-scoped continuity across fresh sessions.
- The continuity is not limited to plain text memory; it includes commits, nodes, decisions, replay runs, and playbooks.
- A second session can recover structured evidence from the same project scope without rereading the source file.

What this experiment did not fully prove:

- Exact free-text handoff reconstruction from `recall_text` alone.

The current Dev MCP surfaces are summary-first. They reliably recover citations, evidence, decision ids, and project context, but they do not always echo the exact original handoff prose back as a ready-made patch plan.

## Value Demonstrated

This experiment supports four concrete value claims.

### 1. Cross-session memory

Plain Codex restarted from zero under strict constraints. Aionis-backed Codex did not.

### 2. Structured project context

Recovered context was not an opaque blob. It came back as:

- node URIs
- commit URIs
- planning decision ids
- replay and playbook objects

### 3. Execution reuse

The same project scope supported:

- replay run capture
- replay step capture
- compile-from-run
- playbook retrieval

This is materially stronger than simple note storage.

### 4. Auditability

The interaction left inspectable identifiers:

- `commit_id`
- `run_id`
- `playbook_id`
- `aionis://...` URIs

That is a runtime evidence trail, not just conversational memory.

## Limitations

- This was a single-file, single-project test.
- The strongest demonstrated advantage was continuity and recoverable structure, not perfect natural-language handoff replay.
- The Dev MCP surfaces remain summary-first, so some recall flows return citations and structured evidence rather than literal handoff text.

## Conclusion

The A/B result is positive.

Plain Codex failed the strict cross-session continuation test. Codex with Aionis succeeded at restoring project-scoped memory, planning evidence, and execution artifacts in a fresh session without reopening the file.

The strongest demonstrated value of Aionis in Codex today is:

- project continuity
- structured context recovery
- replay/playbook reuse
- auditable execution evidence

The weakest remaining area is:

- exact free-text handoff reconstruction through current summary-first MCP recall surfaces

## Recommended Next Step

Run the same A/B shape on a multi-step code-edit task instead of a pure inspection task, then measure:

- time to resume in the second session
- number of repeated repository reads
- whether replay/playbook materially reduce repeated reasoning work
