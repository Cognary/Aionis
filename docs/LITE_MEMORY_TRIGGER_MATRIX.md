# Aionis Lite Memory Trigger Matrix

Last reviewed: 2026-03-20

This document turns the Lite memory governance principles into a practical trigger table.

Preferred module term:

`Runtime-Governed Semantic Memory`

Design principle:

`LLM-adjudicated, runtime-governed memory evolution`

## Purpose

The governance model defines who decides what.

This matrix defines when Lite should:

1. stay fully deterministic
2. trigger LLM adjudication
3. force rehydration
4. reject mutation without review

This document should be treated as an execution-oriented companion to:

1. [docs/LITE_MEMORY_GOVERNANCE_MODEL.md](/Volumes/ziel/Aionisgo/docs/LITE_MEMORY_GOVERNANCE_MODEL.md)
2. [docs/LITE_EXECUTION_MEMORY_STRATEGY.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_STRATEGY.md)
3. [docs/LITE_ANCHOR_SCHEMA.md](/Volumes/ziel/Aionisgo/docs/LITE_ANCHOR_SCHEMA.md)

## Trigger Classes

Lite should recognize four trigger classes:

1. `deterministic_only`
2. `llm_adjudication`
3. `force_rehydration`
4. `reject_or_manual_review`

## Trigger Table

| Situation | Trigger Class | Runtime Action | LLM Role |
|---|---|---|---|
| Raw event append, usage update, time decay, archive relocation | `deterministic_only` | execute directly | none |
| Candidate promotion from event to workflow | `llm_adjudication` | nominate candidate, enforce thresholds | judge reusability and target level |
| Candidate promotion from workflow to pattern | `llm_adjudication` | pre-group by signatures, enforce thresholds | judge whether grouped workflows are one pattern |
| Importance score near threshold | `llm_adjudication` | mark candidate as ambiguous | judge retention vs demotion |
| Low-frequency but high-outcome memory | `llm_adjudication` | nominate strategic-value review | judge whether strategic retention is justified |
| Multiple recalled anchors conflict | `llm_adjudication` | surface conflict and provenance | judge which anchor is more applicable |
| Compression candidate contains repetitive logs or duplicated traces | `llm_adjudication` | keep reversible path, preserve provenance | judge keep-details vs drop-details |
| Irreversible action with missing detail | `force_rehydration` | rehydrate required payload before action | may continue after full context arrives |
| Policy-required verification path | `force_rehydration` | require payload expansion | optional reviewer of expanded context |
| Repeated failure after anchor-only guidance | `force_rehydration` | escalate from summary-only to partial/full | decide next step after payload arrives |
| Confidence below runtime floor | `reject_or_manual_review` | reject mutation or require review | none or optional second-pass analysis |
| Write-scope unsafe or policy-restricted request | `reject_or_manual_review` | reject | none |
| Delete request without strong runtime policy | `reject_or_manual_review` | reject irreversible mutation | none |

## Core Trigger Rules

### Rule 1: Promotion Trigger

Lite should trigger LLM adjudication when:

1. a candidate memory passes deterministic nomination filters
2. the promotion target is not obvious from rules alone
3. semantic significance matters more than raw frequency

Typical operations:

1. `promote_memory`
2. `form_pattern`
3. `derive_policy_hint`

### Rule 2: Threshold Ambiguity Trigger

Lite should trigger LLM adjudication when a memory sits near a deterministic boundary.

Examples:

1. importance is near promote vs demote threshold
2. low usage conflicts with high outcome quality
3. repeated recall exists but pattern confidence is still uncertain

This is where fixed rules are weakest and semantic judgment adds the most value.

### Rule 3: Conflict Trigger

Lite should trigger LLM adjudication when recalled anchors conflict in recommended action.

Examples:

1. two anchors share task signature but suggest different tools
2. two workflows have similar outcomes but different repair paths
3. a recent anchor conflicts with an older but more successful pattern

The runtime should surface:

1. provenance
2. confidence
3. recency
4. payload cost hints

The LLM should judge applicability, not mutate memory automatically.

### Rule 4: Forced Rehydration Trigger

Lite should force rehydration only in narrow cases.

Recommended force conditions:

1. irreversible action with missing detail
2. explicit policy requirement
3. repeated failure after anchor-only guidance
4. safety-critical missing context

This means most rehydration should still remain an explicit agent tool choice.

### Rule 5: Manual Review Or Rejection Trigger

Lite should reject or defer when:

1. runtime budget is exceeded
2. confidence is below floor
3. the request violates write scope or policy
4. the mutation is irreversible and not sufficiently justified

This protects Lite from over-trusting semantic proposals.

## Suggested Trigger Inputs

The runtime should be able to trigger adjudication from structured signals like:

1. `importance_score`
2. `salience`
3. `confidence`
4. `usage_count`
5. `last_used_at`
6. `task_signature`
7. `error_signature`
8. `workflow_signature`
9. `outcome.status`
10. `anchor_conflict_count`
11. `payload_cost_hint`
12. `action_risk_level`

## Suggested Trigger Outputs

When the runtime decides to trigger adjudication, it should send a structured candidate bundle rather than an open-ended prompt.

The candidate bundle should include:

1. operation name
2. candidate ids
3. relevant signatures
4. outcome summary
5. confidence and threshold context
6. payload cost hints when relevant
7. allowed mutation space

This keeps Lite protocol-driven.

## Recommended First Implementation Priorities

The first trigger implementations should be:

1. event-to-workflow promotion trigger
2. workflow-to-pattern trigger with signature gate
3. low-frequency high-outcome retention trigger
4. anchor conflict trigger
5. irreversible-action force-rehydration trigger

These five cover the highest-value ambiguity points.

## Summary

The trigger matrix is the practical operating layer of Lite memory governance.

It ensures that:

1. deterministic mechanics remain deterministic
2. semantic adjudication is only invoked where it adds value
3. rehydration is not overused
4. irreversible mutations remain tightly controlled
