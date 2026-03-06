# Sandbox APIs (Experimental)

Sandbox APIs execute controlled actions in an isolated environment. Treat this surface as optional and gated.

## Endpoints

> `POST /v1/memory/sandbox/sessions`
> `POST /v1/memory/sandbox/execute`
> `POST /v1/memory/sandbox/runs/get`
> `POST /v1/memory/sandbox/runs/logs`
> `POST /v1/memory/sandbox/runs/artifact`
> `POST /v1/memory/sandbox/runs/cancel`

## Safety guidance

1. Keep sandbox disabled unless your runtime needs controlled execution.
2. Use explicit command allowlists and strict timeout settings.
3. Isolate sandbox credentials and execution plane from primary data plane.

## Recommended usage model

1. Keep the main memory and policy path working before enabling sandbox.
2. Start with a narrow allowlist and short timeouts.
3. Route high-risk actions through sandbox only after policy approval.
4. Log sandbox session and run identifiers alongside the normal execution chain.

## When not to use sandbox

Do not use sandbox as the first integration step. If your team has not yet validated memory writes, recall quality, policy flow, and replay identifiers, sandbox will add operational complexity before the core path is stable.

## Rollout guidance

1. Enable sandbox in staging first.
2. Test with a minimal allowlist and non-destructive commands.
3. Confirm operators can retrieve logs and artifacts from sandbox runs.
4. Only then consider controlled production use.

## Error example and fix

Example error:

```json
{
  "error": "forbidden",
  "message": "sandbox command not allowed"
}
```

Fix:
1. Add command to sandbox allowlist policy (if approved).
2. Validate timeout and mode constraints for the requested action.
3. Re-run with a policy-approved command profile.
