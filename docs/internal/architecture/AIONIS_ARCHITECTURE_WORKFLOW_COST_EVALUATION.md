---
title: "Aionis Architecture Workflow Cost Evaluation"
---

# Aionis Architecture Workflow Cost Evaluation

Status: `active` (`2026-03-10`)

## 1. Goal

Measure the real usage cost of the new architecture workflow:

1. PR template
2. reviewer checklist
3. PR metadata workflow gate
4. dependency direction checks
5. kernel contract checks

The purpose is not to prove the workflow has zero cost.

The purpose is to answer:

1. how much author overhead was added
2. how much reviewer ambiguity was removed
3. whether rework and boundary confusion decreased enough to justify the process

## 2. Decision Rule

Keep the workflow as the default if:

1. author overhead remains bounded
2. reviewer clarification cost decreases
3. boundary mistakes and rework decrease

Working rule:

`added process cost < avoided review/rework cost`

## 3. Evaluation Design

Use a short real-world trial instead of a survey.

### Trial window

1. duration: `2 weeks`
2. sample size target: `6-10` real PRs

### Comparison design

Use:

1. `baseline set`
   recent pre-adoption PRs of similar type
2. `trial set`
   new PRs created with the current architecture workflow

Do not compare unrelated PR types.

## 4. PR Buckets

Classify both baseline and trial PRs into one primary bucket:

1. `packaging-only refactor`
2. `runtime host / route boundary change`
3. `kernel-impacting change`

If a PR does not fit one bucket cleanly, exclude it from the comparison set.

## 5. Metrics

Track the following for every PR.

### Author cost

1. minutes to fill PR template
2. minutes to gather verification evidence
3. minutes spent updating architecture docs/checklists, if any

### Reviewer cost

1. minutes to classify the layer and boundary impact
2. number of clarification comments about layer / kernel impact / dependency direction
3. review rounds before approval

### Flow cost

1. CI failures caused by metadata/boundary/contract gates
2. minutes lost to fixing process failures
3. total PR cycle time from open to merge

### Quality outcome

1. post-merge rework required because the architectural boundary was misunderstood
2. post-merge rework required because kernel impact was misclassified

## 6. Data Collection Rules

Use lightweight manual logging.

Do not try to automate every metric in the first pass.

Record values:

1. once when the author opens the PR
2. once after first review
3. once after merge

If exact minutes are unavailable, use best-effort estimates rounded to the nearest `5` minutes.

## 7. Trial Procedure

### Step 1: Select baseline PRs

Choose:

1. `5` recent PRs before the workflow landed
2. matched as closely as possible by PR bucket

### Step 2: Select trial PRs

Require the next `6-10` relevant PRs to use:

1. [/Users/lucio/Desktop/Aionis/.github/PULL_REQUEST_TEMPLATE.md](/Users/lucio/Desktop/Aionis/.github/PULL_REQUEST_TEMPLATE.md)
2. [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_REVIEW_CHECKLIST.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_REVIEW_CHECKLIST.md)
3. [/Users/lucio/Desktop/Aionis/.github/workflows/pr-architecture-metadata.yml](/Users/lucio/Desktop/Aionis/.github/workflows/pr-architecture-metadata.yml)

### Step 3: Log every PR

Use:

1. [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_PR_COST_LOG_TEMPLATE.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_PR_COST_LOG_TEMPLATE.md)

### Step 4: Summarize

At the end of the window, compute:

1. average author overhead
2. average reviewer clarification cost
3. average review rounds
4. average cycle time
5. number of process-caused failures
6. number of architecture misunderstanding rework cases

Final report template:

1. [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_WORKFLOW_COST_REPORT_TEMPLATE.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ARCHITECTURE_WORKFLOW_COST_REPORT_TEMPLATE.md)

## 8. Reporting Format

Keep the final report to one page.

Answer only these questions:

1. How much author cost did the workflow add?
2. How much reviewer ambiguity did it remove?
3. Did architecture-related rework decrease?
4. Should the workflow stay default, be simplified, or be rolled back?

## 9. Suggested Interpretation

Interpretation bands:

1. `Keep as-is`
   author overhead is small and review/rework clearly improve
2. `Keep but simplify`
   process helps, but one or two fields/gates create disproportionate friction
3. `Rollback some parts`
   process cost is high and gains are weak or inconsistent

## 10. Common Failure Modes

Watch for these during the trial:

1. authors filling the template mechanically without improving clarity
2. reviewers ignoring the checklist and falling back to old habits
3. metadata gate failures caused by template confusion rather than real quality issues
4. over-attributing normal review cost to architecture workflow cost

## 11. Recommended First Trial

Recommended first pass:

1. `2 weeks`
2. `6` trial PRs
3. `5` baseline PRs
4. one summary note at the end

This is enough to judge whether the workflow is directionally worth keeping without over-investing in measurement.
