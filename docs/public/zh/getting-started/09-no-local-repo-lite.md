---
title: "没有本地仓库也能 3 分钟起 Lite"
---

# 没有本地仓库也能 3 分钟起 Lite

如果你只是想先在本机跑起 Aionis Lite，而不想先 `git clone Aionis`，就走这条路径。

现在官方 CLI 可以直接帮你 bootstrap 本地 Lite runtime。

## 你需要准备什么

1. Node.js 18+
2. 第一次启动时能联网

你不需要：

1. 本地 `Aionis` 源码仓库
2. 手工安装 runtime

## 第一步：启动 Lite

```bash
npx @aionis/sdk@0.2.20 dev
```

第一次运行时，CLI 会按这个顺序处理：

1. 先检查本地是否已有 runtime
2. 如果 `~/.aionis/runtime` 里有缓存，就直接复用
3. 没缓存时，下载匹配的 runtime bundle
4. 如果 bundle 不可用，再回退到源码 bootstrap 路径

期望的 ready 状态：

1. base URL：`http://127.0.0.1:3321`
2. edition：`lite`
3. backend：`lite_sqlite`

## 第二步：检查健康状态

```bash
npx @aionis/sdk@0.2.20 health --base-url http://127.0.0.1:3321
```

可选检查：

```bash
npx @aionis/sdk@0.2.20 doctor --base-url http://127.0.0.1:3321
npx @aionis/sdk@0.2.20 selfcheck --base-url http://127.0.0.1:3321
```

## 第三步：接一个客户端

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

## 第四步：接 OpenClaw

先装 adapter：

```bash
openclaw plugins install @aionis/openclaw-adapter
```

然后在 OpenClaw 里配置：

1. `baseUrl = http://127.0.0.1:3321`
2. `tenantId = default`
3. `actor = openclaw`

完整插件配置见 OpenClaw adapter 文档。

## 如果没启动起来

先检查这几件事：

1. 第一次 bootstrap 时机器能联网
2. Node.js 版本是 `18+`
3. `health` 返回 `ok`
4. `doctor` 能找到 runtime cache 和已追踪进程

如果机器完全离线，而且本地还没有缓存 runtime，第一次启动会失败。

## 相关文档

1. [SDK CLI](/public/zh/reference/09-sdk-cli)
2. [SDK 指南](/public/zh/reference/05-sdk)
3. [Python SDK + Aionis CLI](/public/zh/getting-started/08-python-sdk-with-cli)
4. [OpenClaw 集成](/public/zh/integrations/04-openclaw)
