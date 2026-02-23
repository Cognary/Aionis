---
title: "API Contract (Hard)"
---

# API Contract (Hard)

This document defines **hard, server-enforced contracts** for Aionis Memory Graph API responses. These rules exist to prevent:

- accidental data exfiltration via embeddings
- response-size explosions (tokens, bandwidth, client memory)
- future regressions when subgraph expansion adds more nodes/edges

## Guiding Rules (A/B/C)

**A. Product boundary (safety/usability)**  
Embeddings are **never returned by default**. Debug embeddings are a privileged channel with strict caps.

**B. API contract (stability)**  
All outward responses are **DTO-whitelisted** (no accidental new fields).

**C. Query/perf boundary (stop-the-bleed)**  
The DB layer uses explicit `SELECT` lists and **does not fetch embeddings** unless debug mode explicitly requests a bounded preview.

## Tenant Isolation (P2.5)

- All memory endpoints support `tenant_id?: string` (default: `MEMORY_TENANT_ID`, normally `default`).
- Header fallback is supported:
  - if request body omits `tenant_id`, server reads `X-Tenant-Id`.
- Isolation key is `(tenant_id, scope)` (internally encoded as a tenant-aware scope key).
- Backward compatibility:
  - `tenant_id=default` keeps legacy single-tenant scope behavior.
- Scope naming:
  - `scope` must be non-empty
  - `scope` must not start with reserved prefix `tenant:` (reserved for internal tenant-derived scope keys)

## Auth Identity Mapping (Phase C MVP)

- Runtime mode presets:
  - `AIONIS_MODE=local` => defaults to dev-safe local settings (`APP_ENV=dev`, `MEMORY_AUTH_MODE=off`)
  - `AIONIS_MODE=service` => defaults to service production baseline (`APP_ENV=prod`, `MEMORY_AUTH_MODE=api_key`)
  - `AIONIS_MODE=cloud` => defaults to cloud production baseline (`APP_ENV=prod`, `MEMORY_AUTH_MODE=api_key_or_jwt`)
  - explicit env vars always override mode defaults
- Optional global mode: `MEMORY_AUTH_MODE=api_key`
- Key registry: `MEMORY_API_KEYS_JSON` (`{ "<api-key>": { tenant_id, agent_id?, team_id?, role? } }`)
- JWT mode: `MEMORY_AUTH_MODE=jwt` (or `api_key_or_jwt`) with `Authorization: Bearer <jwt>`
  - HS256 secret: `MEMORY_JWT_HS256_SECRET`
  - claims: `tenant_id` (or `tenant`) required; `agent_id`/`sub`, `team_id`, `role` optional
  - time validation: `exp`/`nbf` with `MEMORY_JWT_CLOCK_SKEW_SEC`
  - `APP_ENV=prod`: `exp` is required (tokens without `exp` are rejected)
  - hardening recommendation: include `iss` and `aud` claims and enforce them at your token issuer/gateway policy
- In `api_key` mode:
  - all `/v1/memory/*` endpoints require `X-Api-Key`
  - request tenant must match key-bound tenant (`401/403` on failure)
  - identity fields are auto-injected when omitted:
    - recall: `consumer_agent_id`, `consumer_team_id`
    - write: `producer_agent_id` (and owner fallback)
    - rules/tools context: `context.agent.id`, `context.agent.team_id`
  - identity mismatch in caller-provided fields returns `403 identity_mismatch`

## Tenant Quotas (Phase C MVP)

- Enabled by `TENANT_QUOTA_ENABLED=true`.
- Buckets are tenant-scoped and per-process:
  - recall: `TENANT_RECALL_RATE_LIMIT_RPS/BURST`
  - write-like endpoints: `TENANT_WRITE_RATE_LIMIT_RPS/BURST`
  - debug embeddings: `TENANT_DEBUG_EMBED_RATE_LIMIT_RPS/BURST`
- On exceed:
  - HTTP `429`
  - `retry-after` header
  - error codes:
    - `tenant_rate_limited_recall`
    - `tenant_rate_limited_write`
    - `tenant_rate_limited_debug_embeddings`

---

## Endpoints

### `POST /v1/memory/write`

Source-of-record write endpoint.  
Writes nodes/edges into commit chain; embedding/topic processing can run asynchronously and must not block core write success.

**Request**
- `tenant_id?: string`
- `scope?: string`
- `actor?: string`
- `parent_commit_id?: string(uuid)`
- `input_text?: string`
- `input_sha256?: string(64 hex)` (required with `input_text` fallback rule below)
- `model_version?: string`
- `prompt_version?: string`
- `auto_embed?: boolean`
- `force_reembed?: boolean`
- `memory_lane?: "private"|"shared"`
- `producer_agent_id?: string`
- `owner_agent_id?: string`
- `owner_team_id?: string`
- `trigger_topic_cluster?: boolean`
- `topic_cluster_async?: boolean`
- `nodes?: WriteNode[]`
- `edges?: WriteEdge[]`

Validation hard rules:
- must provide `input_text` or `input_sha256`
- private lane `rule` nodes require `owner_agent_id` or `owner_team_id`
- edge refs must resolve by `id` or `client_id`

**Response**
- `tenant_id: string`
- `scope: string`
- `commit_id: string`
- `commit_hash: string`
- `nodes: { id, client_id?, type }[]`
- `edges: { id, type, src_id, dst_id }[]`
- `embedding_backfill?: { enqueued: true, pending_nodes: number }`
- `topic_cluster?: { ... } | { enqueued: true }`
- `shadow_dual_write?: { enabled, strict, mirrored, copied?, error? }`

