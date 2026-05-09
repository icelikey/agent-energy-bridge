---
phase: 06-auto-refuel-notifications
plan: "06-PLAN-03"
subsystem: refuel
tags: [refuel-orchestrator, free-model-fallback, build-context, notification-service, FUEL-03]

requires:
  - phase: 06-PLAN-01
    provides: [NotificationService, wecom-channel, email-channel]
  - phase: 06-PLAN-02
    provides: [AutoRefuelDecorator-notification-integration]
provides:
  - RefuelOrchestrator 余额耗尽免费模型降级（FUEL-03）
  - buildContext() notificationService 注入
  - NotificationService 公开导出（src/index.js）
affects: [06-PLAN-04]

tech-stack:
  added: []
  patterns: [free-model-fallback, fire-and-forget-notification, build-context-injection]

key-files:
  created: []
  modified:
    - src/service/refuel-orchestrator.js
    - src/server/index.js

key-decisions:
  - "availableUsd <= 0 触发降级，而非 < 0，确保零余额也被捕获"
  - "降级后 status 强制为 'ready'（guardDecision.allowed || degraded），避免余额耗尽时请求被 blocked"
  - "Task 3（NotificationService 导出）在 PLAN-01 执行时已预先完成，无需重复提交"

requirements-completed: [FUEL-01, FUEL-03, FUEL-04]

duration: 3min
completed: 2026-05-09
---

# Phase 6 Plan 03: RefuelOrchestrator 免费模型降级 + buildContext 注入 Summary

**RefuelOrchestrator.prepareSession() 在余额耗尽（availableUsd <= 0）时强制切换到 freeModel 并返回 degraded=true，buildContext() 新增 notificationService 字段使通知能力可在服务器启动时注入**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-09T14:45:01Z
- **Completed:** 2026-05-09T14:48:07Z
- **Tasks:** 3（Task 3 预先完成，无新增提交）
- **Files modified:** 2

## Accomplishments

- `RefuelOrchestrator` 构造函数新增 `freeModel`（默认 `process.env.AEB_FREE_MODEL || 'gemini-2.5-flash-free'`）和 `notificationService` 字段
- `prepareSession()` 在 `availableUsd <= 0` 时将 `effectiveModel` 切换为 `freeModel`，设 `degraded = true`
- 降级时通过 `notificationService.sendFromEnv()` fire-and-forget 发送 `balance_exhausted_fallback` 事件（level: critical）
- `status` 逻辑更新为 `guardDecision.allowed || degraded ? 'ready' : 'blocked'`，确保降级后请求不被拦截
- `buildContext()` 新增 `notificationService: options.notificationService || null` 字段
- `src/index.js` 中 `NotificationService` 已在 PLAN-01 完成导出，Task 3 无需额外操作
- 全量测试 203/203 通过，无回归

## Task Commits

1. **Task 1: RefuelOrchestrator 免费模型降级** - `d1edfc7` (feat)
2. **Task 2: buildContext() 注入 notificationService** - `ba117f3` (feat)
3. **Task 3: NotificationService 导出** - 预先完成（PLAN-01，无新提交）

## Files Created/Modified

- `src/service/refuel-orchestrator.js` — 构造函数新增 freeModel/notificationService，prepareSession() 新增降级分支和 degraded 返回字段
- `src/server/index.js` — buildContext() 新增 notificationService 字段

## Decisions Made

- `availableUsd <= 0` 触发降级，而非 `< 0`，确保零余额也被捕获
- 降级后 `status` 强制为 `'ready'`（`guardDecision.allowed || degraded`），避免余额耗尽时请求被 blocked
- Task 3（NotificationService 导出）在 PLAN-01 执行时已预先完成，无需重复提交

## Deviations from Plan

### 预先完成项

**Task 3 — NotificationService 导出已在 PLAN-01 中完成**
- **发现于:** Task 3 执行前读取 src/index.js
- **情况:** 第 16 行已有 `require('./service/notification-service')` 导入，第 44 行已有 `NotificationService` 导出
- **处理:** 跳过 Task 3 代码修改，直接运行验证命令确认（输出 `function`）
- **影响:** 无，计划目标完全达成

## Issues Encountered

None.

## User Setup Required

可选环境变量：
- `AEB_FREE_MODEL` — 覆盖默认免费模型（默认 `gemini-2.5-flash-free`）

## Known Stubs

None.

## Threat Flags

None — 无新增入站端点或认证路径，仅新增出站通知调用（已由 NotificationService 管理）。

## Next Phase Readiness

- PLAN-03 完成，RefuelOrchestrator 具备完整降级能力，buildContext 已注入 notificationService
- PLAN-04 可继续：HTTP 端点（/notify/config, /notify/test, /refuel/status）+ 测试覆盖
- 全量测试 203/203 通过，基础稳固

---
*Phase: 06-auto-refuel-notifications*
*Completed: 2026-05-09*

## Self-Check: PASSED

- [x] `src/service/refuel-orchestrator.js` 存在
- [x] `src/server/index.js` 存在
- [x] `06-PLAN-03-SUMMARY.md` 存在
- [x] 提交 d1edfc7 存在（Task 1）
- [x] 提交 ba117f3 存在（Task 2）
- [x] `this.freeModel` 在构造函数中存在
- [x] `this.notificationService` 在构造函数中存在
- [x] `availableUsd <= 0` 降级分支存在
- [x] `degraded` 字段在返回值中存在
- [x] `notificationService` 在 buildContext() 中存在
- [x] 203/203 测试通过
