# OpenClaw × Aionis Loop Control Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate Aionis loop-control capability into OpenClaw so complex ReAct tasks are bounded by policy, step/time limits, duplicate-progress detection, and replay/handoff escape hatches instead of spinning and burning tokens.

**Architecture:** Keep OpenClaw as the task runtime and use Aionis as an external execution-control substrate. Add a thin loop-control adapter in the OpenClaw plugin that wraps each ReAct step with Aionis policy, bounded-execution checks, and persisted decision/feedback/replay signals. Do not fork OpenClaw planning logic in phase 1; intercept the loop at plugin/tool and session boundary points.

**Tech Stack:** TypeScript, OpenClaw plugin (`@aionis/openclaw-aionis-memory`), Aionis SDK/HTTP APIs, Lite/Server runtime, replay/policy/handoff routes.

---

## Scope

Phase 1 is about **anti-loop control**, not a full new orchestration engine.

### In scope

1. tool-selection gating before each high-cost step
2. local loop budget checks: step count, token budget, duplicate observations, no-progress streak
3. persisted decision and feedback writeback to Aionis
4. forced stop / forced handoff / replay-dispatch escape hatches
5. operator-visible reason codes for why a run continued, downgraded, or stopped

### Out of scope

1. replacing OpenClaw planner
2. redesigning OpenClaw ReAct prompting
3. adding a second execution runtime inside the plugin
4. promising autonomous self-healing for arbitrary tasks

---

## Capability Mapping

Use existing Aionis surfaces rather than inventing a fake unified endpoint.

### Pre-step control

1. `/v1/memory/rules/evaluate`
2. `/v1/memory/tools/select`
3. optional `/v1/memory/planning/context`

### In-step bounds

1. replay `max_steps`
2. replay `timeout_ms`
3. replay `stop_on_failure`
4. deterministic replay gate
5. sandbox budget gate / cancel when execution path goes through sandbox

### Post-step feedback loop

1. `/v1/memory/tools/decision`
2. `/v1/memory/tools/feedback`
3. `/v1/memory/write`

### Escape hatches

1. `/v1/handoff/store`
2. `/v1/handoff/recover`
3. `/v1/memory/replay/playbooks/candidate`
4. `/v1/memory/replay/playbooks/dispatch`

### Governance / ops

1. execution-loop gate job
2. tool decision traceability
3. run lifecycle readback

---

## Target User Flow

The intended runtime flow for one OpenClaw task is:

1. task starts
2. plugin opens a loop-control session state object
3. before every expensive tool step, plugin asks Aionis policy which tool path is allowed/preferred
4. plugin checks local loop budgets
5. if within budget, OpenClaw runs the step
6. result is written back to Aionis as decision/feedback/evidence
7. loop state updates duplicate/no-progress counters
8. if thresholds are crossed, plugin chooses one of:
   - hard stop
   - forced handoff store
   - replay dispatch attempt
9. plugin emits a structured summary explaining why the run continued or stopped

This keeps the integration external and auditable.

---

## Integration Design

### Component 1: Loop Control Adapter

**Files:**
- Modify: `/Users/lucio/Desktop/aionis-openclaw-plugin/src/index.ts`
- Create: `/Users/lucio/Desktop/aionis-openclaw-plugin/src/loop-control.ts`
- Test: `/Users/lucio/Desktop/aionis-openclaw-plugin/test/loop-control.test.ts`

Responsibilities:

1. hold per-run state
2. expose `beforeStep(...)`
3. expose `afterStep(...)`
4. expose `shouldAbort(...)`
5. expose `makeStopReason(...)`

Local state should track at least:

1. `run_id`
2. `scope`
3. `task_anchor`
4. `step_count`
5. `same_tool_streak`
6. `duplicate_observation_streak`
7. `no_progress_streak`
8. `estimated_token_burn`
9. `last_selected_tool`
10. `last_observation_hash`
11. `forced_handoff_triggered`
12. `replay_dispatch_attempted`

### Component 2: Pre-Step Policy Gate

