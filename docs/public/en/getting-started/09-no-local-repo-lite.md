---
title: "3-Minute Lite Setup Without a Local Repo"
---

# 3-Minute Lite Setup Without a Local Repo

Use this path when you want to run Aionis Lite locally without cloning the Aionis repository first.

The CLI can bootstrap a local Lite runtime for you.

## What You Need

1. Node.js 18+
2. internet access for the first bootstrap

You do not need:

1. a local `Aionis` source checkout
2. a manual runtime install step

## Step 1: Start Lite

```bash
npx @aionis/sdk@0.2.20 dev
```

What happens on the first run:

1. the CLI checks for an existing local runtime
2. it reuses cached runtime files under `~/.aionis/runtime` when available
3. it downloads a matching runtime bundle when needed
4. if bundle download is unavailable, it falls back to the source bootstrap path

Expected ready state:

1. base URL: `http://127.0.0.1:3321`
2. edition: `lite`
3. backend: `lite_sqlite`

## Step 2: Verify Health

```bash
npx @aionis/sdk@0.2.20 health --base-url http://127.0.0.1:3321
```

Optional checks:

```bash
npx @aionis/sdk@0.2.20 doctor --base-url http://127.0.0.1:3321
npx @aionis/sdk@0.2.20 selfcheck --base-url http://127.0.0.1:3321
```

## Step 3: Connect a Client

### TypeScript

```bash
npm install @aionis/sdk@0.2.20
```

```ts
import { AionisClient } from "@aionis/sdk";

const client = new AionisClient({
  base_url: "http://127.0.0.1:3321",
});

const out = await client.write({
  scope: "default",
  input_text: "local lite smoke",
});

console.log(out.request_id);
```

### Python

```bash
pip install aionis-sdk==0.2.20
```

```python
from aionis_sdk import AionisClient

client = AionisClient(base_url="http://127.0.0.1:3321")
out = client.write({"scope": "default", "input_text": "local lite smoke"})
print(out.get("request_id"))
```

## Step 4: Use It With OpenClaw

Install the adapter:

```bash
openclaw plugins install @aionis/openclaw-adapter
```

Then configure OpenClaw to use:

1. `baseUrl = http://127.0.0.1:3321`
2. `tenantId = default`
3. `actor = openclaw`

See the OpenClaw adapter docs for the full plugin config.

## If It Does Not Start

Check these first:

1. your machine has outbound network access on the first bootstrap
2. Node.js is `18+`
3. `health` returns `ok`
4. `doctor` can find the runtime cache and tracked process

If your machine is fully offline and has no cached runtime yet, the first bootstrap will fail.

## Related

1. [SDK CLI](/public/en/reference/09-sdk-cli)
2. [SDK Guide](/public/en/reference/05-sdk)
3. [Python SDK + Aionis CLI](/public/en/getting-started/08-python-sdk-with-cli)
4. [OpenClaw Integration](/public/en/integrations/04-openclaw)
