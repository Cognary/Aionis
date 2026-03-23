# Aionis Open-Core Boundary

This document describes the current recommended product boundary for Aionis.

## Short version

Recommended distribution stance:

1. keep `@aionis/sdk` open
2. keep public runtime contracts explicit
3. keep the strongest runtime learning/governance implementation under tighter control

That is a better fit for the current stage than either:

1. opening every runtime-internal capability
2. making the entire developer surface closed

## Why this boundary makes sense now

Aionis already has real technical depth in:

1. execution-memory learning loops
2. governed replay/workflow/tools behavior
3. benchmark and regression-gated runtime validation
4. external-LLM shadow-aligned governance evaluation

Those are the parts most likely to become the long-term moat.

At the same time, Aionis still needs:

1. developer adoption
2. easy integration
3. a clear public identity

The SDK solves the adoption problem better than MCP-first or integration-first packaging.

## Recommended open surface

The default open surface should be:

1. `@aionis/sdk`
2. typed SDK contracts
3. public route-level integration contracts
4. examples, quickstart, and publishing guidance
5. enough local/community runtime documentation to explain how the SDK talks to Aionis

## Recommended controlled surface

The more controlled layer can include:

1. stronger governance orchestration
2. higher-value learning/maintenance internals
3. policy/eval/control-plane logic
4. hosted or pro runtime distribution
5. deeper operational tooling around model-backed governance

## What this is not

This is not a claim that the runtime must be opaque or undocumented.

The goal is:

1. explicit contracts
2. easy developer entry
3. preserved implementation leverage

## External positioning

Recommended public phrasing:

1. Aionis is an execution-memory runtime
2. `@aionis/sdk` is the primary developer interface
3. adapters such as MCP, Codex, or IDE integrations are secondary layers
4. stronger runtime layers are distributed selectively as the product matures

## Immediate implication

For the next release phase, the practical priority should be:

1. make the SDK easy to install, learn, and try
2. keep runtime contracts stable
3. avoid over-exposing the full runtime implementation before the product moat is ready
