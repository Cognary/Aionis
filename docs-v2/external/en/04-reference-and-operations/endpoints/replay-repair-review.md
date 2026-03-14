---
title: "POST /v1/memory/replay/playbooks/repair/review"
description: "Reference for reviewing and governing Aionis replay repair proposals before approval, validation, or promotion."
---

# POST /v1/memory/replay/playbooks/repair/review

## Status

`code-backed`

## What It Does

Reviews a replay repair proposal and controls what happens next.

This is one of the most governance-heavy replay endpoints because it can:

1. approve or reject a repair
2. run shadow validation
3. optionally auto-promote on pass
4. optionally project approved learning artifacts

## Request Fields That Matter First

1. `tenant_id`
2. `scope`
3. `playbook_id`
4. `version`
5. `action`
6. `shadow_validation_mode`
7. `target_status_on_approve`
8. `auto_promote_on_pass`
9. `learning_projection`

## Request Field Table

| Field | Required | What It Does |
| --- | --- | --- |
| `tenant_id` | no | Selects the tenant boundary. |
| `scope` | no | Selects the replay scope to review in. |
| `playbook_id` | yes | Identifies the replay playbook family under review. |
| `version` | no | Pins review to one repaired playbook version. |
| `action` | yes | Chooses `approve` or `reject`. |
| `auto_shadow_validate` | no | Enables shadow validation during approval flow. |
| `shadow_validation_mode` | no | Chooses validation mode such as readiness or execution. |
| `shadow_validation_params` | no | Supplies execution-time parameters for validation. |
| `learning_projection` | no | Controls projection of approved repair knowledge into stronger runtime assets. |

## External Positioning

This endpoint belongs in the deep reference layer, not the homepage story.

It belongs in deep reference because it is for teams that already:

1. use replay seriously
2. need review and promotion controls
3. want adaptation under explicit governance

## Response Field Table

| Field | What It Means | Why You Care |
| --- | --- | --- |
| `playbook_id` / `version` | Reviewed playbook identity and version. | Confirms what governance action applied to. |
| `review_state` | Resulting review state. | Primary governance outcome. |
| `status` | Resulting playbook status after review. | Tells you whether the playbook became stronger or stayed limited. |
| `shadow_validation` | Shadow validation result, when requested. | Useful for approval confidence. |
| `auto_promote_policy_resolution` | Resolution chosen for auto-promotion policy. | Useful for understanding approval consequences. |
| `learning_projection_result` | Result of optional learning projection. | Useful when repairs should influence future runtime assets. |
| `commit_id` / `commit_uri` | Commit lineage for the review decision. | Useful for governance audit trails. |

## Important Boundary

The existence of learning projection in this endpoint is not a license to describe Aionis as open-ended self-improving autonomy.

The grounded claim is:

1. approved replay repairs can be reviewed and governed before becoming stronger runtime assets

## Common Errors

1. `replay_playbook_not_found` or `replay_playbook_version_not_found`
   Trigger: the requested playbook or version does not exist in the current scope.
2. `replay_repair_patch_missing`
   Trigger: review was requested for a playbook version that does not contain a repair patch.
3. `replay_repair_not_pending_review`
   Trigger: the target version is no longer in `pending_review`.

## Grounding

1. `src/memory/schemas.ts`
2. `src/routes/memory-replay-governed.ts`
3. `src/memory/replay.ts`
4. `docs/public/en/api-reference/00-api-reference.md`
5. `docs/public/en/about/01-core-differentiators.md`
