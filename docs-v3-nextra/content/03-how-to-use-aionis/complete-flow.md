---
title: "Complete Flow"
description: "Follow one realistic Aionis loop from write to planning, decision, and feedback using current repository surfaces."
---

# Complete Flow

This page is the shortest realistic Aionis loop for a developer who wants more than a health check.

This page does not try to hit every endpoint. It proves one connected continuity loop:

Work enters Aionis once, then stays inspectable and reusable across the next planning and execution step.

## What This Flow Covers

This example uses real surfaces that exist in the current repository:

1. `memory/write`
2. `planning/context`
3. `tools/select`
4. `tools/decision`
5. `tools/feedback`

That gives you one complete loop:

1. write execution facts
2. assemble planner-facing context
3. persist a governed tool decision
4. inspect that decision by `decision_id`
5. record outcome feedback for later adaptation

## Why This Is The Right First Real Example

This flow is better than a toy demo because it proves four things at once:

1. Aionis stores runtime facts instead of losing them between calls
2. Aionis can return compact planner-facing summaries such as `planning_summary`
3. tool selection produces a persisted `decision_id` and `decision_uri`
4. the next review step can inspect or score the exact decision that was made

## TypeScript SDK Example

Use the TypeScript SDK for the main loop here. In the current repository, these calls are covered in `@aionis/sdk`.

```ts
import { AionisClient } from "@aionis/sdk";

const client = new AionisClient({
  base_url: "http://localhost:3001",
});

const scope = "docs_v2_verified";
const tenant_id = "default";
const run_id = "docs_v2_complete_flow_001";

async function main() {
  await client.write({
    tenant_id,
    scope,
    input_text: "Customer asked for a safe rollout plan and wants email follow-up.",
    memory_lane: "shared",
    nodes: [
      {
        type: "event",
        memory_lane: "shared",
        text_summary: "Customer asked for a safe rollout plan and wants email follow-up.",
      },
    ],
  });

  const planning = await client.planningContext({
    tenant_id,
    scope,
    query_text: "How should the next agent continue this rollout task?",
    context: {
      task: {
        id: "rollout_task_001",
        goal: "continue a safe rollout plan",
      },
      run: {
        id: run_id,
      },
      operator: {
        mode: "reviewed_execution",
      },
    },
    tool_candidates: ["bash", "curl", "psql"],
    tool_strict: true,
    include_shadow: false,
    rules_limit: 50,
    return_layered_context: true,
    context_optimization_profile: "balanced",
  });

  console.log(planning.data.planning_summary);

  const selected = await client.toolsSelect({
    tenant_id,
    scope,
    run_id,
    context: {
      task: {
        id: "rollout_task_001",
        goal: "continue a safe rollout plan",
      },
      run: {
        id: run_id,
      },
      operator: {
        mode: "reviewed_execution",
      },
    },
    candidates: ["bash", "curl", "psql"],
    include_shadow: false,
    rules_limit: 50,
    strict: true,
  });

  console.log(selected.data.selection_summary);

  const decision_id = selected.data.decision.decision_id;
  const selected_tool = selected.data.selection.selected;

  if (!selected_tool) {
    throw new Error("Aionis did not select a tool for this context.");
  }

  const decision = await client.toolsDecision({
    tenant_id,
    scope,
    decision_id,
  });

  console.log(decision.data.lifecycle_summary);

  const feedback = await client.toolsFeedback({
    tenant_id,
    scope,
    run_id,
    decision_id,
    context: {
      task: {
        id: "rollout_task_001",
      },
      run: {
        id: run_id,
      },
    },
    candidates: ["bash", "curl", "psql"],
    selected_tool,
    outcome: "positive",
    target: "tool",
    include_shadow: false,
    rules_limit: 50,
    input_text: "Operator confirmed the selected tool was appropriate for this rollout step.",
  });

  console.log(feedback.data.updated_rules, feedback.data.rule_node_ids, feedback.data.note);
}

main().catch(console.error);
```

## What To Look For In The Response

You do not need to read every raw field on the first pass.

Focus on these compact surfaces:

1. `planning.data.planning_summary.selected_tool`
2. `planning.data.planning_summary.decision_id`
3. `selected.data.selection_summary.selected_tool`
4. `selected.data.decision.decision_uri`
5. `decision.data.lifecycle_summary`
6. `feedback.data.updated_rules` and `feedback.data.note`

Those are the shortest path to understanding whether Aionis is carrying execution state forward.

## HTTP Version For The Same Flow

If you are not using the SDK yet, the same loop works over HTTP.

### 1. Write execution facts

```bash
curl -sS http://localhost:3001/v1/memory/write \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"default",
    "scope":"docs_v2_verified",
    "input_text":"Customer asked for a safe rollout plan and wants email follow-up.",
    "memory_lane":"shared",
    "nodes":[
      {
        "type":"event",
        "memory_lane":"shared",
        "text_summary":"Customer asked for a safe rollout plan and wants email follow-up."
      }
    ]
  }' | jq '{scope,tenant_id,commit_id,commit_uri,nodes}'
```

