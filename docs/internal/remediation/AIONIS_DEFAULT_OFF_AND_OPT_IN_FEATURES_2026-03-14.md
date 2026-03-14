# Aionis Default-Off And Opt-In Features Audit

Date: 2026-03-14

## Purpose

This document lists Aionis features that are not active by default and require explicit enablement.

It is intended as an internal operator/developer reference so people can answer:

1. what is off by default
2. how to enable it
3. where the behavior is enforced in code

## Audit Scope

Reviewed sources:

1. `.env.example`
2. `src/config.ts`
3. `src/memory/schemas.ts`
4. runtime route/service files under `src/routes`, `src/app`, `src/memory`
5. `apps/ops`
6. public/internal docs that explicitly describe opt-in behavior

Not counted as "feature gates" here:

1. pure state fields such as `repair_applied`
2. ordinary paging/filter fields such as `offset`
3. default-safe behavior that is not an enablement switch by itself

## Runtime And Deployment Gates

| Surface | Toggle / setting | Default | How to enable | Effect | Code |
| --- | --- | --- | --- | --- | --- |
| Embedded memory backend | `MEMORY_STORE_BACKEND=embedded` + `MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED` | `postgres` + `false` | set backend to `embedded` and set enable flag to `true` | allows experimental embedded backend | `.env.example:15-18`, `src/config.ts:125-131`, `src/config.ts:700-701`, `src/store/memory-store.ts:69-77` |
| Embedded strict snapshot cap | `MEMORY_STORE_EMBEDDED_SNAPSHOT_STRICT_MAX_BYTES` | `false` | set to `true` | enforces strict snapshot max-bytes behavior | `.env.example:21-25`, `src/config.ts:141-146` |
| Embedded shadow mirror | `MEMORY_STORE_EMBEDDED_SHADOW_MIRROR_ENABLED` | `false` | set to `true` | enables embedded shadow mirror capability for `*_v2` writes | `.env.example:28`, `src/config.ts:154-159`, `src/app/runtime-services.ts:214-220` |
| Embedded debug embeddings | `MEMORY_STORE_EMBEDDED_RECALL_DEBUG_EMBEDDINGS_ENABLED` | `false` | set to `true` | permits embedded recall debug embedding preview capability | `.env.example:30`, `src/config.ts:160-165`, `src/app/runtime-services.ts:210-212` |
| Memory auth | `MEMORY_AUTH_MODE` | `off` | switch to `api_key`, `jwt`, or `api_key_or_jwt` and provide matching secrets | enables API authentication | `.env.example:61-70`, `src/config.ts:198-200` |
| Write hard guard | `MEMORY_WRITE_REQUIRE_NODES` | `false` | set to `true` | rejects `/v1/memory/write` requests with zero nodes | `.env.example:72-75`, `src/config.ts:202-209`, `src/routes/memory-write.ts:177-188` |
| Class-aware recall selector | `MEMORY_RECALL_CLASS_AWARE_ENABLED` | `false` | set to `true` | enables server-default class-aware selector for text recall endpoints | `src/config.ts:291-298`, `src/app/recall-policy.ts:315-329` |
| Server-side context optimization defaults | `MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT`, `MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT` | `off`, `off` | set to `balanced` or `aggressive` | enables endpoint-default context optimization when request omits profile | `.env.example:80-84`, `src/config.ts:330-333`, `src/routes/memory-context-runtime.ts:569-575`, `src/routes/memory-context-runtime.ts:1025-1031` |
| Default recall_text token budget | `MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT` | `0` | set to a positive integer | enables request-default compaction budget for text context endpoints | `.env.example:329-330`, `src/config.ts:330-331`, `src/routes/memory-context-runtime.ts:156-165` |
| Cross-scope edge writes | `ALLOW_CROSS_SCOPE_EDGES` | `false` | set to `true` | permits cross-scope edges during write/handoff/replay write paths | `.env.example:334`, `src/config.ts:340-345`, `src/memory/write.ts:469-472` |
| Sandbox API | `SANDBOX_ENABLED` | `false` | set to `true` and configure executor | enables sandbox session/execute surfaces | `.env.example:124-157`, `src/config.ts:347-395`, `src/routes/memory-sandbox.ts:54-60`, `docs/public/en/reference/08-sandbox-api.md:9-18` |
| Sandbox local process in prod | `SANDBOX_LOCAL_PROCESS_ALLOW_IN_PROD` | `false` | set to `true` in addition to enabling sandbox local process | allows `local_process` sandbox executor in `APP_ENV=prod` | `.env.example:157`, `src/config.ts:382-387`, `src/config.ts:913-915` |
| Request-side guided repair switch to `builtin_llm` | `REPLAY_GUIDED_REPAIR_ALLOW_REQUEST_BUILTIN_LLM` | `false` | set to `true` or make server default strategy `builtin_llm` | allows callers to request `params.guided_repair_strategy=builtin_llm` | `.env.example:173-176`, `src/config.ts:396-405`, `src/memory/replay.ts:4285-4297`, `docs/public/en/api-reference/00-api-reference.md:216-221` |
| Replay learning projection | `REPLAY_LEARNING_PROJECTION_ENABLED` | `false` | set to `true` | enables replay review -> rule/episode projection defaults | `.env.example:190-197`, `src/config.ts:417-422`, `src/app/replay-runtime-options.ts:184-193` |
| Replay learning fault injection | `REPLAY_LEARNING_FAULT_INJECTION_ENABLED` | `false` | set to `true` | enables test-only fault injection markers/errors in replay learning | `.env.example:199`, `src/config.ts:430-435`, `src/memory/replay-learning.ts:337-342` |
| Replay repair review auto-promotion | `REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_DEFAULT` | `false` | set to `true` or use non-`custom` policy profile/override | enables server-default auto-promotion on successful review validation | `.env.example:209-217`, `src/config.ts:454-461`, `src/app/replay-repair-review-policy.ts:328-336` |
| Shadow dual-write | `MEMORY_SHADOW_DUAL_WRITE_ENABLED` | `false` | set to `true` | enables legacy -> `*_v2` shadow dual-write path | `.env.example:366-369`, `src/config.ts:503-509` |
| Strict shadow dual-write | `MEMORY_SHADOW_DUAL_WRITE_STRICT` | `false` | set to `true` after enabling shadow dual-write | turns shadow dual-write into a strict requirement | `.env.example:368-369`, `src/config.ts:510-515`, `src/config.ts:697-710` |
| Scope-level node budgets | `MEMORY_SCOPE_HOT_NODE_BUDGET`, `MEMORY_SCOPE_ACTIVE_NODE_BUDGET` | `0`, `0` | set positive integers | enables scope-level hot / active working-set budget enforcement | `.env.example:381-382`, `src/config.ts:526-528`, `src/jobs/README.md:34-37` |

