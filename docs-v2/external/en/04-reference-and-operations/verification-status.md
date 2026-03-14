---
title: "Verification Status"
description: "See which Aionis documentation surfaces are live-verified, code-backed, or supported by public benchmark evidence."
---

# Verification Status

This page shows how far each part of this site has been verified.

That matters because this site is intentionally moving in two tracks:

1. build the public-facing site now
2. keep tightening accuracy with live verification instead of blocking on every unfinished experiment

## Status Levels

`live-verified`
: validated against a running Lite instance using the current verification scope

`code-backed`
: checked against current code, schemas, SDKs, and public material, but not yet run end-to-end in the current verification cycle

`public-evidence-backed`
: supported by current public benchmark or disclosure pages

## Current `live-verified` Endpoints

1. `POST /v1/memory/write`
2. `POST /v1/memory/recall_text`
3. `POST /v1/memory/planning/context`
4. `POST /v1/memory/context/assemble`
5. `POST /v1/memory/rules/state`
6. `POST /v1/memory/rules/evaluate`
7. `POST /v1/memory/find`
8. `POST /v1/memory/resolve`
9. `POST /v1/memory/tools/select`
10. `POST /v1/memory/tools/decision`
11. `POST /v1/memory/tools/run`
12. `POST /v1/memory/tools/feedback` for both zero-attribution and matched-rule paths
13. `POST /v1/handoff/store`
14. `POST /v1/handoff/recover`

## Current `code-backed` But Not Yet Re-verified Here

1. replay playbook endpoints
2. broader policy-loop paths beyond the verified tools/feedback attribution paths
3. automation and server-only control surfaces
4. deeper production-control endpoints such as tenant quotas and audit dashboards

Replay examples in this bucket include:

1. `runs/get`
2. `playbooks/get`
3. `playbooks/compile_from_run`
4. `playbooks/run`
5. `playbooks/candidate`
6. `playbooks/dispatch`
7. `playbooks/repair/review`

## Why Some Things Stay `code-backed` For Now

There are two main reasons:

1. some flows need more setup than the current verification scope
2. some policy comparison and replay experiments are still in progress and are not yet part of the public claim set

## How To Read These Labels

Use the labels like this:

1. use `live-verified` when you have actually run it
2. use `public-evidence-backed` when it is already disclosed
3. otherwise describe it as `code-backed`, not as a proven user outcome
