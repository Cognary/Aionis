# IA Map

This file maps the proposed external docs structure to the current public docs and code-backed product surfaces.

## Proposed External IA

```text
docs-v2/
  external/
    en/
      index.md
      01-why-aionis/
        index.md
      02-what-is-aionis/
        index.md
        memory-context.md
        handoff.md
        replay.md
        policy.md
        editions.md
        framework-agnostic.md
      03-how-to-use-aionis/
        index.md
        quickstart.md
        complete-flow.md
        memory-context.md
        handoff.md
        replay.md
        policy.md
        sdk-and-http.md
        codex.md
        mcp.md
        langgraph.md
        integrations.md
      04-reference-and-operations/
        index.md
        api-contract.md
        verified-test-data.md
        verification-status.md
        endpoints/
          index.md
          write.md
          recall-text.md
          planning-context.md
          context-assemble.md
          tools-select.md
          tools-decision.md
          tools-feedback.md
          handoff.md
          replay-compile-from-run.md
          replay-run.md
          replay-candidate-dispatch.md
          replay-repair-review.md
        production-ops.md
        governance.md
        benchmarks-and-slo.md
        memory-layers.md
```

## Reader Intent By Layer

1. Layer 1: "Why should I care?"
2. Layer 2: "What does this product actually do?"
3. Layer 3: "How do I get first success quickly?"
4. Layer 4: "Can I trust and operate this deeply?"

## Current Public Docs -> Draft Mapping

### Layer 1

Source material today:

1. `README.md`
2. `docs/public/en/overview/01-overview.md`
3. `docs/public/en/benchmarks/03-differentiation-evidence.md`
4. `docs/public/en/benchmarks/07-agent-handoff-and-replay.md`

### Layer 2

Source material today:

1. `docs/public/en/overview/01-overview.md`
2. `docs/public/en/about/02-aionis-onepage.md`
3. `docs/public/en/architecture/01-architecture.md`
4. `docs/public/en/getting-started/07-choose-lite-vs-server.md`

### Layer 3

Source material today:

1. `docs/public/en/getting-started/01-get-started.md`
2. `docs/public/en/getting-started/02-onboarding-5min.md`
3. `docs/public/en/integrations/01-mcp.md`
4. `docs/public/en/integrations/03-langgraph.md`
5. `docs/public/en/integrations/05-codex-local.md`
6. `docs/public/en/reference/05-sdk.md`

### Layer 4

Source material today:

1. `docs/public/en/api-reference/00-api-reference.md`
2. `docs/public/en/reference/*`
3. `docs/public/en/operations/*`
4. `docs/public/en/benchmarks/*`
5. layered compression and long-memory design material that should be promoted selectively from internal planning into a stable external reference

## Positioning Rule For The Whole Tree

The current public docs are accurate, but they still read too much like a well-organized internal system.

This draft changes the order of explanation:

1. value first
2. product model second
3. onboarding third
4. reference last

That order is better for adoption without turning the docs into empty marketing copy.
