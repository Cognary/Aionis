# Jobs (Pluggable Enhancements)

Core API works without background jobs. Jobs are treated as pluggable enhancements:

- `embed_backfill_job`: backfill missing embeddings asynchronously (derived artifact).
- `topic_cluster_job`: cluster recent events into Topics and write `part_of/derived_from` edges.
- `salience_decay_job`: periodically update salience and tier transitions (`hot -> warm -> cold -> archive`).

Recommended implementation:

- Separate process (same codebase) that imports the shared DB helpers.
- Uses the same `memory_commits` mechanism (jobs write commits too).

## Salience Decay (Implemented)

Run:

```bash
npm run job:salience-decay
```

Behavior (Phase 1 long-term memory):

- decays salience for active tiers (`hot`, `warm`, `cold`)
- adaptive decay (Phase 4) can modulate per-node decay scale using:
  - access recency (`last_activated` / `created_at`)
  - optional feedback signals in slots:
    - `feedback_quality` in `[-1,1]`, or
    - `feedback_positive` + `feedback_negative` integer counters
- transitions by policy:
  - `hot -> warm`
  - `warm -> cold`
  - `cold -> archive`
- optional scope-level budget enforcement (Phase 4):
  - `MEMORY_SCOPE_HOT_NODE_BUDGET` (0 disables)
  - `MEMORY_SCOPE_ACTIVE_NODE_BUDGET` (hot+warm, 0 disables)
  - when exceeded, extra nodes are demoted in bounded batches (still respects daily mutation budget)
- excludes protected nodes (`slots.pin=true` or `slots.legal_hold=true`)
- enforces mutation budget (`MEMORY_TIER_MAX_DAILY_MUTATION_RATIO`)
- records transition markers in slots:
  - `last_tier_transition_ms`
  - `last_tier_transition_from`
  - `last_tier_transition_to`
  - `last_tier_transition_job`

## Compression Rollup (Implemented, Phase 2 MVP)

Run:

```bash
npm run job:compression-rollup
```

Behavior (non-destructive compression):

- scans active `topic` nodes in `hot/warm` with recent supporting events
- writes/updates deterministic `concept` summary nodes (`summary_kind=compression_rollup`)
- stores explicit `citations[]` and source hashes in `slots`
- links summary-to-topic (`part_of`) and summary-to-event (`derived_from`)
- prunes stale summary `derived_from` edges not present in current citation set
- idempotent on rerun when source event set/hash and summary text are unchanged

Quick smoke:

```bash
./examples/compression_rollup_smoke.sh
```

## Topic Cluster (Implemented, online kNN)

This job assigns unassigned `event` nodes to the nearest `topic` by embedding similarity.

- If no topic meets `TOPIC_SIM_THRESHOLD`, it creates a **DRAFT** topic and assigns the event to it.
- Topics are promoted to **ACTIVE** once `member_count >= TOPIC_MIN_EVENTS_PER_TOPIC`.
- Strategy switch is pluggable via `TOPIC_CLUSTER_STRATEGY`:
  - `online_knn` (default)
  - `offline_hdbscan` (reserved; currently explicit fallback to `online_knn`)
- Each run writes a commit and outputs `topic_commit_hash` for audit/VEL compatibility.
- Worker payload and direct job output include `quality`:
  - `cohesion` (avg assigned `part_of.weight`)
  - `coverage` (assigned/processed)
  - `orphan_rate_after` (unassigned eligible events ratio after run)
  - `merge_rate_30d` (recent consolidation aliasing activity ratio)

Run:

```bash
npm run job:topic-cluster
```

## Outbox Worker (Implemented)

If you write memory with `trigger_topic_cluster=true` and `topic_cluster_async=true`, the API enqueues a `memory_outbox` item.

If you write memory with `auto_embed=true` and the server has an embedding provider configured, the API enqueues an `event_type=embed_nodes` item to backfill embeddings asynchronously.

Process it with:

```bash
npm run job:outbox-worker
```

Run once:

```bash
npm run job:outbox-worker -- --once
```

## Consistency Check (Offline)

Read-only integrity checks to catch silent data corruption and state inconsistencies.

```bash
npm run job:consistency-check
```

Options:

