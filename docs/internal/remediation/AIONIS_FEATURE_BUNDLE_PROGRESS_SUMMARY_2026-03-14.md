# Aionis Feature Bundle 进度摘要

日期: 2026-03-14

## 这份文档的目的

这不是新的审计表，也不是新的使用教程。

这份文档只做一件事: 给后续继续推进这条线的人一个足够短、足够全的交接摘要，让他能在几分钟内知道:

1. 现在已经做到了什么
2. 相关入口和文件都在哪里
3. 推荐怎么使用
4. 如果以后继续扩展，优先做什么

## 当前已经完成的东西

围绕 “Aionis 有很多默认关闭、需要显式开启的能力” 这条主线，目前已经补齐了 4 层内容:

1. 审计层
2. 使用层
3. 工具层
4. 文档层

### 1. 审计层

已经明确整理出项目里默认关闭 / 需要显式开启的能力，并形成审计文档:

1. `docs/internal/remediation/AIONIS_DEFAULT_OFF_AND_OPT_IN_FEATURES_2026-03-14.md`

### 2. 使用层

已经补了面向使用者的简化说明，不要求读者自己先理解所有底层变量:

1. `docs/internal/remediation/AIONIS_FEATURE_ENABLEMENT_GUIDE_2026-03-14.md`

### 3. 工具层

已经把“怎么启用这些能力”从手工改 `.env` 变成可复用工具链:

1. 4 套 bundle 模板
2. 1 个 apply/list/status/diff/plan 工具脚本
3. 1 组 `npm` 入口
4. 自动化测试

### 4. 文档层

已经有内部文档、公开教程、README / Quickstart 入口，不再只有仓库维护者知道怎么用。

## 当前可用文件

### 核心脚本

1. `scripts/env/apply-feature-bundle.sh`

### bundle 模板

1. `scripts/env/feature-bundles/local_safe.env`
2. `scripts/env/feature-bundles/experimental.env`
3. `scripts/env/feature-bundles/team_shared.env`
4. `scripts/env/feature-bundles/high_risk.env`

### 自动化测试

1. `scripts/ci/feature-bundle-script.test.mjs`

### 内部文档

1. `docs/internal/remediation/AIONIS_DEFAULT_OFF_AND_OPT_IN_FEATURES_2026-03-14.md`
2. `docs/internal/remediation/AIONIS_FEATURE_ENABLEMENT_GUIDE_2026-03-14.md`
3. `docs/internal/remediation/AIONIS_ENV_BUNDLE_TEMPLATES_2026-03-14.md`
4. `docs/internal/remediation/AIONIS_FEATURE_BUNDLE_PROGRESS_SUMMARY_2026-03-14.md`

### 公开文档入口

1. `docs-site/docs/guide/tutorials/feature-bundles.md`
2. `docs-mintlify/guide/tutorials/feature-bundles.mdx`
3. `README.md`
4. `docs-site/docs/guide/quickstart.md`
5. `docs-mintlify/guide/01-start-here.mdx`
6. `docs/public/en/getting-started/02-onboarding-5min.md`
7. `docs/public/zh/getting-started/02-onboarding-5min.md`

## 当前可用命令

### 直接套用 bundle

```bash
npm run -s env:bundle:local-safe
npm run -s env:bundle:experimental
npm run -s env:bundle:team-shared
npm run -s env:bundle:high-risk
```

### 通用入口

```bash
npm run -s env:bundle:apply -- experimental
```

### 查看和预览

```bash
npm run -s env:bundle:list
npm run -s env:bundle:status
npm run -s env:bundle:status:verbose
npm run -s env:bundle:diff -- experimental
npm run -s env:bundle:plan -- experimental
npm run -s env:bundle:apply -- --dry-run experimental
```

### 更安全地应用

```bash
npm run -s env:bundle:apply -- --backup experimental
```

## 这些命令分别解决什么问题

### `list`

告诉你有哪些标准 bundle 可以直接用。

### `status`

告诉你当前 `.env` 里是否存在 managed bundle block，以及当前 block 标记成哪个 bundle。

### `status --verbose`

在 `status` 基础上，把 managed block 中当前管理的 key 一起打出来。

### `diff`

比较 “当前 `.env` 的 managed bundle block” 和 “目标 bundle”，输出:

1. `added`
2. `changed`
3. `removed`

### `plan`

把下面三件事合并成一条命令:

1. 当前状态
2. 和目标 bundle 的差异
3. 目标 bundle 的最终写入预览

这是现在最推荐的切换前检查入口。

### `apply -- --dry-run`

只看将要写入的 managed block，不落盘。

### `apply -- --backup`

如果当前已有 `.env`，先备份再应用 bundle；如果没有 `.env`，会明确提示跳过备份。

## 当前推荐工作流

如果是本地或团队环境准备切换 bundle，建议按这个顺序:

1. `npm run -s env:bundle:status`
2. `npm run -s env:bundle:plan -- <bundle>`
3. `npm run -s env:bundle:apply -- --backup <bundle>`

如果只是实验，不确定是否真要切:

1. `npm run -s env:bundle:diff -- <bundle>`
2. `npm run -s env:bundle:apply -- --dry-run <bundle>`

## 目前已经覆盖的风险控制

这套工具现在已经把最重要的误操作风险压下去了:

1. 只替换 managed bundle block，不动 `.env` 其他内容
2. 可以先 `diff`
3. 可以先 `plan`
4. 可以先 `dry-run`
5. 可以 `--backup`
6. 在 macOS 默认 `bash 3.2` 环境下可运行，不依赖关联数组

## 验证状态

当前这套工具已经有自动化测试覆盖核心路径，最近一次确认通过的验证包括:

1. `bash -n scripts/env/apply-feature-bundle.sh`
2. `node --test scripts/ci/feature-bundle-script.test.mjs`
3. `npm run -s docs:check`

测试当前覆盖的行为包括:

1. `list`
2. `status`
3. `status --verbose`
4. `diff`
5. `plan`
6. `apply`
7. `apply --dry-run`
8. `apply --backup`

## 现在不急着做的事

当前这条线已经够“正式可用”了，下面这些都属于增强项，不是缺口:

1. `env:bundle:restore <backup-file>`
2. 自动识别当前 managed block 最接近哪个 bundle
3. 更细粒度的 bundle 组合或继承关系
4. 把 bundle 生成和校验进一步 schema 化

## 如果以后继续推进，优先级建议

如果以后还要继续投入，我建议按这个顺序:

1. `restore`
原因: 它直接增强回滚能力，价值最高，也最容易解释给使用者。

2. “当前 block 最接近哪个 bundle”的识别
原因: 可以帮助处理 drift，但不是必须能力。

3. 更复杂的 bundle 继承和组合
原因: 只有模板数量继续增长时才值得做。

## 当前结论

到 2026-03-14 为止，Feature Bundle 这一条线已经从“内部知道一些默认关闭开关”推进成了:

1. 有审计依据
2. 有简化使用说明
3. 有可执行工具
4. 有测试
5. 有公开入口
6. 有风险控制

换句话说，现在已经不再是临时脚本或个人知识，而是一个可以继续维护、继续交接、继续扩展的小型能力体系。
