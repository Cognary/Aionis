---
title: "SDK CLI"
---

# SDK CLI

TypeScript SDK 现在内置了一套面向 runtime 的 CLI。

安装：

```bash
npm install @aionis/sdk@0.2.20
```

不用全局安装也能直接跑：

```bash
npx @aionis/sdk@0.2.20 --help
```

## 它是什么

这套 CLI 是 Aionis runtime 的命令行产品面，当前覆盖：

1. 本地 Lite runtime 生命周期
2. Aionis Doc 的编译、direct execution、handoff、publish、recover 工作流
3. tool runs、replay 状态和 artifact 输出检查
4. runtime 健康检查和环境诊断
5. execution eval 结果检查
6. execution eval gate

当前已实现的命令组：

1. `aionis runtime ...`
2. `aionis doc ...`
3. `aionis eval ...`
4. `aionis runs ...`
5. `aionis playbooks ...`
6. `aionis replay inspect-run`
7. `aionis replay inspect-playbook`
8. `aionis replay recover`
9. `aionis replay explain`
10. `aionis artifacts ...`

兼容 alias 仍然可用：

1. `aionis dev`
2. `aionis stop`
3. `aionis health`
4. `aionis doctor`
5. `aionis selfcheck`

当前边界：

1. runtime 生命周期仍然只覆盖本地 Lite
2. Aionis Doc 当前覆盖 compile、最小 direct execution、handoff、publish、recover 这条工作流
3. eval 命令消费本地 artifact 目录或预生成的 eval summary
4. 这仍然不是 hosted control-plane CLI

如果本地没有 Aionis 仓库，当前 bootstrap 路径是：

1. 先搜索本地 runtime root
2. 复用 `~/.aionis/runtime` 下的缓存 runtime
3. 有可用 bundle 时下载版本化 runtime bundle
4. bundle 不可用时回退到 GitHub 源码归档 bootstrap

## 快速开始

启动 Lite：

```bash
npx @aionis/sdk@0.2.20 runtime dev
```

检查健康：

```bash
npx @aionis/sdk@0.2.20 runtime health --base-url http://127.0.0.1:3321
```

运行 doctor：

```bash
npx @aionis/sdk@0.2.20 runtime doctor --base-url http://127.0.0.1:3321
```

运行 selfcheck：

```bash
npx @aionis/sdk@0.2.20 runtime selfcheck --base-url http://127.0.0.1:3321
```

停止当前端口上由 CLI 追踪的 Lite：

```bash
npx @aionis/sdk@0.2.20 runtime stop --port 3321
```

把一份 Aionis Doc 编译成 graph 输出：

```bash
npx @aionis/sdk@0.2.20 doc compile ./workflow.aionis.md --emit graph
```

直接执行一份 Aionis Doc：

```bash
npx @aionis/sdk@0.2.20 doc execute ./workflow.aionis.md
```

把一份 Aionis Doc 发布进原生 handoff store：

```bash
npx @aionis/sdk@0.2.20 doc publish ./workflow.aionis.md --base-url http://127.0.0.1:3001 --scope default
```

把这份 Aionis Doc 对应的 handoff continuity 再恢复出来：

```bash
npx @aionis/sdk@0.2.20 doc recover ./workflow.aionis.md --base-url http://127.0.0.1:3001 --scope default
```

检查一份 benchmark artifact 的 execution eval：

```bash
npx @aionis/sdk@0.2.20 eval inspect --artifact-dir /path/to/artifact
```

对比两份 eval：

```bash
npx @aionis/sdk@0.2.20 eval compare --baseline /path/to/baseline --treatment /path/to/treatment
```

对 nightly 或 regression artifact 做 gate：

```bash
npx @aionis/sdk@0.2.20 eval gate --artifact-dir /path/to/artifact
```

检查一条 run lifecycle：

```bash
npx @aionis/sdk@0.2.20 runs get --run-id <run_id> --include-feedback
```

检查一条 run 关联的 decisions：

```bash
npx @aionis/sdk@0.2.20 runs decisions --run-id <run_id>
```

检查一条 run 关联的 feedback：

```bash
npx @aionis/sdk@0.2.20 runs feedback --run-id <run_id>
```

列出最近的 tool-lifecycle runs：

```bash
npx @aionis/sdk@0.2.20 runs list --limit 20
```

检查一条 run timeline：

```bash
npx @aionis/sdk@0.2.20 runs timeline --run-id <run_id>
```

检查一份 replay playbook：

```bash
npx @aionis/sdk@0.2.20 playbooks get --playbook-id <playbook_id>
```