- `--scope <scope>` (default: `MEMORY_SCOPE`)
- `--sample <n>` (default: `20`, max `200`)
- `--check-set <all|scope|cross_tenant>` (default: `all`)
- `--strict` (non-zero exit if any **errors**)
- `--strict-warnings` (non-zero exit if any errors **or warnings**)

Large-tenant operation tip (split fast scope checks from global cross-tenant checks):

```bash
npm run job:consistency-check:scope -- --scope default --strict-warnings
npm run job:consistency-check:cross-tenant -- --strict-warnings
```

Cross-tenant integrity checks (Phase C) are included by default:

- `tenant_scope_key_malformed`
- `cross_tenant_edge_scope_mismatch`
- `cross_tenant_rule_def_scope_mismatch`
- `cross_tenant_rule_feedback_scope_mismatch`
- `cross_tenant_outbox_scope_mismatch`
- `cross_tenant_commit_parent_scope_mismatch`

## Quality Eval (Offline)

Read-only long-horizon quality snapshot for drift monitoring and operator gating.

```bash
npm run job:quality-eval
```

Options:

- `--scope <scope>` (default: `MEMORY_SCOPE`)
- `--min-ready-ratio <0..1>` (default: `0.8`)
- `--max-alias-rate <0..1>` (default: `0.3`)
- `--max-archive-ratio <0..1>` (default: `0.95`)
- `--min-fresh-30d-ratio <0..1>` (default: `0.2`)
- `--strict` (exit code `2` if any check fails)

Phase-4 lifecycle smoke (API + jobs together):

```bash
npm run e2e:phase4-smoke
```

Phase-C tenant isolation e2e:

```bash
npm run e2e:phasec-tenant
```

## Health Gate (Operator/CI)

Single command to gate deployments with both integrity and quality checks.

```bash
npm run job:health-gate
```

Default behavior includes a pre-gate `embedding_model` backfill pass to auto-heal historical READY rows with missing model labels.
If model/provider cannot be inferred from env, pre-backfill is skipped (and no `unknown:*` label is written).
It also runs a pre-gate private-lane owner backfill to heal rows where `memory_lane=private` but owner fields are empty.

Disable pre-backfill:

```bash
npm run job:health-gate -- --skip-backfill
```

Disable private-lane owner pre-backfill:

```bash
npm run job:health-gate -- --skip-private-lane-backfill
```

Tune private-lane owner pre-backfill:

```bash
npm run job:health-gate -- --private-lane-backfill-limit 5000 --private-lane-default-owner-agent agent_a
```

Strict warnings mode:

```bash
npm run job:health-gate -- --strict-warnings
```

Exit codes:
- `0`: gate passed
- `2`: gate failed (consistency/quality thresholds)
- `1`: runtime or usage error

## Embedding Model Backfill (Offline)

Backfill `memory_nodes.embedding_model` for older READY rows that were embedded before the column existed.

```bash
npm run job:embedding-model-backfill -- --dry-run
npm run job:embedding-model-backfill -- --limit 5000
```

Options:

- `--scope <scope>` (default: `MEMORY_SCOPE`)
- `--limit <n>` (default: `5000`, max: `50000`)
- `--model <string>` (optional; defaults to current embedding provider name if configured)
- `--dry-run`

## Private Rule Owner Backfill (Offline)

Repair legacy `type=rule` rows where `memory_lane=private` but owner fields are missing.
This is the operational companion for the hard guard introduced by migration `0014_private_rule_owner_guard.sql`.

```bash
npm run job:private-rule-owner-backfill -- --dry-run --limit 5000
npm run job:private-rule-owner-backfill -- --limit 5000
```

Default behavior:

- first tries to set `owner_agent_id` from `producer_agent_id`
- if still unresolved, optionally downgrades to `memory_lane=shared` (default enabled)

Options:

- `--scope <scope>` (default: `MEMORY_SCOPE`)
- `--limit <n>` (default: `5000`, max: `50000`)
- `--sample <n>` (default: `20`, max: `200`)
- `--default-owner-agent <id>` (optional fallback owner)
- `--default-owner-team <id>` (optional fallback team owner when no agent owner exists)
- `--no-shared-fallback` (leave unresolved rows untouched)
- `--dry-run`

## Private Lane Owner Backfill (Offline)

