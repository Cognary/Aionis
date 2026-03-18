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
2. runtime 健康检查和环境诊断
3. execution eval 结果检查
4. execution eval gate

当前已实现的命令组：

1. `aionis runtime ...`
2. `aionis eval ...`

兼容 alias 仍然可用：

1. `aionis dev`
2. `aionis stop`
3. `aionis health`
4. `aionis doctor`
5. `aionis selfcheck`

当前边界：

1. runtime 生命周期仍然只覆盖本地 Lite
2. eval 命令消费本地 artifact 目录或预生成的 eval summary
3. 这仍然不是 hosted control-plane CLI

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

## 推荐使用场景

这套 CLI 适合：

1. 快速拉起本地 Aionis Lite
2. 做重复性的 runtime 自检
3. 检查 execution eval 结果
4. 在 CI 里做 scriptable gate

## 相关文档

1. [SDK 指南](/public/zh/reference/05-sdk)
2. [SDK 兼容矩阵](/public/zh/reference/06-sdk-compatibility-matrix)
3. [5 分钟上手](/public/zh/getting-started/02-onboarding-5min)
