---
phase: 06-auto-refuel-notifications
plan: "06-PLAN-04"
subsystem: http-endpoints + test-coverage
tags: [notify-handler, refuel-status-handler, router, test-coverage, NOTF-01, NOTF-02, NOTF-03, NOTF-04, NOTF-05, FUEL-01, FUEL-02, FUEL-03, FUEL-04, FUEL-05]

requires:
  - phase: 06-PLAN-02
    provides: [AutoRefuelDecorator-notification-integration]
  - phase: 06-PLAN-03
    provides: [RefuelOrchestrator-free-model-fallback, buildContext-notificationService]
provides:
  - GET /agent/v1/notify/config
  - POST /agent/v1/notify/test
  - GET /agent/v1/refuel/status
  - 10 new tests covering Phase 6 functionality
affects: []

tech-stack:
  added: []
  patterns: [return-object-handler, node-test-builtin, registerChannel-mock-pattern]

key-files:
  created:
    - src/server/handlers/notify.js
    - src/server/handlers/refuel-status.js
  modified:
    - src/server/router.js
    - test/auto-refuel-decorator.test.js
    - test/notification-service.test.js
    - test/refuel-orchestrator.test.js

key-decisions:
  - "handlers 使用 return 对象模式而非 sendJson()，与现有 meter.js 等 handler 保持一致"
  - "POST body 直接读取 request.body（router 已解析），不引用不存在的 readJsonBody"
  - "wecom 测试通过覆盖 _wecomSender 实例方法 + registerChannel 重新注册，绕过构造时 bind 问题"
  - "email 测试改为检查 result.results[0].error，因为 send() 内部 try/catch 不会 reject"
  - "dedup 测试使用 registerChannel 替换 channels Map 中的绑定函数"

requirements-completed: [FUEL-01, FUEL-02, FUEL-03, FUEL-04, FUEL-05, NOTF-01, NOTF-02, NOTF-03, NOTF-04, NOTF-05]

duration: 9min
completed: 2026-05-09
---

# Phase 6 Plan 04: HTTP 端点 + 测试覆盖 Summary

**3 个新 HTTP 端点（/notify/config、/notify/test、/refuel/status）注册到 router，10 个新测试覆盖 Phase 6 通知集成、quietHours 抑制、wecom/email 渠道、NOTF-05 去重和 FUEL-03 免费模型降级，全量 213 测试通过**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-09T14:55:56Z
- **Completed:** 2026-05-09T15:04:30Z
- **Tasks:** 6
- **Files created:** 2
- **Files modified:** 4

## Accomplishments

- `src/server/handlers/notify.js` — `getNotifyConfig`（返回可用渠道、已配置渠道、dedupWindowMs）和 `postNotifyTest`（支持指定 channel+url 或 sendFromEnv）
- `src/server/handlers/refuel-status.js` — `getRefuelStatus`（返回 stats、alertLog、degraded 状态）
- `src/server/router.js` — 注册 3 条新路由（GET /notify/config、POST /notify/test、GET /refuel/status）
- `test/auto-refuel-decorator.test.js` — 新增 4 个测试：notificationService 集成、quietHours 抑制、console.error/warn 分级
- `test/notification-service.test.js` — 新增 4 个测试：wecom 格式验证、email 缺参错误、NOTF-05 同级别去重、NOTF-05 不同级别不互相抑制
- `test/refuel-orchestrator.test.js` — 新增 2 个测试：balance=0 时 degraded=true+freeModel、balance>0 时 degraded=false
- 全量测试：213/213 通过（203 原有 + 10 新增）

## Task Commits

1. **Tasks 1-3: HTTP handlers + router** - `553e15f` (feat)
2. **Tasks 4-6: test coverage** - `9009b07` (test)

## Files Created/Modified

