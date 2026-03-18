# Tutorial: Aionis Doc + Runtime Resume

Take a recovered Aionis Doc handoff and push it back into the live runtime path through `context/assemble` and `tools/select`.

## Before you start

1. You already completed [Tutorial: Aionis Doc Quickstart](aionis-doc-quickstart), or you already have a saved `recover-result.json`.
2. You have a running Aionis endpoint in `BASE_URL`.
3. You know your `scope`, and if auth is enabled you have `AIONIS_API_KEY` or bearer auth ready.

## What this tutorial is for

This tutorial explains the current public resume boundary for Aionis Doc.

Today, the runtime path is:

1. recover native continuity from `aionis doc recover`
2. feed `execution_state_v1` and `execution_packet_v1` into `context/assemble`
3. feed recovered continuity into `tools/select`
4. let your runtime execute the selected action using the assembled context and recovered next action

This is not yet a one-command direct execution path from the document itself. It is the supported bridge into runtime execution.

## What you will finish with

One recovered Aionis Doc handoff that becomes:

1. runtime context input
2. policy-governed tool selection input
3. a real execution attempt with a stable `run_id`

## Input

### Environment contract

Use these values across all steps:

1. `BASE_URL = http://127.0.0.1:3001`
2. `SCOPE = default`
3. `DOC_DIR = .aionis-doc-quickstart`
4. `RUN_ID = run_doc_resume_001`

### Files expected from the prior quickstart

1. `$DOC_DIR/workflow.aionis.md`
2. `$DOC_DIR/recover-result.json`

If `recover-result.json` does not exist yet, create it first:

```bash
npx @aionis/sdk@0.2.20 doc recover "$DOC_DIR/workflow.aionis.md" \
  --base-url "$BASE_URL" \
  --scope "$SCOPE" \
  --api-key "$AIONIS_API_KEY" \
  --compact > "$DOC_DIR/recover-result.json"
```

If your environment does not use API auth, omit `--api-key`.

## Step 1: Inspect the recovered continuity payload

```bash
jq '{
  recover_result_version: .recover_result_version,
  anchor: .recover_response.data.anchor,
  handoff_kind: .recover_response.data.handoff_kind,
  current_stage: .recover_response.data.execution_state_v1.current_stage,
  active_role: .recover_response.data.execution_state_v1.active_role,
  next_action: .recover_response.data.execution_ready_handoff.next_action
}' "$DOC_DIR/recover-result.json"
```

What to confirm:

1. `recover_result_version` is `aionis_doc_recover_result_v1`
2. `execution_state_v1` exists
3. `execution_packet_v1` exists
4. `control_profile_v1` exists
5. `execution_ready_handoff.next_action` exists or `handoff.next_action` exists

## Step 2: Build a runtime resume request for `context/assemble`

Create a request that carries the recovered continuity into planner/runtime assembly:

```bash
jq '{
  tenant_id: "default",
  scope: "'"$SCOPE"'",
  query_text: "resume quickstart workflow",
  context: {
    intent: "doc_resume",
    workflow_kind: "aionis_doc",
    control_profile_v1: .recover_response.data.control_profile_v1
  },
  execution_state_v1: .recover_response.data.execution_state_v1,
  execution_packet_v1: .recover_response.data.execution_packet_v1,
  include_rules: false,
  return_layered_context: true
}' "$DOC_DIR/recover-result.json" > "$DOC_DIR/context-assemble-request.json"
```

Why both fields matter:

1. `execution_state_v1` carries the persisted continuity state
2. `execution_packet_v1` carries the exact runtime packet, including `next_action`
3. `context.control_profile_v1` carries the recovered control posture into downstream policy surfaces

## Step 3: Assemble resume-ready context

### With API key auth

```bash
curl -sS "$BASE_URL/v1/memory/context/assemble" \
  -H "X-Api-Key: $AIONIS_API_KEY" \
  -H 'content-type: application/json' \
  -d @"$DOC_DIR/context-assemble-request.json" > "$DOC_DIR/context-assemble-response.json"
```

### Without API auth

```bash
curl -sS "$BASE_URL/v1/memory/context/assemble" \
  -H 'content-type: application/json' \
  -d @"$DOC_DIR/context-assemble-request.json" > "$DOC_DIR/context-assemble-response.json"
```

Inspect the runtime assembly result:

