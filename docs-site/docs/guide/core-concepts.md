# Core Concepts

This page defines the terms used across the rest of the documentation.

## Why this matters

If these concepts are vague, every downstream task becomes harder: integration contracts drift, telemetry becomes inconsistent, and replay investigations turn into guesswork.

## Concept map

1. An **event** is a durable fact about what happened.
2. A **memory** is the durable graph state built from events, edges, and commits.
3. A **memory lane** controls visibility within that memory.
4. **Context assembly** turns recalled memory into bounded runtime context.
5. The **policy loop** decides which actions are allowed or preferred.
6. **Decision provenance** records why a decision happened.
7. **Replay execution** uses those identifiers to reconstruct a full workflow.

## Event

Definition:
1. A typed memory node that represents something that happened.

Why it exists:
1. Agent systems need durable execution facts, not only transient prompts.

Role:
1. Events become recallable context and replay evidence.

## Memory

Definition:
1. Durable graph state of nodes, edges, and commit lineage.

Why it exists:
1. Production agents need auditable state transitions.

Role:
1. Memory provides long-term, queryable runtime context.

## Memory lane

Definition:
1. Visibility partition for memory objects.

Why it exists:
1. Different users, agents, and scopes require explicit access boundaries.

Role:
1. Lane metadata controls what is visible in retrieval flows.

## Replay execution

Definition:
1. Reconstruction and rerun of historical workflow paths.

Why it exists:
1. Incident analysis and regression validation require reproducibility.

Role:
1. Replay links `request_id -> run_id -> decision_id -> commit_uri`.

## Policy loop

Definition:
1. Rule-driven execution control around tool and action selection.

Why it exists:
1. Teams need predictable, governed decisions instead of opaque behavior.

Role:
1. `rules/evaluate -> tools/select -> tools/decision -> tools/feedback`.

## Decision provenance

Definition:
1. Trace chain that records why an execution decision happened.

Why it exists:
1. Debugging and compliance require causality, not guesses.

Role:
1. Provenance data powers replay, audits, and rollout safety checks.

## Context assembly

Definition:
1. Budgeted composition of layered context for planners and runtimes.

Why it exists:
1. Raw retrieval output is noisy and often too large.

Role:
1. `context/assemble` returns deterministic, bounded context.

## How the concepts connect

1. You write events into memory.
2. Memory is filtered by tenant, scope, and lane.
3. Context assembly prepares runtime input for the next decision.
4. The policy loop evaluates rules and selects actions.
5. Decision provenance preserves the chain of identifiers.
6. Replay execution uses that chain later to rebuild what happened.