- `src/server/handlers/notify.js` — getNotifyConfig + postNotifyTest（新建）
- `src/server/handlers/refuel-status.js` — getRefuelStatus（新建）
- `src/server/router.js` — 新增 3 条路由 + 2 个 require
- `test/auto-refuel-decorator.test.js` — 追加 4 个测试（22 → 22 total，文件为新建状态）
- `test/notification-service.test.js` — 追加 4 个测试（8 → 12 total，文件为新建状态）
- `test/refuel-orchestrator.test.js` — 追加 2 个测试（4 → 6 total）

## Decisions Made

- handlers 使用 `return` 对象模式，与现有 `meter.js` 等 handler 保持一致（`send-json.js` 不存在）
- POST body 直接读取 `request.body`（router 的 `parseJsonBody` 已在 POST 请求时解析）
- wecom 测试：覆盖 `_wecomSender` 实例方法并通过 `registerChannel` 重新注册，绕过构造时 `.bind(this)` 导致 channels Map 持有旧引用的问题
- email 测试：`send()` 内部 try/catch 捕获 sender 错误，不会 reject，改为断言 `result.results[0].error`
- dedup 测试：使用 `registerChannel` 替换 channels Map 中的绑定函数，而非直接赋值 `_webhookSender`

## Deviations from Plan

### Rule 3 自动修复 — 不存在的依赖

**[Rule 3 - Blocking] handlers 不引用 send-json.js 和 readJsonBody**
- **发现于:** Task 1 执行前检查 middleware 目录
- **问题:** 计划代码引用 `require('../middleware/send-json')` 和 `readJsonBody`，但这两个模块不存在
- **修复:** 按实际 handler 模式（`return` 对象，`request.body` 已解析）重写 handler，不引入不存在的依赖
- **文件:** `src/server/handlers/notify.js`, `src/server/handlers/refuel-status.js`
- **提交:** 553e15f

### Rule 1 自动修复 — 测试逻辑错误

**[Rule 1 - Bug] email 测试断言方式错误**
- **发现于:** Task 5 测试运行
- **问题:** `assert.rejects()` 永远不触发，因为 `send()` 内部 catch 不会 reject
- **修复:** 改为检查 `result.results[0].error` 匹配 `/url|to/i`
- **提交:** 9009b07

**[Rule 1 - Bug] wecom/dedup 测试 mock 方式错误**
- **发现于:** Task 5 测试运行
- **问题:** `service._webhookSender = ...` 赋值无效（channels Map 持有构造时 bind 的旧引用）；wecom 413ms 超时说明真实 HTTP 请求被发出
- **修复:** wecom 测试覆盖 `_wecomSender` + `registerChannel`；dedup 测试使用 `registerChannel('webhook', ...)` 替换 Map 中的绑定
- **提交:** 9009b07

## Issues Encountered

None beyond the auto-fixed deviations above.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: unauthenticated-endpoint | src/server/handlers/notify.js | POST /agent/v1/notify/test 可触发外部 HTTP 请求（webhook/feishu 等），无认证保护。与现有所有端点一致（项目无认证层），但需在 Phase 7 开源前评估是否需要 API key 保护。 |

## Self-Check: PASSED

- [x] `src/server/handlers/notify.js` 存在
- [x] `src/server/handlers/refuel-status.js` 存在
- [x] `src/server/router.js` 包含 `/agent/v1/notify/config`
- [x] `src/server/router.js` 包含 `/agent/v1/notify/test`
- [x] `src/server/router.js` 包含 `/agent/v1/refuel/status`
- [x] `test/auto-refuel-decorator.test.js` 包含 4 个新测试
- [x] `test/notification-service.test.js` 包含 4 个新测试
- [x] `test/refuel-orchestrator.test.js` 包含 2 个新测试
- [x] 提交 553e15f 存在（Tasks 1-3）
- [x] 提交 9009b07 存在（Tasks 4-6）
- [x] 213/213 测试通过

---
*Phase: 06-auto-refuel-notifications*
*Completed: 2026-05-09*
