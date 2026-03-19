---
title: "Lite Troubleshooting and Feedback"
---

# Lite Troubleshooting and Feedback

Use this page when Lite starts but local behavior still feels wrong, or when you want to report beta feedback in a structured way.

## Fast Triage Order

Check these in order:

1. startup environment
2. `/health`
3. `memory_lane`
4. pack payload shape and runtime identity
5. `npm run -s lite:dogfood`

That order removes the most common false leads first.

## Startup Problems

### `npm run start:lite` exits immediately

Check:

1. Node is `22+`
2. `npm run build` completed
3. your shell is not overriding `AIONIS_EDITION=server`

Lite depends on `node:sqlite`. If Node is too old, fix that before debugging anything else.

### `/health` does not look like Lite

Run:

```bash
curl -fsS http://localhost:3001/health | jq '{ok,runtime,storage,lite}'
```

Expected:

1. `ok = true`
2. `runtime.edition = "lite"`
3. `storage.backend = "lite_sqlite"`
4. `lite.identity.local_actor_id` present
5. `lite.stores.write` present
6. `lite.stores.recall` present

If `storage.backend` is not `lite_sqlite`, you are not actually running the Lite runtime you think you are.

### sandbox returns `sandbox_disabled` or unexpectedly asks for admin token

Check:

1. `SANDBOX_ENABLED` is still `true`
2. `SANDBOX_ADMIN_ONLY` was not set back to `true`
3. `/health` shows `sandbox.enabled = true`

Current Lite default is local direct use, not admin-only gating.

## Write, Recall, and Context Problems

### write succeeds but `find` looks empty

Check:

1. whether the write used `memory_lane = "private"`
2. whether the reader identity matches the owner-scoped write
3. whether the same flow works with `memory_lane = "shared"`

For first validation, prefer `shared`. It is the shortest route to ruling out visibility confusion.

### write succeeds but `recall_text` or `planning/context` is weak

Check:

1. the write response did not return `write_no_nodes`
2. the response may contain `lite_embedding_backfill_completed_inline`
3. the issue still reproduces with `memory_lane = "shared"`
4. the same flow fails under `npm run -s lite:dogfood`

`lite_embedding_backfill_completed_inline` is expected. It means Lite completed local embedding backfill immediately instead of waiting on a worker.

## Replay Problems

### replay lifecycle fails locally

Before digging further:

1. confirm `/health` shows Lite
2. rerun `npm run -s lite:dogfood`
3. identify whether failure is on `run/start`, step writes, or `runs/get`

Current beta expectation:

1. replay lifecycle works in a real Lite process
2. `run/start -> step -> run/end -> runs/get` passes in dogfood

If dogfood is green but your local flow is not, the issue is more likely request shape or environment drift than core Lite persistence.

## Pack Problems

### pack export/import fails locally

Check:

1. `packs/import` receives the nested `pack` payload, not the whole export envelope
2. `/health` still reports `runtime.edition = "lite"`

Current beta expectation:

1. `Lite -> Server` pack compatibility works
2. `Server -> Lite` pack compatibility works

## What Is Not a Bug

These are expected Lite beta boundaries:

1. `/v1/admin/control/*` is server-only
2. unsupported automation governance routes return `501 automation_feature_not_supported_in_lite`
3. Lite is not the recommended production default
4. Lite is not full Server parity

If `/v1/admin/control/*` returns `501 server_only_in_lite`, that is correct Lite behavior.

If an unsupported automation governance route returns `501 automation_feature_not_supported_in_lite`, that is also correct Lite behavior.

## Canonical Validation Command

When in doubt, run:

```bash
npm run -s lite:dogfood
```

That path validates:

1. startup
2. health
3. write
4. find
5. recall_text
6. planning/context
7. context/assemble
8. pack export/import
9. replay lifecycle

It also writes an artifact under `artifacts/lite/`.

## How to Report Feedback

Use the GitHub `Lite Beta Feedback` issue template and include:

1. OS and Node version
2. exact startup command
3. relevant `/health` output
4. whether `lite:dogfood` passed or failed
5. whether the issue is startup, visibility, replay, or packs
6. the smallest request payload that reproduces it

Open the template directly:

[github.com/Cognary/Aionis/issues/new?template=lite-beta-feedback.yml](https://github.com/Cognary/Aionis/issues/new?template=lite-beta-feedback.yml)

If you are unsure whether the behavior is expected, report it anyway. Public beta is for hardening operator UX, not only for catching crashes.

If the run was successful, that is still useful feedback. Successful reports help confirm which startup and operator paths are already stable.

## Next Reading

1. [Lite Public Beta Boundary](/public/en/getting-started/05-lite-public-beta-boundary)
2. [Lite Operator Notes](/public/en/getting-started/04-lite-operator-notes)
3. [5-Minute Onboarding](/public/en/getting-started/02-onboarding-5min)
