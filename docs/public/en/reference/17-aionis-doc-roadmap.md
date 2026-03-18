---
title: "Aionis Doc Roadmap"
---

# Aionis Doc Roadmap

This page describes the planned direction for Aionis Doc as a product-facing protocol layer.

It is a capability roadmap, not a fixed release promise.

## Current Public Boundary

Today, Aionis Doc already supports:

1. source parsing and directive normalization
2. AST, IR, and execution graph compilation
3. versioned compile contracts
4. runtime handoff generation
5. handoff store request generation
6. publish and recover flows through native handoff endpoints
7. official CLI exposure through `aionis doc ...`

This means Aionis Doc is already a usable executable-document workflow surface.

What it does not yet do:

1. directly start full runtime execution from the document itself
2. guarantee the full original aspirational spec surface
3. expose a fully frozen external schema for every future directive family

## Why This Matters

Aionis Doc is the layer that connects:

1. human-readable working documents
2. compiler-visible structure
3. runtime continuity payloads
4. handoff memory persistence
5. recoverable execution state

That makes it strategically important to Aionis even before direct doc-driven execution lands.

## Near-Term Priorities

### 1. Stronger Authoring Stability

Focus:

1. tighten syntax guarantees around payloads and refs
2. make diagnostics more specific and easier to fix
3. keep the stable public subset intentionally small

Expected outcome:

1. lower authoring error rate
2. fewer parser/runtime interpretation gaps

### 2. More Complete Runtime Continuity

Focus:

1. improve continuity shaping around execution state
2. make publish and recover paths easier to operationalize
3. reduce impedance between compile outputs and runtime inputs

Expected outcome:

1. easier integration into real Aionis workflows
2. more reliable handoff continuity recovery

### 3. Better Examples And Integration Guidance

Focus:

1. more end-to-end examples
2. clearer runtime integration patterns
3. stronger public guidance for contracts and diagnostics

Expected outcome:

1. lower time-to-first-success for new authors
2. fewer raw API integrations for common paths

## Mid-Term Priorities

### 1. Direct Doc-Driven Execution

Focus:

1. bridge recovered continuity into real execution/resume paths
2. support a clearer execution-ready boundary from document source
3. make document-driven workflows first-class in the broader runtime narrative

### 2. Stronger Reproducibility Controls

Focus:

1. better module and version pinning semantics
2. clearer replay expectations for executable documents
3. stronger deterministic and advisory mode boundaries

### 3. Richer Evidence And Decision Linking

Focus:

1. clarify evidence attachment semantics
2. improve targetability for decisions, outputs, and sections
3. make document-derived provenance easier to consume downstream

## Long-Term Direction

Longer-term, Aionis Doc should become the protocol layer that allows Aionis to treat one file as:

1. a readable work artifact
2. a compiler input
3. a continuity carrier
4. a recoverable execution record
5. a provenance and evidence envelope

That is the direction. It should not be interpreted as a promise that every directive family will become equally stable.

## Guidance For Teams Adopting It Now

If you are adopting Aionis Doc today:

1. start with `@doc`, `@context`, `@execute`, and `@replay`
2. rely on `aionis doc compile` before any publish flow
3. treat diagnostics as part of the authoring contract
4. adopt publish/recover first, direct execution later

## Related

1. [Aionis Doc](/public/en/reference/10-aionis-doc)
2. [Aionis Doc CLI Workflow](/public/en/reference/13-aionis-doc-cli-workflow)
3. [Aionis Doc Contracts](/public/en/reference/14-aionis-doc-contracts)
4. [Roadmap](/public/en/roadmap/00-roadmap)
