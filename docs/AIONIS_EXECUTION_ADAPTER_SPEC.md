# Aionis Execution Adapter Spec

## Goal

Define the first adapter-first integration shape for Aionis so execution-memory can participate in real agent work without depending on prompt habits or manual MCP choreography.

## Product Intent

The adapter is the main product path.

It should make Aionis feel automatic:

1. task starts with guidance already available
2. tool-use decisions are shaped before execution
3. execution outcomes are observed without extra user prompting
4. task completion or blockage is finalized once
5. future tasks become easier because Aionis learned from prior execution

The thin MCP remains useful, but only as:

1. a compatibility layer
2. a debug and introspection layer
3. a fallback integration path for clients that cannot support a deeper adapter

## First Adapter Scope

The first adapter should target a single concrete path:

1. Claude Code style tool-driven coding sessions

The first adapter should not try to become:

1. a universal SDK for every runtime
2. a browser automation controller
3. a replacement for the thin MCP

## Core Responsibilities

The adapter owns five moments in the execution loop.

### 1. Task Start

At task start, the adapter should:

1. normalize the task description into a planning request
2. call Aionis planning guidance once
3. cache the returned planning state for the task

Minimum output:

1. planning guidance summary
2. workflow and pattern signals
3. compact execution kernel summary

### 2. Pre-Tool Selection

Before the agent uses a tool such as `bash`, `edit`, or `test`, the adapter should:

1. collect the candidate tools
2. call Aionis tool selection
3. preserve the returned decision context
4. expose the preferred tool back to the client

Minimum output:

1. selected tool
2. preferred ordering
3. decision id or equivalent decision handle
4. provenance explanation

### 3. Execution Evidence Capture

After a tool executes, the adapter should capture normalized evidence.

Minimum evidence fields:

1. task id
2. step id
3. selected tool
4. candidate tools
5. step outcome
6. whether the step was reverted
7. short context summary

The adapter should not require the user to restate these details manually.

### 4. Task Finalization

At task completion or blockage, the adapter should send a single normalized task-boundary signal.

Allowed terminal outcomes:

1. `completed`
2. `blocked`
3. `failed`
4. `abandoned`

The adapter should prefer one finalization call over conversational confirmation loops.

### 5. Learned-State Visibility

When the client wants to explain what Aionis learned, the adapter may call introspection.

This is optional for the mainline and primarily useful for:

1. onboarding
2. trust-building
3. debugging
4. demos

## Event Model

The first adapter contract should normalize execution into these event types:

1. `task_started`
2. `tool_selection_requested`
3. `tool_selected`
4. `tool_executed`
5. `step_reverted`
6. `task_completed`
7. `task_blocked`
8. `task_failed`

The adapter should translate these events into existing Aionis runtime calls instead of inventing a second memory model.

## Runtime Mapping

The first adapter should map to the current stable runtime surfaces:

1. `task_started`
   - `POST /v1/memory/planning/context`
2. `tool_selection_requested`
   - `POST /v1/memory/tools/select`
3. `tool_executed` or `step_reverted`
   - `POST /v1/memory/tools/feedback`
   - only when a high-confidence step boundary exists
4. `task_completed` / `task_blocked` / `task_failed`
   - task-boundary finalization path
5. learned-state visibility
   - `POST /v1/memory/execution/introspect`

The adapter should prefer stable route contracts that are already benchmarked.

## Evidence Quality Rules

The adapter must be conservative.

### Positive evidence

High-confidence positive evidence includes:

1. task completed successfully
2. explicit validated step success
3. explicit user-confirmed success

### Negative evidence

High-confidence negative evidence includes:

1. step reverted
2. task blocked
3. task failed
4. explicit user rejection

### Abstain cases

The adapter should abstain when:

1. a tool ran but the task state is unclear
2. a command exited non-zero but the agent kept exploring
3. an edit happened but was not yet validated

The adapter should favor under-learning over mis-learning.

## State Ownership

The adapter should own only ephemeral client-side state:

1. current task id
2. current planning context cache
3. last tool-selection decision handle
4. recent step outcomes for finalization

Persistent learning state remains in Aionis runtime.

## Integration Boundaries

The adapter should not:

1. embed a second persistence layer
2. fork Aionis trust logic
3. duplicate planner packet assembly
4. bypass runtime route contracts

The adapter should:

1. normalize client events
2. preserve decision linkage when available
3. provide evidence-derived fallback when linkage is missing
4. keep user interaction minimal

## First Release Requirements

The first adapter release is good enough if it achieves:

1. no repeated user confirmation loops
2. task-start planning guidance without manual prompting
3. pre-tool selection before `bash`, `edit`, or `test`
4. one task finalization call at the end
5. visible learned-state improvement after repeated similar tasks

## Out Of Scope

The first adapter does not need:

1. multi-client support
2. cross-device synchronization
3. hosted control plane integration
4. a visual dashboard
5. non-coding tool ecosystems

## Success Criteria

The adapter direction is successful when:

1. users no longer need to tell the model to use Aionis
2. similar tasks reliably show stronger Aionis guidance on the next run
3. task-boundary learning happens without prompt choreography
4. thin MCP can stay small and stable