Before a tool step, call Aionis with:

1. `rules/evaluate`
2. `tools/select`

Inputs should include:

1. current intent
2. repo/workspace hints
3. candidate tools
4. current loop-control counters
5. whether the step is high-cost (`bash`, `pytest-all`, broad scan)

Outputs used by plugin:

1. selected tool
2. denied tools
3. explain string
4. shadow recommendation (optional diagnostics only)

### Component 3: Local Anti-Loop Thresholds

Do not wait for the model to realize it is stuck.

The adapter should apply hard local thresholds first.

Initial thresholds for phase 1:

1. `max_steps = 16`
2. `max_same_tool_streak = 4`
3. `max_duplicate_observation_streak = 3`
4. `max_no_progress_streak = 3`
5. `max_estimated_token_burn = configurable`
6. `max_broad_test_invocations = 1`

These should live in plugin config, not inlined constants.

### Component 4: No-Progress Detection

Use cheap heuristics in phase 1.

Progress should be considered absent when:

1. same tool repeats with materially identical input
2. tool output hashes match prior outputs repeatedly
3. no file-set delta is observed across steps
4. selected tool keeps being downgraded by policy but agent still retries equivalent work

This does not need semantic perfection in phase 1. It only needs to catch obvious spin.

### Component 5: Escape-Hatch Strategy

When thresholds trip, choose one controlled path instead of letting ReAct continue indefinitely.

Priority order:

1. if a replay candidate exists for the task shape, attempt `playbooks/dispatch`
2. else if current state is recoverable, `handoff/store`
3. else stop with explicit operator-facing reason

Forced stop reasons should be enumerated, for example:

1. `max_steps_exceeded`
2. `same_tool_streak_exceeded`
3. `duplicate_observation_exceeded`
4. `no_progress_exceeded`
5. `budget_exceeded`
6. `policy_denied_only_path`

---

## Config Design

### Task 1: Add loop-control config surface

**Files:**
- Modify: `/Users/lucio/Desktop/aionis-openclaw-plugin/src/index.ts`
- Test: `/Users/lucio/Desktop/aionis-openclaw-plugin/test/config-loop-control.test.ts`

**Step 1: Write the failing test**

Add tests that parse plugin config with a new `loopControl` block:

```ts
expect(config.loopControl.enabled).toBe(true)
expect(config.loopControl.maxSteps).toBe(16)
expect(config.loopControl.maxSameToolStreak).toBe(4)
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/lucio/Desktop/aionis-openclaw-plugin
npm test -- loop-control
```

Expected: config keys not recognized.

**Step 3: Write minimal implementation**

Add schema/config fields:

1. `enabled`
2. `maxSteps`
3. `maxSameToolStreak`
4. `maxDuplicateObservationStreak`
5. `maxNoProgressStreak`
6. `maxEstimatedTokenBurn`
7. `forceHandoffOnAbort`
8. `tryReplayDispatchOnAbort`

**Step 4: Run test to verify it passes**

Run the same test command.

**Step 5: Commit**

```bash
git add /Users/lucio/Desktop/aionis-openclaw-plugin/src/index.ts /Users/lucio/Desktop/aionis-openclaw-plugin/test/config-loop-control.test.ts
git commit -m "feat: add loop control config surface"
```

---

### Task 2: Implement loop-control state object

**Files:**
- Create: `/Users/lucio/Desktop/aionis-openclaw-plugin/src/loop-control.ts`
- Test: `/Users/lucio/Desktop/aionis-openclaw-plugin/test/loop-control.test.ts`

**Step 1: Write the failing test**

Add unit tests for:

