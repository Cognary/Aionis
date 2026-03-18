---
title: "Aionis Doc CLI 工作流"
---

# Aionis Doc CLI 工作流

这页会明确区分两层命令面：

1. `@aionis/sdk` 暴露的集成 CLI：`aionis doc ...`
2. `@aionis/doc` 包本身暴露的独立二进制

## SDK 集成 CLI 路径

如果你走当前公开的主 CLI 路径，用的是：

1. `aionis doc compile`
2. `aionis doc execute`
3. `aionis doc runtime-handoff`
4. `aionis doc store-request`
5. `aionis doc publish`
6. `aionis doc recover`
7. `aionis doc resume`

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
5. `plan`
6. `diagnostics`

其中 `plan` 会输出 runtime-neutral 的 `execution_plan_v1`，这是 Direct Execution 路径准备使用的编译产物。

## Execute

当你要直接从文档或 plan 产物得到执行结果时，用 `execute`。

```bash
npx @aionis/sdk@0.2.20 doc execute ./workflow.aionis.md
```

支持的 input kind：

1. `source`
2. `compile-envelope`
3. `plan`

当前这条路径会产出版本化的 `aionis_doc_execution_result_v1`，由一个最小本地 runtime 执行固定 demo modules。它的意义是把公开边界从“只有 continuity”推进到“已经有最小 direct execution”。

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
5. 在已有 execution result 时可选携带 `execution_result_summary`
6. 在已有 execution result 时可选携带 `execution_artifacts` 和 `execution_evidence`

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

## Resume

当你要把 recovered continuity 直接推进到 `context/assemble -> tools/select -> tools/decision -> tools/run` 时，用 `resume`。

```bash
npx @aionis/sdk@0.2.20 doc resume ./recover-result.json --input-kind recover-result --candidate resume_patch --candidate request_review --base-url http://127.0.0.1:3001 --scope default
```

支持的 input kind：

1. `source`
2. `runtime-handoff`
3. `handoff-store-request`
4. `publish-result`
5. `recover-result`

这条命令会自动串起：

1. 必要时先 recover
2. 调用 `POST /v1/memory/context/assemble`
3. 调用 `POST /v1/memory/tools/select`
4. 调用 `POST /v1/memory/tools/decision`
5. 调用 `POST /v1/memory/tools/run`
6. 产出版本化的 `aionis_doc_resume_result_v1`

结果 envelope 里会显式带上：

1. `resume_summary`
2. `context_assemble_response`
3. `tools_select_response`
4. `tools_decision_response`
5. `tools_run_response`

如果显式传 `--feedback-outcome positive|negative|neutral`，它还会继续调用：

1. `POST /v1/memory/tools/feedback`
2. 并在结果里附带 `tools_feedback_request`
3. 和 `tools_feedback_response`
4. 以及 feedback 之后再次回读的 `tools_run_post_feedback_response`

其中 `resume_summary` 会直接给出：

1. `selected_tool`
2. `resume_state`
3. `feedback_written`
4. `pre_feedback_run_status`
5. `post_feedback_run_status`
6. `lifecycle_transition`

其中 `resume_state` 当前是 machine-friendly verdict：

1. `inspection_only`
2. `feedback_applied`
3. `lifecycle_advanced`

推荐判定方式：

1. 只想知道有没有继续推进，先读 `resume_state`
2. 想看推进前后差异，再读 `pre_feedback_run_status`、`post_feedback_run_status`

## 实际建议流程

authoring 阶段：

1. `doc compile`
2. `doc execute`
3. `doc runtime-handoff`

持久化阶段：

1. `doc publish`

恢复 continuity 阶段：

1. `doc recover`

恢复后继续执行阶段：

1. `doc resume`

## `@aionis/doc` 独立二进制

如果你直接使用 `@aionis/doc` 包本身，当前对应的是：

1. `compile-aionis-doc`
2. `execute-aionis-doc`
3. `build-aionis-doc-runtime-handoff`
4. `build-aionis-doc-handoff-store-request`
5. `publish-aionis-doc-handoff`
6. `recover-aionis-doc-handoff`
7. `resume-aionis-doc-runtime`

它们和上面的 `aionis doc ...` 是同一条工作流的两套入口：

1. `aionis doc ...` 适合主产品 CLI 使用者
2. 这组独立二进制更接近仓内包和低层集成入口

## 当前产品边界

现在公开收口好的路径，是 `@aionis/sdk` 提供的 `aionis doc ...` 集成 CLI。它已经有一条最小 direct execution 路径，但完整 continuity、publish、recover 仍然是更强的 Aionis 集成层。

当前公开边界是：

1. 编译文档
2. 产出 `execution_plan_v1`
3. 走最小本地 direct execution
4. 转换为 runtime continuity
5. 写入 handoff memory
6. 通过 native recover endpoint 恢复
7. 继续推进到 `context/assemble -> tools/select -> tools/decision -> tools/run`

`@aionis/doc` 独立包现在已经有最小独立发布面，仓库里可以直接走：

1. `aionis-doc:release-check`
2. `aionis-doc:pack-dry-run`
3. `aionis-doc:publish:dry-run`
4. `aionis-doc:publish`
5. `doc-v*` tag 驱动的 `Aionis Doc Publish` workflow

但是否能直接 `npm install @aionis/doc@<version>`，仍然取决于该版本是否已经实际发布到 npm。

## 下一步阅读

1. [Aionis Doc 合同](/public/zh/reference/14-aionis-doc-contracts)
2. [Aionis Doc 示例](/public/zh/reference/15-aionis-doc-examples)
3. [Aionis Doc Diagnostics](/public/zh/reference/16-aionis-doc-diagnostics)
