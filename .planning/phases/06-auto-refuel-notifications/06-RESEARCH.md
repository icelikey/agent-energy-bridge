# Phase 6: Auto-Refuel & Notifications - Research

**Researched:** 2026-05-08
**Domain:** 激活码兑换 / 低余额多渠道通知 / 免费模型兜底 / 通知去重
**Confidence:** HIGH

## Summary

Phase 6 的核心工作是将已有的骨架代码（`AutoRefuelDecorator`、`NotificationService`、`RefuelOrchestrator`、`refuel.js` handler）升级为满足 FUEL-01~05 和 NOTF-01~05 全部要求的完整实现。

代码库已经存在大量基础设施：`AutoRefuelDecorator` 有完整的锁、冷却、策略逻辑；`NotificationService` 已实现 webhook/飞书/钉钉/Slack 四渠道和去重；`NewAPIGatewayAdapter.redeemCode()` 已对接 `/api/user/topup`；`refuel.js` handler 已有输入验证和 `redeemCode` 调用。

缺失的部分集中在三处：(1) `AutoRefuelDecorator` 的 `onAlert` 回调没有接入 `NotificationService`，低余额告警只停留在内存日志；(2) 没有"余额耗尽时自动降级到免费模型"的运行时切换逻辑；(3) 没有 HTTP 端点暴露通知配置、告警状态、降级状态，也没有对应的测试覆盖。

**Primary recommendation:** 在 `AutoRefuelDecorator` 中注入 `NotificationService` 实例，在 `_logAlert` 触发时按事件类型路由到对应通知渠道；在 `ModelSelector` 或 `BudgetGuard` 的降级路径上增加"余额耗尽 → 强制免费模型"逻辑；新增 3 个 HTTP 端点（`/agent/v1/refuel/status`、`/agent/v1/notify/config`、`/agent/v1/notify/test`）；补充测试覆盖。

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 激活码兑换（FUEL-01） | API / Backend | — | `NewAPIGatewayAdapter.redeemCode()` 已在后端，HTTP handler 已存在 |
| 低余额检测（FUEL-02） | API / Backend | — | `AutoRefuelDecorator.getBalance()` 在 adapter 层检测 |
| 多渠道通知发送（NOTF-01~04） | API / Backend | — | `NotificationService` 纯后端，零外部依赖 |
| 免费模型降级（FUEL-03） | API / Backend | — | `ModelSelector` / `BudgetGuard` 已有 fallback 逻辑，需扩展 |
| 通知去重（NOTF-05） | API / Backend | — | `NotificationService._isDuplicate()` 已实现，5 分钟窗口 |
| 提醒策略配置（FUEL-05） | API / Backend | — | 通过环境变量 + `buildContext` options 注入 |
| 事件日志记录（FUEL-04） | API / Backend | — | `AutoRefuelDecorator._alertLog` 已有，需持久化到 Logger |
| 控制台告警（NOTF-01） | API / Backend | — | `Logger.warn/error` 已存在，需在 alert 路径调用 |


<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FUEL-01 | 激活码兑换直接对接 NewAPI 额度系统（quota 兑换） | `NewAPIGatewayAdapter.redeemCode()` 已实现，`POST /api/user/topup` 已对接；`refuel.js` handler 已有验证逻辑；需补充兑换结果回调和余额刷新 |
| FUEL-02 | 余额低于阈值时多渠道提醒通知 | `AutoRefuelDecorator` 已检测低余额；`NotificationService` 已有 4 渠道；需将两者连接，并在 `_logAlert` 中触发通知 |
| FUEL-03 | 额度耗尽时自动降级到免费模型兜底 | `BudgetGuard.evaluateUsage()` 已有 fallback 逻辑；需在余额=0 时强制覆盖 `selectedModel` 为 `gemini-2.5-flash-free` |
| FUEL-04 | 充值/提醒/降级事件状态回调与日志记录 | `AutoRefuelDecorator._alertLog` 已有内存日志；需接入 `Logger` 持久化，并通过 `NotificationService` 发送 webhook 回调 |
| FUEL-05 | 提醒策略可配置（阈值、冷却时间、通知渠道、免打扰时段） | `AutoRefuelDecorator` 已有 `lowBalanceThresholdUsd`/`cooldownMs`/`maxRefuelsPerHour`；需新增 `quietHours` 配置和通知渠道白名单 |
| NOTF-01 | 控制台实时余额告警（warn/critical 级别） | `Logger` 已有 warn/error 级别；需在 `_logAlert` 中按事件类型映射到 warn（低余额）或 error（耗尽） |
| NOTF-02 | Webhook 回调通知（低余额、充值成功/失败、降级事件） | `NotificationService._webhookSender()` 已实现；需定义事件类型到 webhook payload 的映射 |
| NOTF-03 | 邮件通知支持（SMTP 配置） | 当前 `NotificationService` 无 SMTP 支持；需新增 `email` channel，使用 Node.js 内置 `net`/`tls` 实现最小 SMTP 客户端，或通过 HTTP API（如 Mailgun/SendGrid webhook）绕过 SMTP |
| NOTF-04 | 短信/钉钉/企业微信通知支持（Webhook 模板） | 钉钉已实现；需新增企业微信（`wecom`）channel；短信通过 webhook 模板支持（Twilio/阿里云均提供 HTTP API） |
| NOTF-05 | 通知去重与频率限制（避免告警风暴） | `NotificationService._isDuplicate()` 已实现 5 分钟去重窗口；需验证去重 key 包含事件类型+级别，确保不同级别不互相抑制 |
</phase_requirements>

