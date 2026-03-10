---
title: "Aionis Architecture Workflow Cost Report Template"
---

# Aionis Architecture Workflow Cost Report Template

Use this template after the workflow cost evaluation trial ends.

Keep the report to one page.

## 1. Trial Scope

1. Trial window:
2. Baseline PR count:
3. Trial PR count:
4. Included buckets:
   - `packaging-only refactor`
   - `runtime host / route boundary change`
   - `kernel-impacting change`

## 2. Executive Read

Answer in 3-5 sentences:

1. Did the architecture workflow add noticeable author cost?
2. Did it reduce reviewer ambiguity?
3. Should the workflow stay default, be simplified, or be partially rolled back?

## 3. Cost Summary

### Author Cost

1. Average template fill time:
2. Average verification/doc update overhead:
3. Total average author overhead:

### Reviewer Cost

1. Average layer/boundary comprehension time:
2. Average architecture clarification comments:
3. Average review rounds:

### Flow Cost

1. Metadata/boundary/contract gate failure count:
2. Average minutes lost to process failures:
3. Average PR cycle time:

## 4. Outcome Summary

1. Post-merge rework caused by architecture misunderstanding:
2. Post-merge rework caused by kernel misclassification:
3. Notable pattern:

## 5. Baseline vs Trial

Use short deltas only:

1. Author overhead delta:
2. Reviewer clarification delta:
3. Review rounds delta:
4. Cycle time delta:
5. Rework delta:

## 6. Decision

Select one:

1. `Keep as-is`
2. `Keep but simplify`
3. `Rollback some parts`

Reason:

`n/a`

## 7. Simplification or Follow-Up Actions

List at most 3 actions:

1.
2.
3.

## 8. Evidence

Link the supporting materials:

1. [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_WORKFLOW_COST_EVALUATION.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_WORKFLOW_COST_EVALUATION.md)
2. [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_PR_COST_LOG_TEMPLATE.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_PR_COST_LOG_TEMPLATE.md)
