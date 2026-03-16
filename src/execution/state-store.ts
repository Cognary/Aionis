import { z } from "zod";
import {
  ExecutionStateV1Schema,
  type ExecutionStateV1,
} from "./types.js";
import {
  ExecutionStateTransitionV1Schema,
  applyExecutionStateTransition,
  type ExecutionStateTransitionV1,
  type ExecutionTransitionType,
} from "./transitions.js";

export const StoredExecutionStateV1Schema = z.object({
  state: ExecutionStateV1Schema,
  revision: z.number().int().positive(),
  last_transition_type: z.string().trim().min(1).nullable().default(null),
  last_transition_at: z.string().datetime().nullable().default(null),
});
export type StoredExecutionStateV1 = z.infer<typeof StoredExecutionStateV1Schema>;

function stateStoreKey(scope: string, stateId: string): string {
  return `${scope}::${stateId}`;
}

export class InMemoryExecutionStateStore {
  private readonly records = new Map<string, StoredExecutionStateV1>();

  get(scope: string, stateId: string): StoredExecutionStateV1 | null {
    const record = this.records.get(stateStoreKey(scope, stateId));
    return record ? StoredExecutionStateV1Schema.parse(record) : null;
  }

  put(stateInput: ExecutionStateV1): StoredExecutionStateV1 {
    const state = ExecutionStateV1Schema.parse(stateInput);
    const key = stateStoreKey(state.scope, state.state_id);
    const existing = this.records.get(key);
    const next: StoredExecutionStateV1 = StoredExecutionStateV1Schema.parse({
      state,
      revision: existing?.revision ?? 1,
      last_transition_type: existing?.last_transition_type ?? null,
      last_transition_at: existing?.last_transition_at ?? null,
    });
    this.records.set(key, next);
    return next;
  }

  listByScope(scope: string): StoredExecutionStateV1[] {
    const out: StoredExecutionStateV1[] = [];
    for (const record of this.records.values()) {
      if (record.state.scope !== scope) continue;
      out.push(StoredExecutionStateV1Schema.parse(record));
    }
    return out.sort((a, b) => a.state.state_id.localeCompare(b.state.state_id));
  }

  applyTransition(transitionInput: ExecutionStateTransitionV1): StoredExecutionStateV1 {
    const transition = ExecutionStateTransitionV1Schema.parse(transitionInput);
    const key = stateStoreKey(transition.scope, transition.state_id);
    const existing = this.records.get(key);
    if (!existing) {
      throw new Error(`execution state not found for transition: ${transition.scope}/${transition.state_id}`);
    }
    if (transition.expected_revision != null && transition.expected_revision !== existing.revision) {
      throw new Error(`execution state revision mismatch: expected ${transition.expected_revision}, got ${existing.revision}`);
    }

    const nextState = applyExecutionStateTransition(existing.state, transition);
    const next: StoredExecutionStateV1 = StoredExecutionStateV1Schema.parse({
      state: nextState,
      revision: existing.revision + 1,
      last_transition_type: transition.type,
      last_transition_at: transition.at,
    });
    this.records.set(key, next);
    return next;
  }

  has(scope: string, stateId: string): boolean {
    return this.records.has(stateStoreKey(scope, stateId));
  }

  clear(): void {
    this.records.clear();
  }
}

const sharedExecutionStateStore = new InMemoryExecutionStateStore();

export function getSharedExecutionStateStore(): InMemoryExecutionStateStore {
  return sharedExecutionStateStore;
}

export function buildStoredExecutionState(
  stateInput: ExecutionStateV1,
  options: {
    revision?: number;
    lastTransitionType?: ExecutionTransitionType | null;
    lastTransitionAt?: string | null;
  } = {},
): StoredExecutionStateV1 {
  return StoredExecutionStateV1Schema.parse({
    state: stateInput,
    revision: options.revision ?? 1,
    last_transition_type: options.lastTransitionType ?? null,
    last_transition_at: options.lastTransitionAt ?? null,
  });
}