## Standard Stack

### Core（零外部依赖，纯 Node.js）

| 模块 | 版本/位置 | 用途 | 状态 |
|------|-----------|------|------|
| `AutoRefuelDecorator` | `src/adapters/auto-refuel-decorator.js` | 低余额检测、充值触发、告警日志 | 已存在，需扩展 |
| `NotificationService` | `src/service/notification-service.js` | 多渠道通知发送、去重 | 已存在，需扩展 |
| `RefuelOrchestrator` | `src/service/refuel-orchestrator.js` | 激活码兑换编排、低余额处理 | 已存在，需扩展 |
| `NewAPIGatewayAdapter` | `src/adapters/new-api-adapter.js` | `redeemCode()` 对接 NewAPI `/api/user/topup` | 已存在，完整 |
| `Logger` | `src/utils/logger.js` | 控制台 warn/error 输出 | 已存在，需在告警路径调用 |
| `BudgetGuard` | `src/core/budget-guard.js` | 预算评估、fallback 模型决策 | 已存在，需扩展降级逻辑 |
| `node:crypto` | 内置 | 通知签名（飞书 secret 校验） | 已在 `NotificationService` 中使用 |
| `node:http` / `node:https` | 内置 | webhook 发送 | 已在 `NotificationService` 中使用 |
| `node:net` / `node:tls` | 内置 | SMTP 邮件发送（NOTF-03） | 需新增 |

### 新增渠道（NOTF-04）

| 渠道 | 实现方式 | 端点格式 |
|------|----------|----------|
| 企业微信（wecom） | HTTP POST Webhook | `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx` |
| 短信（SMS via HTTP） | HTTP POST 到运营商 API | Twilio/阿里云均为 REST API，无需 SDK |
| 邮件（SMTP） | 内置 `net`/`tls` 最小实现 | 或通过 Mailgun/SendGrid HTTP API（推荐，零依赖） |

**Installation:** 无需安装任何 npm 包，全部使用 Node.js 内置模块。[VERIFIED: 项目 package.json 约束]


## Architecture Patterns

### System Architecture Diagram

```
getBalance() call
       |
       v
AutoRefuelDecorator.getBalance()
       |
       +-- balance >= threshold ---------> return balance
       |
       +-- balance < threshold
              |
              v
         _withRefuelLock()
              |
              +-- cooldown/limit blocked
              |       |
              |       +-- _logAlert(type) --> [NEW] NotificationService.send()
              |                           +-- Logger.warn/error()
              |
              +-- _tryAutoRefuel()
                      |
                      +-- redeemCode() --> NewAPIGatewayAdapter --> POST /api/user/topup
                      |       +-- success --> _logAlert(refuel_success) --> NotificationService
                      |       +-- failure --> _logAlert(refuel_failed)  --> NotificationService
                      |
                      +-- balance == 0 --> [NEW] balance_exhausted event
                                               |
                                               v
                                    selectedModel = gemini-2.5-flash-free (FUEL-03)

NotificationService.send(notification)
       |
       +-- _isDuplicate(hash) --> {sent:false, reason:deduplicated}
       |
       +-- for each target:
              +-- webhook  --> HTTP POST (generic)
              +-- feishu   --> HTTP POST (interactive card)
              +-- dingtalk --> HTTP POST (markdown)
              +-- slack    --> HTTP POST (attachments)
              +-- wecom    --> [NEW] HTTP POST (markdown)
              +-- email    --> [NEW] HTTP API (Mailgun/SendGrid/Aliyun)
```