### `POST /v1/memory/feedback`

Rule feedback endpoint (execution outcome loop).  
Records one feedback event and updates aggregate rule counters in same scope.

**Request**
- `tenant_id?: string`
- `scope?: string`
- `actor?: string`
- `rule_node_id: string(uuid)`
- `run_id?: string`
- `outcome: "positive"|"negative"|"neutral"`
- `note?: string`
- `input_text?: string`
- `input_sha256?: string(64 hex)`

Validation hard rules:
- must provide `input_text` or `input_sha256`
- `rule_node_id` must exist as `type='rule'` in same `(tenant_id, scope)`

**Response**
- `tenant_id: string`
- `scope: string`
- `commit_id: string`
- `commit_hash: string`
- `feedback_id: string`

### `POST /v1/memory/rules/state`

Rule lifecycle state transition endpoint.  
Updates one rule definition state (`draft/shadow/active/disabled`) under strict scope isolation.

**Request**
- `tenant_id?: string`
- `scope?: string`
- `actor?: string`
- `rule_node_id: string(uuid)`
- `state: "draft"|"shadow"|"active"|"disabled"`
- `input_text?: string`
- `input_sha256?: string(64 hex)`

Validation hard rules:
- must provide `input_text` or `input_sha256`
- `rule_node_id` must exist as `type='rule'` in same `(tenant_id, scope)`
- promotion into `shadow/active` validates rule payload shape and required scoped targets

**Response**
- `tenant_id: string`
- `scope: string`
- `commit_id: string`
- `commit_hash: string`

### `POST /v1/memory/find`

Deterministic lookup channel for exact object retrieval and attribute filters.  
Use this endpoint when you need precise object targeting (URI/id/client_id/type), and use `recall/recall_text` for semantic retrieval.

**Request**
- `tenant_id?: string`
- `scope?: string`
- `uri?: string` (`aionis://tenant/scope/type/id`)
- `id?: string` (uuid)
- `client_id?: string`
- `type?: "event"|"entity"|"topic"|"rule"|"evidence"|"concept"|"procedure"|"self_model"`
- `title_contains?: string`
- `text_contains?: string`
- `memory_lane?: "private"|"shared"`
- `slots_contains?: object` (jsonb containment filter)
- `consumer_agent_id?: string` (optional, required to read agent-owned private lane)
- `consumer_team_id?: string` (optional, required to read team-owned private lane)
- `include_meta?: boolean` (default false)
- `include_slots?: boolean` (default false)
- `include_slots_preview?: boolean` (default false)
- `slots_preview_keys?: number` (default 10, max 50)
- `limit?: number` (default 20, max 200)
- `offset?: number` (default 0, max 200000)

**Response**
- `tenant_id: string`
- `scope: string`
- `mode: "find"`
- `filters: { uri,id,client_id,type,title_contains,text_contains,memory_lane,slots_contains,consumer_agent_id,consumer_team_id }`
- `nodes: NodeDTO[]` where each node includes:
  - always: `uri`, `id`, `client_id`, `type`, `title`, `text_summary`
  - topic extras: `topic_state?`, `member_count?`
  - optional by flags: `slots`, `slots_preview`, meta fields (same meta policy as recall DTOs)
- `page: { limit, offset, returned, has_more }`

Lane visibility policy (same as recall):
- always visible: `memory_lane="shared"`
- conditionally visible: `memory_lane="private"` with owner match (`owner_agent_id == consumer_agent_id` or `owner_team_id == consumer_team_id`)
- if `consumer_agent_id`/`consumer_team_id` are omitted, private nodes are filtered out

### `POST /v1/memory/sessions`

Session-first write API. This endpoint creates or updates a session envelope while still using the same commit-chain memory write path.

**Request**
- `tenant_id?: string`
- `scope?: string`
- `actor?: string`
- `session_id: string` (required)
- `title?: string`
- `text_summary?: string`
- `input_text?: string`
- `metadata?: object`
- `auto_embed?: boolean`
- `memory_lane?: "private"|"shared"`
- `producer_agent_id?: string`
- `owner_agent_id?: string`
- `owner_team_id?: string`

**Response**
- `tenant_id: string`
- `scope: string`
- `session_id: string`
- `session_node_id: string|null`
- `session_uri: string|null` (`aionis://tenant/scope/topic/<id>`)
- `commit_id: string`
- `commit_hash: string`
- `nodes: { id, client_id?, type }[]`
- `edges: { id, type, src_id, dst_id }[]`
- `embedding_backfill?: { enqueued: true, pending_nodes: number }|null`

### `POST /v1/memory/events`

Session-first event ingestion API. This endpoint writes one event node and links it to the session with `part_of`.

**Request**
- `tenant_id?: string`
- `scope?: string`
- `actor?: string`
- `session_id: string` (required)
- `event_id?: string` (optional idempotency key; generated if omitted)
- `title?: string`
- `text_summary?: string`
- `input_text?: string`
- `metadata?: object`
- `auto_embed?: boolean`
- `memory_lane?: "private"|"shared"`
- `producer_agent_id?: string`
- `owner_agent_id?: string`
- `owner_team_id?: string`
- `edge_weight?: number` (`0..1`)
- `edge_confidence?: number` (`0..1`)

**Response**
- `tenant_id: string`
- `scope: string`
- `session_id: string`
- `event_id: string`
- `event_node_id: string|null`
- `session_node_id: string|null`
- `event_uri: string|null` (`aionis://tenant/scope/event/<id>`)
- `session_uri: string|null` (`aionis://tenant/scope/topic/<id>`)
- `commit_id: string`
- `commit_hash: string`
- `nodes: { id, client_id?, type }[]`
- `edges: { id, type, src_id, dst_id }[]`
- `embedding_backfill?: { enqueued: true, pending_nodes: number }|null`

