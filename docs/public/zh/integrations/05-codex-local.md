---
title: "Codex 本地 Profile"
---

# Codex 本地 Profile

`Aionis Codex Local Profile` 是面向 Codex 用户的官方本地接入方案。

当前有两种值得用的本地模式。

## 模式 A：纯 Lite + Dev MCP

适合：

1. 按项目作用域跑本地记忆和 replay
2. 想用 SQLite-backed Lite 做低摩擦验证
3. 希望 Codex CLI 显式 opt-in 接入 Aionis 的用户

这条模式包含：

1. `start:lite` 作为本地 runtime
2. `aionis-dev-mcp` 作为 MCP 工具面
3. `codex-aionis-project` 这类按项目启动器

从这里开始：

```bash
npm run build
npm run start:lite
```

然后按项目启动 Codex：

```bash
codex-aionis-project -C /path/to/project
```

它会带来：

1. Lite-backed memory 和 replay
2. 按项目推导的 `scope`
3. 显式接入，而不是全局把 Codex 都绑到 Aionis 上

## 模式 B：Tracked Standalone Profile

适合：

1. 想走完整 tracked wrapper 路径的团队
2. 希望本地编码任务自动记录 replay run 和 step 的场景
3. 想继续使用旧的 standalone Docker profile 的用户

这条模式把三层东西收成了一套：

1. `Aionis Dev MCP` 作为 MCP 工具面
2. standalone Docker 作为本地 Aionis runtime
3. 一个会自动记录 replay run 和 step 的 agent wrapper

## 该怎么选

1. 如果你要最简单的本地使用路径，选 **纯 Lite + Dev MCP**。
2. 如果你要完整 wrapper 驱动的 replay 生命周期，选 **Tracked Standalone Profile**。

## 默认会发生什么

启用这个 Profile 之后，一次通过 `codex-aionis` 启动的任务会默认经过：

1. session 启动时自动记录 replay run
2. 自动请求 planning context
3. 本地命令步骤可自动记录 replay step
4. session 结束时自动写回 run end

## Standalone 三步上手

1. 先把 standalone 拉起来：

```bash
cd /path/to/Aionis
npm run -s mcp:aionis:dev:standalone:oneclick
```

2. 把 Codex 配好，并安装本地 launcher：

```bash
npm run -s aionis:setup:codex
npm run -s aionis:install:codex-launcher
```

3. 跑一遍 doctor：

```bash
npm run -s aionis:doctor:codex
```

完成之后，直接用：

```bash
codex-aionis \
  --root /path/to/Aionis \
  --title "Your task title" \
  --goal "Your concrete goal" \
  --query "Your natural language task description" \
  -- codex
```

## 用户会看到什么

对 standalone 用户来说，这个 Profile 只有两个主要入口：

1. `codex-aionis`：启动受跟踪的 Codex 会话
2. `codex-aionis-doctor`：检查本地 runtime、MCP launcher 和 replay 编排是否正常

## 命令步骤记录

如果你在一个进行中的 session 里想手动记录常见命令步骤，可以用这些 helper：

```bash
AIONIS_RUN_ID=<run-id> \
AIONIS_SESSION_ROOT=/path/to/Aionis \
bash /path/to/Aionis/scripts/aionis-build
```

也可以直接用：

1. `bash /path/to/Aionis/scripts/aionis-test`
2. `bash /path/to/Aionis/scripts/aionis-lint`

## 故障排查

如果 `codex-aionis` 没按预期工作，优先检查这三件事：

1. standalone 容器是否真的在运行
2. `codex-aionis-doctor` 是否通过
3. Codex 是否已经加载了 `aionis-dev` MCP 配置

最直接的 standalone 检查命令是：

```bash
codex-aionis-doctor
codex mcp list
```

## 低层入口

如果你要做更细的集成或调试，底层入口仍然保留：

1. `npm run -s aionis:codex`
2. `npm run -s aionis:setup:codex`
3. `npm run -s aionis:doctor:codex`
4. `npm run -s devloop:session`

## 相关页面

1. [MCP 集成](/public/zh/integrations/01-mcp)
2. [快速开始](/public/zh/getting-started/01-get-started)
3. [Lite 运维说明](/public/zh/getting-started/04-lite-operator-notes)
