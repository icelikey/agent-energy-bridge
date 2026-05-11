---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
last_updated: "2026-05-11T04:30:00.000Z"
progress:
  total_phases: 7
  completed_phases: 6
  total_plans: 8
  completed_plans: 2
---

# State: Agent Energy Bridge

**Project:** Agent Energy Bridge (AEB)
**Status:** Phase 7 In Progress — 2/8 plans complete, 6 plans planned
**Last Updated:** 2026-05-11

---

## Current Phase

**Phase 7: Open Source Release**

- Status: In Progress (2/8 plans complete — 07-PLAN-01~02 done, 07-PLAN-03~08 planned)
- Goal: 社区就绪：CONTRIBUTING.md、API 文档、GitHub Actions CI/CD、Docker 镜像、README 中英双语、安全边界清障
- Requirements: OPEN-01 ~ OPEN-06 pending (0/6 complete)
- Plans:
  - ✅ 07-PLAN-01 (Wave 1): D-14 X-API-Key 认证中间件 — 已完成
  - ✅ 07-PLAN-02 (Wave 1): D-15 安全扫描 + gitleaks 配置 + timingSafeEqual 升级 — 已完成
  - ⏳ 07-PLAN-03 (Wave 2): docs/API.md 中英双语 26 端点 (OPEN-02)
  - ⏳ 07-PLAN-04 (Wave 2): CONTRIBUTING.md + SECURITY.md (OPEN-01)
  - ⏳ 07-PLAN-05 (Wave 2): README.en.md + README.md 互链 (OPEN-06)
  - ⏳ 07-PLAN-06 (Wave 3): CI workflow + .env.example (OPEN-03)
  - ⏳ 07-PLAN-07 (Wave 4): cliff.toml + CHANGELOG + release.yml (OPEN-04)
  - ⏳ 07-PLAN-08 (Wave 4): docker-publish.yml + GHCR 验证 (OPEN-05)

---

## Previous Phase

**Phase 6: Auto-Refuel & Notifications**

- Status: Complete (4/4 plans complete)
- Goal: 激活码兑换对接 NewAPI，低余额多渠道通知，余额耗尽免费模型兜底
- Requirements: FUEL-01 ~ FUEL-05, NOTF-01 ~ NOTF-05
- Key deliverables:
  - ✅ NotificationService 新增 wecom + email 渠道
  - ✅ quiet-hours 工具函数
  - ✅ AutoRefuelDecorator 接入 NotificationService（fire-and-forget）
  - ✅ quietHours 免打扰配置
  - ✅ RefuelOrchestrator 余额耗尽降级到免费模型
  - ✅ buildContext 注入 notificationService
  - ✅ 3 个新 HTTP 端点（/notify/config, /notify/test, /refuel/status）
  - ✅ 10 个新测试（213/213 全部通过）
- Plans:
  - ✅ 06-PLAN-01 (Wave 1): NotificationService 扩展 + quiet-hours 工具
  - ✅ 06-PLAN-02 (Wave 2): AutoRefuelDecorator 接入 NotificationService
  - ✅ 06-PLAN-03 (Wave 2): RefuelOrchestrator 免费模型降级 + buildContext 注入
  - ✅ 06-PLAN-04 (Wave 3): HTTP 端点 + 测试覆盖

---

## Phase Progress

| Phase | Status | Requirements | Complete |
|-------|--------|--------------|----------|
| 1. Security Hardening | Completed | 5 | 5/5 |
| 2. Testing Foundation | Completed | 6 | 6/6 |
| 3. Concurrency Safety | Completed | 4 | 4/4 |
| 4. Token Metering | Completed | 5 | 5/5 |
| 5. Multi-Provider Routing | Completed | 5 | 5/5 |
| 6. Auto-Refuel Enhancement | Complete | 10 | 10/10 |
| 7. Open Source Release | In Progress | 6 | 2/6 |

---

## Test Coverage

**Current:** 219/219 通过（Phase 7 PLAN-02 完成后，auth-middleware 6 个测试全部通过）

| Test File | Tests | Phase |
|-----------|-------|-------|
| multi-provider-router.test.js | 23 | Phase 5 |
| token-meter.test.js | 27 | Phase 4 |
| concurrency-safety.test.js | 10 | Phase 3 |
| auto-refuel-decorator.test.js | 22 | Phase 2 + Phase 6 |
| ops-engine.test.js | 17 | Phase 2 |
| session-store.test.js | 10 | Phase 2 |
| model-selector-routing.test.js | 18 | Phase 2 |
| route-health-checker.test.js | 4 | Phase 5 fix |
| notification-service.test.js | 12 | Phase 6 |
| refuel-orchestrator.test.js | 6 | Phase 6 |
| auth-middleware.test.js | 6 | Phase 7 |

---

## Phase 7 PLAN-02 Deliverables

新增文件:
- `.gitleaks.toml` — gitleaks allowlist 配置，覆盖占位符与测试夹具
- `docs/security-scan-baseline.md` — 扫描结果基线，含 remediation 审计追踪

修改文件:
- `src/server/middleware/auth-middleware.js` — 升级为 `crypto.timingSafeEqual()` 恒时比较
- `test/auth-middleware.test.js` — 新增 2 个 timingSafeEqual 测试用例（6/6 通过）
- `.gitignore` — 添加已移除敏感文件的安全注释条目
- `docs/PROJECT_DEVELOPMENT_GUIDE.md` — 两处 `107.174.146.180` 替换为 `your-server.example.com`

移除文件（git rm --cached，仍保留在工作区）:
- `FRIEND-TEST-GUIDE.md` — 含真实 API key + IP
- `scripts/verify-newapi-live.js` — 含真实服务器凭据
- `scripts/debug-cookie.js` — 含真实服务器凭据

