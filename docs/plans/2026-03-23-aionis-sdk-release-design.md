# Aionis SDK Release Design

Date: 2026-03-23

## Goal

Reposition Aionis from:

1. "a runtime that can be integrated through MCP/Codex-like adapters"

to:

1. "an execution-memory runtime with a first-party SDK"

The SDK should become the primary public product identity.
MCP, Codex, IDE, and agent-framework integrations should become downstream adapters, not the public core story.

## Recommended Positioning

### What Aionis Should Be

Aionis should be presented as:

1. an execution-memory runtime
2. a governed memory system
3. an SDK for building memory-native agents and local execution systems

The key claim is:

1. Aionis does not just store memories
2. Aionis turns execution traces into:
   - reusable workflows
   - trusted patterns
   - planner-visible runtime guidance
   - governed memory mutations

### What Aionis Should Not Lead With

Aionis should not lead with:

1. MCP support
2. Codex support
3. adapter compatibility
4. "works inside X" framing

Those are useful later, but they make Aionis sound like an accessory instead of a runtime.

## Why SDK First Is The Right Move Now

### Recommended approach

Ship Aionis as:

1. runtime
2. route contract
3. SDK wrapper
4. examples

Recommendation:

1. first-party SDK should be the main external surface
2. HTTP routes remain the source of truth
3. SDK becomes the ergonomic product
4. adapters come later

### Alternatives considered

#### Option A: Keep leading with runtime routes only

Pros:

1. lowest extra work
2. stays closest to current implementation

Cons:

1. too raw for broader adoption
2. makes Aionis feel infrastructural rather than productized
3. shifts complexity onto integrators

#### Option B: Lead with MCP/Codex integration

Pros:

1. short-term familiarity
2. easier entry for some agent users

Cons:

1. gives away product identity
2. makes Aionis feel like a plugin layer
3. ties the story to another system's abstraction boundary

#### Option C: Lead with Aionis SDK

Pros:

1. preserves product ownership
2. matches the current state of the runtime
3. makes future adapters downstream instead of upstream
4. easier to document as one coherent mental model

Cons:

1. requires curating a first public API instead of exposing raw everything
2. requires examples and packaging discipline

Recommendation:

1. choose Option C

## First Public SDK Surface

The first SDK should be small.
It should wrap only the surfaces that are already stable and benchmark-defended.

### SDK shape

Recommended first package:

1. `@aionis/sdk`

Recommended client:

1. `createAionisClient(...)`

Recommended first modules:

1. `memory.write`
2. `memory.planningContext`
3. `memory.contextAssemble`
4. `memory.executionIntrospect`
5. `memory.tools.select`
6. `memory.tools.feedback`
7. `memory.replay.repairReview`
8. `memory.anchors.rehydratePayload`

### First API recommendation

Recommended public methods:

```ts
const aionis = createAionisClient({
  baseUrl: "http://127.0.0.1:8787",
});

await aionis.memory.write(...)
await aionis.memory.planningContext(...)
await aionis.memory.contextAssemble(...)
await aionis.memory.executionIntrospect(...)
await aionis.memory.tools.select(...)
await aionis.memory.tools.feedback(...)
await aionis.memory.replay.repairReview(...)
await aionis.memory.anchors.rehydratePayload(...)
```

### What should stay out of SDK v1

Do not lead v1 with:

1. raw lifecycle/archive control
2. every internal governance operation
3. broad admin/control-plane surfaces
4. unstable maintenance operations
5. MCP-specific abstractions

Reason:

1. the current technical maturity is strongest around execution-memory mainlines and current governed live paths
2. v1 should expose the strongest surfaces, not the noisiest ones

## SDK Product Narrative

### Recommended homepage / README headline

Recommended framing:

1. "Aionis is an execution-memory runtime and SDK for building agents that learn workflows, trust patterns, and govern memory updates."

Shorter variant:

1. "Execution memory for real agents."

### Recommended first-screen explanation

Recommended three-line explanation:

