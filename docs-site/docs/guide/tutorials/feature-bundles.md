# Tutorial: Feature Bundles

Use the built-in feature bundles when you want a copy-ready `.env` starting point for common Aionis operating modes.

## What this tutorial covers

1. The four built-in feature bundles.
2. Which bundle to use for each situation.
3. How to apply a bundle without overwriting the rest of your `.env`.

## Why bundles exist

Aionis keeps many higher-risk or experimental capabilities disabled by default.

That is good for safety, but it also means new users can spend too much time flipping individual flags by hand.

Feature bundles solve that problem by grouping the most common default-off and opt-in toggles into a managed `.env` block.

The bundles do **not** replace your whole `.env`.

They only replace the managed feature-bundle section and leave the rest of your config and secrets untouched.

## Available bundles

| Bundle | Best for | What it does |
| --- | --- | --- |
| `local_safe` | local development and first-time setup | keeps experimental and dangerous features off |
| `experimental` | recall / context optimization evaluation | enables safer evaluation defaults without opening execution surfaces |
| `team_shared` | shared team or staging environments | adds production-style auth and shared-environment placeholders while keeping dangerous features off |
| `high_risk` | short-lived approved operator windows | enables sandbox local execution, replay learning, request-side repair override, and dangerous Ops actions |

## Commands

Apply one of the built-in bundles:

```bash
npm run -s env:bundle:local-safe
npm run -s env:bundle:experimental
npm run -s env:bundle:team-shared
npm run -s env:bundle:high-risk
```

List the available bundles:

```bash
npm run -s env:bundle:list
```

Show which bundle is currently managed in `.env`:

```bash
npm run -s env:bundle:status
```

Show the active bundle plus all managed keys:

```bash
npm run -s env:bundle:status:verbose
```

Preview the difference between the current managed bundle block and a target bundle:

```bash
npm run -s env:bundle:diff -- experimental
```

Print the current status, the diff, and the managed block preview in one command:

```bash
npm run -s env:bundle:plan -- experimental
```

Preview the managed block that would be written, without changing `.env`:

```bash
npm run -s env:bundle:apply -- --dry-run experimental
```

Apply the bundle after backing up the current `.env`:

```bash
npm run -s env:bundle:apply -- --backup experimental
```

Or use the generic entrypoint:

```bash
npm run -s env:bundle:apply -- experimental
```

## What each bundle changes

### `local_safe`

Use this when you want the most conservative local baseline.

It keeps:

1. `SANDBOX_ENABLED=false`
2. `REPLAY_LEARNING_PROJECTION_ENABLED=false`
3. `REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_DEFAULT=false`
4. `MEMORY_SHADOW_DUAL_WRITE_ENABLED=false`
5. `OPS_DANGEROUS_ACTIONS_ENABLED=false`

### `experimental`

Use this when you want better recall and context experiments without opening high-risk execution paths.

It enables:

1. `MEMORY_RECALL_CLASS_AWARE_ENABLED=true`
2. `MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT=balanced`
3. `MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT=balanced`
4. `MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT=1200`

It still keeps sandbox, auto-promotion, and dangerous Ops actions off.

### `team_shared`

Use this for shared team environments or staging.

It switches to a service-style baseline and includes placeholders for:

1. `MEMORY_AUTH_MODE=api_key`
2. `MEMORY_API_KEYS_JSON`
3. `CORS_ALLOW_ORIGINS`
4. `CORS_ADMIN_ALLOW_ORIGINS`
5. `OPS_BASIC_AUTH_*`

You must replace the placeholder values before using this in a real environment.

### `high_risk`

Use this only for short-lived, approved evaluation windows.

It enables:

1. `SANDBOX_ENABLED=true`
2. `SANDBOX_EXECUTOR_MODE=local_process`
3. `SANDBOX_LOCAL_PROCESS_ALLOW_IN_PROD=true`
4. `REPLAY_GUIDED_REPAIR_ALLOW_REQUEST_BUILTIN_LLM=true`
5. `REPLAY_LEARNING_PROJECTION_ENABLED=true`
6. `REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_DEFAULT=true`
7. `OPS_DANGEROUS_ACTIONS_ENABLED=true`

This is intentionally not a normal default.

## Recommended usage order

1. Start with `local_safe`.
2. Move to `experimental` when you want recall or context optimization evidence.
3. Use `team_shared` for shared non-local environments.
4. Use `high_risk` only with explicit operator approval and a rollback plan.

## File locations

These bundles live in:

1. `scripts/env/feature-bundles/local_safe.env`
2. `scripts/env/feature-bundles/experimental.env`
3. `scripts/env/feature-bundles/team_shared.env`
4. `scripts/env/feature-bundles/high_risk.env`

The apply script is:

1. `scripts/env/apply-feature-bundle.sh`

## Related pages

1. [Configuration Reference](/reference/configuration)
2. [Deploy](/guide/deploy)
3. [Tutorial: One-click Environment Template](/guide/tutorials/env-template)
