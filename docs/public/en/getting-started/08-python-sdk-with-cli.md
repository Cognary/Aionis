---
title: "Python SDK + Aionis CLI"
---

# Python SDK + Aionis CLI

This is the recommended local developer path for Python users.

The Python package is the client surface.
The official local runtime entrypoint is the shared `aionis` CLI from `@aionis/sdk`.

## Goal

After this flow, you should be able to:

1. install the Python SDK
2. start Aionis Lite locally
3. connect from Python without a local Aionis source repo

## Step 1: Install the Python SDK

```bash
pip install aionis-sdk==0.2.20
```

## Step 2: Start Lite with the official CLI

```bash
npx @aionis/sdk@0.2.20 dev
```

What this does:

1. checks for a local runtime root
2. reuses cached runtime if available
3. tries a versioned runtime bundle
4. falls back to a source bootstrap path when needed

Expected ready state:

1. local base URL: `http://127.0.0.1:3321`
2. edition: `lite`
3. backend: `lite_sqlite`

## Step 3: Verify health

```bash
npx @aionis/sdk@0.2.20 health --base-url http://127.0.0.1:3321
```

Optional deeper checks:

```bash
npx @aionis/sdk@0.2.20 doctor --base-url http://127.0.0.1:3321
npx @aionis/sdk@0.2.20 selfcheck --base-url http://127.0.0.1:3321
```

## Step 4: Connect from Python

```python
from aionis_sdk import AionisClient

client = AionisClient(base_url="http://127.0.0.1:3321")

write_res = client.write({
    "scope": "default",
    "input_text": "Customer prefers email follow-up",
})

recall_res = client.recall_text({
    "scope": "default",
    "query_text": "preferred follow-up channel",
})

print(write_res.get("request_id"))
print(recall_res.get("request_id"))
```

## Why this is the official path

This design is intentional:

1. one local CLI
2. one runtime bootstrap path
3. both TypeScript and Python connect to the same local Lite runtime

That avoids maintaining two separate runtime launchers that can drift.

## Boundary

This is a local developer workflow.

It is not:

1. a hosted control-plane CLI
2. a Python-native runtime manager
3. a production self-hosted deployment path

## Related

1. [SDK Guide](/public/en/reference/05-sdk)
2. [SDK CLI](/public/en/reference/09-sdk-cli)
3. [5-Minute Onboarding](/public/en/getting-started/02-onboarding-5min)