1. Aionis captures execution evidence, not just chat history.
2. It turns repeated execution into stable workflow guidance and trusted patterns.
3. It exposes that behavior through a local runtime plus a first-party SDK.

### Recommended capability framing

Lead with:

1. workflow learning
2. pattern learning
3. governed memory
4. planner-visible rehydration and guidance

Avoid leading with:

1. pack import/export
2. low-level route count
3. integration matrix
4. host compatibility claims

## First Example Set

The first examples should prove product value, not surface area.

### Example 1: Quickstart write -> recall -> plan

Goal:

1. show that repeated writes become planner-visible guidance

Flow:

1. write execution continuity
2. write a second continuity event
3. call planning context
4. show recommended workflows

### Example 2: Tool feedback -> trusted pattern

Goal:

1. show policy learning as a concrete developer experience

Flow:

1. select tool
2. send feedback
3. repeat
4. show trusted pattern in selection or introspection

### Example 3: Replay review -> governed learning

Goal:

1. show replay-governed workflow promotion

Flow:

1. review repair
2. observe governed learning projection
3. show planner-visible workflow guidance

### Example 4: External governance shadow run

Goal:

1. show that Aionis can compare builtin governance against real external LLM governance without changing the public SDK mental model

Flow:

1. run external shadow benchmark or example
2. compare governed outcomes

### Example 5: Minimal agent loop

Goal:

1. show that Aionis is the memory/runtime layer under a simple agent

Flow:

1. task
2. planning context
3. tool action
4. write / feedback
5. second run improves due to memory

## What To Remove Or Downgrade In Messaging

### Messaging to downgrade

These should move from core message to secondary/integration message:

1. MCP integration
2. Codex integration
3. generic "works with any agent host" claims
4. route inventory as the primary story

### Messaging to rewrite

Current wording like:

1. "good for IDE and MCP integrations"

should become something closer to:

1. "Aionis provides a first-party SDK and runtime; IDE, MCP, and host integrations are adapter layers built on top."

### Product hierarchy to enforce

Recommended hierarchy:

1. Aionis Runtime
2. Aionis SDK
3. Aionis Adapters

Adapters may later include:

1. MCP adapter
2. Codex adapter
3. IDE adapter
4. framework bindings

But those should never outrank the SDK in product identity.

## Packaging Recommendation

Short-term recommendation:

1. keep the runtime repository as the source of truth
2. add an SDK package that wraps stable HTTP contracts
3. keep examples separate from the core runtime internals

Suggested public package sequence:

1. `@aionis/sdk`
2. optional later: `@aionis/mcp-adapter`
3. optional later: `@aionis/codex-adapter`

## Launch Sequence

### Phase 1: SDK-first public baseline

Ship:

1. runtime quickstart
2. SDK quickstart
3. three to five value-first examples
4. benchmark-backed proof points

### Phase 2: Strengthen trust

Ship:

1. stable benchmark artifact story
2. external governance shadow evidence
3. clearer governance docs

### Phase 3: Adapters

Only after SDK positioning is established:

1. release MCP adapter
2. release Codex/IDE adapters
3. frame them as integrations, not product identity

## Recommended Next Implementation Steps

### Immediate next step

1. define SDK v1 public method list and response ownership layers

### Next after that

1. rewrite README first screen around SDK identity
2. add `/examples` or `docs/examples` for the first 3 to 5 SDK flows
3. define package/release structure for `@aionis/sdk`

### Later

1. publish adapter strategy as a separate document
2. explicitly demote MCP/Codex from primary message to integration appendix

## Final Recommendation

Yes, Aionis should now move toward an SDK-first release posture.

The current technical state supports it because:

1. the main runtime loops are real
2. the governance stack is real
3. the benchmark posture is strong
4. real external governance shadow alignment now exists

That means Aionis no longer needs to borrow identity from MCP or Codex.

The right public story now is:

1. Aionis is the runtime
2. Aionis SDK is the first-class developer surface
3. MCP and Codex are future adapters
