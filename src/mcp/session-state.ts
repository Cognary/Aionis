export type PendingDecision = {
  decision_id: string;
  decision_uri?: string | null;
  run_id: string | null;
  selected_tool: string | null;
  candidates: string[];
  context: unknown;
  created_at: string;
};

export class AionisMcpSessionState {
  private readonly pendingByDecisionId = new Map<string, PendingDecision>();
  private readonly pendingDecisionIdByRunId = new Map<string, string>();

  setPendingDecision(pending: PendingDecision): void {
    this.pendingByDecisionId.set(pending.decision_id, pending);
    if (pending.run_id) this.pendingDecisionIdByRunId.set(pending.run_id, pending.decision_id);
  }

  getPendingDecisionByDecisionId(decisionId: string | null | undefined): PendingDecision | null {
    if (!decisionId) return null;
    return this.pendingByDecisionId.get(decisionId) ?? null;
  }

  getPendingDecisionByRunId(runId: string | null | undefined): PendingDecision | null {
    if (!runId) return null;
    const decisionId = this.pendingDecisionIdByRunId.get(runId);
    if (!decisionId) return null;
    return this.pendingByDecisionId.get(decisionId) ?? null;
  }

  resolvePendingDecision(args: { decision_id?: string | null; run_id?: string | null }): PendingDecision | null {
    return this.getPendingDecisionByDecisionId(args.decision_id ?? null)
      ?? this.getPendingDecisionByRunId(args.run_id ?? null);
  }

  clearPendingDecision(args: { decision_id?: string | null; run_id?: string | null }): void {
    const pending = this.resolvePendingDecision(args);
    if (!pending) return;
    this.pendingByDecisionId.delete(pending.decision_id);
    if (pending.run_id) this.pendingDecisionIdByRunId.delete(pending.run_id);
  }
}

