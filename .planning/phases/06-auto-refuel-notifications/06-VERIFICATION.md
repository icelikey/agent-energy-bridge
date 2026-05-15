---
phase: 06-auto-refuel-notifications
verified: 2026-05-09T15:30:00Z
status: human_needed
score: 10/10 must-haves verified
overrides_applied: 0
human_verification:
  - test: "向真实企业微信 Webhook URL 发送 POST /agent/v1/notify/test，body: {channel:'wecom',url:'<your-wecom-url>'}"
    expected: "企业微信群收到 markdown 格式消息，标题和内容正确显示"
    why_human: "外部服务集成，测试套件使用 mock HTTP server，无法验证真实 wecom webhook 接收"
  - test: "配置 AEB_NOTIFY_EMAIL_API_URL + AEB_NOTIFY_EMAIL_TO，触发低余额事件，检查邮件是否送达"
    expected: "收件箱收到主题为 '[AEB WARN] ...' 的邮件，正文包含事件详情"
    why_human: "外部 HTTP API 邮件服务集成，需要真实 API key 和收件地址"
  - test: "启动服务器，将 AutoRefuelDecorator 余额设为 0，调用 GET /agent/v1/refuel/status"
    expected: "返回 {degraded: true, stats: {...}, alertLog: [...]}，alertLog 包含 balance_exhausted_fallback 事件"
    why_human: "端到端降级流程需要运行中的服务器实例，无法静态验证"
---

# Phase 6: Auto-Refuel & Notifications 验证报告