1. step counter increments
2. same-tool streak increments and resets
3. duplicate observation streak increments on same hash
4. stop decision fires at configured threshold

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/lucio/Desktop/aionis-openclaw-plugin
npm test -- loop-control
```

Expected: module missing.

**Step 3: Write minimal implementation**

Implement a pure state machine with:

1. `createLoopControlState(config, seed)`
2. `beforeStep(state, candidateTools)`
3. `afterStep(state, result)`
4. `evaluateAbort(state)`
5. `summarizeLoopState(state)`

**Step 4: Run test to verify it passes**

Run the same test command.

**Step 5: Commit**

```bash
git add /Users/lucio/Desktop/aionis-openclaw-plugin/src/loop-control.ts /Users/lucio/Desktop/aionis-openclaw-plugin/test/loop-control.test.ts
git commit -m "feat: add loop control state machine"
```

---

### Task 3: Add Aionis pre-step policy gate

**Files:**
- Modify: `/Users/lucio/Desktop/aionis-openclaw-plugin/src/index.ts`
- Modify: `/Users/lucio/Desktop/aionis-openclaw-plugin/src/loop-control.ts`
- Test: `/Users/lucio/Desktop/aionis-openclaw-plugin/test/loop-control-policy.test.ts`

**Step 1: Write the failing test**

Mock Aionis client so that:

1. `tools/select` prefers `rg` over `grep`
2. denied tools are returned
3. plugin selects the policy-approved tool path

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/lucio/Desktop/aionis-openclaw-plugin
npm test -- loop-control-policy
```

Expected: no pre-step policy hook exists.

**Step 3: Write minimal implementation**

Before executing a tool step:

1. construct candidate tool list
2. call `client.toolsSelect(...)`
3. persist selected tool + explain in loop state
4. return selected tool to OpenClaw path

**Step 4: Run test to verify it passes**

Run the same command.

**Step 5: Commit**

```bash
git add /Users/lucio/Desktop/aionis-openclaw-plugin/src/index.ts /Users/lucio/Desktop/aionis-openclaw-plugin/src/loop-control.ts /Users/lucio/Desktop/aionis-openclaw-plugin/test/loop-control-policy.test.ts
git commit -m "feat: gate react tool steps with aionis policy"
```

---

### Task 4: Add post-step decision + feedback writeback

**Files:**
- Modify: `/Users/lucio/Desktop/aionis-openclaw-plugin/src/index.ts`
- Test: `/Users/lucio/Desktop/aionis-openclaw-plugin/test/loop-control-feedback.test.ts`

**Step 1: Write the failing test**

Add a test that verifies a completed step triggers:

1. decision readback or persistence record usage
2. `tools/feedback`
3. optional `memory/write` evidence record

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/lucio/Desktop/aionis-openclaw-plugin
npm test -- loop-control-feedback
```

Expected: no feedback writeback hook.

**Step 3: Write minimal implementation**

After each step:

1. compute outcome (`positive`, `negative`, `neutral`)
2. call `tools/feedback`
3. write step evidence via `memory/write`
4. update loop-control counters from the result

**Step 4: Run test to verify it passes**

Run the same test command.

**Step 5: Commit**

```bash
git add /Users/lucio/Desktop/aionis-openclaw-plugin/src/index.ts /Users/lucio/Desktop/aionis-openclaw-plugin/test/loop-control-feedback.test.ts
git commit -m "feat: persist loop feedback and step evidence"
```

---

### Task 5: Implement abort and escape-hatch policy

**Files:**
- Modify: `/Users/lucio/Desktop/aionis-openclaw-plugin/src/index.ts`
- Modify: `/Users/lucio/Desktop/aionis-openclaw-plugin/src/loop-control.ts`
- Test: `/Users/lucio/Desktop/aionis-openclaw-plugin/test/loop-control-abort.test.ts`

**Step 1: Write the failing test**

Cover three cases:

1. threshold exceeded -> hard stop
2. threshold exceeded + replay candidate -> dispatch attempted
3. threshold exceeded + no replay candidate -> handoff stored

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/lucio/Desktop/aionis-openclaw-plugin
npm test -- loop-control-abort
```

Expected: no abort orchestration exists.

**Step 3: Write minimal implementation**

Implement:

