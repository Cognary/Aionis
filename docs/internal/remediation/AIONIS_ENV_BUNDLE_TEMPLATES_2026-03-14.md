# Aionis `.env` Bundle Templates

日期: 2026-03-14

## 目的

这份文档提供 4 套可直接复用的 `.env` bundle。

它们不是完整 `.env` 文件，而是面向默认关闭功能的“成组开关模板”。设计目标是:

1. 能直接复制
2. 能用脚本应用
3. 不覆盖你已有的 secrets 和其他配置

## 文件位置

1. `scripts/env/feature-bundles/local_safe.env`
2. `scripts/env/feature-bundles/experimental.env`
3. `scripts/env/feature-bundles/team_shared.env`
4. `scripts/env/feature-bundles/high_risk.env`

## 使用方式

直接应用到当前仓库 `.env`:

```bash
npm run -s env:bundle:local-safe
npm run -s env:bundle:experimental
npm run -s env:bundle:team-shared
npm run -s env:bundle:high-risk
```

查看可用 bundle:

```bash
npm run -s env:bundle:list
```

查看当前 `.env` 正在使用的 bundle:

```bash
npm run -s env:bundle:status
```

查看当前 bundle 以及它管理的 key:

```bash
npm run -s env:bundle:status:verbose
```

预览当前 managed bundle 和目标 bundle 之间的差异:

```bash
npm run -s env:bundle:diff -- experimental
```

把 `status + diff + dry-run preview` 一次打印出来:

```bash
npm run -s env:bundle:plan -- experimental
```

预览将要写入的 managed block, 但不实际修改 `.env`:

```bash
npm run -s env:bundle:apply -- --dry-run experimental
```

应用前先备份当前 `.env`:

```bash
npm run -s env:bundle:apply -- --backup experimental
```

通用入口:

```bash
npm run -s env:bundle:apply -- experimental
```

行为说明:

1. 如果 `.env` 不存在，会先从 `.env.example` 创建
2. 只替换 managed feature bundle block
3. 其他现有键和值保持不动

## 4 套模板怎么选

### `local_safe`

适合:

1. 本地开发
2. 新人熟悉仓库
3. 想保持全部危险能力关闭

特点:

1. 保持 sandbox 关闭
2. 保持 replay learning / auto-promote 关闭
3. 保持 shadow dual-write 关闭
4. 保持 dangerous Ops actions 关闭

### `experimental`

适合:

1. recall / context optimization 实验
2. benchmark 对比
3. 单机评估默认值候选

特点:

1. 打开 `MEMORY_RECALL_CLASS_AWARE_ENABLED=true`
2. 打开 balanced endpoint-default context optimization
3. 仍然保持 sandbox / auto-promote / dangerous ops 关闭

### `team_shared`

适合:

1. 共享测试环境
2. staging
3. 多人共用 API

特点:

1. 切到 `service/prod` 风格
2. 开启 `MEMORY_AUTH_MODE=api_key`
3. 提供 CORS / Ops Basic Auth 占位
4. 危险功能仍默认关闭

注意:

1. 必须替换 `MEMORY_API_KEYS_JSON`
2. 必须替换 `CORS_*` 域名
3. 必须替换 `OPS_BASIC_AUTH_PASS`

### `high_risk`

适合:

1. 明确审批后的短时窗口
2. 执行面实验
3. repair / sandbox / Ops 高风险能力验证

特点:

1. 开启 sandbox local process
2. 允许 request-side `builtin_llm`
3. 开启 replay learning
4. 开启 replay repair review auto-promote
5. 开启 dangerous Ops actions

不适合:

1. 长期开着不用
2. 无审批的共享环境
3. 不清楚回滚方案的生产环境

## 推荐做法

1. 默认从 `local_safe` 开始
2. 需要实验时切到 `experimental`
3. 团队共享优先用 `team_shared`
4. `high_risk` 只作为短期临时模板

## 相关文档

1. 审计总表: `docs/internal/remediation/AIONIS_DEFAULT_OFF_AND_OPT_IN_FEATURES_2026-03-14.md`
2. 简化启用手册: `docs/internal/remediation/AIONIS_FEATURE_ENABLEMENT_GUIDE_2026-03-14.md`
