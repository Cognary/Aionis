# Aionis 功能启用简化手册

日期: 2026-03-14

## 这份手册解决什么问题

上一份审计文档列出了 Aionis 里哪些能力默认关闭、如何开启、以及代码依据。

这份手册不再做全量审计，而是回答更实际的问题:

1. 我现在要开启哪个能力
2. 最少要改哪些配置
3. 什么应该先开，什么不要轻易默认开

配套审计原表:

1. `docs/internal/remediation/AIONIS_DEFAULT_OFF_AND_OPT_IN_FEATURES_2026-03-14.md`
2. `docs/internal/remediation/AIONIS_ENV_BUNDLE_TEMPLATES_2026-03-14.md`

如果你不想自己挑变量，也可以直接用 bundle:

```bash
npm run -s env:bundle:local-safe
npm run -s env:bundle:experimental
npm run -s env:bundle:team-shared
npm run -s env:bundle:high-risk
npm run -s env:bundle:list
npm run -s env:bundle:status
npm run -s env:bundle:status:verbose
npm run -s env:bundle:diff -- experimental
npm run -s env:bundle:plan -- experimental
npm run -s env:bundle:apply -- --dry-run experimental
npm run -s env:bundle:apply -- --backup experimental
```

## 总原则

1. Aionis 的设计是默认保守，不是默认全开。
2. 先开低风险能力，再开高风险能力。
3. 能做请求级 opt-in 的，优先不要直接改成服务端默认。
4. 任何涉及本地执行、自动晋升、危险 Ops 写操作的能力，都要单独审批。

## 最常见的 8 个启用场景

### 1. 只想本地安全试用，不要额外开功能

适合:

1. 本地开发
2. 新同学第一次接触仓库
3. 想先确认基本链路

建议:

1. 保持默认值
2. 不开 `sandbox`
3. 不开 `embedded experimental backend`
4. 不开 `auto-promote`
5. 不开 `dangerous ops actions`

最小基线:

```env
AIONIS_MODE=local
APP_ENV=dev
MEMORY_AUTH_MODE=off
```

### 2. 想实验“更宽图召回”，但不想改服务端默认

推荐做法:

1. 不要先开 `MEMORY_RECALL_CLASS_AWARE_ENABLED`
2. 先在请求里显式传 `recall_mode="dense_edge"`
3. 这比直接改服务端默认更可控

适合:

1. planner/context 实验
2. 少量 benchmark 对比
3. 单调用方验证 recall 质量

请求级做法:

```json
{
  "query_text": "prepare production deploy context",
  "recall_mode": "dense_edge"
}
```

如果你真的要开 selector 默认:

```env
MEMORY_RECALL_CLASS_AWARE_ENABLED=true
```

但建议前提是: 已有稳定 benchmark 证据。

### 3. 想开启 endpoint-default context optimization

这是最值得优先做的“成本优化类”开关之一，因为风险通常低于 sandbox / auto-promote。

推荐顺序:

1. 先在请求里传 `context_optimization_profile`
2. 验证效果稳定后
3. 再改服务端默认

推荐配置:

```env
MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT=balanced
MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT=balanced
```

如果你要更激进:

```env
MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT=aggressive
MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT=aggressive
```

不建议一开始就上 `aggressive`。

### 4. 想开启 Sandbox

这是高风险能力，因为它开始进入执行面。

最低要求:

```env
SANDBOX_ENABLED=true
SANDBOX_ADMIN_ONLY=true
SANDBOX_EXECUTOR_MODE=mock
SANDBOX_ALLOWED_COMMANDS_JSON=["echo"]
```

如果要本地命令执行:

```env
SANDBOX_ENABLED=true
SANDBOX_ADMIN_ONLY=true
SANDBOX_EXECUTOR_MODE=local_process
SANDBOX_ALLOWED_COMMANDS_JSON=["echo","python3","node"]
```

生产环境额外要求:

```env
SANDBOX_LOCAL_PROCESS_ALLOW_IN_PROD=true
```