1. `evaluateAbort(state)` before next step
2. if `tryReplayDispatchOnAbort`, call `replayPlaybookCandidate` then `replayPlaybookDispatch`
3. if not dispatched and `forceHandoffOnAbort`, call `handoffStore`
4. return structured stop reason to caller

**Step 4: Run test to verify it passes**

Run the same command.

**Step 5: Commit**

```bash
git add /Users/lucio/Desktop/aionis-openclaw-plugin/src/index.ts /Users/lucio/Desktop/aionis-openclaw-plugin/src/loop-control.ts /Users/lucio/Desktop/aionis-openclaw-plugin/test/loop-control-abort.test.ts
git commit -m "feat: add loop abort replay and handoff escape hatches"
```

---

### Task 6: Add CLI diagnostics and selfcheck for loop control

**Files:**
- Modify: `/Users/lucio/Desktop/aionis-openclaw-plugin/src/index.ts`
- Modify: `/Users/lucio/Desktop/aionis-openclaw-plugin/README.md`
- Test: `/Users/lucio/Desktop/aionis-openclaw-plugin/test/loop-control-selfcheck.test.ts`

**Step 1: Write the failing test**

Add CLI coverage for:

1. `openclaw aionis-memory selfcheck --loop-control`
2. structured report includes thresholds, policy call, feedback call, and replay/handoff fallback readiness

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/lucio/Desktop/aionis-openclaw-plugin
npm test -- loop-control-selfcheck
```

Expected: CLI flag missing.

**Step 3: Write minimal implementation**

Add a selfcheck mode that:

1. initializes loop-control state
2. exercises `tools/select`
3. simulates duplicate/no-progress streaks
4. confirms abort path chooses replay/handoff correctly

**Step 4: Run test to verify it passes**

Run the same command.

**Step 5: Commit**

```bash
git add /Users/lucio/Desktop/aionis-openclaw-plugin/src/index.ts /Users/lucio/Desktop/aionis-openclaw-plugin/README.md /Users/lucio/Desktop/aionis-openclaw-plugin/test/loop-control-selfcheck.test.ts
git commit -m "feat: add loop control selfcheck and docs"
```

---

## Testing Matrix

### Unit tests

1. config parsing
2. state transitions
3. duplicate detection
4. abort reason selection
5. replay-dispatch path selection
6. handoff fallback path selection

### Integration tests

1. policy select changes tool choice for a high-cost step
2. repeated equivalent failures trigger abort
3. replay candidate exists -> dispatch path called
4. replay candidate absent -> handoff path called
5. loop-control selfcheck returns green on mocked Aionis

### Benchmarks

Add one new benchmark family after implementation:

1. baseline OpenClaw ReAct loop
2. OpenClaw + Aionis memory only
3. OpenClaw + Aionis memory + loop control

Metrics:

1. success rate
2. total tokens
3. repeated-step count
4. tool-switch count
5. stop reason distribution
6. forced-handoff rate
7. replay-dispatch hit rate

---

## Defaults for Phase 1

Recommended initial defaults:

1. `enabled = true`
2. `maxSteps = 16`
3. `maxSameToolStreak = 4`
4. `maxDuplicateObservationStreak = 3`
5. `maxNoProgressStreak = 3`
6. `forceHandoffOnAbort = true`
7. `tryReplayDispatchOnAbort = true`
8. `strictTools = true` for known broad-tool tasks

Keep all of these overridable in config.

---

## Acceptance Criteria

The integration is successful when all of the following are true:

1. OpenClaw no longer continues indefinitely past configured step/no-progress thresholds.
2. High-cost tool drift is reduced by Aionis `tools/select`.
3. Each loop stop includes a structured reason code.
4. Repeated complex tasks can transition into replay-dispatch or explicit handoff rather than silent spin.
5. There is a benchmark that demonstrates lower repeated-step count and lower cost under complex tasks.

---

## Recommendation

Implement this in the plugin first.

Do **not** patch OpenClaw core until the plugin proves the thresholds and hooks are correct.
That keeps the experiment reversible and lets Aionis demonstrate value through SDK integration rather than framework fork maintenance.

