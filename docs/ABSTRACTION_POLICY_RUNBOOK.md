---
title: "Abstraction Policy Runbook"
---

# Abstraction Policy Runbook

Last updated: `2026-02-23`

## Purpose

This runbook defines how to operate Aionis abstraction safely in production:

1. topic clustering behavior (`event -> topic`)
2. compression rollup behavior (`topic -> concept summary`)
3. replay / backfill flow after incidents or migrations

## Profiles

Abstraction has three policy profiles:

1. `conservative`: higher precision, lower abstraction churn
2. `balanced`: default production profile
3. `aggressive`: higher coverage and stronger summarization

Apply profile into `.env` (managed block only):

```bash
npm run -s env:abstraction:balanced
# or:
# npm run -s env:abstraction:conservative
# npm run -s env:abstraction:aggressive
```

The profile manages:

1. `MEMORY_ABSTRACTION_POLICY_PROFILE`
2. `TOPIC_SIM_THRESHOLD`
3. `TOPIC_MIN_EVENTS_PER_TOPIC`
4. `TOPIC_CLUSTER_BATCH_SIZE`
5. `TOPIC_MAX_CANDIDATES_PER_EVENT`
6. `MEMORY_COMPRESSION_LOOKBACK_DAYS`
7. `MEMORY_COMPRESSION_TOPIC_MIN_EVENTS`
8. `MEMORY_COMPRESSION_MAX_TOPICS_PER_RUN`
9. `MEMORY_COMPRESSION_MAX_EVENTS_PER_TOPIC`
10. `MEMORY_COMPRESSION_MAX_TEXT_LEN`

## Backfill / Replay

### Topic clustering replay

Run once:

```bash
npm run -s job:topic-cluster
```

Run until queue is drained (batch replay):

```bash
for i in $(seq 1 20); do
  out="$(npm run -s job:topic-cluster)"
  echo "$out" | jq '{ok, processed_events, assigned, created_topics, promoted, quality}'
  processed="$(echo "$out" | jq -r '.processed_events // 0')"
  if [[ "$processed" == "0" ]]; then
    break
  fi
done
```

### Compression rollup replay

```bash
npm run -s job:compression-rollup
```

For long backlog replay, run in bounded rounds:

```bash
for i in $(seq 1 10); do
  out="$(npm run -s job:compression-rollup)"
  echo "$out" | jq '{ok, scanned_topics, compressed_topics, created_summaries, updated_summaries, unchanged_summaries, citations_written}'
done
```

## Verification

Quality snapshot:

```bash
npm run -s job:quality-eval -- --scope "${SCOPE:-default}"
```

Core production gate (artifacts include abstraction counters):

```bash
npm run -s gate:core:prod -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope "${SCOPE:-default}" \
  --run-perf true
```

Check in gate summary:

1. `blocking_metrics.abstraction_quality_counters.profile`
2. `blocking_metrics.abstraction_quality_counters.observed.compression_summaries`
3. `blocking_metrics.abstraction_quality_counters.observed.cluster_cohesion`
4. `blocking_metrics.abstraction_quality_counters.observed.cluster_orphan_rate`
5. `blocking_metrics.abstraction_quality_counters.observed.cluster_merge_rate_30d`

## Rollback

If abstraction quality regresses:

1. Switch to conservative profile:

```bash
npm run -s env:abstraction:conservative
```

2. Restart API and worker.
3. Re-run `job:quality-eval` and `gate:core:prod`.
4. If needed, pause aggressive replay and keep only topic cluster until drift stabilizes.
