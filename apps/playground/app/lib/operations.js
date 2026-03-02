export const OPERATION_LIST = [
  {
    key: "write",
    label: "write",
    method: "POST",
    path: "/v1/memory/write",
    description: "Create or upsert memory nodes and edges.",
    template: {
      tenant_id: "default",
      scope: "default",
      input_text: "User likes black coffee.",
      auto_embed: true,
      nodes: [
        {
          client_id: "fact_user_coffee",
          type: "fact",
          text_summary: "User likes black coffee."
        }
      ],
      edges: []
    }
  },
  {
    key: "recall",
    label: "recall",
    method: "POST",
    path: "/v1/memory/recall",
    description: "Retrieve structured memory graph context.",
    template: {
      tenant_id: "default",
      scope: "default",
      query: {
        keywords: ["coffee"],
        entity_types: ["fact"]
      },
      limit: 8
    }
  },
  {
    key: "recall_text",
    label: "recall_text",
    method: "POST",
    path: "/v1/memory/recall_text",
    description: "Retrieve textual context for an LLM prompt.",
    template: {
      tenant_id: "default",
      scope: "default",
      query_text: "What coffee does the user prefer?",
      limit: 6
    }
  },
  {
    key: "rules_evaluate",
    label: "rules/evaluate",
    method: "POST",
    path: "/v1/memory/rules/evaluate",
    description: "Run active rules against current execution input.",
    template: {
      tenant_id: "default",
      scope: "default",
      input: {
        task: "draft_reply",
        channel: "chat",
        user_intent: "recommend_coffee"
      }
    }
  },
  {
    key: "tools_select",
    label: "tools/select",
    method: "POST",
    path: "/v1/memory/tools/select",
    description: "Select tool under policy-aware memory context.",
    template: {
      tenant_id: "default",
      scope: "default",
      run_id: "run_playground_001",
      goal: "Answer user preference question",
      candidate_tools: ["search_profile", "draft_answer"],
      context: {
        query: "What coffee does the user prefer?"
      }
    }
  },
  {
    key: "tools_feedback",
    label: "tools/feedback",
    method: "POST",
    path: "/v1/memory/tools/feedback",
    description: "Write execution outcome feedback for policy adaptation.",
    template: {
      tenant_id: "default",
      scope: "default",
      run_id: "run_playground_001",
      decision_id: "decision_replace_me",
      selected_tool: "search_profile",
      outcome: "success",
      score: 1,
      feedback_text: "Result was grounded and aligned with user preference."
    }
  },
  {
    key: "tools_decision",
    label: "tools/decision",
    method: "POST",
    path: "/v1/memory/tools/decision",
    description: "Replay or inspect persisted decision provenance.",
    template: {
      tenant_id: "default",
      scope: "default",
      decision_id: "decision_replace_me"
    }
  }
];

export const OPERATION_MAP = Object.fromEntries(OPERATION_LIST.map((item) => [item.key, item]));

export function defaultPayloadFor(key) {
  const op = OPERATION_MAP[key];
  if (!op) return {};
  return JSON.parse(JSON.stringify(op.template));
}
