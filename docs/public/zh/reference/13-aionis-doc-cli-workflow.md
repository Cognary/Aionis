---
title: "Aionis Doc CLI 工作流"
---

# Aionis Doc CLI 工作流

Aionis Doc 的官方 CLI 路径是：

1. `aionis doc compile`
2. `aionis doc runtime-handoff`
3. `aionis doc store-request`
4. `aionis doc publish`
5. `aionis doc recover`

## Compile

当你要拿 compiler artifacts 时，用 `compile`。

```bash
npx @aionis/sdk@0.2.20 doc compile ./workflow.aionis.md --emit all
```

支持的 emit mode：

1. `all`
2. `ast`
3. `ir`
4. `graph`
5. `diagnostics`

## Runtime Handoff

当你要从文档导出 execution continuity payload 时，用 `runtime-handoff`。

```bash
npx @aionis/sdk@0.2.20 doc runtime-handoff ./workflow.aionis.md --scope default
```

它会产出一个版本化 runtime handoff envelope，里面带有：

1. `execution_state_v1`
2. `execution_packet_v1`
3. `execution_ready_handoff`
4. `graph_summary`

## Store Request

当你要显式拿到 `/v1/handoff/store` payload 时，用 `store-request`。

```bash
npx @aionis/sdk@0.2.20 doc store-request ./runtime-handoff.json --scope default
```

它适合用在：

1. inspection
2. pipeline handoff
3. native handoff/store integration

## Publish

当你要把文档写入 Aionis handoff memory 时，用 `publish`。

```bash
npx @aionis/sdk@0.2.20 doc publish ./workflow.aionis.md --base-url http://127.0.0.1:3001 --scope default
```

支持的 input kind：

1. `source`
2. `runtime-handoff`
3. `handoff-store-request`

## Recover

当你要拿回 native recovered handoff 和 continuity payload 时，用 `recover`。

```bash
npx @aionis/sdk@0.2.20 doc recover ./workflow.aionis.md --base-url http://127.0.0.1:3001 --scope default
```

支持的 input kind：

1. `source`
2. `runtime-handoff`
3. `handoff-store-request`
4. `publish-result`

`publish-result` 模式适合 publish 已经在前一步做完、现在只想 recover 的场景。

## 实际建议流程

authoring 阶段：

1. `doc compile`
2. `doc runtime-handoff`

持久化阶段：

1. `doc publish`

恢复 continuity 阶段：

1. `doc recover`

## 当前产品边界

现在这套 CLI 给的是 source-to-handoff workflow。它还不会直接从文档本身启动完整 runtime execution。

当前公开边界是：

1. 编译文档
2. 转换为 runtime continuity
3. 写入 handoff memory
4. 通过 native recover endpoint 恢复

## 下一步阅读

1. [Aionis Doc 合同](/public/zh/reference/14-aionis-doc-contracts)
2. [Aionis Doc 示例](/public/zh/reference/15-aionis-doc-examples)
3. [Aionis Doc Diagnostics](/public/zh/reference/16-aionis-doc-diagnostics)