检查一份 playbook 的 deterministic replay 候选结果：

```bash
npx @aionis/sdk@0.2.20 playbooks candidate --playbook-id <playbook_id> --mode strict
```

检查一份 playbook 的 governed dispatch 结果：

```bash
npx @aionis/sdk@0.2.20 playbooks dispatch --playbook-id <playbook_id> --mode simulate
```

检查一条 replay run：

```bash
npx @aionis/sdk@0.2.20 replay inspect-run --run-id <run_id> --include-steps --include-artifacts
```

检查一份 replay playbook：

```bash
npx @aionis/sdk@0.2.20 replay inspect-playbook --playbook-id <playbook_id> --mode strict
```

查看一条 replay run 的只读恢复计划：

```bash
npx @aionis/sdk@0.2.20 replay recover --run-id <run_id> --allow-partial
```

解释一条 run 当前的 replay compile readiness：

```bash
npx @aionis/sdk@0.2.20 replay explain --run-id <run_id>
```

列出一份 artifact 目录内容：

```bash
npx @aionis/sdk@0.2.20 artifacts list --artifact-dir /path/to/artifact
```

查看一份 artifact 文件：

```bash
npx @aionis/sdk@0.2.20 artifacts show --artifact-dir /path/to/artifact --name execution_eval_summary.json
```

导出一份 artifact 目录：

```bash
npx @aionis/sdk@0.2.20 artifacts export --artifact-dir /path/to/artifact --out /tmp/artifact-copy
```

打包一份 artifact 目录：

```bash
npx @aionis/sdk@0.2.20 artifacts pack --artifact-dir /path/to/artifact --out /tmp/artifact.tgz
```

## 命令说明

### `aionis runtime dev`

`aionis runtime dev` 会启动或附着到一个本地 Lite runtime。

常用参数：

1. `--runtime-root /path/to/Aionis`
2. `--host 127.0.0.1`
3. `--port 3321`
4. `--runtime-version 0.2.20`
5. `--runtime-cache-dir ~/.aionis/runtime`
6. `--force-download`
7. `--offline`
8. `--foreground`
9. `--json`

如果不传 `--runtime-root`，CLI 会自动搜索：

1. 当前工作区
2. 父级目录
3. 常见本地路径，比如 `~/Desktop/Aionis`
4. 已缓存的 runtime bootstrap 目录
5. 远程 runtime bootstrap 源

### `aionis runtime doctor`

`runtime doctor` 当前会检查：

1. `node:sqlite` 支持
2. runtime root 发现
3. runtime cache root
4. runtime manifest
5. `dist/index.js`
6. `scripts/start-lite.sh`
7. pid 文件
8. pid 是否仍存活
9. 日志路径
10. write / replay SQLite 路径
11. runtime health

### `aionis runtime selfcheck`

`runtime selfcheck` 会跑一套最小闭环：

1. `health`
2. `memory/write`
3. `memory/recall_text`
4. `handoff/store`
5. `handoff/recover`
6. `tools/select`
7. replay run + compile

### `aionis doc ...`

`aionis doc ...` 是 Aionis Doc 的 executable-document 工作流入口。

这里说的是 `@aionis/sdk` 主 CLI 里的集成命令面，不是 `@aionis/doc` 包自身的独立二进制名字。

适合用在你想把一份人类可读文档推进成：

1. compile 结果
2. direct execution 结果
3. runtime handoff
4. handoff/store request
5. `/v1/handoff/store` 发布
6. `/v1/handoff/recover` 恢复结果
7. `context/assemble -> tools/select -> tools/decision -> tools/run` resume 结果

底层桥接到的独立二进制是：

1. `compile-aionis-doc`
2. `execute-aionis-doc`
3. `build-aionis-doc-runtime-handoff`
4. `build-aionis-doc-handoff-store-request`
5. `publish-aionis-doc-handoff`
6. `recover-aionis-doc-handoff`
7. `resume-aionis-doc-runtime`

当前 V1 命令：

1. `aionis doc compile <input-file>`
2. `aionis doc execute <input-file>`
3. `aionis doc runtime-handoff <input-file>`
4. `aionis doc store-request <runtime-handoff.json>`
5. `aionis doc publish <input-file>`
6. `aionis doc recover <input-file>`
7. `aionis doc resume <input-file>`

推荐用法：

