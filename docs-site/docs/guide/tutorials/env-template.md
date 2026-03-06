# Tutorial: One-click Environment Template

Create a reusable Aionis environment file once, then run all tutorials with consistent variables.

## Before you start

1. You have shell access (`bash` or `zsh`).
2. You have a valid API key or bearer token.
3. You know the target base URL, tenant, and scope.

## What you will finish with

A single `.env.aionis` file that works across the tutorial commands in this docs set.

> **Tip - Copy and run**
> Use the copy button at the top-right of each code block.

## Input

| Variable | Required | Purpose | Example |
| --- | --- | --- | --- |
| `BASE_URL` | Yes | Aionis service URL | `http://localhost:3001` |
| `AIONIS_API_KEY` | Yes | Auth for public API endpoints | `aionis_live_xxx` |
| `AIONIS_TENANT_ID` | Yes | Tenant isolation key | `default` |
| `AIONIS_SCOPE` | Yes | Scope isolation key | `support` |

## Steps

### Step 1: Generate `.env.aionis`

```bash
cat > .env.aionis <<'EOF'
BASE_URL=http://localhost:3001
AIONIS_API_KEY=replace_with_real_key
AIONIS_TENANT_ID=default
AIONIS_SCOPE=support
EOF
```

### Step 2: Load variables into current shell

```bash
set -a
source .env.aionis
set +a
```

### Step 3: Validate connectivity

```bash
curl -sS "$BASE_URL/health" | jq
```

## Expected response sample

```json
{
  "ok": true
}
```

## Common failure and fix

Failure:

```text
source: no such file or directory: .env.aionis
```

Fix:

1. Ensure Step 1 ran successfully in the same working directory.
2. Confirm file exists with `ls -la .env.aionis`.
3. Re-run `source .env.aionis`.

## Success criteria

1. `/health` returns HTTP `200`.
2. The response payload indicates healthy service state.
3. `BASE_URL`, `AIONIS_API_KEY`, `AIONIS_TENANT_ID`, and `AIONIS_SCOPE` are available in your shell session.
