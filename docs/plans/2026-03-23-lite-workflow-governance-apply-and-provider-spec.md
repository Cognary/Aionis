# Lite Workflow Governance Apply And Provider Spec

## Goal

Complete the workflow auto-promotion governance path so it reaches the same practical layer as replay/tools, and make internal governance provider plumbing actually used on a second live runtime path.

## Scope

- Add narrow runtime apply semantics to workflow auto-promotion governance.
- Keep the actual workflow promotion behavior unchanged.
- Persist a minimal internal apply marker on workflow projection output.
- Add an env-gated static `promote_memory` governance provider for the workflow projection live path.
- Keep the provider internal-only and disabled by default.

## Runtime Apply

- Workflow promotion already creates a stable workflow anchor once observation threshold is met.
- This slice does **not** change that promotion threshold or stable-anchor creation.
- Instead, when governance preview yields an applicable `stable` raise:
  - mark runtime apply in decision trace
  - append `runtime_policy_applied`
  - persist a minimal governed override marker on `slots.workflow_write_projection`

## Provider

- New env gate:
  - `WORKFLOW_GOVERNANCE_STATIC_PROMOTE_MEMORY_PROVIDER_ENABLED`
- When enabled, the workflow live path uses the same deterministic static `promote_memory` provider pattern already introduced on replay.
- Explicit review result still wins over provider output.

## Validation

- workflow route contract test still covers packet/review/admissibility/policy-effect
- new workflow route test covers runtime apply metadata
- new workflow route test covers provider-driven review when no explicit review is supplied
- `tsc`
- `test:lite`