**Phase Goal:** 激活码兑换对接 NewAPI 额度系统，余额低于阈值时多渠道提醒，额度耗尽时自动降级到免费模型兜底，提醒策略可配置，通知去重与频率限制
**Verified:** 2026-05-09T15:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                 | Status     | Evidence                                                                                                    |
|----|-----------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------------|
| 1  | 激活码兑换调用 adapter.redeemCode()，对接 NewAPI 额度系统             | ✓ VERIFIED | `refuel-orchestrator.js:189-200` handleLowBalance() 在 context.activationCode 存在时调用 redeemCode；测试 ok 1 通过 |
| 2  | 余额低于阈值时 _logAlert 触发多渠道通知（fire-and-forget）            | ✓ VERIFIED | `auto-refuel-decorator.js:154-156` notificationService 存在且非 quietHours 时调用 _emitNotification().catch(()=>{}) |
| 3  | 余额耗尽（availableUsd <= 0）时强制降级到 freeModel，status='ready'   | ✓ VERIFIED | `refuel-orchestrator.js:63-78` availableUsd<=0 分支；测试 ok 17 degraded=true, selectedModel=freeModel, status=ready |
| 4  | 降级/提醒/充值事件写入 alertLog，可通过 getAlertLog() 查询            | ✓ VERIFIED | `auto-refuel-decorator.js:135-140` _logAlert 写入 _alertLog；getAlertLog() 方法存在；refuel-status handler 暴露 |
| 5  | quietHours 配置在免打扰时段内跳过通知发送                             | ✓ VERIFIED | `auto-refuel-decorator.js:154` isInQuietHours(this.quietHours) 守卫；测试 ok 19 验证抑制行为                  |
| 6  | wecom 渠道使用 msgtype:markdown 格式                                  | ✓ VERIFIED | `notification-service.js:207-215` _wecomSender body.msgtype='markdown'；测试 ok 9 验证格式                   |
| 7  | email 渠道通过 HTTP API 发送（非 SMTP）                               | ✓ VERIFIED | `notification-service.js:217-239` _emailSender 使用 _webhookSender；缺少 url/to 时抛出错误；测试 ok 10 验证  |
| 8  | 通知去重：同类型+级别+内容在 dedupWindowMs 内第二次返回 {sent:false,reason:'deduplicated'} | ✓ VERIFIED | `notification-service.js:56-59` _isDuplicate 检查；测试 ok 11 验证同级别去重，ok 12 验证不同级别不互相抑制 |
| 9  | 3 个新 HTTP 端点注册到 router（/notify/config, /notify/test, /refuel/status） | ✓ VERIFIED | `router.js:16-17,46-48` 导入并注册；ROUTES 数组包含全部 3 条路由                                            |
| 10 | 全量测试 213/213 通过，无回归                                         | ✓ VERIFIED | `node --test test/*.test.js` 输出：pass 213, fail 0                                                         |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact                                      | Expected                              | Status     | Details                                                                 |
|-----------------------------------------------|---------------------------------------|------------|-------------------------------------------------------------------------|
| `src/utils/quiet-hours.js`                    | isInQuietHours 工具函数               | ✓ VERIFIED | 23 行，跨午夜 OR 逻辑正确（start > end 时 hour>=start \|\| hour<end）  |
| `src/service/notification-service.js`         | wecom + email 渠道，去重，env 解析    | ✓ VERIFIED | 327 行，6 个渠道注册，_parseEnvTargets 解析 wecom/email 环境变量        |
| `src/adapters/auto-refuel-decorator.js`       | NotificationService 注入，quietHours  | ✓ VERIFIED | 220 行，构造函数含 notificationService/notifyTargets/quietHours，_emitNotification 存在 |
| `src/service/refuel-orchestrator.js`          | freeModel 降级，degraded 返回字段     | ✓ VERIFIED | 281 行，freeModel/notificationService 构造函数字段，availableUsd<=0 降级分支 |
| `src/server/index.js`                         | buildContext() 含 notificationService | ✓ VERIFIED | 第 20 行：`notificationService: options.notificationService \|\| null`  |
| `src/index.js`                                | 导出 NotificationService              | ✓ VERIFIED | 第 16 行 require，第 44 行 module.exports 包含 NotificationService      |
| `src/server/handlers/notify.js`               | getNotifyConfig + postNotifyTest      | ✓ VERIFIED | 65 行，return 对象模式（与现有 handler 一致），requireNotificationService 守卫 |
| `src/server/handlers/refuel-status.js`        | getRefuelStatus                       | ✓ VERIFIED | 25 行，return 对象模式，requireAutoRefuel 检查 getAlertLog 是否为函数   |
| `src/server/router.js`                        | 3 条新路由注册                        | ✓ VERIFIED | 第 16-17 行 require，第 46-48 行 ROUTES 条目                            |
| `test/auto-refuel-decorator.test.js`          | 新增 4 个 Phase 6 测试                | ✓ VERIFIED | 22 个测试（18 原有 + 4 新增），全部通过                                 |
| `test/notification-service.test.js`           | 新增 4 个 Phase 6 测试                | ✓ VERIFIED | 12 个测试（8 原有 + 4 新增），全部通过                                  |
| `test/refuel-orchestrator.test.js`            | 新增 2 个 Phase 6 测试                | ✓ VERIFIED | 6 个测试（4 原有 + 2 新增），全部通过                                   |

### Key Link Verification

| From                          | To                                    | Via                                      | Status     | Details                                                                 |
|-------------------------------|---------------------------------------|------------------------------------------|------------|-------------------------------------------------------------------------|
| AutoRefuelDecorator._logAlert | NotificationService.sendFromEnv       | _emitNotification().catch(()=>{})        | ✓ WIRED    | auto-refuel-decorator.js:154-156，fire-and-forget 模式                  |
| AutoRefuelDecorator._logAlert | isInQuietHours                        | require('../utils/quiet-hours')          | ✓ WIRED    | auto-refuel-decorator.js:2，_logAlert:154 使用                          |
| RefuelOrchestrator.prepareSession | NotificationService.sendFromEnv   | this.notificationService?.sendFromEnv()  | ✓ WIRED    | refuel-orchestrator.js:69-77，balance_exhausted_fallback 事件           |
| buildContext()                | notificationService                   | options.notificationService \|\| null    | ✓ WIRED    | server/index.js:20                                                      |
| router.js                     | handlers/notify.js                    | require('./handlers/notify')             | ✓ WIRED    | router.js:16，ROUTES:46-47                                              |
| router.js                     | handlers/refuel-status.js             | require('./handlers/refuel-status')      | ✓ WIRED    | router.js:17，ROUTES:48                                                 |
| notify.js handler             | context.notificationService           | requireNotificationService(context)      | ✓ WIRED    | notify.js:1-8，getNotifyConfig:12，postNotifyTest:30                    |
| refuel-status.js handler      | context.adapter.getAlertLog           | requireAutoRefuel(context)               | ✓ WIRED    | refuel-status.js:1-8，getRefuelStatus:11                                |

