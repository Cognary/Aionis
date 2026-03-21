# Aionis Host Integration Architecture

## Goal

Define the long-term host integration architecture for Aionis so future capabilities can plug into a stable product shell instead of one-off host-specific glue.

This document exists to prevent the integration layer from fracturing into:

1. one bridge for planning
2. another bridge for tool selection
3. another bridge for replay or governance
4. another bridge for introspection

The host path should become a real integration bus.

## Core Product Model

The product stack should be understood as:

```text
host agent
↓
host bridge
↓
Aionis integration bus
↓
Aionis runtime capabilities
↓
tools and execution environment
```

In product terms:

1. the host agent owns user interaction and task orchestration
2. Aionis owns execution-memory logic
3. tools still do the actual work

## Architecture Principle

The integration layer must be:

1. event-driven
2. capability-registered
3. host-agnostic at the core
4. host-specific only at the outer bridge

That means:

1. Codex CLI should not get a one-off custom planning shim
2. Claude Code should not get a separate memory model
3. future hosts should reuse the same Aionis bus contracts

## Layer Model

### 1. Host Bridge

The host bridge is the outermost layer.

It translates host-native lifecycle surfaces into Aionis integration events.

Examples:

1. Codex CLI `hooks.json`
2. future Claude Code plugin or fork hooks
3. future open-source agent host callbacks

The host bridge should know:

1. how the host emits lifecycle information
2. how to collect host metadata
3. how to return host-native outputs

The host bridge should not know:

1. Aionis trust logic
2. workflow promotion logic
3. replay or governance policy internals

### 2. Integration Bus

The integration bus is the main internal boundary.

It receives normalized execution events and dispatches them to registered Aionis capabilities.

The integration bus is where Aionis stops being "a specific host integration" and becomes "a reusable execution layer".

### 3. Capability Handlers

Each Aionis capability should register itself against bus events.

Examples:

1. planning guidance
2. tool selection
3. execution evidence capture
4. task finalization
5. rehydration
6. introspection
7. replay/governance later

Each capability handler should declare:

1. which events it listens to
2. which prerequisites it needs
3. which outputs it emits
4. whether it is synchronous, optional, or best-effort

### 4. Runtime Adapter

The runtime adapter is the layer that maps capability outputs to existing stable Aionis runtime routes.

It should continue to prefer stable routes such as:

1. `POST /v1/memory/planning/context`
2. `POST /v1/memory/tools/select`
3. `POST /v1/memory/tools/feedback`
4. task finalization path
5. `POST /v1/memory/execution/introspect`

## Canonical Event Bus

The bus should standardize a finite set of events.

The baseline event family should be:

1. `session_started`
2. `task_started`
3. `prompt_submitted`
4. `tool_selection_requested`
5. `tool_selected`
6. `tool_executed`
7. `step_reverted`
8. `task_terminal`
9. `memory_inspection_requested`
10. `operator_action_requested`

Not every host will emit every event at first.

That is acceptable.
The point is to standardize the integration language now.

## Canonical Execution Context

Every event should carry a standard execution context object.

The minimum context should include:

1. `host_name`
2. `host_version`
3. `session_id`
4. `task_id`
5. `turn_id`
6. `cwd`
7. `scope`
8. `prompt`
9. `tool_candidates`
10. `selected_tool`
11. `task_kind`
12. `goal`
13. `host_metadata`

This context should be the primary contract future capabilities consume.

The purpose is simple:

1. avoid rebuilding context differently per feature
2. avoid re-parsing host-native payloads in every handler
3. keep later integrations predictable

## Capability Registry

The integration bus should not hardcode all behavior in one large dispatcher.

Instead, it should support a capability registry model.

Each capability should look conceptually like:

1. capability id
2. subscribed events
3. optional feature flag
4. handler implementation
5. output type

The initial registry should support these capability families:

1. `planning_guidance`
2. `tool_selection`
3. `execution_feedback`
4. `task_finalization`
5. `learned_state_visibility`

Later capability families can include:

1. `rehydration`
2. `workflow_repair`
3. `operator_governance`
4. `replay_actions`

## Output Channels

The integration layer must support more than one kind of output.

The initial output channels should be:

1. `context_injection`
2. `tool_ordering`
3. `task_feedback_recorded`
4. `task_finalized`
5. `inspection_payload`
6. `warning`

This is important because not every capability returns text.

Examples:

1. planning wants `context_injection`
2. tool selection wants `tool_ordering`
3. task completion wants `task_finalized`
4. introspection wants `inspection_payload`

## Host-Agnostic Core, Host-Specific Edge

The core integration bus should not know whether the host is:

1. Codex CLI
2. Claude Code
3. another open-source coding host

The host-specific bridge should only do:

1. input normalization
2. host-native output conversion
3. host-specific lifecycle translation

Everything after that should be shared.

This is the main guardrail that prevents the repository from drifting into multiple incompatible host paths.

## Feature Flags

The integration architecture should reserve feature flags from the start.

Recommended flags:

1. `planning_injection`
2. `tool_selection`
3. `execution_feedback`
4. `task_finalization`
5. `rehydration`
6. `learned_state_visibility`
7. `operator_surfaces`

These flags should let the product enable capabilities incrementally without rewriting bridge contracts.

## Host Strategy

The expected host strategy is:

1. Codex CLI becomes the first serious open host path
2. thin MCP remains fallback, debug, and compatibility only
3. later hosts reuse the same integration bus

This means future work should avoid:

1. growing MCP into the main product shell
2. building new host-specific memory logic
3. bypassing the integration bus for convenience

## Implementation Direction

The practical implementation path should be:

1. keep current adapter, sidecar, and wrapper as reusable internals
2. add host-specific bridges such as Codex CLI hook bridge
3. gradually refactor bridge logic onto a capability registry
4. keep runtime route mapping stable underneath

## Success Criteria

This architecture is successful when:

1. new Aionis capabilities can be attached without inventing new host contracts
2. host integrations share one execution-context model
3. Codex CLI and later hosts can reuse the same capability handlers
4. MCP is no longer mistaken for the main product shell
5. Aionis can keep expanding functionally without turning integration code into a mess
