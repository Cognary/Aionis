# Aionis Lite Public Beta Self-Feedback Wave 2

Date: `2026-03-12`
Status: `completed_with_findings`

Related:

1. [AIONIS_LITE_PUBLIC_BETA_SELF_FEEDBACK_WAVE_1_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_PUBLIC_BETA_SELF_FEEDBACK_WAVE_1_2026-03-12.md)
2. [AIONIS_LITE_PUBLIC_BETA_READINESS_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_PUBLIC_BETA_READINESS_2026-03-12.md)
3. [Lite Public Beta 边界](/Users/lucio/Desktop/Aionis/docs/public/zh/getting-started/05-lite-public-beta-boundary.md)
4. [Lite 运维说明](/Users/lucio/Desktop/Aionis/docs/public/zh/getting-started/04-lite-operator-notes.md)
5. [Lite 排障与反馈](/Users/lucio/Desktop/Aionis/docs/public/zh/getting-started/06-lite-troubleshooting-and-feedback.md)

## Goal

Run a second first-party Lite beta wave focused on boundary behavior rather than only green-path success:

1. `memory_lane = "shared"` visibility
2. `memory_lane = "private"` visibility
3. pack route authentication requirements
4. minimum valid `memory/write` request shape

Artifacts:

1. invalid minimal write attempt:
   [public_beta_boundary_20260312_135149](/Users/lucio/Desktop/Aionis/artifacts/lite/public_beta_boundary_20260312_135149)
2. valid boundary run:
   [public_beta_boundary_valid_20260312_135227](/Users/lucio/Desktop/Aionis/artifacts/lite/public_beta_boundary_valid_20260312_135227)

## Result Summary

Overall result: `useful beta findings`

The Lite product did not show a new kernel blocker, but this wave produced two real public-beta feedback items.

## Finding 1: Minimum write shape is stricter than the current public boundary wording

Observed:

1. a `memory/write` request containing only `nodes` failed with:
   `must set input_text or input_sha256`
2. this was reproducible in Lite real-process execution

Interpretation:

1. this is valid server behavior, not a Lite-only bug
2. however, it is a real public-beta friction point because the current Lite public boundary lists `/v1/memory/write` as supported without calling out the minimum request shape

Recommendation:

1. update public Lite operator or troubleshooting docs to explicitly say that `memory/write` still requires `input_text` or `input_sha256`

## Finding 2: `private` visibility is asymmetric across `find` and `recall_text`

Observed on the valid boundary run:

1. `shared` note:
   - visible in `find`
   - visible in `recall_text`
2. `private` note:
   - hidden from `find`
   - still returned by `recall_text` without explicit agent context

Interpretation:

1. current Lite behavior is not a simple “private is invisible everywhere without owner context”
2. it is more precise to say:
   - `find` respects a stricter inspection visibility path
   - `recall_text` can still surface private-lane content in this local single-user Lite shape

This is not automatically wrong, but it is operator-facing semantic complexity and should be documented more carefully.

Recommendation:

1. tighten public wording around `memory_lane = "private"`
2. avoid implying that private content will simply “not appear” across all inspection and recall surfaces

## Boundary Checks That Passed

1. `shared` lane remained discoverable through `find` and `recall_text`
2. pack export without admin token failed as expected with `401 unauthorized_admin`
3. pack export with admin token succeeded as expected

## Feedback Classification

This wave did not produce a release blocker.

It did produce two public-beta quality items:

1. documentation gap on `memory/write` minimum request requirements
2. documentation/semantics gap around `private` lane visibility across different Lite surfaces

## Next Step

1. keep the current Lite public beta posture
2. treat these as operator UX / boundary documentation fixes
3. if external beta feedback repeats the same confusion, prioritize doc clarification before changing kernel behavior