### `GET /v1/memory/sessions/:session_id/events`

List events in one session using deterministic graph linkage (`event --part_of--> session-topic`).

**Query**
- `tenant_id?: string`
- `scope?: string`
- `consumer_agent_id?: string`
- `consumer_team_id?: string`
- `include_meta?: boolean` (default false)
- `include_slots?: boolean` (default false)
- `include_slots_preview?: boolean` (default false)
- `slots_preview_keys?: number` (default 10, max 50)
- `limit?: number` (default 20, max 200)
- `offset?: number` (default 0)

**Response**
- `tenant_id: string`
- `scope: string`
- `session: { session_id, node_id, title, text_summary, uri } | null`
- `events: EventDTO[]`
- `page: { limit, offset, returned, has_more }`

`EventDTO` always includes:
- `uri`, `id`, `client_id`, `event_id`, `type`, `title`, `text_summary`, `edge_weight`, `edge_confidence`

Optional by flags:
- `slots` or `slots_preview`
- same meta-family fields as other node DTOs when `include_meta=true`

Lane visibility policy matches `find/recall`: shared always visible; private events require owner match via `consumer_agent_id`/`consumer_team_id`.

### `POST /v1/memory/packs/export`

Export a scoped memory snapshot for migration/backup/benchmark replay.

Auth:
- Requires `X-Admin-Token`.

**Request**
- `tenant_id?: string`
- `scope?: string`
- `include_nodes?: boolean` (default true)
- `include_edges?: boolean` (default true)
- `include_commits?: boolean` (default true)
- `include_meta?: boolean` (default true)
- `max_rows?: number` (default 5000, max 50000; applied per section)

**Response**
- `tenant_id: string`
- `scope: string`
- `manifest:`
  - `version: "aionis_pack_manifest_v1"`
  - `pack_version: "aionis_pack_v1"`
  - `sha256: string` (hash over `pack` payload)
  - `generated_at: string`
  - `counts: { nodes, edges, commits }`
  - `truncated: { nodes, edges, commits }`
  - `max_rows: number`
- `pack:`
  - `version: "aionis_pack_v1"`
  - `tenant_id: string`
  - `scope: string`
  - `nodes: [...]`
  - `edges: [...]`
  - `commits: [...]`

### `POST /v1/memory/packs/import`

Import a previously exported pack into the same tenant/scope domain (hash-verified, idempotent mapping).

Auth:
- Requires `X-Admin-Token`.

**Request**
- `tenant_id?: string` (must match `pack.tenant_id` if provided)
- `scope?: string` (must match `pack.scope` if provided)
- `actor?: string`
- `verify_only?: boolean` (default false)
- `auto_embed?: boolean` (default false)
- `manifest_sha256?: string` (optional; when provided must equal hash of `pack`)
- `pack:`
  - `version: "aionis_pack_v1"`
  - `tenant_id: string`
  - `scope: string`
  - `nodes: NodePackDTO[]`
  - `edges: EdgePackDTO[]`
  - `commits: CommitPackDTO[]` (optional for import execution; retained for audit context)

**Response (`verify_only=true`)**
- `ok: true`
- `verified: true`
- `imported: false`
- `tenant_id: string`
- `scope: string`
- `pack_sha256: string`
- `planned: { nodes, edges, commits_in_pack }`

**Response (`verify_only=false`)**
- `ok: true`
- `verified: true`
- `imported: true`
- `tenant_id: string`
- `scope: string`
- `pack_sha256: string`
- `commit_id: string`
- `commit_hash: string`
- `nodes: number`
- `edges: number`
- `embedding_backfill?: { enqueued: true, pending_nodes: number } | null`

### `POST /v1/memory/recall`

Default recall knobs are profile-driven:
- base default: `MEMORY_RECALL_PROFILE`
- optional layered overrides: `MEMORY_RECALL_PROFILE_POLICY_JSON`
  - priority: `tenant_endpoint` > `tenant_default` > `endpoint` > global default
- optional adaptive downgrade on queue pressure:
  - `MEMORY_RECALL_ADAPTIVE_DOWNGRADE_ENABLED=true`
  - `MEMORY_RECALL_ADAPTIVE_WAIT_MS=<threshold>`
  - `MEMORY_RECALL_ADAPTIVE_TARGET_PROFILE=<profile>`
  - adaptive downgrade only applies when request did **not** explicitly pin recall knobs
- optional adaptive hard-cap on sustained queue pressure:
  - `MEMORY_RECALL_ADAPTIVE_HARD_CAP_ENABLED=true`
  - `MEMORY_RECALL_ADAPTIVE_HARD_CAP_WAIT_MS=<threshold>`
  - hard-cap budgets:
    - `MEMORY_RECALL_ADAPTIVE_HARD_CAP_LIMIT`
    - `MEMORY_RECALL_ADAPTIVE_HARD_CAP_NEIGHBORHOOD_HOPS`
    - `MEMORY_RECALL_ADAPTIVE_HARD_CAP_MAX_NODES`
    - `MEMORY_RECALL_ADAPTIVE_HARD_CAP_MAX_EDGES`
    - `MEMORY_RECALL_ADAPTIVE_HARD_CAP_RANKED_LIMIT`
    - `MEMORY_RECALL_ADAPTIVE_HARD_CAP_MIN_EDGE_WEIGHT`
    - `MEMORY_RECALL_ADAPTIVE_HARD_CAP_MIN_EDGE_CONFIDENCE`
  - hard-cap also applies only when request did **not** explicitly pin recall knobs