## Phase 7 PLAN-01 Deliverables

新增文件:
- `src/server/middleware/auth-middleware.js` — createAuthMiddleware 工厂，X-API-Key 校验，零依赖
- `test/auth-middleware.test.js` — 4 个测试（无 key 跳过、正确 key、错误 key 401、缺失 key 401）

修改文件:
- `src/server/handlers/notify.js` — postNotifyTest 前置 auth middleware，getNotifyConfig 保持公开
- `src/server/index.js` — buildContext() 新增 apiKey 字段（options > AEB_API_KEY env > null）

---

## Phase 6 PLAN-04 Deliverables

新增文件:

- `src/server/handlers/notify.js` — getNotifyConfig + postNotifyTest（GET /notify/config, POST /notify/test）
- `src/server/handlers/refuel-status.js` — getRefuelStatus（GET /refuel/status）

修改文件:

- `src/server/router.js` — 注册 3 条新路由 + 2 个 require
- `test/auto-refuel-decorator.test.js` — 追加 4 个测试（22 total）
- `test/notification-service.test.js` — 追加 4 个测试（12 total）
- `test/refuel-orchestrator.test.js` — 追加 2 个测试（6 total）

---

## Phase 6 PLAN-03 Deliverables

修改文件:

- `src/service/refuel-orchestrator.js` — 构造函数新增 freeModel/notificationService，prepareSession() 新增余额耗尽降级分支（FUEL-03），返回 degraded 字段
- `src/server/index.js` — buildContext() 新增 notificationService 字段

---

## Phase 6 PLAN-02 Deliverables

修改文件:

- `src/adapters/auto-refuel-decorator.js` — 注入 NotificationService/notifyTargets/quietHours，_logAlert 控制台分级 + fire-and-forget 多渠道通知，新增 _emitNotification 方法

---

## Phase 6 PLAN-01 Deliverables

新增文件:

- `src/utils/quiet-hours.js` — isInQuietHours() 工具函数（跨午夜安全）

修改文件:

- `src/service/notification-service.js` — 新增 wecom + email 渠道，_parseEnvTargets() 解析新环境变量

---

## Phase 5 Deliverables

新增文件:

- `src/core/multi-provider-router.js` — MultiProviderRouter（N-provider 加权路由）
- `src/server/handlers/routing.js` — 3 个路由 HTTP 端点
- `test/multi-provider-router.test.js` — 23 个测试

修改文件:

- `src/index.js` — 导出 MultiProviderRouter, DEFAULT_ROUTER_OPTIONS
- `src/server/router.js` — 注册 /agent/v1/routing/* 路由
- `src/server/index.js` — buildContext + destroy 集成 multiProviderRouter
- `test/route-health-checker.test.js` — 修复既有失败（添加 'unhealthy' 到断言数组）

---

## Validated Capabilities

Existing features already implemented (from PROJECT.md):

- 12 维能力雷达图模型评分
- 三层降级兜底（主选 → 降级 → 免费模型）
- 预算感知路由（free/economy/balanced/premium 四档）
- 多协议自适应（OpenAI/Anthropic/Google/Kimi/MiniMax）
- 调用前预算审批（/optimize 接口）
- 能效持续优化（EnergyScore 公式）
- Claude Code UserPromptSubmit Hook（余额自动检查）
- OpenClaw Cost Guard 守护进程（自动同步 + 免费模式切换）
- Skill 一键安装器（install.mjs 自动配置一切）
- NewAPI 适配器（QuantumNous/new-api 对接）
- Docker 部署支持
- Token 精细化计量（按模型/用户/任务类型统计）
- N-provider 加权路由（MultiProviderRouter，5 秒故障检测）

---

## Known Issues

1. **NewAPI 余额查询权限错误**: `/api/user/self` 返回 access token 无效，导致余额显示 $0
2. **Background task exit code 1**: Bridge 启动和 install 测试虽成功但返回 exit code 1（子进程分离行为）
3. ~~硬编码密码~~: ✅ 已修复
4. ~~Math.random API Key~~: ✅ 已修复
5. ~~AutoRefuel 竞态条件~~: ✅ 已修复
6. ~~setInterval 未清理~~: ✅ 已修复
7. ~~route-health-checker.test.js:5~~: ✅ 已修复（Phase 5）
8. ~~POST /notify/test 无认证保护~~: ✅ 已修复（Phase 7 PLAN-01）
9. **远程服务器密钥需手动 rotate**: `104.243.33.52:3000` 的 NewAPI key 和 `107.174.146.180` 的 test password 需所有者手动 rotate（见 docs/security-scan-baseline.md）

---

## Next Actions

1. 继续执行 Phase 7 剩余 plans（07-PLAN-03 ~ 08）
2. Phase 7 剩余交付物：docs/API.md 中英双语、CONTRIBUTING.md、SECURITY.md、README 中英互链、CI workflow、CHANGELOG、Docker GHCR 发布
3. 生产部署文档需提醒设置 `AEB_API_KEY` 环境变量以启用 `/notify/test` 认证保护
4. **Wave 2 启动前确认**：远程服务器密钥已手动 rotate（104.243.33.52:3000 NewAPI key，107.174.146.180 test password）

## Decisions Log

- **Checkpoint Option A (07-PLAN-02)**: 用户选择"先处置再开源"——移除敏感文件 + 脱敏文档 + 记录 remediation，而非直接 BLOCKED 暂停 Phase 7。

---

*State updated: 2026-05-11*
*Phase 7 PLAN-02 完成 — 219/219 测试通过，D-15 完成，敏感信息已处置，Wave 2 可启动*
