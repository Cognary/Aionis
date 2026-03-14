---
title: "Endpoint Reference"
description: "Start from the verified Aionis endpoints, then inspect replay and deeper routes with explicit status boundaries."
---

# Endpoint Reference

This is the endpoint-level reference for the highest-value Aionis routes.

It starts with the routes most likely to matter during evaluation and first integration.

## Verified First

These pages were selected because they are the shortest path from evaluation to real integration:

1. [POST /v1/memory/write](./write.md)
2. [POST /v1/memory/recall_text](./recall-text.md)
3. [POST /v1/memory/planning/context](./planning-context.md)
4. [POST /v1/memory/context/assemble](./context-assemble.md)
5. [POST /v1/memory/rules/state](./rules-state.md)
6. [POST /v1/memory/rules/evaluate](./rules-evaluate.md)
7. [POST /v1/memory/find](./find.md)
8. [POST /v1/memory/resolve](./resolve.md)
9. [POST /v1/memory/tools/select](./tools-select.md)
10. [POST /v1/memory/tools/decision](./tools-decision.md)
11. [POST /v1/memory/tools/run](./tools-run.md)
12. [POST /v1/memory/tools/feedback](./tools-feedback.md)
13. [Handoff Store and Recover](./handoff.md)

## Replay Endpoints In Reference

These replay pages are currently `code-backed` and, where applicable, `public-evidence-backed`, but not yet `live-verified` in the current validation scope:

1. [POST /v1/memory/replay/runs/get](./replay-run-get.md)
2. [POST /v1/memory/replay/playbooks/get](./replay-playbook-get.md)
3. [POST /v1/memory/replay/playbooks/candidate](./replay-playbook-candidate.md)
4. [POST /v1/memory/replay/playbooks/compile_from_run](./replay-compile-from-run.md)
5. [POST /v1/memory/replay/playbooks/run](./replay-run.md)
6. [POST /v1/memory/replay/playbooks/dispatch](./replay-dispatch.md)
7. [Replay Candidate And Dispatch](./replay-candidate-dispatch.md)
8. [POST /v1/memory/replay/playbooks/repair/review](./replay-repair-review.md)

## Scope Of This Reference

Each page aims to answer four things:

1. what the endpoint is for
2. which request fields matter first
3. which response fields matter first
4. what we already verified against a live Lite instance in the current validation scope

For shared failure semantics, see:

1. [Common Errors](../common-errors.md)

## Verified Scope

The current verification scope is:

1. `tenant_id = default`
2. `scope = docs_v2_verified`

See:

1. [Verified Test Data](../verified-test-data.md)
2. [Verification Status](../verification-status.md)