Profiles:
- `strict_edges` (default): `limit=24`, `hops=2`, `max_nodes=60`, `max_edges=80`, `ranked_limit=140`, `min_edge_weight=0.2`, `min_edge_confidence=0.2`
- `quality_first`: `limit=30`, `hops=2`, `max_nodes=80`, `max_edges=100`, `ranked_limit=180`, `min_edge_weight=0.05`, `min_edge_confidence=0.05`
- `legacy`: historical defaults (`30/2/50/100/100/0/0`)

**Request**
- `query_embedding: number[]` (required, dim=1536)
- `tenant_id?: string`
- `scope?: string`
- `recall_strategy?: "local"|"balanced"|"global"` (optional high-level retrieval preset; ignored when explicit recall knobs are provided)
- `consumer_agent_id?: string` (optional; enables lane-based visibility and read-side audit)
- `consumer_team_id?: string` (optional; used with team-private lane and team-scoped rules)
- `limit?: number` (default from recall profile, max 200)
- `neighborhood_hops?: 1|2` (default from recall profile)
- `max_nodes?: number` (default from recall profile, max 200)
- `max_edges?: number` (default from recall profile, **max 100 hard**)
- `ranked_limit?: number` (default from recall profile, max 500)
- `min_edge_weight?: number` (default from recall profile, max 1) stage-2 edge fetch filter
- `min_edge_confidence?: number` (default from recall profile, max 1) stage-2 edge fetch filter
- `context_token_budget?: number` (optional; compacts `context.text` toward token budget using conservative estimation, keeps `items/citations` intact)
- `context_char_budget?: number` (optional; direct char budget override for `context.text`; takes precedence over token budget)
- `context_compaction_profile?: "balanced"|"aggressive"` (optional; section-level compaction preset, default `balanced`)
- `include_meta?: boolean` (default false)
- `include_slots?: boolean` (default false)
- `include_slots_preview?: boolean` (default false)
- `slots_preview_keys?: number` (default 10, max 50)
- `return_debug?: boolean` (default false)
- `include_embeddings?: boolean` (default false; **debug-only**, see below)
- Rules (optional planner injection):
  - `rules_context?: any` (normalized planner context object; see `docs/PLANNER_CONTEXT.md`)
  - `rules_include_shadow?: boolean` (default false)
  - `rules_limit?: number` (default 50, max 200)

**Response**
- `tenant_id: string`
- `scope: string`
- `seeds: { id,type,title,text_summary,tier,salience,confidence,similarity }[]`
- `ranked: { id, activation, score }[]` (bounded by `ranked_limit`)
- `subgraph: { nodes: NodeDTO[], edges: EdgeDTO[] }`
- `context: { text: string, items: any[], citations: any[] }`
- `rules?: { scope, considered, matched, skipped_invalid_then, invalid_then_sample, applied }` (only when `rules_context` is provided)
- `debug?: { neighborhood_counts: { nodes:number, edges:number }, embeddings?: DebugEmbeddingDTO[], context_compaction?: { profile, token_budget, char_budget, applied, before_chars, after_chars, before_est_tokens, after_est_tokens, dropped_lines, dropped_by_section } }` (only when `return_debug=true`)
- `trajectory?: { strategy, layers, budgets, pruned_reasons }` (stage-level explain block for L0/L1/L2 flow)
  - `observability?: { stage_timings_ms, inflight_wait_ms, adaptive, stage1, neighborhood_counts }`
    - `stage_timings_ms` includes per-stage timing slices (`stage1_candidates_ann_ms`, `stage2_edges_ms`, `stage3_context_ms`, etc.)
    - `adaptive.profile` / `adaptive.hard_cap` expose queue-pressure downgrade decisions
    - `stage1` includes ANN vs exact-fallback mode and seed counters when available
  - `layers[0]` (`L0`): `{ hits, ann_seed_candidates, mode, exact_fallback_attempted, duration_ms, pruned_reasons[] }`
  - `layers[1]` (`L1`): `{ hits, edges, candidate_nodes, candidate_edges, dropped_nodes, dropped_edges, duration_ms, pruned_reasons[] }`
  - `layers[2]` (`L2`): `{ context_chars, duration_ms, pruned_reasons[] }`
  - common `pruned_reasons` include (when applicable):
    - `seed_empty`
    - `exact_fallback_empty`
    - `ann_empty_recovered_by_exact_fallback`
    - `max_nodes_cap`
    - `max_edges_cap`
    - `edge_quality_thresholds_active`
    - `seed_visibility_or_state_filtered`
    - `context_empty_no_nodes`
    - `context_empty_after_compaction_or_missing_text`

**NodeDTO (whitelist)**
- Always: `id`, `type`, `title`, `text_summary`
- For topics: `topic_state?`, `member_count?`
- For compression summaries:
  - `type="concept"` with `slots.summary_kind="compression_rollup"` (only if `include_slots=true`)
- Slots:
  - `include_slots=true`: `slots`
  - `include_slots_preview=true`: `slots_preview` (top `slots_preview_keys`, sorted by key)
- Meta (only when `include_meta=true`):
  - `raw_ref`, `evidence_ref`, `embedding_status`, `embedding_model`, `memory_lane`, `producer_agent_id`, `owner_agent_id`, `owner_team_id`, `created_at`, `updated_at`, `last_activated`, `salience`, `importance`, `confidence`, `commit_id`

**EdgeDTO (whitelist)**
- Always: `from_id`, `to_id`, `type`, `weight`
- Meta (only when `include_meta=true`): `commit_id`

