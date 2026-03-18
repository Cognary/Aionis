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

### Execution Result

版本：

```text
aionis_doc_execution_result_v1
```

用途：

1. direct execution output envelope
2. runtime-neutral plan 的最小执行结果
3. `outputs`、`artifacts`、`evidence`、`node_results`、`errors` 和 `warnings` 的稳定载体

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
5. 可选的 `execution_result_summary`
6. execution-time `artifacts` / `evidence` continuity 映射

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

### Resume Result

版本：

```text
aionis_doc_resume_result_v1
```

用途：

1. post-recover resume 的结果 envelope
2. `context/assemble` 请求与响应快照
3. `tools/select` 请求与响应快照
4. `tools/decision` 生命周期查询结果
5. `tools/run` 生命周期查询结果

## 合同推进顺序

通常的推进顺序是：

1. compile result
2. execution result
3. runtime handoff
4. handoff store request
5. publish result
6. recover result
7. resume result

## Runtime-Neutral Module Contract

现在 direct execution 不再只依赖 JavaScript handler，也依赖一个稳定的模块侧 contract。

当前执行面采用 `manifest + handler` 拆分：

1. `manifest.module`
2. `manifest.version`
3. `manifest.required_capabilities`
4. `manifest.input_contract`
5. `manifest.output_contract`
6. `manifest.artifact_contract`
7. `manifest.evidence_contract`
8. `handler(input, context)`

其中 portable 的部分是 `manifest`。它描述模块是什么、需要哪些 runtime capability，以及输入输出必须满足什么 shape。`handler` 只是某个 runtime 下的本地实现。

这样 runtime 就可以在执行前后显式校验：

1. 不支持的模块能力要求
2. 不符合 contract 的输入
3. 不符合 contract 的输出
4. 不符合 contract 的 artifact side outputs
5. 不符合 contract 的 evidence side outputs

从而把执行 contract 从某个具体 runtime 实现里拆出来。

## Continuity Mapping

当 direct execution 已经先发生时，`runtime_handoff_v1` 现在还可以显式携带：

1. `execution_result_summary`
2. `execution_artifacts`
3. `execution_evidence`
4. `execution_packet_v1.artifact_refs`
5. `execution_packet_v1.evidence_refs`

这让 handoff 不再只承载“将来要执行什么”，也能承载“刚刚执行出了什么 side outputs”。

## Resume Lifecycle Mapping

当 recovered continuity 继续进入 runtime 政策闭环时，`resume_result_v1` 现在会显式携带：

1. `resume_summary`
2. `context_assemble_response`
3. `tools_select_response`
4. `tools_decision_response`
5. `tools_run_response`
6. 可选的 `tools_feedback_request`
7. 可选的 `tools_feedback_response`
8. 可选的 `tools_run_post_feedback_response`

`resume_summary` 用来避免调用方自己 diff 两次 `tools/run`，当前会直接给出：

1. `selected_tool`
2. `resume_state`
3. `feedback_written`
4. `feedback_outcome`
5. `pre_feedback_run_status`
6. `post_feedback_run_status`
7. `lifecycle_transition`
8. `lifecycle_advanced`
9. `feedback_updated_rules`

其中 `resume_state` 是优先给机器消费的 verdict：

1. `inspection_only`
2. `feedback_applied`
3. `lifecycle_advanced`

这意味着 `aionis doc resume` 不只是把 continuity 推进到 selection，而且会把决策与 run lifecycle 的只读快照也一起带回给调用方。显式传 `--feedback-outcome` 时，还会把一次治理反馈写入，以及 feedback 之后重新读取的 run lifecycle，一起收进同一个 envelope。

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