## Request-Level Opt-In Features

| Endpoint family | Field | Default | How to enable | Effect | Code |
| --- | --- | --- | --- | --- | --- |
| `recall`, `recall_text`, `planning/context`, `context/assemble` | `recall_mode="dense_edge"` | not set | pass `dense_edge` explicitly | enables wider graph recall mode mapped to `quality_first` | `src/memory/schemas.ts:124-125`, `src/memory/schemas.ts:163-165`, `src/memory/schemas.ts:240-242`, `src/memory/schemas.ts:284-286`, `docs/public/en/api-reference/00-api-reference.md:71-73` |
| `recall_text`, `planning/context`, `context/assemble` | `recall_class_aware=true` | not set | pass `true` explicitly | enables class-aware selector per request even if env default stays off | `src/memory/schemas.ts:165`, `src/memory/schemas.ts:242`, `src/memory/schemas.ts:286`, `src/app/recall-policy.ts:315-329` |
| recall endpoints | `return_debug` | `false` | pass `true` | enables recall debug channel | `src/memory/schemas.ts:128-156`, `src/memory/schemas.ts:168-192` |
| recall endpoints | `include_embeddings` | `false` | pass `true` and also set `return_debug=true`; admin privileges required | returns debug embeddings preview | `src/memory/schemas.ts:130-131`, `src/memory/schemas.ts:170-171`, `src/memory/recall.ts:187-193` |
| recall/planning/context endpoints | `include_meta`, `include_slots`, `include_slots_preview` | `false` | pass `true` explicitly | returns extra metadata / slot payloads | `src/memory/schemas.ts:131-134`, `src/memory/schemas.ts:171-174`, `src/memory/schemas.ts:254-258`, `src/memory/schemas.ts:297-301` |
| recall / recall_text | `rules_include_shadow` | `false` | pass `true` | includes SHADOW rules in rules context | `src/memory/schemas.ts:150-156`, `src/memory/schemas.ts:189-192` |
| `planning/context` | `include_shadow` | `false` | pass `true` | includes SHADOW rules in planner path | `src/memory/schemas.ts:236-248` |
| `planning/context` | `return_layered_context` | `false` | pass `true` | returns explicit multi-layer assembled context payload | `src/memory/schemas.ts:268-275` |
| `context/assemble` | `include_shadow` | `false` | pass `true` | includes SHADOW rules in assembly path | `src/memory/schemas.ts:280-317` |
| pack export | `include_decisions` | `false` | pass `true` | exports decision records in pack | `src/memory/schemas.ts:467-476` |
| pack import | `verify_only` | `false` | pass `true` | runs pack import verification without applying it | `src/memory/schemas.ts:480-486` |
| pack import | `auto_embed` | `false` | pass `true` | auto-embeds imported nodes on import | `src/memory/schemas.ts:480-486` |
| tools/select, tools/feedback | `include_shadow` | `false` | pass `true` | includes SHADOW rules in tool rule evaluation/attribution | `src/memory/schemas.ts:649-663`, `src/memory/schemas.ts:690-718` |
| replay compile | `allow_partial` | `false` | pass `true` | allows compile from non-fully-successful material | `src/memory/schemas.ts:809-822`, `src/memory/replay.ts:2690` |
| replay learning projection payload | `enabled` | `false` | pass `true` | turns on request-scoped projection even if caller supplies payload manually | `src/memory/schemas.ts:924-931` |
| replay repair review | `auto_promote_on_pass` | `false` | pass `true` | auto-promotes after shadow validation pass if gate thresholds match | `src/memory/schemas.ts:935-960` |
| automation run | `options.allow_local_exec` | `false` | pass `true` | explicit consent for local execution from automation runs | `src/memory/schemas.ts:1167-1181` |
| strict/guided replay params | `params.allow_local_exec` | required explicit consent | pass `true` | replay local execution is rejected without explicit consent | `src/memory/replay.ts:4239-4265` |