---

### `POST /v1/memory/recall_text`

Server embeds `query_text` using the configured embedding provider, then calls the same recall pipeline as `/recall`.
This includes the same profile policy, adaptive downgrade, and adaptive hard-cap behavior.

**Request**
- Same fields as `/recall`, except:
  - `query_text: string` (required)
  - `recall_strategy?: "local"|"balanced"|"global"` (same semantics as `/recall`)
  - server can apply default `context_token_budget` when request omits both compaction fields:
    - `MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT` (`0` disables)

**Response**
- Same as `/recall`, plus:
  - `query: { text: string, embedding_provider: string }`
- `trajectory?: { strategy, layers, budgets, pruned_reasons }` (same shape and semantics as `/recall`)
- `observability?: { stage_timings_ms, inflight_wait_ms, adaptive, stage1, neighborhood_counts }` (same shape as `/recall`)

**Upstream embedding failure mapping (`/recall_text`)**
- provider throttled / rate limited: `429 upstream_embedding_rate_limited` (+ `retry-after`)
- provider timeout / unavailable: `503 upstream_embedding_unavailable` (+ `retry-after`)
- provider malformed response: `502 upstream_embedding_bad_response`
- server should not expose generic `500` for known upstream embedding failures

---

### `POST /v1/memory/planning/context`

One-call planner surface that composes:

1. semantic recall from `query_text`
2. rule evaluation on the same `context`
3. optional tool selection when `tool_candidates` is supplied

This endpoint is designed for planner/executor integration where you want one request for memory context + policy + tool decision.

**Request**
- `query_text: string` (required)
- `context: any` (required; recommended normalized planner context)
- `tenant_id?: string`
- `scope?: string`
- `recall_strategy?: "local"|"balanced"|"global"`
- `consumer_agent_id?: string`
- `consumer_team_id?: string`
- `include_shadow?: boolean` (default `false`)
- `rules_limit?: number` (default `50`, max `200`)
- `run_id?: string` (optional tool-decision provenance id)
- `tool_candidates?: string[]` (optional; if omitted, tool selection is skipped)
- `tool_strict?: boolean` (default `true`; only used when `tool_candidates` is provided)
- recall knobs and response flags (same semantics as `/recall_text`):
  - `limit`, `neighborhood_hops`, `max_nodes`, `max_edges`, `ranked_limit`
  - `min_edge_weight`, `min_edge_confidence`
  - `return_debug`, `include_embeddings`, `include_meta`, `include_slots`, `include_slots_preview`, `slots_preview_keys`
  - `context_token_budget`, `context_char_budget`, `context_compaction_profile`

**Response**
- `tenant_id: string`
- `scope: string`
- `query: { text: string, embedding_provider: string }`
- `recall: RecallResponse`
  - same structure as `/recall_text`, plus `trajectory` and `observability`
- `rules: RulesEvaluateResponse`
  - same structure as `/v1/memory/rules/evaluate`
- `tools?: ToolsSelectResponse`
  - present only when request includes `tool_candidates`
  - same structure as `/v1/memory/tools/select`

Notes:
- Embedding error mapping follows `/recall_text`.
- Rate limiting / tenant quota / inflight gate class is `recall`.
- Identity enforcement:
  - `consumer_agent_id` / `consumer_team_id` are checked against authenticated principal
  - `context.agent.id` / `context.agent.team_id` are also checked/injected when auth is enabled

---

### `GET /v1/admin/control/diagnostics/tenant/:tenant_id`

Structured operability snapshot for recall pipeline + outbox health.

**Headers**
- `X-Admin-Token: <ADMIN_TOKEN>`

**Query**
- `scope?: string` (optional; narrow diagnostics to one logical scope)
- `window_minutes?: number` (optional; default `60`, min `5`, max `1440`)

**Response**
- `ok: true`
- `diagnostics: { ... }`
  - `tenant_id`, `scope`, `window_minutes`, `generated_at`
  - `request_telemetry.endpoints[]`:
    - `endpoint`, `total`, `errors`, `error_rate`, `latency_p50_ms`, `latency_p95_ms`, `latency_p99_ms`
  - `recall_pipeline`:
    - `total`, `empty_seed`, `empty_nodes`, `empty_edges`
    - `empty_seed_rate`, `empty_node_rate`, `empty_edge_rate`
    - `seed_avg`, `node_avg`, `edge_avg`
  - `outbox`:
    - `totals: { pending, retrying, failed, oldest_pending_age_sec }`
    - `by_event_type[]: { event_type, pending, retrying, failed, oldest_pending_age_sec }`

---

### `POST /v1/admin/control/alerts/routes`

Create an alert delivery route.

**Headers**
- `X-Admin-Token: <ADMIN_TOKEN>`

**Request**
- `tenant_id: string`
- `channel: "webhook"|"slack_webhook"|"pagerduty_events"`
- `label?: string|null`
- `events?: string[]` (default `["*"]`)
- `status?: "active"|"disabled"` (default `"active"`)
- `target: string` (required)
- `secret?: string|null`
- `headers?: Record<string,string>`
- `metadata?: Record<string,unknown>`

**Target validation**
- `target` must be an absolute `https://` URL.
- URL credentials (`user:pass@`) are rejected.
- Host must be publicly routable (no loopback/private/reserved/local-internal hosts).
- Channel-specific host constraints:
  - `slack_webhook`: `hooks.slack.com` or `hooks.slack-gov.com`
  - `pagerduty_events`: `events.pagerduty.com` or `events.eu.pagerduty.com`

**Errors**
- `400 invalid_alert_target`

---