### Data-Flow Trace (Level 4)

| Artifact                      | Data Variable         | Source                                    | Produces Real Data | Status      |
|-------------------------------|-----------------------|-------------------------------------------|--------------------|-------------|
| notify.js getNotifyConfig     | channels, dedupWindowMs | context.notificationService.channels / opts | 是，来自 NotificationService 实例 | ✓ FLOWING |
| refuel-status.js getRefuelStatus | stats, alertLog    | context.adapter.getRefuelStats() / getAlertLog() | 是，来自 AutoRefuelDecorator 运行时状态 | ✓ FLOWING |
| auto-refuel-decorator.js _logAlert | _alertLog        | 每次 _logAlert 调用追加                   | 是，运行时事件      | ✓ FLOWING   |

### Behavioral Spot-Checks

| Behavior                                      | Command                                                    | Result                          | Status  |
|-----------------------------------------------|------------------------------------------------------------|---------------------------------|---------|
| 全量测试通过                                  | `node --test test/*.test.js`                               | pass 213, fail 0                | ✓ PASS  |
| auto-refuel-decorator 22 个测试通过           | `node --test test/auto-refuel-decorator.test.js`           | pass 22, fail 0                 | ✓ PASS  |
| notification-service 12 个测试通过            | `node --test test/notification-service.test.js`            | pass 12, fail 0（含 refuel-orchestrator 6 个）| ✓ PASS  |
| FUEL-03 降级：balance=0 时 degraded=true      | test ok 17 in refuel-orchestrator.test.js                  | degraded=true, model=gemini-2.5-flash-free, status=ready | ✓ PASS |
| NOTF-05 去重：同级别第二次 sent=false         | test ok 11 in notification-service.test.js                 | second.sent=false, reason='deduplicated' | ✓ PASS |
| NOTF-05 去重：不同级别不互相抑制              | test ok 12 in notification-service.test.js                 | critical.sent=true              | ✓ PASS  |

### Requirements Coverage

| Requirement | Source Plan  | Description                                          | Status       | Evidence                                                                 |
|-------------|--------------|------------------------------------------------------|--------------|--------------------------------------------------------------------------|
| FUEL-01     | PLAN-03/04   | 激活码兑换对接 NewAPI 额度系统                       | ✓ SATISFIED  | refuel-orchestrator.js:189-200 redeemCode 调用；测试 ok 1 验证           |
| FUEL-02     | PLAN-02/04   | 余额低于阈值时多渠道提醒                             | ✓ SATISFIED  | auto-refuel-decorator.js:154-156 _emitNotification；测试 ok 19 验证      |
| FUEL-03     | PLAN-03/04   | 额度耗尽时降级到免费模型                             | ✓ SATISFIED  | refuel-orchestrator.js:63-78；测试 ok 17 验证 degraded=true              |
| FUEL-04     | PLAN-02/03/04| 充值/提醒/降级事件状态回调与日志                     | ✓ SATISFIED  | _logAlert 写入 alertLog；balance_exhausted_fallback 事件；refuel-status 端点 |
| FUEL-05     | PLAN-02/04   | 提醒策略可配置（阈值、冷却、渠道、免打扰时段）       | ✓ SATISFIED  | 构造函数 quietHours/notifyTargets/lowBalanceThresholdUsd；测试 ok 20 验证 |
| NOTF-01     | PLAN-02/04   | 控制台实时余额告警（warn/critical 级别）             | ✓ SATISFIED  | auto-refuel-decorator.js:146-151 console.error/warn 分支；测试 ok 21/22  |
| NOTF-02     | PLAN-02/04   | Webhook 回调通知                                     | ✓ SATISFIED  | NotificationService webhook 渠道；_emitNotification 调用 sendFromEnv     |
| NOTF-03     | PLAN-01/04   | 邮件通知支持（SMTP 配置）                            | ✓ SATISFIED* | _emailSender 通过 HTTP API 实现（非 SMTP）；PLAN-01 明确记录此设计决策   |
| NOTF-04     | PLAN-01/04   | 短信/钉钉/企业微信通知支持                           | ✓ SATISFIED  | _wecomSender（企业微信）+ _dingtalkSender 均已实现；测试 ok 9 验证 wecom  |
| NOTF-05     | PLAN-01/04   | 通知去重与频率限制                                   | ✓ SATISFIED  | _hashNotification + _isDuplicate + dedupWindowMs；测试 ok 11/12 验证     |

