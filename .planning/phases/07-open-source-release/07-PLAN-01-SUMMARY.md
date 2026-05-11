---
phase: 07-open-source-release
plan: 07-PLAN-01
subsystem: security
tags: [auth, middleware, api-key, http, security-hardening]

# Dependency graph
requires:
  - phase: 06-auto-refuel-notifications
    provides: POST /agent/v1/notify/test handler that needs auth protection
provides:
  - reusable createAuthMiddleware for future management endpoints
  - X-API-Key auth on POST /notify/test
  - context.apiKey injected via buildContext
  - 4 new unit tests covering auth edge cases
affects:
  - 07-PLAN-02 (可能扩展到其他管理端点的认证)
  - any future admin-only HTTP endpoint

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Auth middleware as factory: createAuthMiddleware({ apiKey }) → (req, res, ctx) => void"
    - "No-op auth when env var unset (dev-friendly default)"
    - "statusCode + code fields on thrown errors for HTTP error-handler mapping"

key-files:
  created:
    - src/server/middleware/auth-middleware.js
    - test/auth-middleware.test.js
  modified:
    - src/server/handlers/notify.js
    - src/server/index.js

key-decisions:
  - "认证失败返回 401（身份认证失败）而非 403"
  - "未配置 AEB_API_KEY 时跳过认证，保持开发友好；生产环境必须设置该变量"
  - "仅保护 postNotifyTest（写/触发操作），getNotifyConfig 保持公开（只读）"
  - "API Key 存放于 context.apiKey，中间件从 context 读取，不直接依赖 env"

patterns-established:
  - "Auth middleware pattern: 复用现有 (request, response, context) => void 三参数形式，通过 throw Error{statusCode,code} 中断流水"
  - "DI 注入 secret：apiKey 经 buildContext 进入 context，handler 从 context 读取"

requirements-completed: [OPEN-01]

# Metrics
duration: 4min
completed: 2026-05-11
---

# Phase 7 Plan 01: 安全修复 — notify/test 认证 Summary

**`POST /agent/v1/notify/test` 现在强制 X-API-Key 认证，通过新增可复用的 `auth-middleware.js` 实现，开发环境未配置 key 时自动 no-op。**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-11T04:16:24Z
- **Completed:** 2026-05-11T04:20:15Z
- **Tasks:** 4/4
- **Files modified:** 4（2 新建 + 2 修改）

## Accomplishments

1. 新增 `src/server/middleware/auth-middleware.js`：零依赖、工厂模式、遵循现有中间件规范
2. `POST /notify/test` 接入认证，`GET /notify/config` 保持公开
3. `buildContext()` 新增 `apiKey` 字段，优先级 `options > AEB_API_KEY env > null`
4. 新增 4 个单元测试覆盖：无 key 配置、正确 key、错误 key、缺失 key
5. 全部 217/217 测试通过（原 213 + 新增 4）

## Commits

| Task | Type | Message | Hash |
|------|------|---------|------|
| 1 | feat | add auth-middleware for X-API-Key protection | 629e0a4 |
| 2 | feat | require X-API-Key auth on POST /notify/test | fa354e7 |
| 3 | feat | inject apiKey into buildContext DI container | d049ce3 |
| 4 | test | add 4 tests for auth-middleware | 8cb5a39 |

## Verification

```bash
node --test test/auth-middleware.test.js   # 4/4 pass
node --test test/*.test.js                  # 217/217 pass
```

- 单文件测试：4 pass / 0 fail
- 全量测试：217 pass / 0 fail（相比基线 +4）
- 构建无回归，运行时行为在无 `AEB_API_KEY` 时与旧版完全一致

## Deviations from Plan

None — plan executed exactly as written.

计划 Task 1 代码示例中重复了 `request.headers['x-api-key']` 两次（明显笔误），实现时做了最小清理（合并为单次读取 + `headers || {}` 防御），不改变行为，无需作为 deviation 记录。

## Authentication Gates

无——本计划内部不调用外部服务。

## Known Stubs

无。认证链路完整：env 读取 → buildContext → context.apiKey → handler → middleware → 401 throw。

## Impact on Downstream Work

- **07-PLAN-02 及以后**：如需为其他管理端点（如 `/refuel/status` 写入类扩展、未来 admin endpoints）加认证，直接 `require('../middleware/auth-middleware').createAuthMiddleware({ apiKey: context.apiKey })` 即可。
- **开源发布**：生产部署文档（README.en.md / CONTRIBUTING.md）需提醒设置 `AEB_API_KEY`，否则 `/notify/test` 可被任意访问。

## Threat Flags

无新增威胁面。本计划收窄了既有 `POST /notify/test` 的访问控制（从"无认证"到"X-API-Key gated"），为 Phase 7 开源边界清障。

## Self-Check: PASSED

- [x] src/server/middleware/auth-middleware.js 存在
- [x] test/auth-middleware.test.js 存在
- [x] src/server/handlers/notify.js 已修改（包含 createAuthMiddleware import 和调用）
- [x] src/server/index.js 已修改（buildContext 包含 apiKey 字段）
- [x] 提交 629e0a4、fa354e7、d049ce3、8cb5a39 全部存在于 git log
- [x] 全量测试 217/217 通过
