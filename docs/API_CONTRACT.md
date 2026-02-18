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

## Auth Identity Mapping (Phase C MVP)

- Optional global mode: `MEMORY_AUTH_MODE=api_key`
- Key registry: `MEMORY_API_KEYS_JSON` (`{ "<api-key>": { tenant_id, agent_id?, team_id?, role? } }`)
- JWT mode: `MEMORY_AUTH_MODE=jwt` (or `api_key_or_jwt`) with `Authorization: Bearer <jwt>`
  - HS256 secret: `MEMORY_JWT_HS256_SECRET`
  - claims: `tenant_id` (or `tenant`) required; `agent_id`/`sub`, `team_id`, `role` optional
  - time validation: `exp`/`nbf` with `MEMORY_JWT_CLOCK_SKEW_SEC`
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

### `POST /v1/memory/recall`

**Request**
- `query_embedding: number[]` (required, dim=1536)
- `tenant_id?: string`
- `scope?: string`
- `consumer_agent_id?: string` (optional; enables lane-based visibility and read-side audit)
- `consumer_team_id?: string` (optional; used with team-private lane and team-scoped rules)
- `limit?: number` (default 30, max 200)
- `neighborhood_hops?: 1|2` (default 2)
- `max_nodes?: number` (default 50, max 200)
- `max_edges?: number` (default 100, **max 100 hard**)
- `ranked_limit?: number` (default 100, max 500)
- `min_edge_weight?: number` (default 0, max 1) stage-2 edge fetch filter
- `min_edge_confidence?: number` (default 0, max 1) stage-2 edge fetch filter
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
- `debug?: { neighborhood_counts: { nodes:number, edges:number }, embeddings?: DebugEmbeddingDTO[] }` (only when `return_debug=true`)

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

**Request**
- Same fields as `/recall`, except:
  - `query_text: string` (required)

**Response**
- Same as `/recall`, plus:
  - `query: { text: string, embedding_provider: string }`

**Upstream embedding failure mapping (`/recall_text`)**
- provider throttled / rate limited: `429 upstream_embedding_rate_limited` (+ `retry-after`)
- provider timeout / unavailable: `503 upstream_embedding_unavailable` (+ `retry-after`)
- provider malformed response: `502 upstream_embedding_bad_response`
- server should not expose generic `500` for known upstream embedding failures

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
- `include_shadow?: boolean` (default false; if true, returns a non-enforcing `shadow_selection`)
- `rules_limit?: number` (default 50, max 200)
- `strict?: boolean` (default true)

**Response**
- `tenant_id: string`
- `scope: string`
- `candidates: string[]` (deduped)
- `selection: { candidates, allowed, denied, preferred, ordered, selected }`
- `rules: { considered, matched, skipped_invalid_then, invalid_then_sample, agent_visibility_summary, applied, tool_conflicts_summary, shadow_selection?, shadow_tool_conflicts_summary? }`

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

## Verification Stamp

- Last reviewed: `2026-02-16`
- Verification commands:
  - `npm run test:contract`
  - `npm run docs:check`
