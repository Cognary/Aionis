# Aionis Lite Public Beta Readiness

Date: `2026-03-12`  
Status: `completed_for_controlled_public_beta`

Related:

1. [AIONIS_LITE_STATUS_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_STATUS_2026-03-11.md)
2. [AIONIS_LITE_ALPHA_RELEASE_MEMO_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_ALPHA_RELEASE_MEMO_2026-03-12.md)
3. [AIONIS_LITE_BETA_GATE_V2_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_BETA_GATE_V2_2026-03-12.md)
4. [Lite Public Beta Boundary (EN)](/Users/lucio/Desktop/Aionis/docs/public/en/getting-started/05-lite-public-beta-boundary.md)
5. [Lite Public Beta 边界 (ZH)](/Users/lucio/Desktop/Aionis/docs/public/zh/getting-started/05-lite-public-beta-boundary.md)
6. [Lite Troubleshooting and Feedback (EN)](/Users/lucio/Desktop/Aionis/docs/public/en/getting-started/06-lite-troubleshooting-and-feedback.md)
7. [Lite 排障与反馈 (ZH)](/Users/lucio/Desktop/Aionis/docs/public/zh/getting-started/06-lite-troubleshooting-and-feedback.md)
8. [AIONIS_LITE_PUBLIC_BETA_DECISION_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_PUBLIC_BETA_DECISION_2026-03-12.md)
9. [AIONIS_LITE_PUBLIC_BETA_DOGFOOD_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_PUBLIC_BETA_DOGFOOD_2026-03-12.md)

## Purpose

Lite now has stronger beta-candidate evidence than it did during alpha-only bring-up.

The main remaining problem is no longer kernel capability.

It is public release framing.

This phase exists to make sure Lite can be exposed externally without ambiguity about:

1. what it supports
2. what remains server-only
3. what users should do when they outgrow Lite

## What Is Already True

These repository facts are already established:

1. Lite alpha gate passes
2. Lite beta gate v1 passes
3. Lite beta gate v2 passes
4. repeated dogfood evidence is green
5. operator notes exist in EN and ZH
6. startup path and health contract are stable

## What Still Needed Public Framing

Before this step, the public surface still lacked one concise page that answered:

1. Is Lite for production?
2. Which routes are supported?
3. Which routes are intentionally unavailable?
4. When should a user move to Server?

That gap is now being closed through the public beta boundary docs.

## Current Decision

The repository can now describe Lite more precisely as:

1. internal alpha completed
2. repository beta-candidate by v1 and v2
3. suitable for controlled public beta evaluation

It should still not be described as:

1. GA
2. default deployment profile
3. a Server replacement

## Next Readiness Work

The next highest-value items after the public beta boundary page are:

1. one more non-scripted real-user beta-style dogfood pass
2. a concise public troubleshooting/feedback loop
3. a beta decision memo that explicitly approves or withholds public beta launch

That decision memo now exists and now approves a controlled public beta rather than a GA posture.
