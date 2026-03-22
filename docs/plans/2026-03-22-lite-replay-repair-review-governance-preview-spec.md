# Lite Replay Repair Review Governance Preview Spec

## Goal

Connect the new `promote_memory` semantic-review baseline to a real internal runtime path without introducing model calling or a new public route family.

The chosen call site is `replayPlaybookRepairReview`.

## Why This Call Site

`replayPlaybookRepairReview` already:

1. evaluates repaired playbooks
2. computes deterministic gate metrics
3. optionally triggers replay-learning projection

That makes it the narrowest existing runtime path where Lite can emit a real governed-promotion preview instead of keeping semantic-review helpers completely detached from live execution flows.

## Scope

In scope:

1. build a bounded `promote_memory` semantic review packet during approved replay repair review
2. attach that packet to the repair-review response as a governance preview
3. keep the preview optional and internal-minded
4. add route-contract coverage

Out of scope:

1. model calling
2. accepting review results from requests
3. mutating replay-learning projection based on the preview
4. general governance preview surfaces across all routes

## Contract

When replay repair review:

1. is an `approve`
2. reaches `review_state = approved`
3. has learning projection enabled

the response should expose:

1. `governance_preview.promote_memory.review_packet`

The packet should:

1. use `promote_memory`
2. target `workflow/L2`
3. include candidate count
4. include compact candidate examples
5. include deterministic gate state

## Acceptance

1. repair review response contract accepts optional governance preview
2. approved replay review with learning projection returns a bounded `promote_memory` review packet
3. reject / blocked cases do not incorrectly fabricate an approved governance preview
4. `tsc` and `test:lite` stay green
