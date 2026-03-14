---
title: "Verified Test Data"
description: "Inspect the fixed validation scope and fixture set used to keep the examples on this site aligned with live Lite behavior."
---

# Verified Test Data

This page lists the validation data used to check the examples on this site against a live Lite instance.

## Validation Scope

Current validation used:

1. `tenant_id = default`
2. `scope = docs_v2_verified`
3. latest Lite verification pass used `http://127.0.0.1:3314`
4. verification date: `2026-03-13`

## Why This Exists

Without a fixed validation scope, example docs drift in two common ways:

1. they pick up unrelated local data from `scope=default`
2. they assume response fields that are not actually returned

## Verified Fixture Files

These fixture payloads are stored as static site assets:

1. [`memory-write.json`](/fixtures/docs-v2-verified/memory-write.json)
2. [`recall-text.json`](/fixtures/docs-v2-verified/recall-text.json)
3. [`planning-context.json`](/fixtures/docs-v2-verified/planning-context.json)
4. [`context-assemble.json`](/fixtures/docs-v2-verified/context-assemble.json)
5. [`rules-state.json`](/fixtures/docs-v2-verified/rules-state.json)
6. [`rules-evaluate.json`](/fixtures/docs-v2-verified/rules-evaluate.json)
7. [`find.json`](/fixtures/docs-v2-verified/find.json)
8. [`resolve-event.json`](/fixtures/docs-v2-verified/resolve-event.json)
9. [`tools-select.json`](/fixtures/docs-v2-verified/tools-select.json)
10. [`tools-decision.json`](/fixtures/docs-v2-verified/tools-decision.json)
11. [`tools-run.json`](/fixtures/docs-v2-verified/tools-run.json)
12. [`tools-feedback.template.json`](/fixtures/docs-v2-verified/tools-feedback.template.json)
13. [`tools-feedback-positive.json`](/fixtures/docs-v2-verified/tools-feedback-positive.json)
14. [`handoff-store.json`](/fixtures/docs-v2-verified/handoff-store.json)
15. [`handoff-recover.json`](/fixtures/docs-v2-verified/handoff-recover.json)

## Current Verification Notes

The most important corrections from live verification were:

1. `write` is documented around `commit_id` and `commit_uri`
2. `recall_text` is documented around the returned `context` object
3. `planning/context` already exposes a useful compact `planning_summary`
4. `tools/select` persists a real `decision_id` even with zero matched rules
5. `tools/feedback` may correctly return `updated_rules = 0` with an explanatory note when no rule attribution is possible
6. `tools/decision` is the simplest audit lookup surface for a persisted decision
7. `context/assemble` already exposes a compact `assembly_summary`
8. `rules/evaluate` already returns a compact `evaluation_summary` that is usable before parsing the full matched-rule payload
9. `find` is a deterministic filter surface, not semantic recall
10. `resolve` is URI-first and returns a compact `resolve_summary` alongside the resolved object payload
11. `rules/state` returns a commit-shaped audit record instead of a long rule object
12. `tools/run` is the run-level audit surface and exposes a compact `lifecycle_summary`
13. `tools/feedback` also supports a matched-rule path with `updated_rules = 1` and persisted `decision_id` linkage
14. `handoff/recover` returns `handoff`, `prompt_safe_handoff`, and `execution_ready_handoff`