但更推荐生产使用 `http_remote`，不要直接开 `local_process`。

### 5. 想开启 guided repair 的 `builtin_llm`

如果只是让服务端支持 OpenAI-compatible repairer，本身不够，还要决定是否允许调用方在请求里临时切换成 `builtin_llm`。

最小配置:

```env
REPLAY_GUIDED_REPAIR_STRATEGY=builtin_llm
REPLAY_GUIDED_REPAIR_LLM_API_KEY=...
REPLAY_GUIDED_REPAIR_LLM_MODEL=gpt-4.1-mini
```

如果你还要允许请求方临时切换:

```env
REPLAY_GUIDED_REPAIR_ALLOW_REQUEST_BUILTIN_LLM=true
```

建议:

1. 先只开服务端默认 repairer
2. 不要先开放 request-side override

### 6. 想开启 replay learning 和 auto-promotion

这是另一个高风险区，因为它会影响策略生命周期。

只开 replay learning:

```env
REPLAY_LEARNING_PROJECTION_ENABLED=true
REPLAY_LEARNING_TARGET_RULE_STATE=draft
```

如果你还想默认 review 通过后自动晋升:

```env
REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_DEFAULT=true
REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_TARGET_STATUS=active
```

建议:

1. 先把 learning target 保持在 `draft`
2. 自动晋升不要一开始就开
3. 必须先确认 shadow validation 质量稳定

### 7. 想实验 embedded backend

最小配置:

```env
MEMORY_STORE_BACKEND=embedded
MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED=true
```

如果你还需要 embedded shadow mirror:

```env
MEMORY_STORE_EMBEDDED_SHADOW_MIRROR_ENABLED=true
```

如果你还要 embedded debug embeddings:

```env
MEMORY_STORE_EMBEDDED_RECALL_DEBUG_EMBEDDINGS_ENABLED=true
```

建议:

1. 先只开 backend 本身
2. shadow mirror 单独评估
3. debug embeddings 只给调试场景

### 8. 想临时开启 Ops 危险操作

只建议:

1. 故障处理窗口
2. 明确审批后
3. 执行完立即关闭

配置:

```env
OPS_DANGEROUS_ACTIONS_ENABLED=true
```

同时建议:

```env
OPS_BASIC_AUTH_ENABLED=true
OPS_BASIC_AUTH_USER=ops
OPS_BASIC_AUTH_PASS=change-me
```

## 推荐启用顺序

如果是团队环境，建议按这个顺序推进:

1. 先补全认证: `MEMORY_AUTH_MODE`
2. 再确认限流和租户配额保持开启
3. 再做 recall / context optimization 实验
4. 再做 embedded backend 或 replay learning 实验
5. 再做 sandbox
6. 最后才考虑 auto-promote 和危险 Ops 动作

## 明确不建议直接默认开启的东西

以下能力，即使仓库支持，也不建议“先开再说”:

1. `SANDBOX_ENABLED`
2. `SANDBOX_EXECUTOR_MODE=local_process` in prod
3. `REPLAY_GUIDED_REPAIR_ALLOW_REQUEST_BUILTIN_LLM=true`
4. `REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_DEFAULT=true`
5. `OPS_DANGEROUS_ACTIONS_ENABLED=true`
6. `MEMORY_RECALL_CLASS_AWARE_ENABLED=true` without benchmark evidence

## 给团队的最简判断口诀

1. 想提效果，先做请求级 opt-in
2. 想提默认，先跑 benchmark / gate
3. 想碰执行面，先收权限
4. 想碰自动晋升，先看 shadow validation
5. 想碰危险操作，只开短窗口

## 维护建议

每次新增默认关闭能力时，建议同步更新两份文档:

1. 审计总表: `AIONIS_DEFAULT_OFF_AND_OPT_IN_FEATURES_2026-03-14.md`
2. 这份简化手册: `AIONIS_FEATURE_ENABLEMENT_GUIDE_2026-03-14.md`
