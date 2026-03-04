---
title: "OpenClaw Integration"
---

# OpenClaw Integration

Aionis can serve as the memory and policy layer for OpenClaw/Clawbot-style tool agents.

## Integration Shape

Use four actions in your skill runtime:

1. `memory.write`
2. `memory.context`
3. `memory.policy`
4. `memory.feedback` (recommended for closed-loop adaptation)

A reference implementation is included at:

1. `src/integrations/openclaw-skill.ts`

## Action Contract

1. `memory.write`
   Write user intent, tool results, and key decisions into project-scoped memory.
2. `memory.context`
   Assemble layered context (`facts/episodes/rules/decisions/tools/citations`) with budget presets.
3. `memory.policy`
   Apply `tools/select` (or `rules/evaluate`) before routing tool execution.
4. `memory.feedback`
   Write execution outcome back to policy loop (`run_id`, `decision_id`) for governed adaptation.

## Scope and Isolation Recommendation

1. Use fixed tenant for single-user setups (`tenant_id=default`).
2. Use one scope per project: `scope=clawbot:<project>`.
3. Persist `run_id` and returned `decision_id` between select and feedback.

## Smoke Test

```bash
set -a; source .env; set +a
bash examples/openclaw_skill_smoke.sh
```

This smoke runs: write -> context -> policy -> feedback.
If your target server does not expose `context/assemble` yet, the smoke marks context as `context_assemble_unavailable` and continues with policy + feedback checks.

## Minimal Runtime Example

```ts
import { createOpenClawSkillFromEnv } from "../src/integrations/openclaw-skill.js";

const skill = createOpenClawSkillFromEnv(process.env);

await skill.invoke("memory.write", {
  project: "sales-assistant",
  run_id: "run_20260304_001",
  kind: "event",
  text: "Customer prefers email follow-up",
});

const ctx = await skill.invoke("memory.context", {
  project: "sales-assistant",
  run_id: "run_20260304_001",
  query_text: "How should I follow up?",
  budget: "normal",
  context: { intent: "follow_up" },
});

const policy = await skill.invoke("memory.policy", {
  project: "sales-assistant",
  run_id: "run_20260304_001",
  mode: "tools_select",
  context: { intent: "follow_up" },
  candidate_tools: ["send_email", "call_crm", "search_docs"],
  strict: false,
});

await skill.invoke("memory.feedback", {
  project: "sales-assistant",
  run_id: "run_20260304_001",
  decision_id: policy.decision_id ?? undefined,
  outcome: "positive",
  context: { intent: "follow_up" },
  candidate_tools: ["send_email", "call_crm", "search_docs"],
  selected_tool: policy.selected_tool ?? "send_email",
});
```

## Related

1. [Integrations Overview](/public/en/integrations/00-overview)
2. [API Contract](/public/en/api/01-api-contract)
3. [Policy and Execution Loop](/public/en/policy-execution/00-policy-execution-loop)
