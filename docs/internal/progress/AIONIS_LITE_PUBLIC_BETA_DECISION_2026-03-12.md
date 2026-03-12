# Aionis Lite Public Beta Decision

Date: `2026-03-12`  
Status: `recommended_for_controlled_public_beta`

Related:

1. [AIONIS_LITE_STATUS_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_STATUS_2026-03-11.md)
2. [AIONIS_LITE_PUBLIC_BETA_READINESS_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_PUBLIC_BETA_READINESS_2026-03-12.md)
3. [AIONIS_LITE_BETA_GATE_V2_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_BETA_GATE_V2_2026-03-12.md)
4. [Lite Public Beta Boundary (EN)](/Users/lucio/Desktop/Aionis/docs/public/en/getting-started/05-lite-public-beta-boundary.md)
5. [Lite Troubleshooting and Feedback (EN)](/Users/lucio/Desktop/Aionis/docs/public/en/getting-started/06-lite-troubleshooting-and-feedback.md)

## Decision

Lite is now suitable for a controlled public beta.

This is not a GA decision.

It means:

1. the repository gates for Lite beta-candidate readiness are already passing
2. the public support boundary is explicit
3. public operator notes and troubleshooting entrypoints exist
4. there is a structured feedback path for beta users

It does not mean:

1. Lite replaces Server
2. Lite is the default deployment path
3. Lite has full Server parity
4. Lite is ready for broad production positioning

## Why This Decision Is Reasonable

The main blocker is no longer kernel capability.

That work is already established through:

1. Lite runtime host split
2. SQLite-backed write / recall / replay / sessions / packs / inspection
3. local policy loop and context runtime
4. repeated green dogfood evidence
5. passing alpha and beta repository gates

The remaining gap was public framing and feedback capture.

That gap is materially smaller now because:

1. Lite public beta boundary pages exist in EN and ZH
2. public troubleshooting and feedback pages exist in EN and ZH
3. GitHub issue intake now has a Lite beta feedback template

## Controlled Public Beta Scope

The recommended external positioning is:

1. single-user local edition
2. SQLite-backed local runtime
3. suitable for evaluation, dogfooding, and local agent workflows
4. intentionally narrower than Server

Current server-only boundary remains:

1. `/v1/admin/control/*`
2. `/v1/automations/*`

## Messaging Discipline

Public beta messaging should keep these statements stable:

1. Lite is for local single-user usage
2. Server remains the production topology
3. Lite beta is not Server parity
4. users who outgrow Lite should move to Server rather than forcing governance or automation expectations into Lite

## Remaining Risks

Public beta is now supportable, but still carries these risks:

1. more operator UX edge cases may appear once non-repo users start onboarding
2. troubleshooting coverage is better, but not field-complete
3. repeated scripted dogfood is strong evidence, but not a substitute for broader external hardening

## Next Work After Public Beta Launch

The next phase should focus on:

1. collecting real beta feedback
2. tightening startup and operator UX from reported friction
3. defining a future GA gate rather than adding large new kernel surfaces
