# Aionis Lite Post-Public-Beta Plan

Date: `2026-03-12`  
Status: `active`

Related:

1. [AIONIS_LITE_PUBLIC_BETA_DECISION_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_PUBLIC_BETA_DECISION_2026-03-12.md)
2. [AIONIS_LITE_BETA_GATE_V2_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_BETA_GATE_V2_2026-03-12.md)
3. [AIONIS_LITE_PUBLIC_BETA_DOGFOOD_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_PUBLIC_BETA_DOGFOOD_2026-03-12.md)
4. [Lite Public Beta Boundary (EN)](/Users/lucio/Desktop/Aionis/docs/public/en/getting-started/05-lite-public-beta-boundary.md)
5. [Lite Troubleshooting and Feedback (EN)](/Users/lucio/Desktop/Aionis/docs/public/en/getting-started/06-lite-troubleshooting-and-feedback.md)

## Purpose

Lite is no longer blocked on core kernel capability.

The next phase is not to widen Lite toward Server parity.

The next phase is to make controlled public beta useful and safe:

1. collect structured real-user feedback
2. tighten operator UX from that feedback
3. define what must be true before GA is even considered

## Current Baseline

These are already true on `main`:

1. Lite public beta is approved in a controlled posture
2. alpha gate passes
3. beta gate v1 passes
4. beta gate v2 passes
5. repeated scripted dogfood is green
6. a non-scripted public-beta-style operator pass is green

This means the highest-value next work is no longer capability bring-up.

## Phase Priorities

### P1. Feedback Intake and Triage Discipline

Goal:

1. make sure every public beta report arrives in a structured form
2. make the beta support boundary and troubleshooting links visible at intake time
3. avoid drifting back to informal issue reports with missing operator context

Deliverables:

1. issue template remains mandatory and stable
2. issue template config routes users toward troubleshooting/boundary docs first
3. repository gate checks feedback-entrypoint readiness

### P2. Operator UX Tightening

Goal:

1. reduce avoidable confusion during install/start/use

Focus areas:

1. Node 22 / `node:sqlite`
2. `memory_lane` visibility semantics
3. `X-Admin-Token` and pack route expectations
4. local SQLite file-path expectations
5. startup failure messages and health debugging

### P3. Feedback-to-Fix Loop

Goal:

1. convert real beta feedback into a small set of recurring classes
2. fix highest-frequency operator friction first

Expected classes:

1. startup/install
2. health/environment drift
3. write/visibility
4. recall/context quality
5. replay lifecycle
6. packs/admin token
7. documentation/operator UX

### P4. GA Gate Definition

Goal:

1. define a future Lite GA gate without claiming GA now

GA gate should only be started after:

1. controlled public beta feedback has accumulated
2. no repeated blocker-class feedback remains unresolved
3. support boundary has stayed stable

## Immediate Execution Order

1. land feedback-entrypoint readiness as a machine-checked repository gate
2. keep collecting public beta feedback through the issue template
3. summarize the first wave of beta feedback into a short memo
4. convert repeated friction into operator UX fixes
5. only then draft a GA gate proposal

## Non-Goals

This phase does not aim to:

1. add control-plane parity
2. add automations to Lite
3. reposition Lite as the default deployment profile
4. erase the Lite vs Server boundary

## Exit Criteria

This phase is succeeding if:

1. feedback intake remains structured
2. beta feedback produces a small number of recurring, actionable themes
3. operator docs and startup behavior continue to stay aligned with those themes
4. Lite remains narrow, stable, and understandable
