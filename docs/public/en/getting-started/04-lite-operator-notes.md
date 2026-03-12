---
title: "Lite Operator Notes"
---

# Lite Operator Notes

Use this page when `npm run start:lite` is already working and you want the shortest path to operating Lite without guessing at local-only behavior.

## What Lite Is

Lite Alpha is the single-user, local SQLite-backed Aionis edition.

It intentionally keeps these outer surfaces server-only:

1. `/v1/admin/control/*`
2. `/v1/automations/*`

Those route groups should return stable `501 server_only_in_lite`. Treat that as expected Lite behavior, not as a startup failure.

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
curl -fsS http://localhost:3001/health | jq '{ok,aionis_edition,memory_store_backend,lite_write_store,lite_recall_store}'
```

Healthy Lite should show:

1. `aionis_edition = "lite"`
2. `memory_store_backend = "lite_sqlite"`
3. `lite_write_store` and `lite_recall_store` present

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
2. `memory_lane = "private"` is owner-scoped and may not appear in `find` unless consumer identity matches

If you want the shortest debug path, use `shared` while verifying:

1. `/v1/memory/write`
2. `/v1/memory/find`
3. `/v1/memory/recall_text`
4. `/v1/memory/planning/context`
5. `/v1/memory/context/assemble`

If `find` looks empty after a successful private write, check visibility semantics before assuming SQLite persistence is broken.

## Pack Routes and Admin Token

Lite runs with local auth defaults, but pack routes still require an admin token.

Set it at startup:

```bash
ADMIN_TOKEN=dogfood-admin npm run start:lite
```

Then call pack routes with:

```bash
-H 'X-Admin-Token: dogfood-admin'
```

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

### `/health` says `postgres` instead of `lite_sqlite`

Check:

1. you actually started with `npm run start:lite`
2. `AIONIS_EDITION=lite` was not overridden

### write succeeds but `find` looks empty

Check:

1. did you write with `memory_lane = "private"`?
2. are you expecting owner-scoped data to appear without consumer identity?
3. can you reproduce the same flow with `memory_lane = "shared"`?

### write succeeds but recall/context is empty

Check:

1. the write actually created nodes
2. the response does not contain `write_no_nodes`
3. the response may contain `lite_embedding_backfill_completed_inline`, which is expected and should help fresh recallability
4. rerun the same flow with `npm run -s lite:dogfood`

### pack routes fail locally

Check:

1. `ADMIN_TOKEN` was set before startup
2. requests include `X-Admin-Token`
3. you are importing the nested `pack`, not the whole export envelope

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
