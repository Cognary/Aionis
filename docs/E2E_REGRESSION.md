---
title: "E2E Regression Checklist (Local Terminal)"
---

# E2E Regression Checklist (Local Terminal)

This is a pragmatic, repeatable checklist for verifying the end-to-end loop:

- write (SoR) succeeds even when embeddings are slow/failing
- async outbox backfills embeddings and then runs downstream jobs (topic_cluster)
- recall contract is stable (no embeddings leaked; bounded debug channel)
- idempotency and dead-letter/replay are safe

Assumptions:
- You are in the repo root: `/Users/lucio/Desktop/Aionis`
- Postgres is running locally and `DATABASE_URL` in `.env` is correct

## 0) Load Env

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
echo "$DATABASE_URL"
```

## 1) Migrate DB

```bash
make db-migrate
psql aionis -c "select filename from schema_migrations order by id desc limit 10;"
```

Expected:
- newest migrations include `0005_embedding_status.sql`, `0006_memory_nodes_client_id.sql`, `0007_outbox_failed.sql`, `0008_outbox_job_key.sql`.

## 2) Start API + Worker (2 terminals)

Terminal A (API):
```bash
cd /Users/lucio/Desktop/Aionis
npm run dev
```

Terminal B (Worker):
```bash
cd /Users/lucio/Desktop/Aionis
npm run job:outbox-worker
```

Sanity:
```bash
curl -sS localhost:$PORT/health | jq
```

## 3) Write SoR (auto-embed does not block)

```bash
curl -sS localhost:$PORT/v1/memory/write \
  -H 'content-type: application/json' \
  -d '{
    "input_text":"e2e derived embeddings",
    "auto_embed": true,
    "nodes":[{"client_id":"e2e_evt_1","type":"event","text_summary":"e2e: write succeeds; embedding is derived"}]
  }' | jq
```

Expected:
- HTTP 200
- has `commit_id`, `commit_hash`
- includes `embedding_backfill.enqueued=true` (if provider configured) and `pending_nodes>=1`.

DB check (node exists immediately):
```bash
psql aionis -c "
select id, client_id, type, embedding_status, embedding_attempts, (embedding is not null) as has_embedding
from memory_nodes
where scope='$MEMORY_SCOPE' and client_id='e2e_evt_1'
limit 1;"
```

Expected:
- row exists
- `embedding_status` is `pending` right after write (then becomes `ready` after worker runs)

## 4) Outbox Backfill Happened

```bash
psql aionis -c "
select id, event_type, attempts, claimed_at, published_at, failed_at, left(coalesce(last_error,''),120) as err
from memory_outbox
where scope='$MEMORY_SCOPE'
order by id desc
limit 20;"
```

Expected:
- newest `embed_nodes` row gets `published_at` after worker processes it
- if the write requested topic cluster and events were pending, the embed job payload includes `after_topic_cluster_event_ids`

## 5) Recall Contract (no embeddings in DTO)

```bash
curl -sS localhost:$PORT/v1/memory/recall_text \
  -H 'content-type: application/json' \
  -d '{"query_text":"derived embeddings","limit":20}' \
| jq '{nodes:(.subgraph.nodes|length), edges:(.subgraph.edges|length), has_embedding:(.subgraph.nodes|map(has("embedding"))|any)}'
```

Expected:
- `has_embedding=false` always

## 6) Debug Embeddings Channel (privileged + bounded)

Not allowed without admin token:
```bash
curl -sS -i localhost:$PORT/v1/memory/recall_text \
  -H 'content-type: application/json' \
  -d '{"query_text":"derived embeddings","limit":20,"return_debug":true,"include_embeddings":true}' | head -n 20
```

Allowed with admin token:
```bash
curl -sS localhost:$PORT/v1/memory/recall_text \
  -H 'content-type: application/json' \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -d '{"query_text":"derived embeddings","limit":20,"return_debug":true,"include_embeddings":true}' \
