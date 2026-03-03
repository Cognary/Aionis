---
title: "Playground"
---

# Playground

`apps/playground` 是 Aionis 记忆与策略闭环的交互式 API 实验台。

## 覆盖路由

1. `POST /v1/memory/write`
2. `POST /v1/memory/recall`
3. `POST /v1/memory/recall_text`
4. `POST /v1/memory/rules/evaluate`
5. `POST /v1/memory/tools/select`
6. `POST /v1/memory/tools/feedback`
7. `POST /v1/memory/tools/decision`
8. `POST /v1/memory/tools/run`
9. `POST /v1/memory/resolve`
10. `POST /v1/memory/context/assemble`

## 主要能力

1. 三栏控制台布局：左侧导航与历史，中间聊天与检查器，右侧运行设置。
2. 完整双语 UI（`EN` / `中文`），并持久化语言偏好。
3. LLM 配置面板（`provider`、`base_url`、`model`、`api_key`、`temperature`、`max_tokens`、`system_prompt`）本地持久化。
4. 内置会话管理（新建/删除/切换/重命名/清空）和多轮对话线程。
5. 每轮可选 `recall_text` 注入；可选自动写入对话到记忆（模拟自学习）。
6. 一键连接测试（Test connection）。
7. 场景预设（Support/Sales/Assistant）快速填充 tenant/scope 和 payload。
8. 每个操作都有 JSON 模板编辑器，支持运行时变量（如 `\{\{last.decision_id\}\}`）。
9. Flow 编排支持断言（`expect_ok`、`require_decision_id`、`max_duration_ms` 等）和失败即停。
10. 检查器支持请求链、响应 diff、导出 JSON/Markdown、分享链接。
11. `context/assemble` 提供层预算与 merge trace 的可视化调参。
12. URI-first 检查动作：`decision_uri` / `commit_uri` 一键复制与 `resolve`。

## 本地运行

```bash
npm --prefix apps/playground install
npm run -s playground:dev
```

构建与启动：

```bash
npm run -s playground:build
npm run -s playground:start
```

默认 API 目标是 `http://127.0.0.1:3001`，可在 UI 中修改。

## 使用说明

1. Playground 通过自身服务端路由 `/api/playground/execute` 转发请求，避免浏览器本地调试时的 CORS 阻断。
2. 凭据属于运行时输入，不会写入仓库。
3. 使用生产凭据时，建议仅在内网或受控环境开放 Playground。