Repair legacy rows where `memory_lane=private` but owner fields are missing (all node types, not only `rule`).

```bash
npm run job:private-lane-owner-backfill -- --dry-run --limit 5000
npm run job:private-lane-owner-backfill -- --limit 5000
```

Default behavior:

- first tries to set `owner_agent_id` from `producer_agent_id`
- if still unresolved, optionally downgrades to `memory_lane=shared` (default enabled)

Options:

- `--scope <scope>` (default: `MEMORY_SCOPE`)
- `--limit <n>` (default: `5000`, max: `50000`)
- `--sample <n>` (default: `20`, max: `200`)
- `--default-owner-agent <id>` (optional fallback owner)
- `--default-owner-team <id>` (optional fallback team owner when no agent owner exists)
- `--no-shared-fallback` (leave unresolved rows untouched)
- `--dry-run`

## Outbox Replay (Implemented)

Once an outbox item exceeds `OUTBOX_MAX_ATTEMPTS`, the worker marks it as **FAILED** (`failed_at` set). Failed items are not claimed again until replayed.

Replay examples:

```bash
# replay a single outbox row
npm run job:outbox-replay -- --id 123 --dry-run
npm run job:outbox-replay -- --id 123

# replay all failed embed backfill jobs (up to 200 rows)
npm run job:outbox-replay -- --event-type embed_nodes --limit 200 --dry-run
npm run job:outbox-replay -- --event-type embed_nodes --limit 200
```

## Idempotency Notes

- Outbox items use deterministic `job_key` to prevent duplicate enqueues for the same logical job.
- `embed_nodes` is safe to run more than once (it skips nodes already `embedding_status=ready`).
- `topic_cluster` is safe to run more than once (edges use stable ids + unique constraints).

## Rule Promotion Suggest (Offline)

Read-only helper to list **SHADOW** rules that appear ready to promote to **ACTIVE** based on feedback stats.
This job never mutates rule state.

```bash
npm run job:rule-promotion-suggest
```

Options:

- `--scope <scope>` (default: `MEMORY_SCOPE`)
- `--limit <n>` (default: `50`, max `500`) number of SHADOW rules to scan (ordered by score desc)
- `--min-positives <n>` (default: `10`)
- `--max-neg-ratio <float>` (default: `0.1`)
- `--min-score <n>` (default: `min_positives - 1`)
- `--no-json` omit `if_json/then_json/exceptions_json` from output
- `--strict` exit with code `2` if any suggestions are found

## Phase-D Performance Jobs (Scale Validation)

### Synthetic Dataset Seed

Generate a large tenant-aware benchmark dataset (topics + events + part_of/derived_from edges):

```bash
npm run job:perf-seed -- --scope perf --tenant-id default --src-scope default --src-tenant-id default --events 50000 --topics 500 --reset
```

Notes:

- uses one existing READY embedding from source scope as vector payload
- writes all rows under a dedicated commit (`actor=job:perf_seed`)
- sets `memory_lane=shared` so recall benchmarks are visible without owner filters

### API Latency Benchmark

Measure recall/write latency percentiles (p50/p95/p99) with configurable concurrency:

```bash
npm run job:perf-benchmark -- --base-url http://localhost:3001 --scope perf --tenant-id default --mode all --warmup 20 --recall-requests 200 --recall-concurrency 12 --write-requests 80 --write-concurrency 4
```

Auth handling:

- for `MEMORY_AUTH_MODE=api_key` or `api_key_or_jwt`, script auto-picks the first key from `MEMORY_API_KEYS_JSON`
- override with `PERF_API_KEY=...`
- for JWT mode set `PERF_AUTH_BEARER=...`

### Worker Throughput Benchmark

Benchmark outbox worker throughput by repeating `--once` loops:

```bash
npm run job:perf-worker-benchmark -- --scope default --iterations 5
```

Output includes:

- processed/sec
- claimed/processed totals
- per-iteration elapsed/processed
- outbox before/after snapshot

### Performance Report Generator

Aggregate matrix artifacts to markdown report:

```bash
npm run job:perf-report -- --dir /Users/lucio/Desktop/Aionis/artifacts/perf/<run_id> --output /Users/lucio/Desktop/Aionis/artifacts/perf/<run_id>/PERFORMANCE_REPORT_V1.md
```