### `GET /v1/admin/control/alerts/routes`

List alert routes.

**Headers**
- `X-Admin-Token: <ADMIN_TOKEN>`

**Query**
- `tenant_id?: string`
- `channel?: "webhook"|"slack_webhook"|"pagerduty_events"`
- `status?: "active"|"disabled"`
- `limit?: number`
- `offset?: number`

**Response**
- `ok: true`
- `routes: AlertRoute[]`

---

### `POST /v1/admin/control/incident-publish/jobs`

Enqueue one incident bundle publish job.

**Headers**
- `X-Admin-Token: <ADMIN_TOKEN>`

**Request**
- `tenant_id: string`
- `run_id: string`
- `source_dir: string` (required)
- `target: string` (required)
- `max_attempts?: number` (`1..100`, default `5`)
- `metadata?: Record<string,unknown>`

**Input constraints**
- `source_dir`:
  - must be an absolute local POSIX path
  - must not be `/`
  - must not contain dot segments (`.` / `..`)
  - must not be a URI
- `target`:
  - must be an absolute URI with one of: `https`, `s3`, `gs`, `az`, `abfs`, `oci`, `arn`
  - local filesystem paths are rejected
  - `https` targets must use publicly routable hosts
  - URL credentials are rejected

**Errors**
- `400 invalid_incident_publish_source_dir`
- `400 invalid_incident_publish_target`

---

### `GET /v1/admin/control/incident-publish/jobs`

List incident publish jobs.

**Headers**
- `X-Admin-Token: <ADMIN_TOKEN>`

**Query**
- `tenant_id?: string`
- `status?: "pending"|"processing"|"succeeded"|"failed"|"dead_letter"`
- `limit?: number`
- `offset?: number`

**Response**
- `ok: true`
- `jobs: IncidentPublishJob[]`

---

### `POST /v1/admin/control/incident-publish/jobs/replay`

Replay failed/dead-letter incident publish jobs.

**Headers**
- `X-Admin-Token: <ADMIN_TOKEN>`

**Request**
- `tenant_id?: string`
- `statuses?: ("failed"|"dead_letter")[]`
- `ids?: uuid[]`
- `limit?: number` (`1..200`)
- `reset_attempts?: boolean`
- `reason?: string`
- `dry_run?: boolean`
- `allow_all_tenants?: boolean` (required when `tenant_id` omitted)

**Response**
- `ok: true`
- `dry_run: boolean`
- `selected_count: number`
- `updated_count: number`
- `sample: IncidentPublishJob[]`

---

## Hard Constraints: Debug Embeddings

Debug embeddings are the most likely “silent data export” channel. The server enforces all of the following:

**Allowed iff all conditions are met**
1. `return_debug=true` AND `include_embeddings=true`
2. Request is authorized via:
   - `X-Admin-Token` header matching `ADMIN_TOKEN`, OR
   - `ADMIN_TOKEN` is unset AND `NODE_ENV != production` AND the request is from loopback (`127.0.0.1` / `::1`)
3. `limit <= 20` (hard)

**What is returned**
- Embeddings are **never included** in `subgraph.nodes`.
- If allowed, the response includes `debug.embeddings` with **bounded previews** only:
  - max **5** seed nodes
  - `preview` first **16** dims only
  - `sha256` of the full vector text (integrity/debug)
  - hard size cap: `max_debug_bytes = 64KB` (exceeding this returns `400`)

---

## Draft Topics and Explainability

- Draft topics (`topic_state=draft`) are **excluded from scoring** and cannot influence ranking.
- For explainability, the server may append (or, if `max_nodes` is already full, swap in) a small number of draft topics into the returned subgraph (bounded by `max_nodes`) when they are strongly connected (`part_of` / `derived_from`) to top nodes.

## Compression Preference in `recall_text`

- When compression concept summaries are present in ranked context, `context.text` prefers summary-first rendering and reduces raw event fanout.
- In compression mode, events already cited by selected compression summaries are excluded from context event listing to avoid duplicate token spend.
- Compression summaries must remain evidence-backed through citations and graph edges (`derived_from`).
- When `context_token_budget` or `context_char_budget` is set, Aionis compacts `context.text` by dropping lower-priority detail lines first (evidence fanout and verbose rule lines), while preserving structured `context.items` and `context.citations`.
- `context_compaction_profile` presets:
  - `balanced`: keeps richer rule/event details when budget allows.
  - `aggressive`: trims event fanout and verbose rule JSON earlier, preserving topic/concept and rule summary lines first.

---

## Embedding Readiness (Derived Artifacts)

Embeddings are treated as **derived artifacts**:
- `/v1/memory/write` may accept nodes without embeddings and backfill them asynchronously.
- `/v1/memory/recall*` only uses nodes with `embedding_status=ready` as vector seeds and as activatable content sources for ranking. Nodes not ready are not returned by default.
- Default active recall tiers are `hot` + `warm` (cold/archive are non-default memory layers).

## Multi-Agent Lane Semantics (P2 MVP)

Write-time fields (optional):
- top-level: `memory_lane?: "private"|"shared"`, `producer_agent_id?`, `owner_agent_id?`, `owner_team_id?`
- node-level overrides: same keys on each node

Behavior:
- New writes default to `memory_lane="private"` unless explicitly overridden.
- Legacy rows are backfilled as `shared` via migration to preserve compatibility.
- Hard guard (DB + API):
  - `type="rule"` with `memory_lane="private"` must set at least one owner:
    - `owner_agent_id` OR `owner_team_id`
  - Violations are rejected at write/promote time (`invalid_private_rule_owner`).
  - DB constraint: `0014_private_rule_owner_guard.sql` (`NOT VALID`, enforced for new rows).