| jq '{emb_n:(.debug.embeddings|length), preview_len:(.debug.embeddings[0].preview|length), subgraph_has_embedding:(.subgraph.nodes|map(has("embedding"))|any)}'
```

Expected:
- `emb_n <= 5`
- `preview_len <= 16`
- `subgraph_has_embedding=false`

Hard cap check:
```bash
curl -sS localhost:$PORT/v1/memory/recall_text \
  -H 'content-type: application/json' \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -d '{"query_text":"derived embeddings","limit":21,"return_debug":true,"include_embeddings":true}' \
| jq
```

Expected:
- HTTP 400
- `error=debug_embeddings_limit_too_high`

## 7) Meta Gating (include_meta)

```bash
curl -sS localhost:$PORT/v1/memory/recall_text \
  -H 'content-type: application/json' \
  -d '{"query_text":"derived embeddings","limit":20,"return_debug":true}' \
| jq '{node_has_created_at:(.subgraph.nodes|map(has("created_at"))|any), edge_has_commit_id:(.subgraph.edges|map(has("commit_id"))|any)}'

curl -sS localhost:$PORT/v1/memory/recall_text \
  -H 'content-type: application/json' \
  -d '{"query_text":"derived embeddings","limit":20,"return_debug":true,"include_meta":true}' \
| jq '{node_has_created_at:(.subgraph.nodes|map(has("created_at"))|any), edge_has_commit_id:(.subgraph.edges|map(has("commit_id"))|any)}'
```

Expected:
- first: both false
- second: both true

## 8) Idempotency: client_id and outbox job_key

Re-send the same write (same `client_id`, no `id`):
```bash
curl -sS localhost:$PORT/v1/memory/write \
  -H 'content-type: application/json' \
  -d '{
    "input_text":"e2e idempotency retry",
    "auto_embed": true,
    "nodes":[{"client_id":"e2e_evt_1","type":"event","text_summary":"e2e: retry"}]
  }' | jq
```

Expected:
- HTTP 200
- node id in response is identical to the previous `e2e_evt_1` write

Outbox should not explode with duplicate jobs for the same commit+payload:
```bash
psql aionis -c "
select event_type, count(*) as n
from memory_outbox
where scope='$MEMORY_SCOPE'
group by event_type
order by event_type;"
```

## 8.1) Force Re-embed (model upgrade)

If you change the embedding model/provider, you can trigger a best-effort refresh without blocking `/write`.

```bash
curl -sS localhost:$PORT/v1/memory/write \
  -H 'content-type: application/json' \
  -d '{
    "input_text":"force reembed",
    "auto_embed": true,
    "force_reembed": true,
    "nodes":[{"client_id":"e2e_evt_1","type":"event","text_summary":"force reembed refresh"}]
  }' | jq

psql aionis -c "
select id, client_id, embedding_status, embedding_attempts, embedding_model
from memory_nodes
where scope='$MEMORY_SCOPE' and client_id='e2e_evt_1'
limit 1;"
```

Expected:
- `/write` still returns 200.
- Worker processes an `embed_nodes` job even if the node was already `ready`.
- `embedding_attempts` increments and `embedding_model` becomes the active provider/model string (e.g. `minimax:embo-01`).

## 9) Dead-letter + replay (operator)

Failed count:
```bash
psql aionis -c "select count(*) from memory_outbox where failed_at is not null;"
```

Replay (dry-run):
```bash
npm run job:outbox-replay -- --all-failed --dry-run
```

## 10) Rate Limit Sanity (P3.2)

Tip: if you run many concurrent curls, do **not** write all headers/bodies to the same file (race + corruption).

Capture one `429` (recall):

```bash
set -a; source .env; set +a
export RATE_LIMIT_BYPASS_LOOPBACK=false

