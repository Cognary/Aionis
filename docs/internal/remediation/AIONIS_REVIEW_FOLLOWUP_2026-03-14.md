# Aionis Review Follow-Up

Date: 2026-03-14
Owner: Aionis Core
Source: full-project review across runtime code, Ops app, SDK docs, and public docs

## Scope

This note tracks the three non-pagination findings from the 2026-03-14 review:

1. Ops proxy routes keep some privileged mutations effectively enabled by default.
2. Public `/health` exposes too much internal runtime detail.
3. Public docs and SDK docs drifted from the live route surface and package versions.

Status snapshot:

1. Ops proxy default safety posture: open
2. Public health detail exposure: open
3. Docs and SDK surface drift: resolved in this review pass

## Finding 1: Ops Proxy Default Safety Posture

Severity: P1

### Summary

The Ops app proxies privileged control-plane and automation mutations from Next.js API routes into the Aionis backend. Those routes use process-level secrets and are not consistently fail-closed for destructive or configuration-changing actions.

### Evidence

Control proxy:

1. `apps/ops/app/api/control/execute/route.js:73-93` forwards requests with `x-admin-token: ADMIN_TOKEN`.
2. `apps/ops/app/api/control/execute/route.js:96-153` allows `alert_route_create` with no `OPS_DANGEROUS_ACTIONS_ENABLED` gate.
3. `apps/ops/app/api/control/execute/route.js:156-249` only guards selected operations such as non-dry-run alert dispatch, alert replay, and multi-tenant incident replay.

Automation proxy:

1. `apps/ops/app/api/automation/execute/route.js:60-91` forwards authenticated memory-plane requests directly to runtime routes.
2. `apps/ops/app/api/automation/execute/route.js:119-151` exposes mutation operations such as:
   - `automation_promote`
   - `automation_shadow_review`
   - `automation_run_approve_repair`
   - `automation_run_reject_repair`
   - `automation_run_cancel`
   - `automation_run_resume`
   - compensation assignment / record actions
3. Those operations are allow-listed, but there is no equivalent dangerous-action gate in this route.

Deployment/docs posture:

1. `apps/ops/README.md:73-100` documents Basic Auth and IP allowlist as optional.
2. `apps/ops/README.md:102-112` documents `OPS_DANGEROUS_ACTIONS_ENABLED=false`, but that default only blocks a subset of write paths.

### Risk

If an Ops deployment is reachable and the operator has configured only `AIONIS_ADMIN_TOKEN` or memory credentials, the Next.js proxy becomes a standing privileged mutation surface. The current design assumes external perimeter controls are present, but does not require them before enabling meaningful writes.

### Recommended Remediation

1. Introduce one fail-closed gate for all mutating Ops proxy operations, not only a subset.
2. Split operations into:
   - read-only
   - safe write
   - dangerous write
3. Require explicit enablement for all write classes, or at minimum for:
   - alert route create/update
   - automation promote / shadow review
   - repair approve / reject
   - compensation assignment / action record
4. Make Ops docs state clearly that running with only app-level env vars and no extra gate is not a safe production posture.

### Acceptance Criteria

1. All privileged proxy mutations are disabled by default.
2. Enabling write paths requires an explicit Ops-side toggle.
3. The allowed operations table in Ops docs matches actual route gating behavior.

## Finding 2: Public `/health` Leaks Internal Runtime Detail

Severity: P1

### Summary

The unauthenticated `GET /health` endpoint returns much more than a liveness/readiness contract. It discloses runtime topology, local filesystem locations, embedded-runtime state, capability flags, and sandbox posture.

### Evidence

`src/host/http-host.ts:294-334` returns all of the following without auth:

1. edition and backend mode
2. database target hash
3. embedded snapshot path and compaction settings
4. embedded capability flags
5. Lite SQLite store snapshots
6. capability contract versions
7. sandbox executor health
8. sandbox remote egress posture and object-store configuration
9. Lite route matrix

Concrete examples from the current response payload:

