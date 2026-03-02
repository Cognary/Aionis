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
      run_id: "{{last.run_id}}",
      decision_id: "{{last.decision_id}}",
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
      decision_id: "{{last.decision_id}}"
    }
  }
];

export const FLOW_PRESETS = [
  {
    key: "quick_default",
    label: "Quick Default",
    description: "write -> recall_text -> rules -> tools_select",
    steps: [
      { operation: "write" },
      { operation: "recall_text" },
      { operation: "rules_evaluate" },
      { operation: "tools_select" }
    ]
  },
  {
    key: "policy_closed_loop",
    label: "Policy Closed Loop",
    description: "Add feedback and decision replay after selection",
    steps: [
      { operation: "write" },
      { operation: "recall_text" },
      { operation: "rules_evaluate" },
      { operation: "tools_select" },
      { operation: "tools_feedback" },
      { operation: "tools_decision" }
    ]
  }
];

export const SCENARIO_PRESETS = [
  {
    key: "support_triage",
    label: "Support Triage",
    description: "Customer support memory + policy flow",
    connection: {
      tenant_id: "support",
      scope: "ticketing"
    },
    default_operation: "write",
    flow_key: "policy_closed_loop",
    payload_by_operation: {
      write: {
        input_text: "Customer reports recurring password reset failures on mobile app.",
        nodes: [
          {
            client_id: "ticket_4821",
            type: "event",
            text_summary: "Password reset fails on mobile app for customer c_4821"
          }
        ]
      },
      recall_text: {
        query_text: "What issue did this customer report and what should support do first?"
      },
      rules_evaluate: {
        input: {
          task: "support_triage",
          priority: "high",
          channel: "support_chat"
        }
      },
      tools_select: {
        run_id: "run_support_triage_001",
        goal: "Recommend first support action for password reset issue",
        candidate_tools: ["kb_search", "account_lookup", "draft_reply"]
      },
      tools_feedback: {
        run_id: "{{last.run_id}}",
        selected_tool: "kb_search",
        feedback_text: "Suggested remediation steps matched known password reset playbook."
      }
    }
  },
  {
    key: "sales_followup",
    label: "Sales Follow-up",
    description: "Lead memory + next-action decision",
    connection: {
      tenant_id: "sales",
      scope: "pipeline"
    },
    default_operation: "write",
    flow_key: "quick_default",
    payload_by_operation: {
      write: {
        input_text: "Lead from FinBank asked for SOC2 details and pricing next week.",
        nodes: [
          {
            client_id: "lead_finbank_soc2",
            type: "fact",
            text_summary: "FinBank lead asked for SOC2 package and pricing follow-up next week"
          }
        ]
      },
      recall_text: {
        query_text: "Summarize lead needs and next follow-up action."
      },
      tools_select: {
        run_id: "run_sales_followup_001",
        goal: "Pick best next action for enterprise lead",
        candidate_tools: ["crm_lookup", "compose_followup", "pricing_packet"]
      }
    }
  },
  {
    key: "personal_assistant",
    label: "Personal Assistant",
    description: "Personal memory retrieval + helper tool decision",
    connection: {
      tenant_id: "personal",
      scope: "assistant"
    },
    default_operation: "write",
    flow_key: "quick_default",
    payload_by_operation: {
      write: {
        input_text: "User prefers meetings after 2pm and avoids Monday mornings.",
        nodes: [
          {
            client_id: "pref_meeting_time",
            type: "fact",
            text_summary: "Meetings after 2pm preferred; avoid Monday mornings"
          }
        ]
      },
      recall_text: {
        query_text: "What meeting windows should the assistant suggest?"
      },
      tools_select: {
        run_id: "run_personal_assistant_001",
        goal: "Choose action for scheduling request",
        candidate_tools: ["calendar_lookup", "schedule_draft"]
      }
    }
  }
];

export const OPERATION_MAP = Object.fromEntries(OPERATION_LIST.map((item) => [item.key, item]));
export const FLOW_PRESET_MAP = Object.fromEntries(FLOW_PRESETS.map((item) => [item.key, item]));
export const SCENARIO_PRESET_MAP = Object.fromEntries(SCENARIO_PRESETS.map((item) => [item.key, item]));

export function defaultPayloadFor(key) {
  const op = OPERATION_MAP[key];
  if (!op) return {};
  return JSON.parse(JSON.stringify(op.template));
}