tmp="$(mktemp -d /tmp/aionis-rl.XXXXXX)"
rm -f "$tmp/res.txt"
for i in {1..80}; do
  h="$tmp/h$i"
  b="$tmp/b$i"
  (
    code="$(curl -sS -D "$h" -o "$b" -w "%{http_code}" localhost:$PORT/v1/memory/recall_text \
      -H 'content-type: application/json' \
      -d '{"query_text":"memory graph","limit":20}')"
    echo "$code $i" >> "$tmp/res.txt"
  ) &
done
wait

idx="$(awk '$1==429{print $2; exit}' "$tmp/res.txt")"
echo "picked idx=$idx (dir=$tmp)"
head -n 30 "$tmp/h$idx"
jq '{error, message, details}' "$tmp/b$idx"
```

Expected:
- `HTTP/1.1 429 Too Many Requests`
- `error=rate_limited_recall`
- header includes `Retry-After`

Capture one `429` (debug embeddings):

```bash
set -a; source .env; set +a
export RATE_LIMIT_BYPASS_LOOPBACK=false

tmp="$(mktemp -d /tmp/aionis-rl.XXXXXX)"
rm -f "$tmp/res.txt"
for i in {1..30}; do
  h="$tmp/h$i"
  b="$tmp/b$i"
  (
    code="$(curl -sS -D "$h" -o "$b" -w "%{http_code}" localhost:$PORT/v1/memory/recall_text \
      -H 'content-type: application/json' \
      -H "X-Admin-Token: $ADMIN_TOKEN" \
      -d '{"query_text":"memory graph","limit":20,"return_debug":true,"include_embeddings":true}')"
    echo "$code $i" >> "$tmp/res.txt"
  ) &
done
wait

idx="$(awk '$1==429{print $2; exit}' "$tmp/res.txt")"
echo "picked idx=$idx (dir=$tmp)"
head -n 30 "$tmp/h$idx"
jq '{error, message, details}' "$tmp/b$idx"
```

Expected:
- `error=rate_limited_debug_embeddings`

## 11) Consistency Check (P4.2)

```bash
set -a; source .env; set +a
npm run job:consistency-check
```

Scope-only fast path:

```bash
npm run job:consistency-check -- --check-set scope
```

Cross-tenant-only path:

```bash
npm run job:consistency-check -- --check-set cross_tenant
```

Fail CI (errors only):

```bash
npm run job:consistency-check -- --strict
```

Fail CI (errors + warnings):

```bash
npm run job:consistency-check -- --strict-warnings
```

## 11.1) Commit ID Hard Constraint (P4.1)

After applying migration `0010_commit_id_not_null.sql`, these should be impossible:

```bash
psql aionis -c "select count(*) from memory_nodes where commit_id is null;"
psql aionis -c "select count(*) from memory_edges where commit_id is null;"
```

## 12) Embedding Model Backfill (Optional)

If you recently added `embedding_model` and the consistency check warns about missing values for READY nodes:

```bash
set -a; source .env; set +a
npm run job:embedding-model-backfill -- --dry-run
npm run job:embedding-model-backfill -- --limit 5000
```

Note: this labels existing vectors with the **currently configured** provider/model name. If you need full correctness across historical model changes, use `force_reembed=true` to refresh embeddings.

## 13) Phase 4 Loop Smoke (Rehydrate + Activate + Adaptive Decay + Quality Gate)

One-command smoke:

```bash
cd /Users/lucio/Desktop/Aionis
./examples/long_term_phase4_smoke.sh
```

Manual split (if you want step-by-step):

```bash
set -a; source .env; set +a

# Rehydrate from archive/cold to warm (by client_id)
curl -sS localhost:$PORT/v1/memory/archive/rehydrate \
  -H 'content-type: application/json' \
  -d '{
    "scope":"'"$MEMORY_SCOPE"'",
    "client_ids":["e2e_evt_1"],
    "target_tier":"warm",
    "reason":"manual e2e rehydrate",
    "input_text":"manual e2e rehydrate"
  }' | jq

