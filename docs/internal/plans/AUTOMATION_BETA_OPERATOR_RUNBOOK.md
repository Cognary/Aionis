---
title: "Automation Beta Operator Runbook"
---

# Automation Beta Operator Runbook

Status: `draft` (`2026-03-07`)  
Owner: Aionis Core  
Audience: operators supporting the Automation design partner beta

## 1. Purpose

This runbook defines the minimum operator response flow for the Automation beta.

It covers:

1. `approval_required`
2. `repair_required`
3. `approve_repair`
4. `reject_repair`
5. `compensation/retry`
6. explicit `shadow` execution
7. disabling a bad automation version

This runbook does not cover:

1. public Marketplace operations
2. parallel scheduling
3. async shadow dashboards
4. general workflow-engine incident patterns

## 2. Capture First

Before acting on a failing or paused automation, capture:

1. `tenant_id`
2. `scope`
3. `automation_id`
4. `run_id`
5. `version`
6. affected `node_id`
7. `playbook_run_id` if present
8. current `lifecycle_state`
9. current `pause_reason`
10. current `terminal_outcome`

## 3. Baseline Inspection

Use `POST /v1/automations/runs/get` first.

Expected operator checks:

1. confirm whether the run is `running`, `paused`, `compensating`, or `terminal`
2. identify the first non-terminal node
3. inspect `output_snapshot_json` for the paused or failed node
4. inspect `playbook_run_id` for any playbook-backed node
5. confirm whether compensation already ran or is still pending

## 4. Approval Pause

Run state:

1. `lifecycle_state=paused`
2. `pause_reason=approval_required`

Operator action:

1. review the node output and downstream impact
2. if execution should continue, call `POST /v1/automations/runs/resume`
3. if execution should stop permanently, call `POST /v1/automations/runs/cancel`

Do not:

1. use `approve_repair` for a plain approval gate
2. treat `approval_required` as a failed run

## 5. Repair Pause

Run state:

1. `lifecycle_state=paused`
2. `pause_reason=repair_required`

Node state:

1. affected node should be `paused`
2. affected node should keep the failing `playbook_run_id`

Operator action:

1. confirm the failing node and its `playbook_run_id`
2. inspect whether a repaired playbook version exists in the same lineage
3. decide whether to continue with the repaired version or reject the repair

Continue path:

1. if the repair is acceptable, call `POST /v1/automations/runs/approve_repair`
2. this records approval evidence and resumes execution

Reject path:

1. if the repair is not acceptable, call `POST /v1/automations/runs/reject_repair`
2. if compensation is configured, the run may enter compensation before terminalizing

Do not:

1. call plain `resume` before a reviewed repair exists
2. assume the newest playbook version is valid unless the lineage check passes

## 6. Reject And Compensation

Typical sequence:

1. `reject_repair`
2. run enters `compensating` or directly reaches `terminal`
3. successful compensation ends as `failed_compensated`
4. failed compensation ends as `failed`

Operator action when compensation fails:

1. inspect the run and node compensation status
2. repair the compensation playbook if required
3. call `POST /v1/automations/runs/compensation/retry`
4. verify the run reaches `terminal` with `failed_compensated`

Do not:

1. retry compensation after the run is already `*_compensated`
2. treat a failed compensation as proof that forward execution should resume

## 7. Shadow Execution

Use shadow mode to validate a `shadow` automation version without making it the default runnable path.

Rules:

1. plain `run` on a `shadow` head must be rejected
2. only explicit `execution_mode=shadow` runs are valid
3. playbook-backed nodes execute in replay `simulate`
4. approval nodes auto-approve with shadow evidence instead of waiting for a human

Operator checks after a shadow run:

1. run should reach `terminal/succeeded`
2. run should report `execution_mode=shadow`
3. approval nodes should contain `shadow_auto_approved=true`
4. playbook-backed nodes should retain non-null `playbook_run_id`
5. playbook output should show `mode=simulate`

## 8. Disable Or Roll Back

Use `POST /v1/automations/promote` to move the latest version to `disabled` when a version should stop accepting new runs.

Recommended triggers:

1. repeated `repair_required` on the same node after a recent promotion
2. repeated compensation failure on a critical cleanup path
3. shadow validation disagreement with active behavior
4. any automation bug that can mutate infrastructure incorrectly

Current beta constraint:

1. promotion only allows the current latest version as the source
2. silent rewind of head is intentionally blocked

## 9. Escalate Immediately

Escalate to engineering if any of the following happens:

1. a run remains `running` with no active operator action and no node progress
2. a run returns `terminal` with missing `terminal_outcome`
3. a `shadow` run pauses on approval instead of auto-approving
4. a playbook-backed node completes without `playbook_run_id`
5. `compensation/retry` changes a previously compensated run back to plain `failed`
6. `approve_repair` or `reject_repair` changes the wrong node lineage

## 10. Beta Support Boundary

During design partner beta, support commitments are:

1. best-effort operator response during staffed hours
2. bounded workflows using sequential DAGs only
3. explicit handling of `approve_repair`, `reject_repair`, `cancel`, and `compensation/retry`

Out of scope:

1. parallel recovery logic
2. generalized workflow retries
3. arbitrary event-triggered automations
4. Marketplace publishing incidents

## 11. Related

1. `/Users/lucio/Desktop/Aionis/docs/internal/plans/AUTOMATION_BETA_RELEASE_READINESS_CHECKLIST.md`
2. `/Users/lucio/Desktop/Aionis/docs/internal/plans/AUTOMATION_BETA_LIMITATIONS_AND_SUPPORT_BOUNDARY.md`
3. `/Users/lucio/Desktop/Aionis/docs/PLAYBOOK_MARKETPLACE_AUTOMATION_DAG_PLAN.md`