1. 想看 AST / IR / graph 时，用 `doc compile`
2. 想直接从文档拿最小执行结果时，用 `doc execute`
3. 想拿 execution continuity carrier 时，用 `doc runtime-handoff`
4. 想拿显式的 native handoff/store payload 时，用 `doc store-request`
5. 想把 workflow 正式写入 Aionis handoff memory 时，用 `doc publish`
6. 想通过原生 recover endpoint 拿回 handoff、execution state 和 next action 时，用 `doc recover`
7. 想把 recovered continuity 直接推进到 `context/assemble -> tools/select -> tools/decision -> tools/run` 时，用 `doc resume`
8. 如果还想顺手写入一次治理反馈，可额外传 `--feedback-outcome`

当前支持的输入模式：

1. `doc execute` 支持 `source|compile-envelope|plan`
2. `doc runtime-handoff` 支持 `source|compile-envelope`
3. `doc publish` 支持 `source|runtime-handoff|handoff-store-request`
4. `doc recover` 支持 `source|runtime-handoff|handoff-store-request|publish-result`
5. `doc resume` 支持 `source|runtime-handoff|handoff-store-request|publish-result|recover-result`

这意味着 SDK CLI 现在已经把 Aionis Doc 从源文档一路暴露到 recovered continuity 以及 post-recover resume，不需要自己手工拼 `context/assemble`、`tools/select`、`tools/decision` 和 `tools/run`。如果显式传 `--feedback-outcome`，还可以继续补一笔 `tools/feedback`，并拿到 feedback 前后的 run lifecycle 对比。

当前文档默认优先讲 `aionis doc ...`，因为这是已经收口到主产品 CLI 的路径。`@aionis/doc` 独立包本身目前仍更适合视为仓内可用的低层入口，而不是已经完全收口的独立公开分发面。

### `aionis runs ...`

`aionis runs ...` 用来检查 tool-selection runs 及其 decision / feedback 历史。

当前 V1 命令：

1. `aionis runs list`
2. `aionis runs get`
3. `aionis runs timeline`
4. `aionis runs decisions`
5. `aionis runs feedback`

### `aionis eval inspect`

`eval inspect` 会读取：

1. 已存在的 `execution_eval_summary.json`
2. 或包含 `summary.json` 与 `cases.jsonl` 的原始 artifact 目录

适合用来从 CLI 直接拿稳定的 execution-eval summary。

### `aionis eval compare`

`eval compare` 会比较两份 eval 输入，输出：

1. treatment 结果变化
2. treatment score 变化
3. delta 变化

### `aionis eval gate`

`eval gate` 会套用当前 execution gate 规则，并返回：

1. 通过时退出码 `0`
2. gate 失败时退出码 `5`

如果你要把结果接进 CI 或初始化脚本，建议加 `--json`。

### `aionis runs get`

`runs get` 会通过当前 tools lifecycle surface 检查一条 run。

当前 V1 支持：

1. `--run-id <id>`
2. 可选 `--scope <scope>`
3. 可选 `--decision-limit <n>`
4. 可选 `--include-feedback`
5. 可选 `--feedback-limit <n>`
6. `--json`

当前边界：

1. 这是基于 `/v1/memory/tools/run` 的真实 run inspection surface
2. 还不是一个泛 runtime 的统一 run model

### `aionis runs decisions`

`runs decisions` 会检查一条 run 关联的 decisions。

当前 V1 支持：

1. `--run-id <id>`
2. 可选 `--scope <scope>`
3. 可选 `--decision-limit <n>`
4. `--json`

当前行为：

1. 先从 `tools/run` 读取这条 run 的 decisions
2. 再从 `tools/decision` 读取这条 run 的 latest decision

### `aionis runs feedback`

`runs feedback` 会检查一条 run 关联的 feedback。

当前 V1 支持：

1. `--run-id <id>`
2. 可选 `--scope <scope>`
3. 可选 `--feedback-limit <n>`
4. `--json`

### `aionis playbooks get`

`playbooks get` 用来按 id 获取一份 replay playbook。

当前 V1 支持：

1. `--playbook-id <id>`
2. 可选 `--scope <scope>`
3. `--json`

### `aionis playbooks candidate`

`playbooks candidate` 用来检查一份 playbook 是否适合 deterministic replay。

当前 V1 支持：

1. `--playbook-id <id>`
2. 可选 `--scope <scope>`
3. 可选 `--version <n>`
4. 可选 `--mode simulate|strict|guided`
5. `--json`

### `aionis playbooks dispatch`

`playbooks dispatch` 用来查看一份 playbook 的 governed replay dispatch 返回结果。

当前 V1 支持：