# Feed positive signal + activation for adaptive decay
curl -sS localhost:$PORT/v1/memory/nodes/activate \
  -H 'content-type: application/json' \
  -d '{
    "scope":"'"$MEMORY_SCOPE"'",
    "client_ids":["e2e_evt_1"],
    "outcome":"positive",
    "activate":true,
    "run_id":"e2e_manual_001",
    "reason":"manual e2e positive",
    "input_text":"manual e2e activate"
  }' | jq

# Run evolution + drift gate
npm run job:salience-decay
npm run job:quality-eval -- --strict
```

Expected:
- Rehydrate returns `rehydrated.moved_nodes >= 0` and commit metadata.
- Activate returns `activated.updated_nodes >= 1` when node exists.
- `job:salience-decay` shows adaptive counters when feedback signals exist.
- `job:quality-eval -- --strict` exits zero when current quality checks pass.

## 14) CI Health Gate (Consistency + Quality)

```bash
cd /Users/lucio/Desktop/Aionis
npm run job:health-gate
```

默认会先做一次 `embedding_model` 自动回填（用于清理历史 READY 节点告警）。
如需禁用：

```bash
npm run job:health-gate -- --skip-backfill
```

Production-strict:

```bash
npm run job:health-gate -- --strict-warnings --consistency-check-set scope
```

Separate cross-tenant strict gate:

```bash
npm run job:consistency-check -- --check-set cross_tenant --strict-warnings
```

Exit code convention:
- `0`: pass
- `2`: gate failed
- `1`: runtime/usage error

## Handling Long Outputs

If an output is too long to paste:

```bash
# capture
curl -sS localhost:$PORT/v1/memory/recall_text \
  -H 'content-type: application/json' \
  -d '{"query_text":"derived embeddings","limit":20}' > /tmp/recall.json

# share summaries
wc -c /tmp/recall.json
jq '{nodes:(.subgraph.nodes|length), edges:(.subgraph.edges|length), has_embedding:(.subgraph.nodes|map(has("embedding"))|any)}' /tmp/recall.json
jq '.debug.neighborhood_counts // null' /tmp/recall.json
```

## 15) Multi-Agent Fabric (P2 MVP)

Prereq:

```bash
cd /Users/lucio/Desktop/Aionis
make db-migrate
```

Write one private and one shared memory item:

```bash
curl -sS localhost:${PORT:-3001}/v1/memory/write \
  -H 'content-type: application/json' \
  -d '{
    "input_text":"p2 lane private",
    "producer_agent_id":"agent_a",
    "memory_lane":"private",
    "nodes":[{"client_id":"p2_private_a","type":"event","text_summary":"private memory from agent_a"}]
  }' | jq

curl -sS localhost:${PORT:-3001}/v1/memory/write \
  -H 'content-type: application/json' \
  -d '{
    "input_text":"p2 lane shared",
    "producer_agent_id":"agent_b",
    "memory_lane":"shared",
    "nodes":[{"client_id":"p2_shared_b","type":"event","text_summary":"shared memory from agent_b"}]
  }' | jq
```

Recall as `agent_a` and verify lane metadata:

```bash
curl -sS localhost:${PORT:-3001}/v1/memory/recall_text \
  -H 'content-type: application/json' \
  -d '{
    "query_text":"memory",
    "limit":20,
    "consumer_agent_id":"agent_a",
    "consumer_team_id":"team_default",
    "include_meta":true
  }' \
| jq '{nodes:(.subgraph.nodes|length), lanes:(.subgraph.nodes|map(.memory_lane)|unique)}'
```

Create a team-scoped rule:

```bash
curl -sS localhost:${PORT:-3001}/v1/memory/write \
  -H 'content-type: application/json' \
  -d '{
    "input_text":"create team rule",
    "nodes":[
      {
        "client_id":"p2_rule_team_json",
        "type":"rule",
        "text_summary":"team_default forces json output",
        "slots":{
          "rule_scope":"team",
          "target_team_id":"team_default",
          "if":{"intent":"json"},
          "then":{"output":{"format":"json","strict":true}}
        }
      }
    ]
  }' | jq
