---
title: "Lite Operator Notes"
---

# Lite Operator Notes

Use this page when `npm run start:lite` is already working and you want the shortest path to operating Lite without guessing at local-only behavior.

## What Lite Is

Lite Alpha is the single-user, local SQLite-backed Aionis edition.

It intentionally keeps admin/control server-only:

1. `/v1/admin/control/*`

That route group should return stable `501 server_only_in_lite`. Treat that as expected Lite behavior, not as a startup failure.

Lite now includes a local automation subset under `/v1/automations/*`.

Currently supported:

1. definition create/get/list/validate
2. run/get/list/cancel/resume
3. local playbook-driven runs backed by SQLite

Still intentionally unavailable inside the automation namespace:

1. reviewer assignment flows
2. promotion and control-plane review flows
3. compensation and telemetry surfaces

Those unsupported automation routes should return `501 automation_feature_not_supported_in_lite`.

Lite error responses now use one stable envelope:

1. `status`
2. `error`
3. `message`
4. `details`

## Runtime Prerequisites

Lite requires Node.js with `node:sqlite` support.

Practical rule:

1. use Node `22+`
2. if `npm run start:lite` exits immediately with a SQLite support error, fix Node first before debugging anything else

Minimal startup path:

```bash
cp .env.example .env
npm install
npm run build
npm run start:lite
```

Expected health shape:

```bash
curl -fsS http://localhost:3001/health | jq '{ok,runtime,storage,lite}'
```

Healthy Lite should show:

1. `runtime.edition = "lite"`
2. `storage.backend = "lite_sqlite"`
3. `lite.stores.write` and `lite.stores.recall` present

## Sandbox Defaults

Lite now exposes sandbox routes to the ordinary local user path by default.

Current default startup behavior:

1. `SANDBOX_ENABLED=true`
2. `SANDBOX_ADMIN_ONLY=false`
3. `SANDBOX_EXECUTOR_MODE=mock`

If you want to relock sandbox behind the local admin token:

```bash
SANDBOX_ADMIN_ONLY=true npm run start:lite
```

If you want a practical local-process sandbox preset:

```bash
npm run start:lite:local-process
```

That preset keeps the default allowlist intentionally narrow:

1. `SANDBOX_EXECUTOR_MODE=local_process`
2. `SANDBOX_ALLOWED_COMMANDS_JSON=["echo"]`

## Default Local Files

By default Lite stores local state in:

1. `.tmp/aionis-lite-write.sqlite`
2. `.tmp/aionis-lite-replay.sqlite`

You can override them with:

1. `LITE_WRITE_SQLITE_PATH`
2. `LITE_REPLAY_SQLITE_PATH`

This is useful when:

1. isolating separate dogfood runs
2. keeping a stable local memory graph
3. resetting Lite state without touching the rest of the repo

## Memory Lane Behavior

The most common Lite operator confusion is not startup. It is visibility.

Rule of thumb:

1. `memory_lane = "shared"` is best for onboarding, demos, and inspection
2. `memory_lane = "private"` is owner-scoped and `find` is usually stricter about it
3. do not simplify private-lane behavior into “hidden on every Lite surface”
4. the more accurate current operator rule is:
   - `find` may hide private content
   - `recall_text`, `planning/context`, and `context/assemble` may still surface private content

If you want the shortest debug path, use `shared` while verifying:

1. `/v1/memory/write`
2. `/v1/memory/find`
3. `/v1/memory/recall_text`
4. `/v1/memory/planning/context`
5. `/v1/memory/context/assemble`

If `find` looks empty after a successful private write, check visibility semantics before assuming SQLite persistence is broken.

## Minimum Write Request Shape

Lite supports `/v1/memory/write`, but the minimum request shape is the same as Server.

You must still provide at least one of:

1. `input_text`
2. `input_sha256`

If you send only `nodes`, the current response is:

1. `must set input_text or input_sha256`

That is not a Lite-specific failure and does not mean the SQLite write path is broken. It means the request does not satisfy the write contract.

## Pack Routes

Operator expectations:

1. `packs/export` returns an envelope
2. `packs/import` expects the nested `pack` payload from that envelope
3. cross-edition `Lite -> Server` and `Server -> Lite` pack compatibility is already part of the Lite alpha evidence path

## Expected Write Warning

Lite may return this warning after a successful write:

1. `lite_embedding_backfill_completed_inline`

That is normal.

It means Lite completed local embedding backfill inline so fresh writes become recallable without an external worker.

Treat it as confirmation that Lite is doing the right thing, not as a degraded-write error.

## Local Automation Identity

Lite defaults replay, playbook, and automation ownership to one local actor.

Practical rule:

1. if you do nothing, Lite uses `LITE_LOCAL_ACTOR_ID=local-user`
2. replay/playbook flows and automation playbook nodes share that same local actor
3. override it when you want a stable personal local identity

Example:

```bash
LITE_LOCAL_ACTOR_ID=lucio npm run start:lite
```

## Canonical Validation Path

The canonical real-process validation command is:

```bash
npm run -s lite:dogfood
```

It validates the full local loop:

1. startup
2. health
3. write
4. find
5. recall_text
6. planning/context
7. context/assemble
8. pack export/import
9. replay lifecycle

The script writes a run artifact under `artifacts/lite/`.

Use it when:

1. checking a local environment after setup
2. validating a Lite bugfix
3. gathering repeated evidence for beta-gate decisions

## Troubleshooting Checklist

### `start:lite` exits immediately

Check:

1. Node version is `22+`
2. `npm run build` completed
3. no stale shell env is forcing `AIONIS_EDITION=server`

### `/health` says the storage backend is not `lite_sqlite`

Check:

1. you actually started with `npm run start:lite`
2. `AIONIS_EDITION=lite` was not overridden

### write succeeds but `find` looks empty

Check:

1. did you write with `memory_lane = "private"`?
2. are you expecting owner-scoped data to appear without consumer identity?
3. can you reproduce the same flow with `memory_lane = "shared"`?
4. do not assume “empty `find`” also means `recall_text` must be empty

### write succeeds but recall/context is empty

Check:

1. the write actually created nodes
2. the response does not contain `write_no_nodes`
3. the response may contain `lite_embedding_backfill_completed_inline`, which is expected and should help fresh recallability
4. rerun the same flow with `npm run -s lite:dogfood`

### pack routes fail locally

Check:

1. you are importing the nested `pack`, not the whole export envelope
2. `/health` still reports `runtime.edition = "lite"`

## Recommended Operator Flow

The stable local operator order is:

1. start Lite
2. check `/health`
3. write one `shared` event
4. validate `find`
5. validate `recall_text`
6. validate `planning/context`
7. validate `context/assemble`
8. run `lite:dogfood`

## Next Reading

1. [5-Minute Onboarding](/public/en/getting-started/02-onboarding-5min)
2. [Embedding Setup](/public/en/getting-started/03-embedding-setup)
3. [Lite Public Beta Boundary](/public/en/getting-started/05-lite-public-beta-boundary)
4. [Get Started](/public/en/getting-started/01-get-started)
5. [Lite Troubleshooting and Feedback](/public/en/getting-started/06-lite-troubleshooting-and-feedback)
