# Lite Benchmark Profile Policy Spec

Date: 2026-03-23
Status: implemented

## Goal

Turn the suite-profile baseline from a flat drift list into an explicit long-lived policy.

The benchmark now has enough stable structure that not every profile-key drift should be treated the same way.

## Policy

The profile policy is split into:

1. `hard`
2. `soft`

`hard` keys are long-lived execution-memory product-contract indicators. They should be stable across refactors and should gate isolated validation by default.

`soft` keys are still useful drift signals, but they are allowed to move during normal tuning and should stay visible without becoming the default blocker.

## Runtime behavior

Benchmark baseline compare should now expose:

1. `changed_profile_keys`
2. `hard_changed_profile_keys`
3. `soft_changed_profile_keys`
4. `profile_policy_version`

And the CLI should support:

1. `--fail-on-profile-drift`
2. `--fail-on-hard-profile-drift`

## Validation behavior

`scripts/lite-real-validation.sh` should default to:

1. hard profile drift gating

It should still allow:

1. `all`
2. `hard`
3. `off`

through an environment-controlled mode.
