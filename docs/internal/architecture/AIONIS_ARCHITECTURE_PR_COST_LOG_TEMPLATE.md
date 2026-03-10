---
title: "Aionis Architecture PR Cost Log Template"
---

# Aionis Architecture PR Cost Log Template

Use one copy of this template per PR during the workflow cost evaluation trial.

## PR Metadata

1. PR link:
2. PR title:
3. Date opened:
4. Date merged:
5. Bucket:
   - `packaging-only refactor`
   - `runtime host / route boundary change`
   - `kernel-impacting change`
6. Comparison group:
   - `baseline`
   - `trial`

## Author Cost

1. Minutes to fill PR template:
2. Minutes to gather verification evidence:
3. Minutes to update related docs/spec/checklists:
4. Total author process overhead minutes:

## Reviewer Cost

1. Minutes to understand layer/boundary placement:
2. Clarification comments about architecture/layer/kernel impact:
3. Review rounds before approval:

## Flow Cost

1. PR metadata workflow failed:
   - `yes/no`
2. Dependency direction or kernel contract check failed:
   - `yes/no`
3. Minutes spent fixing process/gate failures:
4. Total cycle time from open to merge:

## Outcome

1. Post-merge rework due to architecture misunderstanding:
   - `yes/no`
2. Post-merge rework due to kernel impact misclassification:
   - `yes/no`
3. Short note:

## Reviewer Judgment

1. Did the template/checklist improve clarity?
   - `yes/no/mixed`
2. Was any field obviously low-value?
3. Would you keep this workflow for this PR type?
   - `yes/no/mixed`
