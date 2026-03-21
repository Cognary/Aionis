import type { AionisMcpEnv } from "../mcp/client.js";

export type HostExecutionContext = {
  host_name: string;
  host_version: string | null;
  session_id: string;
  task_id: string | null;
  turn_id: string | null;
  cwd: string;
  scope: string;
  prompt: string | null;
  task_kind?: string | null;
  goal?: string | null;
  tool_candidates?: string[];
  selected_tool?: string | null;
  host_metadata: Record<string, unknown>;
};

export type HostSessionStartedEvent = {
  event_type: "session_started";
  context: HostExecutionContext;
  source: "startup" | "resume";
};

export type HostPromptSubmittedEvent = {
  event_type: "prompt_submitted";
  context: HostExecutionContext;
  prompt: string;
};

export type HostToolSelectionRequestedEvent = {
  event_type: "tool_selection_requested";
  context: HostExecutionContext;
  candidates: string[];
  selection_context: unknown;
  strict?: boolean;
  reorder_candidates?: boolean;
  include_shadow?: boolean;
  rules_limit?: number;
};

export type HostToolExecutedEvent = {
  event_type: "tool_executed";
  context: HostExecutionContext;
  selected_tool: string;
  candidates: string[];
  execution_context: unknown;
  command_exit_code?: number;
  validated?: boolean;
  reverted?: boolean;
  note?: string;
};

export type HostTaskTerminalEvent = {
  event_type: "task_terminal";
  context: HostExecutionContext;
  outcome: "completed" | "blocked" | "failed" | "abandoned" | "stopped";
  last_assistant_message: string | null;
  selected_tool?: string | null;
  candidates?: string[];
  terminal_context?: unknown;
  note?: string;
};

export type HostIntegrationEvent =
  | HostSessionStartedEvent
  | HostPromptSubmittedEvent
  | HostToolSelectionRequestedEvent
  | HostToolExecutedEvent
  | HostTaskTerminalEvent;

export type HostCapabilityOutput =
  | {
      channel: "context_injection";
      text: string;
    }
  | {
      channel: "tool_ordering";
      selected_tool: string | null;
      ordered: string[];
      preferred: string[];
      provenance_explanation: string | null;
      used_trusted_pattern_tools: string[];
      used_trusted_pattern_affinity_levels: string[];
    }
  | {
      channel: "warning";
      text: string;
    }
  | {
      channel: "task_feedback_recorded";
      classification: "positive" | "negative" | "abstain";
      recorded: boolean;
      reason: string;
    }
  | {
      channel: "task_finalized";
      classification: "positive" | "negative" | "abstain";
      recorded: boolean;
      reason: string;
    };

export type HostCapabilityRuntime = {
  env: AionisMcpEnv;
  postJson: <TResponse = unknown>(env: AionisMcpEnv, path: string, body: unknown) => Promise<TResponse>;
};

export type HostCapabilityHandler = {
  id: string;
  subscribed_events: HostIntegrationEvent["event_type"][];
  handle(event: HostIntegrationEvent, runtime: HostCapabilityRuntime): Promise<HostCapabilityOutput[]>;
};
