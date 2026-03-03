---
title: "Docs Public Product-Language Plan"
---

# Docs Public Product-Language Plan

## Goal

Keep public docs strictly external-facing and product-oriented, while preserving all internal documents in a separate internal tree.

## Scope

1. Public docs surface: `docs/public/en/**`
2. Internal docs surface: `docs/internal/**`
3. Public navigation and homepage copy only use external product language.

## Execution Checklist

1. Restructure public IA to Memory Kernel categories.
2. Remove internal-facing wording from public pages.
3. Remove public navigation links to planning/internal docs.
4. Enforce public-doc checks in CI (`docs:check`):
   - no links to `docs/internal`
   - no internal-only wording markers
5. Keep multilingual parity optional during IA stabilization.

## Non-Goals

1. Deleting any internal documents.
2. Rewriting all historical technical runbooks in a single batch.
3. Publishing internal strategy/remediation content.

## Completion Criteria

1. Public homepage and sidebar match category-led IA.
2. Public docs do not reference internal paths.
3. Public copy gate passes in `docs:check`.
4. `docs:build` succeeds.