```

Evaluate with team context:

```bash
curl -sS localhost:${PORT:-3001}/v1/memory/rules/evaluate \
  -H 'content-type: application/json' \
  -d '{
    "context":{"intent":"json","provider":"minimax","tool":{"name":"psql"},"agent":{"id":"agent_a","team_id":"team_default"}},
    "include_shadow":true,
    "limit":50
  }' | jq '{considered, matched, active_n:(.active|length), shadow_n:(.shadow|length), lane:.agent_visibility_summary.lane, scope_stats:.agent_visibility_summary.rule_scope}'
```

Tool select with the same context (lane-aware visibility should match evaluate):

```bash
curl -sS localhost:${PORT:-3001}/v1/memory/tools/select \
  -H 'content-type: application/json' \
  -d '{
    "context":{"intent":"json","provider":"minimax","tool":{"name":"psql"},"agent":{"id":"agent_a","team_id":"team_default"}},
    "candidates":["psql","curl","bash"],
    "strict":true,
    "include_shadow":true,
    "rules_limit":50
  }' | jq '{selected:.selection.selected, ordered:.selection.ordered, lane:.rules.agent_visibility_summary.lane, scope_stats:.rules.agent_visibility_summary.rule_scope}'
```

SDK-based demo entry (replacing direct curl for common flows):

```bash
cd /Users/lucio/Desktop/Aionis
/Users/lucio/Desktop/Aionis/examples/rules_evaluate.sh | jq '{matched, active_n:(.active|length), shadow_n:(.shadow|length)}'
/Users/lucio/Desktop/Aionis/examples/tools_select.sh psql curl bash | jq '{selected:.selection.selected, ordered:.selection.ordered}'
```

Expected:

1. Scripts succeed without manual curl payload assembly.
2. Output still matches server API schema.
3. Behavior is consistent with direct endpoint calls above.

## 16) Private Rule Owner Hard Guard + Backfill

Dry-run existing legacy rows (if any):

```bash
cd /Users/lucio/Desktop/Aionis
npm run job:private-rule-owner-backfill -- --dry-run --limit 5000
```

Apply repair (producer owner first, otherwise shared fallback):

```bash
npm run job:private-rule-owner-backfill -- --limit 5000
```

Check hard consistency:

```bash
npm run job:consistency-check \
  -- --check-set scope \
  | jq '.checks[] | select(.name=="private_rule_without_owner")'
```

Expected: `count=0`.

Optional strict mode (if you want unresolved rows to stay private and fail the run):

```bash
npm run job:private-rule-owner-backfill -- --limit 5000 --no-shared-fallback
```

## 17) Phase C Tenant Isolation + Cross-Tenant Consistency

Run strict tenant e2e:

```bash
cd /Users/lucio/Desktop/Aionis
npm run e2e:phasec-tenant
```

Expected:

1. tenant A/B evaluate only see their own rule source ids.
2. Script exits 0 with `ok: phase-c tenant e2e passed`.
3. Embedded consistency step shows all cross-tenant checks count=0.

Manual spot-check:

```bash
npm run job:consistency-check \
  -- --check-set cross_tenant \
  | jq '.checks[] | select(.name=="tenant_scope_key_malformed" or (.name|startswith("cross_tenant_")))'
```

Expected:

1. All above checks have `count=0`.

## Verification Stamp

- Last reviewed: `2026-02-18`
- Verification commands:
  - `npm run docs:check`
  - `npm run job:health-gate -- --strict-warnings --consistency-check-set scope`
  - `npm run job:consistency-check -- --check-set cross_tenant --strict-warnings`