## Ops, Browser, And Integration Surfaces

| Surface | Setting | Default | How to enable | Effect | Code |
| --- | --- | --- | --- | --- | --- |
| Ops dangerous actions | `OPS_DANGEROUS_ACTIONS_ENABLED` | `false` | set to `true` | allows destructive Ops actions such as non-dry-run replay and quota delete | `apps/ops/README.md:102-112`, `apps/ops/app/api/control/execute/route.js:40-49`, `docs/public/en/operations/01-ops-console.md:36-42` |
| Ops Basic Auth | `OPS_BASIC_AUTH_ENABLED` | `false` fallback | set `OPS_BASIC_AUTH_ENABLED=true` or provide both username/password | enables Basic Auth gate for Ops UI/API | `apps/ops/middleware.js:55-60`, `apps/ops/README.md:73-84` |
| Admin/control browser CORS | `CORS_ADMIN_ALLOW_ORIGINS` | empty | set explicit trusted origins | enables browser access to admin/control routes | `.env.example:119-122`, `src/app/http-observability.ts:77-82` |
| Memory browser CORS in prod | `CORS_ALLOW_ORIGINS` | empty in prod | set explicit trusted origins | enables browser access to memory POST routes in prod | `.env.example:115-118`, `src/app/http-observability.ts:77-80` |
| Codex local attachment | explicit local profile / wrapper opt-in | not global | run the documented local profile / wrapper | attaches Aionis to Codex intentionally instead of globally | `docs/public/en/integrations/05-codex-local.md:38-43` |

## Practical Defaults To Remember

If someone asks "what is intentionally not on by default in Aionis?", the shortest accurate answer is:

1. embedded backend
2. class-aware recall selector
3. endpoint-default context optimization
4. cross-scope edge writes
5. sandbox
6. request-side `builtin_llm` repair override
7. replay learning projection
8. replay auto-promotion
9. shadow dual-write
10. scope-level budget enforcement
11. dangerous Ops actions
12. most debug / SHADOW-preview response expansions

## Maintenance Note

When adding a new feature gate in Aionis:

1. add it to `.env.example` if it is env-controlled
2. add its default and validation to `src/config.ts`
3. document whether it is default-off or default-on
4. add the item to this audit if the default is off or opt-in
