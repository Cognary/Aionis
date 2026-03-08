---
title: "Automation Public Beta Rollback Drill 2026-03-08"
---

# Automation Public Beta Rollback Drill 2026-03-08

Status: `completed`  
Owner: Aionis Core  
Executed at: `2026-03-08`

## Goal

Validate the bounded public-beta rollback path for Automation without promising stale-head rewind.

Rollback model used in this drill:

1. disable the current bad latest version
2. fetch the last known-good version
3. recreate that graph as a new latest draft
4. shadow-validate the recreated version
5. approve and promote the recreated version back to `active`

## Why This Model

Current product intentionally blocks stale-source promote.

That means rollback is explicit:

1. disable bad head
2. recreate good graph as new head
3. validate
4. re-activate

This preserves auditability and matches the immutable version model.

## Executed Procedure

The rehearsal was executed against a live local API and Postgres instance using:

```bash
BASE_URL=http://127.0.0.1:3070 SMOKE_THROTTLE_SEC=0.2 npm run -s automation:public-beta-rollback-drill
```

Supporting assets:

1. script: `/Users/lucio/Desktop/Aionis/examples/automation_public_beta_rollback_drill.sh`
2. API under test: `/Users/lucio/Desktop/Aionis/src/index.ts`
3. automation runtime: `/Users/lucio/Desktop/Aionis/src/memory/automation.ts`

## Observed Results

Observed output summary from the live run:

```json
{
  "ok": true,
  "tenant_id": "default",
  "scope": "automation_public_beta_rollback_drill_1772974074_03a049be",
  "automation_id": "automation_public_beta_rollback_drill_1772974074",
  "versions": {
    "good_v1": 1,
    "good_active": 3,
    "bad_v2": 4,
    "bad_active": 6,
    "disabled_bad_head": 7,
    "recreated_draft": 8,
    "recreated_shadow": 9,
    "recreated_active": 10
  },
  "shadow_validation_status": "completed"
}
```

Interpretation:

1. the bad latest active head was disabled as a new immutable version `7`
2. the known-good version `1` was fetched and recreated as draft `8`
3. the recreated rollback target moved to `shadow` as version `9`
4. shadow validation completed successfully for the recreated target
5. the recreated rollback target was approved and promoted to `active` as version `10`

## Acceptance Check

The drill is considered successful because all of the following were observed:

1. bad version was no longer the active head after disable
2. rollback target became a new latest version instead of rewinding history
3. shadow evidence existed before re-activation
4. final activation happened from the recreated and reviewed shadow version

## Public-Beta Conclusion

This rollback path is acceptable for bounded public beta because it is:

1. explicit
2. auditable
3. API-driven
4. compatible with current version immutability

This is sufficient for bounded public beta, but not yet a GA rollback/incident-response package.
