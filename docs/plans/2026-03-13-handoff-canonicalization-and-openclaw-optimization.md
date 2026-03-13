# 2026-03-13 Handoff Canonicalization And OpenClaw Optimization

## Summary

This document records the handoff-related changes made to Aionis Core and the corresponding OpenClaw plugin integration updates.

The main objective was to separate:

- full system-facing handoff payloads
- prompt-safe, model-facing handoff payloads
- execution-ready continuation payloads

This work was driven by OpenClaw continuation benchmarks where exact handoff recovery improved success rate and resume latency, but token behavior remained unstable when the full native recover payload was injected directly into model prompts.

## Problem

`POST /v1/handoff/recover` originally returned a full artifact payload containing both:

- fields required by Aionis runtime and auditability
- fields not useful for LLM continuation

Examples of system-facing fields:

- `id`
- `uri`
- `commit_id`
- `commit_uri`
- `scope`
- `tenant_id`
- `matched_nodes`

These are correct and necessary for Aionis internals, but they are not generally useful when the next agent session only needs to continue work.

When the OpenClaw plugin passed the full recover payload to the model, two issues appeared:

1. unnecessary prompt bloat
2. unstable cache behavior across cases/providers

The result was that handoff still improved continuation quality and speed, but token reduction was weaker than expected.

## Design Goal

Keep the full handoff payload intact for system use, while adding canonical views for agent/runtime consumption.

The design goal is:

- no breaking change to existing clients
- preserve full artifact fidelity
- expose a prompt-safe view for model injection
- expose an execution-ready view for direct continuation logic

## Aionis Core Changes

### 1. Canonical recover views added

File:
- `/Users/lucio/Desktop/Aionis/src/memory/handoff.ts`

`recoverHandoff(...)` now returns the existing full payload plus two new views:

- `prompt_safe_handoff`
- `execution_ready_handoff`

The response shape is now effectively:

```json
{
  "tenant_id": "default",
  "scope": "...",
  "handoff_kind": "patch_handoff",
  "anchor": "...",
  "matched_nodes": 1,
  "handoff": { "...full artifact view..." },
  "prompt_safe_handoff": {
    "anchor": "...",
    "handoff_kind": "...",
    "file_path": "...",
    "repo_root": null,
    "symbol": null,
    "summary": "...",
    "handoff_text": "...",
    "risk": "...",
    "acceptance_checks": ["..."],
    "tags": ["..."]
  },
  "execution_ready_handoff": {
    "file_path": "...",
    "summary": "...",
    "handoff_text": "...",
    "risk": "...",
    "acceptance_checks": ["..."]
  }
}
```

### 2. Full payload preserved

The original `handoff` object is unchanged in principle.

This means existing consumers that rely on:

- `handoff.id`
- `handoff.uri`
- `handoff.commit_id`
- `handoff.commit_uri`

continue to work.

### 3. SDK typing updated

File:
- `/Users/lucio/Desktop/Aionis/src/sdk/types.ts`

`HandoffRecoverResponse` now includes optional typings for:

- `prompt_safe_handoff`
- `execution_ready_handoff`

This keeps the API additive and backward-compatible.

## OpenClaw Plugin Changes

Files:
- `/Users/lucio/Desktop/aionis-openclaw-plugin/src/index.ts`
- `/Users/lucio/Desktop/aionis-openclaw-plugin/openclaw.plugin.json`
- `/Users/lucio/Desktop/aionis-openclaw-plugin/scripts/bench-openclaw-aionis-exact-handoff-helper.py`

### 1. Plugin now prefers canonical handoff views

The plugin no longer needs to manually infer a model-safe handoff view from the full payload.

It now prefers:

- `execution_ready_handoff`
- then `prompt_safe_handoff`
- then falls back to full `handoff`

### 2. New plugin config

A new config field was added:

- `handoffPromptView`

Allowed values:

- `full`
- `prompt-safe`
- `execution-ready`

Default:

- `prompt-safe`

This allows controlled experiments without changing Aionis server semantics.

### 3. Tool and CLI recover output updated

`aionis_recover_handoff` now returns:

- the full recover payload
- `selected_prompt_handoff`

This makes it easier to inspect exactly what the plugin would inject into the model.

## Why This Is Safe

This is not a destructive protocol change.

The implementation preserves compatibility by:

- keeping `/v1/handoff/recover` path unchanged
- keeping `handoff` full artifact view intact
- only adding new response fields
- making plugin behavior configurable rather than hard-swapping semantics

As a result, existing Aionis consumers should not break unless they were relying on undocumented assumptions about exact response shape ordering.

## Verification

### Aionis Core route tests

Command:

```bash
node /Users/lucio/Desktop/Aionis/scripts/ci/handoff-routes.test.mjs
```

Observed result:

- 4 tests passed

### Real Lite route smoke

A local Lite instance was started on `http://127.0.0.1:3321` and the following were exercised:

- `POST /v1/handoff/store`
- `POST /v1/handoff/recover`

The real recover response included both:

- `prompt_safe_handoff`
- `execution_ready_handoff`

### Plugin verification

Commands:

```bash
npm run -s typecheck
npm run -s build
python3 -m py_compile scripts/bench-openclaw-aionis-exact-handoff-helper.py
bash -n scripts/bench-openclaw-aionis-exact-handoff.sh
```

Observed result:

- plugin typecheck passed
- plugin build passed
- benchmark helper syntax check passed
- benchmark shell syntax check passed

## What This Solves

This change solves the main layering problem:

Aionis can keep rich, auditable handoff artifacts while exposing a stable, model-safe continuation view for agent runtimes.

This is especially important for OpenClaw-like systems, where token pressure is affected by:

- fixed system/tool prompt overhead
- prompt cache behavior
- how handoff context is injected into fresh sessions

The change does not by itself guarantee large token reductions in every runtime/provider combination, but it removes a known source of prompt noise and unstable prompt assembly.

## Remaining Work

### 1. Execution-ready benchmark path

The benchmark still needs to be shifted from:

- “recover handoff and restate it as JSON”

into:

- “recover handoff and directly perform the next action”

This is required to measure the real continuation value instead of just handoff summarization quality.

### 2. OpenClaw context-engine integration

Current integration is still primarily prompt-injection based.

A deeper `context-engine` integration is likely needed if the goal is to reduce more of OpenClaw’s context tax rather than only improving continuation quality.

### 3. Replay-oriented continuation

Handoff helps with continuation.

Replay is still the stronger path for avoiding repeated re-reasoning in repeatable workflows.

The long-term direction remains:

- handoff for exact cross-session continuation
- replay for reusable workflow execution

## Recommended Next Step

Use `prompt_safe_handoff` as the default agent-facing recover view and continue benchmarking with:

1. execution-ready continuation tasks
2. Gemini/Codex provider comparison
3. deeper OpenClaw integration experiments