- If `consumer_agent_id` is provided on recall:
  - visible: `shared`
  - visible: `private` + `owner_agent_id == consumer_agent_id`
  - visible: `private` + `owner_team_id == consumer_team_id` (when team id provided)
- Recall read-side audit is recorded in `memory_recall_audit` (best-effort, non-blocking).

## Consolidation Canonicalization (Phase 3)

- Canonicalization is implemented as offline jobs and writes only node `slots` metadata:
  - duplicate node: `alias_of`, `superseded_by`
  - canonical node: `merged_from[]`, `merged_count`
- Consolidation apply includes contradiction guardrails for `topic`/`concept`:
  - candidates with opposing polarity/negation semantics are skipped by default (`contradictory_candidate`)
  - explicit override is possible only in offline job mode (`--allow-contradictory`), and is audit-marked in slots/commit diff
- Edge redirection is also offline-job driven: aliased node incident edges are redirected to canonical nodes with conflict-safe upsert semantics.
- Default mode is dry-run; explicit apply is required.
- API contract remains stable: these fields are visible only when `include_slots=true` (or via `slots_preview`).

## Archive Rehydrate (Phase 4)

### `POST /v1/memory/archive/rehydrate`

On-demand retrieval policy for long-horizon memory: selectively rehydrate archived/cold nodes into active tiers.

**Request**
- `tenant_id?: string`
- `scope?: string`
- `actor?: string`
- `node_ids?: uuid[]` (1..200)
- `client_ids?: string[]` (1..200)
- `target_tier?: "warm"|"hot"` (default `warm`)
- `reason?: string`
- `input_text` or `input_sha256` (required)

At least one of `node_ids` or `client_ids` must be provided.

**Behavior**
- Only nodes whose current tier rank is below `target_tier` are moved.
  - e.g. `archive -> warm`, `cold -> warm`, `warm -> hot`
- Moved nodes get:
  - `last_activated=now()`
  - slots markers: `last_rehydrated_at`, `last_rehydrated_job`, `last_rehydrated_from_tier`, `last_rehydrated_to_tier`, `last_rehydrated_reason`, `last_rehydrated_input_sha256`
- Writes are commit-audited via `memory_commits`.

**Response**
- `tenant_id`, `scope`, `target_tier`
- `commit_id`, `commit_hash` (null when nothing moved)
- `rehydrated`: requested/resolved/moved/noop/missing counters + ids

## Node Activation / Feedback (Adaptive Decay Signals)

### `POST /v1/memory/nodes/activate`

Ingest node-level activity and optional positive/negative signal, used by adaptive decay.

**Request**
- `tenant_id?: string`
- `scope?: string`
- `actor?: string`
- `node_ids?: uuid[]` (1..200)
- `client_ids?: string[]` (1..200)
- `run_id?: string`
- `outcome?: "positive"|"negative"|"neutral"` (default `neutral`)
- `activate?: boolean` (default `true`)
- `reason?: string`
- `input_text` or `input_sha256` (required)

At least one of `node_ids` or `client_ids` must be provided.

**Behavior**
- Resolves target nodes by id/client_id in scope.
- For found nodes:
  - updates feedback counters/quality in slots:
    - `feedback_positive`, `feedback_negative`, `feedback_quality`
    - `last_feedback_outcome`, `last_feedback_at`, `last_feedback_run_id`, `last_feedback_reason`, `last_feedback_input_sha256`
  - optionally updates `last_activated` (`activate=true`)
  - updates `commit_id`
- All writes are commit-audited via `memory_commits`.

**Response**
- `tenant_id`, `scope`
- `commit_id`, `commit_hash` (null when no node found)
- `activated`: requested/resolved/found/updated/missing counters + ids

---

### `POST /v1/memory/rules/evaluate`

Evaluate SHADOW/ACTIVE rules against a caller-provided execution context. This is intended to be called by a planner/tool-selector before making decisions.

**Request**
- `context: any` (required)
- `tenant_id?: string`
- `scope?: string`
- `include_shadow?: boolean` (default true)
- `limit?: number` (default 50, max 200)

**Response**
- `tenant_id: string`
- `scope: string`
- `considered: number`
- `matched: number`
- `skipped_invalid_then: number` (rules skipped due to invalid `then_json` schema)
- `agent_visibility_summary`:
  - `agent: { id, team_id }`
  - `rule_scope: { scanned, filtered_by_scope, filtered_by_lane, filtered_by_condition, skipped_invalid_then, matched_active, matched_shadow }`
  - `lane: { applied, reason, legacy_unowned_private_visible, legacy_unowned_private_detected }`
    - `reason` enum:
      - `missing_agent_context`
      - `enforced_agent_only`
      - `enforced_team_only`
      - `enforced_agent_team`
- `active: RuleMatchDTO[]`
- `shadow: RuleMatchDTO[]` (omitted from matching when `include_shadow=false`)
- `applied: { policy, sources, conflicts, shadow_policy?, shadow_sources?, shadow_conflicts? }`
  - `applied.conflict_explain[]` (readable winner/loser explanation per conflict path)
  - `applied.tool_explain` (readable tool.* conflict/winner explanation; computed with special semantics)
  - `applied.shadow_tool_explain` (when `include_shadow=true`)

**RuleMatchDTO (whitelist)**
- `rule_node_id`, `state`, `summary`
- `rule_scope`, `target_agent_id?`, `target_team_id?`
- `if_json`, `then_json`, `exceptions_json`
- `stats: { positive, negative }`
- `rank: { score, evidence_score, priority, weight, specificity }`
- `match_detail: { condition_paths, condition_path_count }`
- `commit_id`

