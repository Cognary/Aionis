---
title: "Aionis Architecture PR Drill"
---

# Aionis Architecture PR Drill

Status: `active` (`2026-03-10`)

Use this note when an engineer wants to prepare an architecture-impacting PR using the new template and review discipline.

## 1. Goal

This drill is meant to answer one practical question:

1. can a normal refactor PR be described using the new `layer / boundary / kernel-impact / rollback` workflow without inventing extra process

## 2. Drill Scenario

Example scenario:

1. split a route-heavy runtime entrypoint into host and registrar modules
2. keep behavior unchanged
3. tighten dependency direction while preserving green build/contract/docs

This is a good drill because it is:

1. architecture-impacting
2. reviewable
3. not a product redesign

## 3. Example Filled PR Body

```md
## Summary

Move runtime host registration out of the mixed entrypoint and keep the entrypoint focused on bootstrap wiring. No kernel semantics change; this is a packaging and dependency-direction cleanup.

## Architecture Layer

- [ ] `Kernel`
- [x] `Runtime Services`
- [ ] `Control & Extensions`

If the PR spans more than one layer, state the reason briefly:

`n/a`

## Boundary Impact

1. Does this PR introduce or remove any dependency direction across `Kernel -> Runtime Services -> Control & Extensions`?
   `yes, removes host-orchestrator logic from the mixed entrypoint and keeps host wiring out of runtime app helpers`
2. Does this PR change kernel semantics or only packaging/wiring?
   `packaging-only`
3. If kernel-impacting, which canonical object or stable surface changed?
   `n/a`

## Spec References

- [x] `/Users/lucio/Desktop/Aionis/docs/AIONIS_KERNEL_ARCHITECTURE_SPEC.md`
- [x] `/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_KERNEL_ARCHITECTURE_ADOPTION_PLAN.md`
- [ ] `/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_KERNEL_CONTRACT_CHECKLIST.md`

## Verification

```text
npm run -s lint -- --no-cache
npm run -s build
npm run -s test:contract
npm run -s test:dependency-direction
npm run -s docs:check
```

## Rollback Surface

Revert the extracted host/route registrar modules and restore the previous bootstrap wiring in `src/index.ts`.

## Review Notes

Check dependency direction first: `src/app/*` should still avoid `src/routes/*`, and host-only registration should stay in `src/host/*`.
```

## 4. Reviewer Walkthrough

Suggested review order for the drill:

1. confirm the selected layer is plausible
2. confirm the PR is actually `packaging-only` or `kernel-impacting`
3. check dependency direction before reading behavior details
4. verify the command list is appropriate for the claimed scope
5. check rollback clarity last

## 5. Pass Criteria

The drill is successful if:

1. the author can fill the template without ambiguity
2. the reviewer can classify the change quickly
3. the CI metadata gate passes without manual workaround
4. the PR discussion uses `Kernel / Runtime Services / Control & Extensions` consistently

## 6. Follow-Up

If the drill feels awkward, improve:

1. template wording
2. reviewer checklist wording
3. CI error messages

Do not respond by adding more architecture layers or more abstract terminology.
