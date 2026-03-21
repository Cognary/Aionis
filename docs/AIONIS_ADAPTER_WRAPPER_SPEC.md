# Aionis Adapter Wrapper Spec

## Goal

Define the first wrapper-oriented client wiring layer that can drive the Aionis adapter sidecar without relying on prompt choreography.

## Product Role

The wrapper is the first practical bridge between:

1. a real client that can run commands or tool steps
2. the local adapter sidecar
3. the Aionis runtime learning loop

It is not the final native integration. It is the first usable path for clients that can emit lifecycle events but do not expose deep private hooks.

## Why A Wrapper Layer

The sidecar already gives Aionis a local event-driven surface.

What is still missing is a client-friendly layer that can:

1. start a task once
2. request tool selection in order
3. execute a real command-backed step
4. report the step outcome back to the sidecar
5. finalize the task once

Without that layer, the sidecar remains correct but too low-level for practical client integration experiments.

## First Scope

The first wrapper slice should focus on command-backed steps.

That means:

1. `bash`
2. `test`
3. any other command-style tool with a process boundary

The first wrapper slice does not need to solve rich editor hooks yet.

## Main Responsibilities

The wrapper should:

1. call the sidecar with `task_started`
2. call the sidecar with `tool_selection_requested`
3. run a real command step through a command runner
4. call the sidecar with `tool_executed`
5. call the sidecar with one terminal outcome
6. optionally call introspection

The wrapper should not:

1. fork sidecar contracts
2. store long-term state outside the sidecar
3. add a second trust model

## Runtime Shape

The first wrapper should exist as a source-owned TypeScript module under `src/adapter/`.

It should:

1. reuse the current sidecar dispatcher in-process
2. accept an injected command runner for tests
3. provide a default local command runner for real local use

## Command Step Contract

The first wrapper must support a normalized command step shape:

1. `task_id`
2. `step_id`
3. `selected_tool`
4. `candidates`
5. `context`
6. `command`
7. optional `args`
8. optional `cwd`
9. optional `validated`
10. optional `reverted`
11. optional `note`

The wrapper should capture:

1. exit code
2. stdout
3. stderr

and forward the exit code into the `tool_executed` event.

## Evidence Rules

The wrapper should stay conservative.

That means:

1. command execution alone should not force positive learning
2. validated command-backed success may produce stronger evidence
3. ambiguous command steps should still allow task-boundary finalization to be the main learning path

## Success Criteria

The first wrapper slice is successful when:

1. a local client can drive one full task loop without prompt reminders
2. command execution results are automatically forwarded into Aionis
3. task finalization happens once
4. the sidecar remains the only event-driven integration surface
5. richer client-native wiring can build on this layer later
