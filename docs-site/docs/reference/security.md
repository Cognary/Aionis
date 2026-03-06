# Security

This page defines the minimum security baseline for operating Aionis in production.

## Baseline controls

1. Never deploy production with `MEMORY_AUTH_MODE=off`.
2. Use least-privilege credentials per environment.
3. Protect admin routes with dedicated admin credentials.
4. Restrict CORS to explicit trusted origins.
5. Rotate keys and tokens on schedule or incident.

## Secrets handling baseline

1. Keep API keys, JWT secrets, and admin tokens outside source control.
2. Use separate credentials for dev, staging, and production.
3. Rotate secrets after incident response, not only on a calendar.
4. Audit automation, worker, and replay jobs after each credential change.

## Operational checks

1. Confirm auth mode before each release.
2. Confirm dangerous operation switches remain default-safe.
3. Audit random sample of sensitive actions weekly.

## Incident response readiness

1. Keep request/decision/replay IDs in logs.
2. Keep credential rotation runbook documented and tested.
3. Preserve release artifacts for forensic analysis.

## Logging and audit baseline

1. Log `request_id` for every API interaction.
2. Log `run_id` and `decision_id` for policy and tool workflows.
3. Log `commit_uri` when memory writes are part of the execution path.
4. Keep deployment version and environment metadata with operational logs.

## Review cadence

1. Before each release: validate auth mode, CORS, and admin-route protection.
2. Weekly: sample sensitive actions and confirm logs retain required identifiers.
3. After each security incident: rotate credentials, revalidate access boundaries, and replay a critical workflow to confirm normal behavior.
