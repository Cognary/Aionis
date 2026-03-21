type WorkflowCandidateLike = {
  workflow_signature?: string | null;
  promotion_ready?: boolean | null;
  observed_count?: number | null;
  last_transition_at?: string | null;
  confidence?: number | null;
};

function workflowCandidateScore(item: WorkflowCandidateLike): [number, number, number, number] {
  const promotionReady = item.promotion_ready === true ? 1 : 0;
  const observedCount = Number.isFinite(item.observed_count ?? Number.NaN) ? Number(item.observed_count) : -1;
  const lastTransitionAt = typeof item.last_transition_at === "string" && item.last_transition_at.trim()
    ? Date.parse(item.last_transition_at)
    : Number.NaN;
  const transitionScore = Number.isFinite(lastTransitionAt) ? lastTransitionAt : -1;
  const confidence = Number.isFinite(item.confidence ?? Number.NaN) ? Number(item.confidence) : -1;
  return [promotionReady, observedCount, transitionScore, confidence];
}

function compareWorkflowCandidateScore(left: WorkflowCandidateLike, right: WorkflowCandidateLike): number {
  const a = workflowCandidateScore(left);
  const b = workflowCandidateScore(right);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

export function dedupeWorkflowCandidatesBySignature<T extends WorkflowCandidateLike>(items: T[]): T[] {
  const out: Array<T | undefined> = [];
  const indexBySignature = new Map<string, number>();
  for (const item of items) {
    const signature = typeof item.workflow_signature === "string" ? item.workflow_signature.trim() : "";
    if (!signature) {
      out.push(item);
      continue;
    }
    const existingIndex = indexBySignature.get(signature);
    if (existingIndex == null) {
      indexBySignature.set(signature, out.length);
      out.push(item);
      continue;
    }
    const existing = out[existingIndex];
    if (!existing) {
      out[existingIndex] = item;
      continue;
    }
    if (compareWorkflowCandidateScore(item, existing) > 0) {
      out[existingIndex] = item;
    }
  }
  return out.filter((item): item is T => item != null);
}
