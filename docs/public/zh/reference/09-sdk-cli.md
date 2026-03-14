---
title: "SDK CLI"
---

# SDK CLI

TypeScript SDK 现在内置了一套 Phase 1 本地开发 CLI。

安装：

```bash
npm install @aionis/sdk
```

不用全局安装也能直接跑：

```bash
npx aionis --help
```

## 它是什么

这套 CLI 是本地 Lite 开发入口，不是 hosted control-plane CLI。

当前命令：

1. `aionis dev`
2. `aionis stop`
3. `aionis health`
4. `aionis doctor`
5. `aionis selfcheck`

Phase 1 边界：

1. 只管理本地 Lite
2. 不负责 Server 或 Cloud runtime 生命周期
3. `stop` 只管理由 CLI 自己启动并追踪的进程

## 快速开始

启动 Lite：

```bash
npx aionis dev --runtime-root /path/to/Aionis
```

检查健康：

```bash
npx aionis health --base-url http://127.0.0.1:3321
```

运行 doctor：

```bash
npx aionis doctor --runtime-root /path/to/Aionis --base-url http://127.0.0.1:3321
```

运行 selfcheck：

```bash
npx aionis selfcheck --base-url http://127.0.0.1:3321
```

停止当前端口上由 CLI 追踪的 Lite：

```bash
npx aionis stop --port 3321
```

## 命令说明

### `aionis dev`

`aionis dev` 会启动或附着到一个本地 Lite runtime。

常用参数：

1. `--runtime-root /path/to/Aionis`
2. `--host 127.0.0.1`
3. `--port 3321`
4. `--foreground`
5. `--json`

如果不传 `--runtime-root`，CLI 会自动搜索：

1. 当前工作区
2. 父级目录
3. 常见本地路径，比如 `~/Desktop/Aionis`

### `aionis doctor`

`doctor` 当前会检查：

1. `node:sqlite` 支持
2. runtime root 发现
3. `dist/index.js`
4. `scripts/start-lite.sh`
5. pid 文件
6. pid 是否仍存活
7. 日志路径
8. write / replay SQLite 路径
9. runtime health

### `aionis selfcheck`

`selfcheck` 会跑一套最小闭环：

1. `health`
2. `memory/write`
3. `memory/recall_text`
4. `handoff/store`
5. `handoff/recover`
6. `tools/select`
7. replay run + compile

如果你要把结果接进 CI 或初始化脚本，建议加 `--json`。

## 推荐使用场景

这套 CLI 适合：

1. 快速拉起本地 Aionis Lite
2. 做重复性的开发环境自检
3. 用 SDK-first 的方式取代零散 runtime shell 脚本

## 相关文档

1. [SDK 指南](/public/zh/reference/05-sdk)
2. [SDK 兼容矩阵](/public/zh/reference/06-sdk-compatibility-matrix)
3. [5 分钟上手](/public/zh/getting-started/02-onboarding-5min)
