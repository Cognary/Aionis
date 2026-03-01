# Aionis 审查结论与修复计划（2026-03-01）

Last updated: `2026-03-01`

## 1. 审查结论总览

### P1（高优先级）

1. Ops IP allowlist 可被伪造头绕过（`x-forwarded-for` 优先信任，缺少可信代理边界约束）。
2. `api_key_or_jwt` 存在认证短路（无效 API Key 会阻断 JWT 继续验证）。
3. 依赖安全告警：`fastify`（high）及 `ajv`（moderate）存在已知漏洞链路风险（需版本升级与回归）。

### P2（中优先级）

1. 官网联系入口限流信任 `x-forwarded-for`，并存在高基数 key 导致内存增长风险（该实现已迁移至私有仓维护）。
2. `z.coerce.boolean()` 对 `"false"` / `"0"` 解析为 `true`，会导致会话事件查询参数语义偏差。
3. CORS 全局配置与真实路由需求不一致，存在误配置风险。

### P3（低优先级）

1. MCP 默认端口与文档不一致（实现与 README 偏差）。

## 2. 开放问题与决策（已定稿）

### 决策 A：Ops 反向代理信任链

- 选择：默认按高危处理，除非有技术强约束保证只经可信代理访问。
- 规则：
  1. 仅当 `remoteAddress`（在 Ops 中为 `request.ip`）命中 `trusted_proxy_cidrs` 时，才解析 `x-forwarded-for` / `x-real-ip`。
  2. 生产环境下，若配置了 `OPS_IP_ALLOWLIST` 但未配置 `OPS_TRUSTED_PROXY_CIDRS`，启动即失败（fail-closed）。
  3. 运行侧同步要求：安全组/WAF/网关封堵直连入口。

### 决策 B：`api_key_or_jwt` 认证冲突策略

- 选择：无效 API Key 不阻断 JWT 验证。
- 规则：
  1. 任一凭证有效即通过。
  2. 两者均无效才拒绝。
  3. 若未来要“API Key 失败即拒绝”的严格模式，需独立命名为 `api_key_then_jwt_strict` 并单独文档化。

### 决策 C：CORS 作用域

- 选择：按路由拆分 CORS，不使用全局一套。
- 规则：
  1. memory 公共入口：仅面向 `POST` 路径与必要请求头。
  2. admin 路由：默认禁用跨域；仅在显式配置内部控制台 origin 时开放，并放行 `PUT/DELETE` 等方法。

## 3. 修复计划（分阶段）

### Phase 1（本次执行，P1/P2 关键收敛）

- [x] Ops 可信代理约束与生产 fail-closed。
- [x] `api_key_or_jwt` 认证语义修正为 OR。
- [x] CORS 路由拆分（memory/admin 分离，admin 默认关闭）。
- [x] 对应文档更新（README、Ops README、`.env.example`、Go-Live Gate）。
- [x] 回归补充（Ops middleware 单测、contract-smoke auth 断言）。

### Phase 2（已完成）

- [x] 依赖安全修复：升级 `fastify` 至无漏洞版本并重跑全量回归。
- [x] 联系入口限流重构：默认不信任代理头，且引入 key 回收策略（TTL/LRU + max keys）；对应实现在私有仓 `aionis-hosted`。
- [x] 会话查询参数布尔解析修正（显式字符串映射，不使用 `z.coerce.boolean()`）。

### Phase 3（待执行，文档一致性）

- [x] MCP 默认端口与文档统一（实现或 README 二选一，保持单一事实源）。

## 4. 验收标准

1. Ops：
- 非可信代理来源即便携带伪造 `x-forwarded-for` 也不能绕过 allowlist。
- `NODE_ENV=production` + `OPS_IP_ALLOWLIST` + 缺少 `OPS_TRUSTED_PROXY_CIDRS` 时应 fail-closed。

2. Auth：
- `api_key_or_jwt` 模式下，无效 API Key + 有效 JWT 必须通过。

3. CORS：
- memory 非 `POST` 路由不应因默认策略被跨域放开。
- admin 在未配置 `CORS_ADMIN_ALLOW_ORIGINS` 时不返回跨域放行头。

4. 依赖安全：
- `npm audit --omit=dev` 结果为 0 漏洞（high/moderate/low 均为 0）。

## 5. 本次变更落地清单

1. Ops 可信代理与 fail-closed：
- `apps/ops/middleware.js`
- `scripts/ci/ops-middleware-ip-guard.test.mjs`

2. `api_key_or_jwt` OR 语义修复：
- `src/util/auth.ts`
- `src/dev/contract-smoke.ts`

3. CORS 路由拆分：
- `src/index.ts`
- `.env.example`
- `README.md`
- `apps/ops/README.md`
- `docs/PROD_GO_LIVE_GATE.md`

4. Phase 2 补充修复：
- `src/memory/schemas.ts`
- `package.json`
- `package-lock.json`

5. Phase 3 文档一致性：
- `src/mcp/aionis-mcp.ts`