1. `memory_store_embedded_snapshot_path`
2. `lite_recall_store`
3. `lite_write_store`
4. `sandbox`
5. `sandbox_remote_egress_cidr_count`
6. `sandbox_artifact_object_store_base_uri_configured`
7. `lite_route_matrix`

### Risk

This turns a public health probe into an information disclosure surface. An external caller can learn the deployed edition, whether Lite storage paths exist, whether sandbox remote execution is configured, and which internal features are active. That makes target profiling easier and increases blast radius if the service is exposed beyond a trusted network.

### Recommended Remediation

1. Split `/health` into:
   - public minimal health
   - privileged diagnostics health
2. Keep the public contract limited to fields such as:
   - `ok`
   - coarse edition/backend identifier if needed
   - maybe a minimal readiness bit
3. Move detailed runtime fields behind admin auth or a server-only diagnostics route.
4. Update runbooks so operators know which endpoint is safe for load balancers and public probes.

### Acceptance Criteria

1. Anonymous callers cannot read filesystem paths, store snapshots, capability matrices, or sandbox posture.
2. Operators still have an authenticated diagnostics surface with the current detail level.
3. Public docs distinguish probe usage from operator diagnostics usage.

## Finding 3: Docs And SDK Surface Drift

Severity: P2
Status: resolved on 2026-03-14 in this review pass

### Summary

Before the review follow-up edits, public API docs and SDK docs had drifted from the current implementation. The biggest gaps were missing Automation routes in the public API map and inconsistent SDK version examples across TypeScript and Python docs.

### Runtime Surface Evidence

The runtime exposes the following Automation routes in `src/routes/automations.ts`:

1. `src/routes/automations.ts:129-141` -> `/v1/automations/compensation/policy_matrix`
2. `src/routes/automations.ts:159-171` -> `/v1/automations/shadow/review`
3. `src/routes/automations.ts:216-228` -> `/v1/automations/assign_reviewer`
4. `src/routes/automations.ts:261-274` -> `/v1/automations/graph/validate`
5. `src/routes/automations.ts:327-340` -> `/v1/automations/runs/assign_reviewer`
6. `src/routes/automations.ts:447-459` -> `/v1/automations/runs/compensation/record_action`
7. `src/routes/automations.ts:462-475` -> `/v1/automations/runs/compensation/assign`

### Resolution Applied

Public API docs were synchronized:

1. `docs/public/en/api-reference/00-api-reference.md:123-146`
2. `docs/public/zh/api-reference/00-api-reference.md:123-146`
3. `docs/public/en/api-reference/01-automation-api-reference.md:38-56`
4. `docs/public/zh/api-reference/01-automation-api-reference.md:38-56`

SDK docs were synchronized to current package lines:

1. TypeScript package version remains `0.2.19` in `packages/sdk/package.json:1-8`
2. TypeScript SDK docs now show `@aionis/sdk@0.2.19` in:
   - `docs/public/en/reference/05-sdk.md:25-44`
   - `docs/public/zh/reference/05-sdk.md:18-36`
   - `docs/public/en/reference/09-sdk-cli.md`
   - `docs/public/zh/reference/09-sdk-cli.md`
   - `packages/sdk/README.md:5-15`
3. Python package version remains `0.2.18` in `packages/python-sdk/pyproject.toml:5-10`
4. Python docs continue to show `aionis-sdk==0.2.18` and use `@aionis/sdk@0.2.19` only for the Lite CLI bootstrap path:
   - `packages/python-sdk/README.md:5-19`

### Follow-Up Recommendation

Even though this specific drift is now fixed, the repo still needs a repeatable control to stop future drift:

1. add a docs-vs-route-surface check for the public Automation route inventory
2. add a docs-vs-package-version check for SDK version snippets
3. include that check in `docs:check` or a dedicated CI test

## Next Actions

Recommended execution order:

1. Fix Ops proxy default safety posture.
2. Reduce `/health` detail for anonymous callers.
3. Add automated anti-drift checks so the docs issue does not recur.

## Validation Notes

The documentation alignment portion of Finding 3 was verified with:

1. `npm run docs:check`
2. targeted route/doc spot-checks across `src/routes/automations.ts`, public API docs, and SDK docs
