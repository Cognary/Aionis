# Aionis Public Repo Retention

This step turns the repository split into an actionable public shrink plan.

## What changed

1. Updated `REPO_CUTOVER.md` to reflect the real current topology:
   - public `Aionis`
   - private `Aionis-runtime`
2. Added a concrete public retention plan for SDK/docs/demo-shell boundaries.

## Why it matters

Without a retention plan, the public repository would either:

1. stay too large and keep exposing moat-bearing runtime internals
2. get cut down too aggressively and break SDK quickstart/demo onboarding

The plan now makes the staging explicit:

1. keep SDK/docs/demo surface public
2. move runtime mainline ownership to the private repo
3. replace the current public demo dependency on the full runtime tree before deleting deep internals