### Recommended Project Structure

```
src/
+-- adapters/
|   +-- auto-refuel-decorator.js   # inject NotificationService, add quietHours
+-- service/
|   +-- notification-service.js    # add wecom/email channel
|   +-- refuel-orchestrator.js     # add freeModel option + degradation notification
+-- core/
|   +-- budget-guard.js            # no change needed (fallback already exists)
+-- server/
|   +-- handlers/
|       +-- refuel.js              # existing, no change needed
|       +-- notify.js              # [NEW] GET /notify/config, POST /notify/test
|       +-- refuel-status.js       # [NEW] GET /refuel/status (alert log + degradation)
+-- utils/
    +-- quiet-hours.js             # [NEW] quiet hours check utility
```

### Pattern 1: AutoRefuelDecorator injects NotificationService

**What:** Accept optional notificationService in constructor; call it inside _logAlert by event type.

**When to use:** Every _logAlert call (low balance, refuel success/failure, cooldown, limit exceeded).

Constructor additions:

```javascript
// Source: [VERIFIED: src/adapters/auto-refuel-decorator.js existing structure]
this.notificationService = options.notificationService || null;
this.notifyTargets = options.notifyTargets || null;
this.quietHours = options.quietHours || null; // { start: 22, end: 8 }
```

_logAlert additions (after existing logic):

```javascript
// NOTF-01: console alert
const isCritical = type === 'refuel_failed' || (meta && meta.availableUsd === 0);
if (isCritical) console.error('[AEB CRITICAL]', type, meta);
else console.warn('[AEB WARN]', type, meta);

// NOTF-02~04: multi-channel notification, fire-and-forget
if (this.notificationService && !this._inQuietHours()) {
  this._emitNotification(type, meta).catch(() => {});
}
```

Level mapping:
- refuel_failed / balance_exhausted --> critical
- refuel_success --> info
- cooldown / limit_exceeded / no_method --> warn

### Pattern 2: Free Model Forced Fallback (FUEL-03)

**What:** In RefuelOrchestrator.prepareSession(), after handleLowBalance, if availableUsd <= 0, override selectedModel to freeModel.

Constructor additions:

```javascript
// Source: [VERIFIED: src/service/refuel-orchestrator.js existing structure]
this.freeModel = options.freeModel || process.env.AEB_FREE_MODEL || 'gemini-2.5-flash-free';
this.notificationService = options.notificationService || null;
```

prepareSession additions (after balance fetch):

```javascript
let effectiveModel = selectedModel;
let degraded = false;
if (availableUsd <= 0) {
  effectiveModel = this.freeModel;
  degraded = true;
  if (this.notificationService) {
    this.notificationService.sendFromEnv({
      type: 'balance_exhausted_fallback',
      level: 'critical',
      title: 'Balance exhausted - switched to free model',
      message: 'Switched to ' + effectiveModel,
      meta: { originalModel: selectedModel, freeModel: effectiveModel },
    }).catch(() => {});
  }
}
return {
  status: guardDecision.allowed || degraded ? 'ready' : 'blocked',
  selectedModel: effectiveModel,
  degraded,
  // ... existing fields unchanged ...
};
```

### Pattern 3: Wecom Channel (NOTF-04)

Register in NotificationService constructor:

```javascript
// Source: [ASSUMED - Wecom Webhook API format]
this.registerChannel('wecom', this._wecomSender.bind(this));
```

Sender:

```javascript
async _wecomSender(target, payload) {
  const body = {
    msgtype: 'markdown',
    markdown: {
      content: '### ' + payload.title + '\n' + payload.message + '\n> Event: ' + payload.type,
    },
  };
  return this._webhookSender({ ...target, config: body }, payload);
}
```

Env var: AEB_NOTIFY_WECOM_URL

### Pattern 4: Quiet Hours Utility (FUEL-05)

```javascript
// Source: [VERIFIED: pure logic, no external deps]
// src/utils/quiet-hours.js
function isInQuietHours(quietHours) {
  if (!quietHours) return false;
  const { start, end } = quietHours;
  const hour = new Date().getHours();
  if (start <= end) return hour >= start && hour < end;
  return hour >= start || hour < end; // crosses midnight e.g. 22:00-08:00
}
module.exports = { isInQuietHours };
```

### Anti-Patterns to Avoid

