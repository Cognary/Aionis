# Go-live Checklist

Use this checklist before enabling production traffic.

## What this page is for

Use this page during the final day of launch. It is the short operational checklist for deciding whether the deployment is ready for external traffic.

## T-24h checks

1. Core gate passes in staging.
2. Authentication and isolation settings verified.
3. Rollback owner and release owner assigned.
4. Replay evidence chain prepared.
5. Monitoring dashboards and alert channels active.

## Required evidence before launch

Do not approve the release without all of the following:

1. A passing core gate result from the target version.
2. A successful write, recall, and policy sanity path in the target environment.
3. One replayable workflow with stored `run_id`, `decision_id`, and `commit_uri`.
4. A named rollback owner and a tested rollback procedure.

## T-2h checks

1. Target environment health is green.
2. Write/recall/policy smoke path passes.
3. Release artifact and version metadata finalized.

## Launch checks

1. Shift traffic gradually.
2. Track p95 latency and error rate during rollout window.
3. Keep rollback path ready and tested.

## Rollback triggers

Rollback immediately if any of these appear during the rollout window:

1. Sustained `5xx` increase beyond the agreed threshold.
2. Critical write or recall path failure in the live environment.
3. Policy decisions diverge on a guarded production workflow.
4. Replay of a critical workflow no longer reconstructs correctly.

## Post-release checks

1. Re-run core gate.
2. Validate decision/feedback linkage.
3. Archive release evidence package.