### 2. Build planner-facing context

```bash
curl -sS http://localhost:3001/v1/memory/planning/context \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"default",
    "scope":"docs_v2_verified",
    "query_text":"How should the next agent continue this rollout task?",
    "context":{
      "version":1,
      "run":{"id":"docs_v2_complete_flow_001"},
      "intent":"rollout_followup",
      "agent":{"id":"docs_v2_agent","team_id":"docs_v2_team"},
      "tool":{"name":"bash"},
      "request":{"endpoint":"/docs-v2/complete-flow","method":"POST"}
    },
    "tool_candidates":["bash","curl","psql"],
    "tool_strict":true,
    "include_shadow":false,
    "rules_limit":50,
    "return_layered_context":true,
    "context_optimization_profile":"balanced"
  }' | jq '{planning_summary}'
```

### 3. Persist a tool decision

```bash
curl -sS http://localhost:3001/v1/memory/tools/select \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"default",
    "scope":"docs_v2_verified",
    "run_id":"docs_v2_complete_flow_001",
    "context":{
      "version":1,
      "run":{"id":"docs_v2_complete_flow_001"},
      "intent":"rollout_followup",
      "agent":{"id":"docs_v2_agent","team_id":"docs_v2_team"},
      "tool":{"name":"bash"},
      "request":{"endpoint":"/docs-v2/complete-flow","method":"POST"}
    },
    "candidates":["bash","curl","psql"],
    "include_shadow":false,
    "rules_limit":50,
    "strict":true
  }' | tee /tmp/aionis-tools-select.json | jq '{selection_summary,decision}'
```

### 4. Inspect the exact persisted decision

```bash
DECISION_ID="$(jq -r '.decision.decision_id' /tmp/aionis-tools-select.json)"
SELECTED_TOOL="$(jq -r '.selection.selected' /tmp/aionis-tools-select.json)"

curl -sS http://localhost:3001/v1/memory/tools/decision \
  -H 'content-type: application/json' \
  -d "{
    \"tenant_id\":\"default\",
    \"scope\":\"docs_v2_verified\",
    \"decision_id\":\"${DECISION_ID}\"
  }" | jq '{lookup_mode,lifecycle_summary,decision}'
```

### 5. Record feedback against that decision

```bash
curl -sS http://localhost:3001/v1/memory/tools/feedback \
  -H 'content-type: application/json' \
  -d "{
    \"tenant_id\":\"default\",
    \"scope\":\"docs_v2_verified\",
    \"run_id\":\"docs_v2_complete_flow_001\",
    \"decision_id\":\"${DECISION_ID}\",
    \"context\":{
      \"version\":1,
      \"run\":{\"id\":\"docs_v2_complete_flow_001\"},
      \"intent\":\"rollout_followup\",
      \"agent\":{\"id\":\"docs_v2_agent\",\"team_id\":\"docs_v2_team\"},
      \"tool\":{\"name\":\"bash\"},
      \"request\":{\"endpoint\":\"/docs-v2/complete-flow\",\"method\":\"POST\"}
    },
    \"candidates\":[\"bash\",\"curl\",\"psql\"],
    \"selected_tool\":\"${SELECTED_TOOL}\",
    \"outcome\":\"positive\",
    \"target\":\"tool\",
    \"include_shadow\":false,
    \"rules_limit\":50,
    \"input_text\":\"Operator confirmed the selected tool was appropriate for this rollout step.\"
  }" | jq '{updated_rules,rule_node_ids,commit_uri,note}'
```

If no rule sources were involved in the selection, this call may legitimately return:

1. `updated_rules = 0`
2. `rule_node_ids = []`
3. a note such as `no matching rule sources for attribution`

## What This Proves

At the end of this flow, you have more than a successful API call.

You have:

1. a persisted execution fact
2. a planner-facing compact summary
3. a persisted decision record with `decision_id`
4. an inspectable lifecycle view for that decision
5. an explicit feedback record about whether rule attribution happened or not

That is the real external value of Aionis: the work survives the step where most agent systems lose it.

## What To Add Next

Once this loop works, the next useful additions are:

1. add `handoff/store` and `handoff/recover` when work moves between agents or sessions
2. add `context/assemble` when you want bounded execution context rather than planner context
3. add replay playbooks when a successful path should become reusable execution

## Code Grounding

This page is intentionally tied to current implementation surfaces:

1. request contracts in `src/memory/schemas.ts`
2. planner and assembly summaries in `src/app/planning-summary.ts`
3. decision persistence in `src/memory/tools-select.ts`
4. lifecycle lookup in `src/memory/tools-decision.ts`
5. feedback linkage in `src/memory/tools-feedback.ts`