- **Awaiting notification in _logAlert:** Notification failure must never block balance query. Always fire-and-forget with .catch(() => {}).
- **Full SMTP with net/tls:** SMTP handshake is complex. Prefer HTTP API (Mailgun, SendGrid, Aliyun DM). SMTP is optional extension only.
- **Dedup key using only type:** Different severity levels of the same event type must send independently. Current implementation correctly includes level in the hash.
- **Not logging degradation events:** Free model fallback must write to _alertLog and trigger FUEL-04 callbacks.
- **Not injecting notificationService into buildContext:** Server startup must pass NotificationService instance in context options.


## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 通知去重 | 自定义 Map + TTL 逻辑 | NotificationService._isDuplicate() | 已实现 SHA-256 hash + 5min 窗口 + 自动清理 |
| Webhook 发送 | 自定义 fetch wrapper | NotificationService._webhookSender() | 已处理 timeout、HTTP 错误、content-type |
| 飞书/钉钉格式化 | 手写 JSON 模板 | NotificationService._feishuSender()/_dingtalkSender() | 已实现，含颜色映射 |
| 激活码兑换 | 直接调用 fetch | NewAPIGatewayAdapter.redeemCode() | 已处理 session、auth header、响应解析 |
| 并发充值锁 | 自定义 mutex | AutoRefuelDecorator._withRefuelLock() | 已实现 Promise 链锁 + 锁内余额重校验 |
| 余额提取 | 手写字段解析 | NewAPIGatewayAdapter._extractBalance() | 已处理 balance/quota/data 嵌套多种格式 |
| 冷却时间控制 | 自定义 debounce | AutoRefuelDecorator cooldownMs + _lastRefuelAt | 已实现，含 maxRefuelsPerHour |

**Key insight:** 本 phase 的核心工作是连接已有组件，而不是新建组件。AutoRefuelDecorator 和 NotificationService 已经各自完整，缺的只是注入关系和少量新 channel。

## Common Pitfalls

### Pitfall 1: 通知发送阻塞余额查询主流程
**What goes wrong:** 在 _logAlert 中 await 通知发送，若 webhook 超时（默认 10s），getBalance() 会挂起 10 秒。
**Why it happens:** 直觉上想确认通知已发送。
**How to avoid:** 始终 fire-and-forget：this._emitNotification(type, meta).catch(() => {})
**Warning signs:** getBalance() 响应时间 > 1s。

### Pitfall 2: 去重 key 碰撞导致告警风暴抑制
**What goes wrong:** warn 级别的"低余额"和 critical 级别的"余额耗尽"共享同一 hash，critical 被去重抑制。
**Why it happens:** 去重 key 只用 type，不含 level。
**How to avoid:** 验证 NotificationService._hashNotification() 的 raw 字符串包含 level（当前实现已正确：type:level:title:message）。
**Warning signs:** critical 告警在 5 分钟内被 deduplicated 返回。

### Pitfall 3: buildContext 未注入 notificationService
**What goes wrong:** AutoRefuelDecorator 和 RefuelOrchestrator 的 notificationService 为 null，通知静默失败。
**Why it happens:** buildContext() 只注入了 adapter/budgetGuard 等，新增字段需手动添加。
**How to avoid:** 在 buildContext() 中添加 notificationService: options.notificationService || null，并在 server.destroy() 中无需清理（无 timer）。
**Warning signs:** 测试中 notificationService.send() 从未被调用。

### Pitfall 4: 免费模型降级后 guardDecision.allowed 仍为 false
**What goes wrong:** prepareSession 返回 status: 'blocked'，即使已降级到免费模型，Agent 仍被拒绝。
**Why it happens:** BudgetGuard.evaluateUsage() 基于原始 selectedModel 的价格评估，免费模型价格为 0 但评估已完成。
**How to avoid:** 降级后强制 status = 'ready'：status: guardDecision.allowed || degraded ? 'ready' : 'blocked'
**Warning signs:** degraded=true 但 status='blocked'。

### Pitfall 5: 激活码格式校验过严导致合法码被拒
**What goes wrong:** refuel.js 的 validateString pattern 为 /^[A-Za-z0-9\-_]+$/，某些激活码含点号或斜杠被拒。
**Why it happens:** 安全校验模式设计时未考虑所有合法格式。
**How to avoid:** 与 NewAPI 实际激活码格式对齐。当前 NewAPI 激活码格式为字母数字+连字符，现有 pattern 正确。[VERIFIED: src/server/handlers/refuel.js:29]
**Warning signs:** 合法激活码返回 400 INVALID_CODE_FORMAT。