### One-Command Matrix Runner

Run multi-scale seed + benchmark + explain + report:

```bash
npm run perf:phase-d-matrix
```

Useful env overrides:

- `SCALES=100000,300000,1000000`
- `BASE_URL=http://localhost:3001`
- `SCOPE_PREFIX=perf_d`
- `TENANT_ID=default`
- `OUT_DIR=/Users/lucio/Desktop/Aionis/artifacts/perf/custom_run`

## Consolidation Candidates (Offline, Shadow Mode)

Read-only helper to score near-duplicate candidates for Phase 3 consolidation.
This job never mutates nodes/edges; it outputs ranked merge candidates only.

```bash
npm run job:consolidation-candidates
```

Options:

- `--scope <scope>` (default: `MEMORY_SCOPE`)
- `--types <csv>` (default: `topic,concept,entity`)
- `--max-anchors <n>` (default: `MEMORY_CONSOLIDATION_MAX_ANCHORS`)
- `--neighbors-per-node <n>` (default: `MEMORY_CONSOLIDATION_NEIGHBORS_PER_NODE`)
- `--min-vector <float>` (default: `MEMORY_CONSOLIDATION_MIN_VECTOR_SIM`)
- `--min-score <float>` (default: `MEMORY_CONSOLIDATION_MIN_SCORE`)
- `--max-pairs <n>` (default: `MEMORY_CONSOLIDATION_MAX_PAIRS`)
- `--conflict-min-shared-tokens <n>` (default: `MEMORY_CONSOLIDATION_CONFLICT_MIN_SHARED_TOKENS`)
- `--conflict-negation-lexical-min <float>` (default: `MEMORY_CONSOLIDATION_CONFLICT_NEGATION_LEXICAL_MIN`)
- `--no-summary` hide text summaries in output payload
- `--strict` exit with code `2` if any suggestions are found

Output also includes a normalized merge protocol payload:

- `merge_protocol_version = "consolidation_candidate_v1"`
- `merge_candidates_v1[]` (pair + evidence + conflict details)

Quick smoke:

```bash
./examples/consolidation_candidates.sh 50
```

## Consolidation Apply (Offline, Guarded)

Apply `alias_of/superseded_by` canonicalization for top consolidation candidates.
Default mode is dry-run; no mutations happen unless `--apply` is set.

```bash
# dry-run (default)
npm run job:consolidation-apply -- --limit-apply 20

# apply mutations (writes commit + updates node slots)
npm run job:consolidation-apply -- --apply --limit-apply 20
```

Options:

- `--scope <scope>` (default: `MEMORY_SCOPE`)
- same scoring options as `job:consolidation-candidates`
- `--limit-apply <n>` (default: `20`) max pairs to canonicalize per run
- `--apply` required to persist updates
- contradictory topic/concept candidates are blocked by default (`MEMORY_CONSOLIDATION_BLOCK_CONTRADICTORY=true`)
- `--allow-contradictory` bypasses the contradiction guard for one run (audited in slots + commit diff)

Output includes merge protocol views for orchestration/UI:

- `merge_protocol_version`
- `merge_candidates_v1[]`
- `planned_apply_v1[]`

Quick smoke:

```bash
# dry-run
./examples/consolidation_apply.sh 10 dry-run

# apply
./examples/consolidation_apply.sh 10 apply
```

## Consolidation Edge Redirect (Offline, Guarded)

Redirect edges from aliased nodes (`slots.alias_of`) to their canonical nodes.
Default mode is dry-run; no mutations happen unless `--apply` is set.

```bash
# dry-run
npm run job:consolidation-redirect-edges

# apply
npm run job:consolidation-redirect-edges -- --apply
```

Options:

- `--scope <scope>` (default: `MEMORY_SCOPE`)
- `--max-aliases <n>` (default: `MEMORY_CONSOLIDATION_REDIRECT_MAX_ALIASES`)
- `--max-edges-per-alias <n>` (default: `MEMORY_CONSOLIDATION_REDIRECT_MAX_EDGES_PER_ALIAS`)
- `--apply` required to persist updates

Quick smoke:

```bash
# dry-run
./examples/consolidation_redirect_edges.sh dry-run

# apply
./examples/consolidation_redirect_edges.sh apply
```