Notes:
- This endpoint **never returns embeddings**.
- `then_json` is a **strict policy patch schema** (minimal, stable) designed for planner/tool-selector injection.
- Rule scope filtering is applied before condition matching:
  - `global`: always eligible
  - `team`: requires `context.agent.team_id` (or `context.team_id`) to equal `target_team_id`
  - `agent`: requires `context.agent.id` (or `context.agent_id`) to equal `target_agent_id`
- Rule lane filtering:
  - when `context.agent.id` or `context.agent.team_id` is provided, rule node visibility is lane-enforced:
    - visible: `shared`
    - visible: `private` + owner match (`owner_agent_id` / `owner_team_id`)
    - `private` + no owner fields is treated as non-visible (legacy data defect); detected count is surfaced in `lane.legacy_unowned_private_detected`
  - when no agent/team context is provided, lane filter is not enforced (`lane.applied=false`, `reason=missing_agent_context`).
- `$regex` conditions are safety-guarded (length/complexity limits); unsafe or invalid patterns fail closed as non-match.

**PolicyPatch (then_json)**
- `output?: { format?: "json"|"text"|"markdown", strict?: boolean }`
- `tool?: { allow?: string[], deny?: string[], prefer?: string[] }`
- `extensions?: object` (namespaced escape hatch)
- Rule rank metadata can be set in rule node `slots.rule_meta`:
  - `slots.rule_meta.priority` (int, default 0, range -100..100)
  - `slots.rule_meta.weight` (number, default 1, range 0..2)
- Rule scope metadata can be set in rule node slots:
  - `slots.rule_scope`: `"global"|"team"|"agent"` (default `global`)
  - `slots.target_team_id`: required when `rule_scope="team"`
  - `slots.target_agent_id`: required when `rule_scope="agent"`

**Recommended context shape (non-binding)**
- See `docs/PLANNER_CONTEXT.md` and `examples/planner_context.json`.

---

### `POST /v1/memory/tools/select`

Apply ACTIVE rule policy to a caller-provided list of tool candidates and return a deterministic selection decision.
This endpoint is a convenience wrapper around rules evaluation + tool policy application, intended for tool selector integration.

**Request**
- `context: any` (required; normalized planner context recommended)
- `candidates: string[]` (required, 1..200)
- `tenant_id?: string`
- `scope?: string`
- `run_id?: string` (recommended; execution run correlation id)
- `include_shadow?: boolean` (default false; if true, returns a non-enforcing `shadow_selection`)
- `rules_limit?: number` (default 50, max 200)
- `strict?: boolean` (default true)

**Response**
- `tenant_id: string`
- `scope: string`
- `candidates: string[]` (deduped)
- `selection: { candidates, allowed, denied, preferred, ordered, selected }`
- `rules: { considered, matched, skipped_invalid_then, invalid_then_sample, agent_visibility_summary, applied, tool_conflicts_summary, shadow_selection?, shadow_tool_conflicts_summary? }`
- `decision: { decision_id, run_id, selected_tool, policy_sha256, source_rule_ids, created_at }`

Notes:
- This endpoint **never returns embeddings**.
- Only `rules.applied.policy.tool` is interpreted by the selector:
  - `tool.allow`: allowlist (hard). If multiple matched rules specify `tool.allow`, the **effective allowlist is the intersection**.
  - `tool.deny`: denylist (hard). Effective denylist is the **union**.
  - `tool.prefer`: ordering hint (soft). Effective prefer order is **rank-aware**: higher rule rank has higher priority.
    - rank = `priority * 1000 + evidence_score * 100 * weight + specificity`
 - `strict` behavior:
   - `strict=true` (default): if allow/deny filters remove all candidates, returns `400 no_tools_allowed`
   - `strict=false`: if `tool.allow` removes all, fall back to **deny-only** (ignore allowlist) and return `selection.fallback`
 - `tool_conflicts_summary` is a short, UI/log-friendly list derived from `applied.tool_explain.conflicts` (bounded; not exhaustive).
 - `rules.agent_visibility_summary` follows the same shape/semantics as `/v1/memory/rules/evaluate`.

---

### `POST /v1/memory/tools/feedback`

Feedback loop for tool selection decisions. This attributes an outcome to the matched rules and updates their
verification stats (`positive_count` / `negative_count`) for ordering and governance.

**Request**
- `context: any` (required)
- `candidates: string[]` (required)
- `selected_tool: string` (required)
- `outcome: "positive"|"negative"|"neutral"` (required)
- `tenant_id?: string`
- `scope?: string`
- `actor?: string`
- `run_id?: string`
- `decision_id?: string` (UUID; if omitted, server attempts inference and may create a feedback-derived decision record)
- `target?: "tool"|"all"` (default `"tool"`)
- `include_shadow?: boolean` (default false; if true, also attributes to matched SHADOW rule sources)
- `rules_limit?: number` (default 50, max 200)
- `note?: string`
- `input_text` or `input_sha256` (required; same rule as `/v1/memory/feedback`)

**Response**
- `ok: true`
- `tenant_id: string`
- `scope: string`
- `updated_rules: number`
- `rule_node_ids: string[]`
- `commit_id: string|null`
- `commit_hash: string|null`
- `decision_id: string`
- `decision_link_mode: "provided"|"inferred"|"created_from_feedback"`
- `decision_policy_sha256: string`

## Verification Stamp

- Last reviewed: `2026-02-23`
- Verification commands:
  - `npm run test:contract`
  - `npm run docs:check`
