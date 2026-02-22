---
title: "Packaging Plan"
---

# Aionis Packaging Plan

This document is the execution blueprint for packaging Aionis as a production-facing product and category narrative.

## Objective

Build one consistent public story and delivery surface across:

1. Narrative
2. Architecture expression
3. Marketing website
4. Docs website
5. Release evidence

Target outcome:

`Aionis is a Verifiable / Operable Memory Kernel for agents.`

## Canon (Must Stay Fixed)

Main narrative:

1. `Verifiable / Operable Memory Kernel`

Three pillars:

1. `Audit-first`
2. `Derived async`
3. `Memory -> Policy`

Release structure (every launch):

1. `Problem -> Architecture Principles -> Evidence -> Boundaries -> Next Step`

## Positioning of Token Compression

Token compression is included as an efficiency layer, not as primary category claim.

Rules:

1. Do not lead with generic "more accurate memory" messaging.
2. Present compression as `budget-controlled + traceable`.
3. Evidence must include all three metrics:
   - `compression_ratio`
   - `items_retain_ratio`
   - `citations_retain_ratio`
4. Compression KPI participates in production gate as non-blocking first, then blocking after stabilization.

## Audience Packs

Maintain three synchronized versions per release:

1. Technical pack (engineering + infra)
2. Product pack (application teams)
3. Business pack (partner/investor/commercial)

## Public Information Architecture

## Website (marketing)

Landing flow:

1. Problem
2. Architecture principles
3. Evidence (including compression KPI)
4. Boundaries (what Aionis is / is not)
5. Next step CTA

Required pages:

1. Home
2. Open Core model
3. Docs gateway
4. Pricing / contact

## Docs Website (public)

Top-level sections:

1. Start Here
2. API + SDK
3. Production Operations
4. Narrative + Release Materials
5. Boundary (Open Core vs Hosted)

Non-public docs policy:

1. Internal GTM/hosted operator internals stay in private repo.
2. Public docs keep product-facing and operator-safe content only.

## Release Evidence Standard

Each release should include:

1. Build / contract / docs / SDK checks
2. Health gate + consistency check summary
3. Performance SLO summary
4. Compression KPI summary
5. Boundary + known limitations
6. Next-step plan

## Execution Phases

## Phase 1 - Canon Lock

Status: `completed`

Deliverables:

1. Narrative canon fixed in docs
2. Release template fixed
3. Boundary docs linked

## Phase 2 - Surface Unification

Status: `in_progress`

Deliverables:

1. Website home/docs copy aligned with canon
2. Docs home/index reorganized
3. Token compression evidence language integrated

Acceptance:

1. Homepage, docs home, README first-screen sentence exactly consistent
2. Compression appears as evidence layer with KPI wording

## Phase 3 - Release Packaging Ops

Status: `pending`

Deliverables:

1. Standard release checklists and evidence bundle references surfaced in docs/website
2. Public materials (technical/product/business) linked from one gateway

Acceptance:

1. Every release can be published with one repeatable template and complete evidence links

## Phase 4 - Continuous Narrative Governance

Status: `pending`

Deliverables:

1. Weekly narrative drift review in governance report
2. Gate on wording drift for homepage/docs core sentence (lightweight lint/check)

Acceptance:

1. No conflicting tagline variants remain in public-facing entry points

## Working Checklist

1. Align homepage copy with canon and evidence ordering.
2. Align docs gateway copy with canon and role-based tracks.
3. Add compression evidence references in website + docs.
4. Ensure docs navigation includes packaging plan and narrative materials.
5. Validate with:
   - `npm run -s build`
   - `npm run -s docs:check`

## Verification Stamp

- Last reviewed: `2026-02-22`