1. `--playbook-id <id>`
2. 可选 `--scope <scope>`
3. 可选 `--version <n>`
4. 可选 `--mode simulate|strict|guided`
5. `--json`

### `aionis replay ...`

`aionis replay ...` 用来检查 replay runs 以及 replay 派生的恢复状态。

当前 V1 命令：

1. `aionis replay inspect-run`
2. `aionis replay inspect-playbook`
3. `aionis replay recover`
4. `aionis replay explain`

### `aionis replay inspect-playbook`

`replay inspect-playbook` 会组合两条 inspection surface：

1. `playbooks/get`
2. `playbooks/candidate`

当前 V1 支持：

1. `--playbook-id <id>`
2. 可选 `--scope <scope>`
3. 可选 `--version <n>`
4. 可选 `--mode simulate|strict|guided`
5. `--json`

当前行为：

1. 获取 playbook 元数据和状态
2. 评估同一份 playbook 的 deterministic replay candidacy
3. 在一个 envelope 里返回 candidate、deterministic gate 和 cost signals

### `aionis replay recover`

`replay recover` 会返回一条 replay run 的只读恢复计划。

当前 V1 支持：

1. `--run-id <id>`
2. 可选 `--scope <scope>`
3. 可选 `--allow-partial`
4. `--json`

当前行为：

1. 拉取带 steps 的 replay run
2. 判断当前是否可恢复
3. 在一个 envelope 里返回 `recovery_path`、`blockers` 和 `next_action`
4. 不会写 replay 状态，也不会自动 compile

### `aionis replay explain`

`replay explain` 会给出一条只读解释，说明某个 replay run 当前是否满足 playbook generation 的 compile 条件。

当前 V1 支持：

1. `--run-id <id>`
2. 可选 `--scope <scope>`
3. 可选 `--allow-partial`
4. `--json`

当前行为：

1. 拉取包含 steps 的 replay run
2. 解释当前 `compile_from_run` 会不会被阻断
3. 在一个 envelope 里返回 blockers、next action 和 step status frequency

### `aionis runs list`

`runs list` 会从真实的 execution-decision store 返回最近的 tool-lifecycle runs。

当前 V1 支持：

1. 可选 `--scope <scope>`
2. 可选 `--limit <n>`
3. `--json`

当前行为：

1. 从持久化 execution decisions 做 recent runs rollup
2. 返回 decision count、feedback total、latest decision time 和 latest selected tool
3. 不暴露假的 scenario filter 或 cursor 语义

### `aionis runs timeline`

`runs timeline` 会返回一条 tool-lifecycle run 的真实有序事件流。

当前 V1 支持：

1. `--run-id <id>`
2. 可选 `--scope <scope>`
3. 可选 `--decision-limit <n>`
4. 可选 `--feedback-limit <n>`
5. `--json`

当前行为：

1. 通过 `tools/run` 拉取单条 run
2. 将 decisions 和 recent feedback 合并成一个有序事件流
3. 暴露的是窄版 tool-lifecycle timeline，不是通用 runtime event log

### `aionis artifacts list`

`artifacts list` 会递归列出一份 artifact 目录下的文件和子目录。

当前 V1 支持：

1. `--artifact-dir <path>`
2. `--json`

### `aionis artifacts show`

`artifacts show` 会读取 artifact 目录下的一份文件，并输出 UTF-8 文本或 base64 内容。

当前 V1 支持：

1. `--artifact-dir <path>`
2. `--name <relative-file>`
3. `--json`

### `aionis artifacts export`

`artifacts export` 会把一份 artifact 目录复制到另一个本地路径。

当前 V1 支持：

1. `--artifact-dir <path>`
2. `--out <path>`
3. `--json`

### `aionis artifacts pack`

`artifacts pack` 会把一份 artifact 目录打成 `.tar.gz` 包。

当前 V1 支持：

1. `--artifact-dir <path>`
2. `--out <path>`
3. `--json`

## 推荐使用场景

这套 CLI 适合：

1. 快速拉起本地 Aionis Lite
2. 做重复性的 runtime 自检
3. 用 `aionis doc ...` 跑一条正式的 executable-document 工作流
4. 检查 execution eval 结果
5. 在 CI 里做 scriptable gate
6. 不用直接打原始 API 就能检查 replay/playbook/run

## 相关文档

1. [SDK 指南](/public/zh/reference/05-sdk)
2. [SDK 兼容矩阵](/public/zh/reference/06-sdk-compatibility-matrix)
3. [5 分钟上手](/public/zh/getting-started/02-onboarding-5min)
