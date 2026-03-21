export type AdapterPlanningSnapshot = {
  tenant_id: string | null;
  scope: string | null;
  recommended_workflow_count: number;
  candidate_workflow_count: number;
  trusted_pattern_count: number;
  contested_pattern_count: number;
  planner_explanation: string | null;
  workflow_signals: unknown[];
  pattern_signals: unknown[];
  execution_kernel: Record<string, unknown>;
};

export type AdapterSelectionSnapshot = {
  tenant_id: string | null;
  scope: string | null;
  selected_tool: string | null;
  ordered: string[];
  preferred: string[];
  decision_id: string | null;
  decision_uri: string | null;
  run_id: string | null;
  provenance_explanation: string | null;
  used_trusted_pattern_tools: string[];
  used_trusted_pattern_affinity_levels: string[];
};

export type AdapterTaskSession = {
  task_id: string;
  tenant_id: string | null;
  scope: string | null;
  query_text: string;
  context: unknown;
  tool_candidates: string[];
  planning: AdapterPlanningSnapshot | null;
  last_selection: AdapterSelectionSnapshot | null;
  recent_outcomes: Array<{
    step_id: string;
    selected_tool: string;
    classification: "positive" | "negative" | "abstain";
    recorded: boolean;
  }>;
  terminal_event_type: string | null;
};

export class AionisAdapterSessionState {
  private readonly tasks = new Map<string, AdapterTaskSession>();

  upsertTask(session: AdapterTaskSession): void {
    this.tasks.set(session.task_id, session);
  }

  getTask(taskId: string): AdapterTaskSession | null {
    return this.tasks.get(taskId) ?? null;
  }

  setPlanning(taskId: string, planning: AdapterPlanningSnapshot): AdapterTaskSession | null {
    const current = this.getTask(taskId);
    if (!current) return null;
    const next = { ...current, planning };
    this.tasks.set(taskId, next);
    return next;
  }

  setLastSelection(taskId: string, lastSelection: AdapterSelectionSnapshot): AdapterTaskSession | null {
    const current = this.getTask(taskId);
    if (!current) return null;
    const next = { ...current, last_selection: lastSelection };
    this.tasks.set(taskId, next);
    return next;
  }

  appendOutcome(
    taskId: string,
    outcome: {
      step_id: string;
      selected_tool: string;
      classification: "positive" | "negative" | "abstain";
      recorded: boolean;
    },
  ): AdapterTaskSession | null {
    const current = this.getTask(taskId);
    if (!current) return null;
    const next = {
      ...current,
      recent_outcomes: [...current.recent_outcomes, outcome].slice(-20),
    };
    this.tasks.set(taskId, next);
    return next;
  }

  markTerminal(taskId: string, eventType: string): AdapterTaskSession | null {
    const current = this.getTask(taskId);
    if (!current) return null;
    const next = { ...current, terminal_event_type: eventType };
    this.tasks.set(taskId, next);
    return next;
  }

  isTerminal(taskId: string): boolean {
    return this.getTask(taskId)?.terminal_event_type != null;
  }
}