```bash
jq '{
  packet_source_mode: .execution_kernel.packet_source_mode,
  execution_state_v1_present: .execution_kernel.execution_state_v1_present,
  execution_packet_v1_present: .execution_kernel.execution_packet_v1_present,
  selected_tool: .assembly_summary.selected_tool,
  context_est_tokens: .assembly_summary.context_est_tokens
}' "$DOC_DIR/context-assemble-response.json"
```

What to confirm:

1. `execution_kernel.packet_source_mode` is `packet_input`
2. `execution_state_v1_present` is `true`
3. `execution_packet_v1_present` is `true`
4. `layered_context` exists if you requested it

What this means:

1. the runtime accepted recovered continuity as execution kernel input
2. the server did not have to rebuild the packet from state only
3. the assembled context is now resume-aware

## Step 4: Build a governed resume request for `tools/select`

Now push the same recovered continuity into the policy-governed selection surface:

```bash
jq '{
  tenant_id: "default",
  scope: "'"$SCOPE"'",
  run_id: "'"$RUN_ID"'",
  context: {
    intent: "doc_resume",
    workflow_kind: "aionis_doc",
    control_profile_v1: .recover_response.data.control_profile_v1
  },
  execution_state_v1: .recover_response.data.execution_state_v1,
  candidates: [
    "resume_patch",
    "run_focused_smoke",
    "request_review"
  ],
  strict: true
}' "$DOC_DIR/recover-result.json" > "$DOC_DIR/tools-select-request.json"
```

## Step 5: Select the next action under recovered control state

### With API key auth

```bash
curl -sS "$BASE_URL/v1/memory/tools/select" \
  -H "X-Api-Key: $AIONIS_API_KEY" \
  -H 'content-type: application/json' \
  -d @"$DOC_DIR/tools-select-request.json" > "$DOC_DIR/tools-select-response.json"
```

### Without API auth

```bash
curl -sS "$BASE_URL/v1/memory/tools/select" \
  -H 'content-type: application/json' \
  -d @"$DOC_DIR/tools-select-request.json" > "$DOC_DIR/tools-select-response.json"
```

Inspect the selection result:

```bash
jq '{
  selected_tool: .selection.selected,
  decision_id: .decision.decision_id,
  run_id: .decision.run_id,
  control_profile_origin: .execution_kernel.control_profile_origin,
  execution_state_v1_present: .execution_kernel.execution_state_v1_present,
  current_stage: .execution_kernel.current_stage,
  active_role: .execution_kernel.active_role
}' "$DOC_DIR/tools-select-response.json"
```

What to confirm:

1. `decision.run_id` matches `RUN_ID`
2. `decision.decision_id` exists
3. `execution_kernel.execution_state_v1_present` is `true`
4. `execution_kernel.control_profile_origin` is `continuity_delivered` when `control_profile_v1` is passed in `context`

## Step 6: What actually resumes after selection

At this point, your runtime has everything needed to continue the execution attempt:

1. `layered_context` from `context/assemble`
2. `execution_packet_v1.next_action` from the recovered continuity
3. `selection.selected` from `tools/select`
4. `decision.decision_id` and `run_id` for replay continuity

The practical execution loop is:

1. read `execution_packet_v1.next_action`
2. run the selected tool or module in your runtime
3. keep `run_id` stable
4. persist the rest of the lifecycle through `tools/decision`, `tools/run`, and `tools/feedback` if your integration uses the full policy loop

## What success looks like

1. recover returns continuity payloads
2. `context/assemble` reports `packet_input` execution-kernel mode
3. `tools/select` returns a real `decision_id` under the recovered execution state
4. your runtime can now continue work without reconstructing the task from scratch

## Common failure and fix

Failure:

```text
execution_state_v1 validation failed
```

Fix:

1. confirm you are passing the recovered `execution_state_v1` object unchanged
2. if you manually edited saved JSON, regenerate it from `aionis doc recover`
3. prefer passing both `execution_state_v1` and `execution_packet_v1` to preserve exact continuity

## Read next

1. [Tutorial: Aionis Doc Quickstart](aionis-doc-quickstart)
2. [Tutorial: Integrate One Agent End-to-End](agent-integration)
3. [API: POST /v1/memory/context/assemble](/api/endpoints/context-assemble)
4. [API: POST /v1/memory/tools/select](/api/endpoints/tools-select)