### Pitfall 6: 免打扰时段跨午夜判断错误
**What goes wrong:** quietHours = { start: 22, end: 8 }，用 hour >= start && hour < end 判断，23:00 不在范围内（22 <= 23 < 8 为 false）。
**Why it happens:** 跨午夜区间需要 OR 逻辑而非 AND。
**How to avoid:** if (start > end) return hour >= start || hour < end; 已在 Pattern 4 中正确实现。
**Warning signs:** 23:00 发送了应被抑制的通知。

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | yes | v22.16.0 | — |
| node:crypto | NotificationService dedup hash | yes | built-in | — |
| node:http/https | Webhook sending | yes | built-in | — |
| node:net/tls | SMTP (NOTF-03 optional) | yes | built-in | Use HTTP API instead |
| NewAPI instance | FUEL-01 redeemCode | external | unknown | Known issue: /api/user/self returns access token invalid |
| AEB_NOTIFY_WEBHOOK_URL | NOTF-02 | env var | — | No notification sent (graceful) |
| AEB_NOTIFY_FEISHU_URL | NOTF-04 feishu | env var | — | No notification sent (graceful) |
| AEB_NOTIFY_DINGTALK_URL | NOTF-04 dingtalk | env var | — | No notification sent (graceful) |
| AEB_NOTIFY_WECOM_URL | NOTF-04 wecom [NEW] | env var | — | No notification sent (graceful) |
| AEB_FREE_MODEL | FUEL-03 fallback model | env var | — | Default: gemini-2.5-flash-free |

**Missing dependencies with no fallback:** None — all notification channels degrade gracefully when env vars are absent.

