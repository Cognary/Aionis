---
title: "Aionis Doc 合同"
---

# Aionis Doc 合同

Aionis Doc toolchain 会输出一组版本化 JSON 合同，方便 runtime 和外部工具按稳定 shape 集成。

## 当前版本化输出

### Compile Result

版本：

```text
aionis_doc_compile_result_v1
```

用途：

1. compiler envelope
2. diagnostics summary
3. AST / IR / graph transport

### Runtime Handoff

版本：

```text
aionis_doc_runtime_handoff_v1
```

用途：

1. execution continuity carrier
2. `execution_state_v1`
3. `execution_packet_v1`
4. `execution_ready_handoff`

### Handoff Store Request

版本：

```text
aionis_doc_handoff_store_request_v1
```

用途：

1. native `/v1/handoff/store` request payload
2. 从 document runtime handoff 到 Aionis handoff memory 的显式桥

### Publish Result

版本：

```text
aionis_doc_publish_result_v1
```

用途：

1. store 提交结果
2. 返回的 `commit_id`
3. 存储后的 anchor 和 handoff kind

### Recover Result

版本：

```text
aionis_doc_recover_result_v1
```

用途：

1. publish-plus-recover 或 recover-only 的结果 envelope
2. recover request payload
3. recovered handoff response

## 合同推进顺序

通常的推进顺序是：

1. compile result
2. runtime handoff
3. handoff store request
4. publish result
5. recover result

## 为什么版本化 envelope 很重要

这些合同可以帮助你：

1. 保持 CLI 输出稳定
2. 让 runtime 消费端不再为每个命令写不同解析分支
3. 在测试里验证集成
4. 后续扩展新合同而不静默破坏旧集成

## 相关文档

1. [Aionis Doc](/public/zh/reference/10-aionis-doc)
2. [Aionis Doc CLI 工作流](/public/zh/reference/13-aionis-doc-cli-workflow)
3. [SDK CLI](/public/zh/reference/09-sdk-cli)
4. [Aionis Doc 示例](/public/zh/reference/15-aionis-doc-examples)
5. [Aionis Doc Diagnostics](/public/zh/reference/16-aionis-doc-diagnostics)
