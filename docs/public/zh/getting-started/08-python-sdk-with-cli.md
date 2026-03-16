---
title: "Python SDK + Aionis CLI"
---

# Python SDK + Aionis CLI

这是当前推荐给 Python 用户的本地开发路径。

Python 包负责 client surface。  
本地 runtime 的官方入口是 `@aionis/sdk` 提供的统一 `aionis` CLI。

## 目标

完成这条流程后，你应该能做到：

1. 安装 Python SDK
2. 本地启动 Aionis Lite
3. 在没有本地 Aionis 源码仓库的情况下，从 Python 连上本地服务

## 第一步：安装 Python SDK

```bash
pip install aionis-sdk==0.2.20
```

## 第二步：用官方 CLI 启动 Lite

```bash
npx @aionis/sdk@0.2.20 dev
```

这条命令会：

1. 先检查本地 runtime root
2. 如果有缓存 runtime，就直接复用
3. 如果有版本化 runtime bundle，就优先下载 bundle
4. 如果 bundle 不可用，就回退到源码 bootstrap 路径

期望的 ready 状态：

1. 本地 base URL：`http://127.0.0.1:3321`
2. edition：`lite`
3. backend：`lite_sqlite`

## 第三步：验证健康状态

```bash
npx @aionis/sdk@0.2.20 health --base-url http://127.0.0.1:3321
```

如果你要做更完整的本地检查：

```bash
npx @aionis/sdk@0.2.20 doctor --base-url http://127.0.0.1:3321
npx @aionis/sdk@0.2.20 selfcheck --base-url http://127.0.0.1:3321
```

## 第四步：从 Python 连接

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

## 为什么官方推荐这样做

这是一个刻意的产品选择：

1. 只有一套本地 CLI
2. 只有一条 runtime bootstrap 路径
3. TypeScript 和 Python 都连接同一个本地 Lite runtime

这样可以避免维护两套独立启动器，减少漂移和排障成本。

## 边界

这是一条本地开发路径，不是：

1. hosted control-plane CLI
2. Python 原生 runtime manager
3. 生产自托管部署入口

## 相关文档

1. [SDK 指南](/public/zh/reference/05-sdk)
2. [SDK CLI](/public/zh/reference/09-sdk-cli)
3. [5 分钟上手](/public/zh/getting-started/02-onboarding-5min)