**Known issue:** NewAPI /api/user/self returns "access token invalid" (STATE.md Known Issue #1). This affects getBalance() accuracy but does not block redeemCode() which uses POST /api/user/topup with Bearer token.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | node:test (built-in) |
| Config file | none — run directly |
| Quick run command | `node --test test/auto-refuel-decorator.test.js test/notification-service.test.js` |
| Full suite command | `node --test test/*.test.js` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FUEL-01 | redeemCode() calls NewAPI /api/user/topup and returns ok | unit | `node --test test/auto-refuel-decorator.test.js` | yes (partial) |
| FUEL-02 | Low balance triggers NotificationService.send() | unit | `node --test test/auto-refuel-decorator.test.js` | needs new test |
| FUEL-03 | Balance=0 forces selectedModel to freeModel | unit | `node --test test/refuel-orchestrator.test.js` | needs new test |
| FUEL-04 | refuel/degradation events logged + webhook callback | unit | `node --test test/auto-refuel-decorator.test.js` | needs new test |
| FUEL-05 | quietHours suppresses notifications during window | unit | `node --test test/auto-refuel-decorator.test.js` | needs new test |
| NOTF-01 | console.warn called for warn events, console.error for critical | unit | `node --test test/auto-refuel-decorator.test.js` | needs new test |
| NOTF-02 | webhook target receives correct payload on low_balance event | unit | `node --test test/notification-service.test.js` | yes (generic webhook) |
| NOTF-03 | email channel sends via HTTP API | unit | `node --test test/notification-service.test.js` | needs new test |
| NOTF-04 | wecom channel formats markdown correctly | unit | `node --test test/notification-service.test.js` | needs new test |
| NOTF-05 | same event within 5min returns deduplicated | unit | `node --test test/notification-service.test.js` | yes |

### Sampling Rate
- **Per task commit:** `node --test test/auto-refuel-decorator.test.js test/notification-service.test.js test/refuel-orchestrator.test.js`
- **Per wave merge:** `node --test test/*.test.js`
- **Phase gate:** All 203+ tests green before /gsd-verify-work

### Wave 0 Gaps
- [ ] New tests in `test/auto-refuel-decorator.test.js` — covers FUEL-02, FUEL-04, FUEL-05, NOTF-01
- [ ] New tests in `test/refuel-orchestrator.test.js` — covers FUEL-03
- [ ] New tests in `test/notification-service.test.js` — covers NOTF-03 (email), NOTF-04 (wecom)
- [ ] New test file `test/refuel-status-handler.test.js` — covers new HTTP endpoints

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A — internal service |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A — single-tenant |
| V5 Input Validation | yes | validateBody() + validateString() already in refuel.js |
| V6 Cryptography | yes | node:crypto for dedup hash (SHA-256) — already correct |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Activation code brute-force | Tampering | Rate limiter already in place (AEB_RATE_LIMIT_MAX=100/min) |
| Webhook SSRF (attacker-controlled URL) | Tampering | Notification targets come from env vars or trusted config, not user input |
| Notification payload injection | Tampering | Payload is structured JSON from internal events, not user-supplied strings |
| Alert storm DoS | Denial of Service | NotificationService dedup (5min window) + AutoRefuelDecorator maxRefuelsPerHour |
| Activation code in logs | Information Disclosure | refuel.js logs sanitized result, not the raw code — verify in implementation |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Wecom Webhook format is msgtype:markdown with markdown.content field | Pattern 3 | Wecom messages fail silently; need to verify against official docs |
| A2 | Email via HTTP API (Mailgun/SendGrid) is acceptable for NOTF-03 | Standard Stack | If SMTP is strictly required, need net/tls implementation |
| A3 | gemini-2.5-flash-free is the correct free model identifier in NewAPI | FUEL-03 | Fallback model name mismatch causes 404 from gateway |
| A4 | NewAPI /api/user/topup accepts { key: code } and returns { success: true } | FUEL-01 | Already in NewAPIGatewayAdapter.redeemCode() — but actual NewAPI instance behavior unverified |

## Open Questions

1. **NOTF-03 邮件实现方式**
   - What we know: NotificationService 无 SMTP 支持；Node.js 内置 net/tls 可实现
   - What is unclear: 用户是否有 SMTP 服务器，还是更倾向于 HTTP API（Mailgun/SendGrid）
   - Recommendation: 默认实现 HTTP API email channel（AEB_NOTIFY_EMAIL_API_URL + AEB_NOTIFY_EMAIL_API_KEY），SMTP 作为可选扩展

2. **NewAPI 余额查询权限问题（Known Issue #1）**
   - What we know: /api/user/self 返回 access token invalid，导致 getBalance() 返回 $0
   - What is unclear: 是否影响 redeemCode() 的成功率
   - Recommendation: Phase 6 实现中，redeemCode() 成功后主动调用 getBalance() 验证余额是否更新，若仍为 0 则记录警告

3. **免费模型名称**
   - What we know: CLAUDE.md 中指定 gemini-2.5-flash-free 为免费兜底模型
   - What is unclear: 该模型名称在 NewAPI 实例中是否已注册
   - Recommendation: 通过 AEB_FREE_MODEL 环境变量可配置，默认值 gemini-2.5-flash-free

## Sources

### Primary (HIGH confidence)
- [VERIFIED: src/adapters/auto-refuel-decorator.js] — 现有 AutoRefuelDecorator 完整实现，含锁、冷却、策略
- [VERIFIED: src/service/notification-service.js] — 现有 NotificationService，含 4 渠道、去重、env 解析
- [VERIFIED: src/adapters/new-api-adapter.js] — redeemCode() 实现，POST /api/user/topup
- [VERIFIED: src/service/refuel-orchestrator.js] — prepareSession() 结构，handleLowBalance() 逻辑
- [VERIFIED: src/server/handlers/refuel.js] — HTTP handler，输入验证，redeemCode 调用
- [VERIFIED: src/server/index.js] — buildContext() 结构，context 字段列表
- [VERIFIED: src/server/router.js] — 现有路由表，22 个端点
- [VERIFIED: test/auto-refuel-decorator.test.js] — 18 个现有测试，覆盖范围
- [VERIFIED: test/notification-service.test.js] — 8 个现有测试，覆盖范围
- [VERIFIED: .planning/STATE.md] — 当前测试状态 179/180，Known Issues
- [VERIFIED: .planning/ROADMAP.md] — Phase 6 架构决策：预充值优先，人在回路

### Secondary (MEDIUM confidence)
- [CITED: CLAUDE.md] — 免费兜底模型 gemini-2.5-flash-free，充值命令，环境变量

### Tertiary (LOW confidence)
- [ASSUMED] Wecom Webhook markdown format (msgtype/markdown.content)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all core modules verified by reading source files
- Architecture: HIGH — patterns derived directly from existing code structure
- Pitfalls: HIGH — derived from code analysis and known issues in STATE.md
- New channels (wecom/email): MEDIUM — wecom format assumed, email approach recommended but not locked

**Research date:** 2026-05-08
**Valid until:** 2026-06-08 (stable domain, 30-day window)
