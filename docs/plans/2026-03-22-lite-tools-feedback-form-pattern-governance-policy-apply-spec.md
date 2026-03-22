# Lite Tools Feedback Form-Pattern Governance Policy Apply Spec

Date: 2026-03-22

## Goal

Allow the `tools/feedback` `form_pattern` governance path to apply one narrow runtime effect to persisted pattern anchors when a bounded semantic review is admissible and strongly confident.

## Scope

This slice applies only one effect:

1. `provisional/candidate -> stable/trusted`

This slice does **not**:

1. change distinct-run counting
2. widen mutation scope beyond pattern anchor state
3. bypass negative-feedback or contested logic

## Runtime Rule

Runtime apply is allowed only when all of the following are true:

1. route built a `form_pattern` governance preview
2. bounded review is supplied
3. review is admissible
4. policy effect preview applies
5. current anchor state is `provisional/candidate`

The apply is narrow:

1. set `pattern_state = stable`
2. set `credibility_state = trusted`
3. update promotion/maintenance fields consistently
4. mark trust-hardening with a semantic-review override marker

This slice still does not change:

1. `distinct_run_count`
2. `required_distinct_runs`
3. default trust-hardening gate semantics

## Contract Additions

Extend tools-feedback governance decision trace with:

1. `runtime_apply_changed_pattern_state`
2. `runtime_policy_applied` stage

The persisted anchor should reflect the applied state, and the response `pattern_anchor` should match persistence.

## Validation

Required validation:

1. admitted high-confidence review writes `stable/trusted`
2. persisted anchor matches the returned anchor
3. low-confidence review remains `provisional/candidate`
4. decision trace records runtime apply
5. full `test:lite`