*NOTF-03 备注：REQUIREMENTS.md 原文为"SMTP 配置"，实现采用 HTTP API（兼容 Mailgun/SendGrid/Aliyun DM）。PLAN-01 明确记录此决策："email 渠道使用 HTTP API 而非 SMTP，兼容 Mailgun/SendGrid/Aliyun DM"。功能目标（邮件通知）已达成，传输方式有意偏离。

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/server/handlers/notify.js` | — | POST /agent/v1/notify/test 无认证保护，可触发外部 HTTP 请求 | ⚠️ Warning | PLAN-04 已记录为 threat_flag，Phase 7 开源前评估 |

无 TODO/FIXME/placeholder、无空实现、无硬编码空数据。

### Human Verification Required

#### 1. 企业微信 Webhook 真实送达

**Test:** 启动服务器，配置 `AEB_NOTIFY_WECOM_URL=<真实企业微信机器人 URL>`，调用 `POST /agent/v1/notify/test` with body `{"channel":"wecom","url":"<url>","title":"AEB Test","message":"验证消息"}`
**Expected:** 企业微信群收到 markdown 格式消息，标题和正文正确显示
**Why human:** 外部服务集成，测试套件使用 mock HTTP server，无法验证真实 wecom webhook 接收和渲染

#### 2. Email HTTP API 真实送达

**Test:** 配置 `AEB_NOTIFY_EMAIL_API_URL`、`AEB_NOTIFY_EMAIL_TO`、`AEB_NOTIFY_EMAIL_API_KEY`，触发低余额事件或调用 `/notify/test`
**Expected:** 收件箱收到主题为 `[AEB WARN] ...` 的邮件，正文包含事件类型和时间戳
**Why human:** 需要真实 HTTP API 邮件服务（Mailgun/SendGrid/Aliyun DM）和有效 API key

#### 3. 端到端降级流程验证

**Test:** 启动服务器，使用 `availableUsd=0` 的 mock adapter，调用 `prepareSession`，然后 `GET /agent/v1/refuel/status`
**Expected:** 返回 `{degraded: true, stats: {...}, alertLog: [{type: "balance_exhausted_fallback", ...}]}`
**Why human:** 需要运行中的服务器实例和完整 context 注入，静态代码分析已验证逻辑，但端到端流程需要运行时确认

### Gaps Summary

无阻断性 gap。所有 10 个需求（FUEL-01~05, NOTF-01~05）均有代码实现证据，213/213 测试通过。

唯一值得注意的偏差：NOTF-03 使用 HTTP API 而非 SMTP，属于 PLAN-01 中明确记录的设计决策，不影响功能目标达成。

---

_Verified: 2026-05-09T15:30:00Z_
_Verifier: Kiro (gsd-verifier)_
