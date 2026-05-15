# Roadmap: Agent Energy Bridge

**Created:** 2026-05-04
**Phases:** 7
**Requirements:** 38 v1 requirements mapped

---

## Overview

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Security Hardening | 移除所有安全隐患，达到生产可用安全标准 | SECU-01~05 | 5 |
| 2 | Testing Foundation | 核心模块测试覆盖，建立质量基线 | TEST-01~06 | 6 |
| 3 | Concurrency Safety | 消除竞态条件和资源泄漏 | CONC-01~04 | 4 |
| 4 | Token Metering | 精细化 token 统计与计费 | METR-01~05 | 5 |
| 5 | Multi-Provider Routing | 主备中转站自动切换 | ROUT-01~05 | 5 |
| 6 | Auto-Refuel & Notifications | 激活码对接 + 低余额提醒 + 免费兜底 | FUEL-01~05, NOTF-01~05 | 10 ✅ Completed 2026-05-09 |
| 7 | Open Source Release | 社区就绪：文档、CI/CD、版本管理 | OPEN-01~06 | 6 ✅ Completed 2026-05-11 |

**Total v1 requirements: 43**

---

## Phase Details

### Phase 1: Security Hardening

**Goal:** 移除所有安全隐患，达到生产可用安全标准

**Requirements:** SECU-01, SECU-02, SECU-03, SECU-04, SECU-05

**Success Criteria:**
1. `npm run security:audit` 或等效检查通过零硬编码密钥
2. 所有 API Key 生成使用 `crypto.randomBytes`，单元测试验证随机性强度
3. 环境变量缺失时服务明确报错并拒绝启动（fail-secure）
4. 输入验证覆盖所有 HTTP API 端点，非法输入返回 400
5. 速率限制生效：暴力请求在 10 秒内被拦截

**Key Risk:** 安全改动可能破坏现有功能，需完整回归测试

**UI hint:** no

---

### Phase 2: Testing Foundation

**Goal:** 核心模块测试覆盖，建立质量基线

**Requirements:** TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06

**Success Criteria:**
1. ops handlers 测试覆盖率达到 80%+
2. session-summary 模块测试覆盖率达到 80%+
3. usage 计量模块测试覆盖率达到 80%+
4. AutoRefuelDecorator 所有 public 方法有单元测试
5. ModelSelector 路由决策所有分支有测试用例
6. 端到端测试验证完整调用流程（optimize → call → report）

**Key Risk:** 无外部依赖的测试框架（node:test）mock 复杂场景较繁琐

**UI hint:** no

---

### Phase 3: Concurrency Safety

**Goal:** 消除竞态条件和资源泄漏

**Requirements:** CONC-01, CONC-02, CONC-03, CONC-04

**Success Criteria:**
1. 并发充值场景下余额计算正确（100 并发请求测试通过）
2. 进程退出时所有 setInterval/setTimeout 被清理（无句柄泄漏）
3. alert 数组达到上限后自动丢弃最早条目，内存占用稳定
4. 并发请求下余额查询返回一致结果，无脏读

**Key Risk:** 锁粒度设计不当可能降低吞吐量

**UI hint:** no

---

### Phase 4: Token Metering

**Goal:** 精细化 token 统计与计费

**Requirements:** METR-01, METR-02, METR-03, METR-04, METR-05

**Success Criteria:**
1. 按模型维度 token 统计 API 返回准确数据（误差 < 1%）
2. 按用户维度用量追踪支持多 Agent 标识
3. 按任务类型（coding/reasoning/multimodal）归因正确
4. token 消耗实时更新延迟 < 500ms
5. 历史记录支持 7/30/90 天查询窗口

**Key Risk:** 统计精度依赖上游 Gateway 返回的 usage 数据质量

**UI hint:** no

---

### Phase 5: Multi-Provider Routing

**Goal:** 主备中转站自动切换

**Requirements:** ROUT-01, ROUT-02, ROUT-03, ROUT-04, ROUT-05

**Success Criteria:**
1. 主中转站模拟故障后，5 秒内自动检测到并切换
2. 备用中转站接管后请求成功率 > 99%
3. 主站恢复后自动切回，切换延迟 < 10 秒
4. 多 provider 负载均衡按权重分配流量
5. 每次切换事件记录到日志并触发通知

**Key Risk:** 多 provider 间模型名称/参数映射不一致

**UI hint:** no

---

### Phase 6: Auto-Refuel & Notifications

**Goal:** 激活码对接 + 低余额多渠道提醒 + 免费模型兜底

**Requirements:** FUEL-01, FUEL-02, FUEL-03, FUEL-04, FUEL-05, NOTF-01, NOTF-02, NOTF-03, NOTF-04, NOTF-05

**Success Criteria:**
1. 激活码兑换成功调用 NewAPI 额度接口并更新余额
2. 余额低于阈值时 30 秒内触发多渠道提醒（控制台 / Webhook / 邮件 / 短信 / 钉钉）
3. 额度耗尽时自动降级到免费模型，Agent 无感知中断
4. 提醒 / 充值 / 降级事件通过 webhook 回调并记录日志
5. 提醒策略可配置：阈值、冷却时间、通知渠道、免打扰时段
6. 通知去重生效：同一事件 5 分钟内不重复发送
7. 控制台告警区分 warn（余额紧张）和 critical（余额耗尽）级别

**Key Risk:** 通知渠道配置错误或缺失导致告警无法送达

**Architecture Decision:**
> **预充值优先，人在回路。** v1 采用"兑换码预充值 + 低余额提醒"模式，避免 Agent 自主消费的不可控风险。自动直充（AUTO-01）降级为 v2 实验性功能，需用户明确授权 + 单笔下限 + Circuit Breaker。
> 
> 参考：Google AP2 Mandate、Coinbase x402、Mastercard Agent Pay 均采用"用户授权 + 消费限额"模式，尚无成熟的无人值守自动充值标准。

**UI hint:** no

---

### Phase 7: Open Source Release

**Goal:** 社区就绪：文档、CI/CD、版本管理

**Requirements:** OPEN-01, OPEN-02, OPEN-03, OPEN-04, OPEN-05, OPEN-06

**Success Criteria:**
1. CONTRIBUTING.md 包含开发环境搭建、PR 流程、代码规范
2. API 文档覆盖所有 26 个端点，含请求/响应示例
3. GitHub Actions 在 PR 时运行测试和安全扫描
4. 版本发布自动化：打 tag → 生成 changelog → 创建 release
5. Docker 镜像自动构建并推送到 GitHub Container Registry (ghcr.io)
6. README 中英双语，含快速开始和架构概览

**Plans:** 8 plans

Plans:
- [x] 07-PLAN-01.md — 安全修复：notify/test 认证 + auth-middleware (D-14) [Complete]
- [ ] 07-PLAN-02.md — 安全扫描门槛：gitleaks config + 基线扫描 + timingSafeEqual 升级 (D-15)
- [ ] 07-PLAN-03.md — docs/API.md 中英双语 26 端点 (OPEN-02)
- [ ] 07-PLAN-04.md — CONTRIBUTING.md + SECURITY.md (OPEN-01)
- [ ] 07-PLAN-05.md — README.en.md + README.md 切换链接 (OPEN-06)
- [ ] 07-PLAN-06.md — .github/workflows/ci.yml + .env.example 更新 (OPEN-03)
- [ ] 07-PLAN-07.md — cliff.toml + CHANGELOG.md + release.yml (OPEN-04)
- [ ] 07-PLAN-08.md — .github/workflows/docker-publish.yml (OPEN-05)

**Key Risk:** 开源后 Issue/PR 管理需要维护者时间投入

**UI hint:** no

---

## Dependencies Between Phases

```
Phase 1 (Security) ──→ Phase 2 (Testing) ──→ Phase 3 (Concurrency)
                                                          │
                                                          ▼
Phase 7 (Open Source) ←── Phase 6 (Auto-Refuel) ←── Phase 5 (Routing)
                                                          ▲
                                                          │
                                                   Phase 4 (Metering)
```

**说明：**
- Phase 1 → 2 → 3 是线性依赖：安全基础 → 测试基线 → 并发加固
- Phase 4 和 5 可并行执行（计量和路由相对独立）
- Phase 6 依赖 Phase 4（需要精确的计量来判断何时加油）和 Phase 5（多 provider 支持）
- Phase 7 依赖前面所有阶段完成

---

## Milestones

### M1: Production Ready (Phases 1-3)
**目标：** 代码达到生产部署的安全和质量标准
**交付物：** 通过安全审计、测试覆盖 80%+、无竞态条件
**时间预估：** 2-3 周

### M2: Core Features Complete (Phases 4-6)
**目标：** 核心业务能力完整（计量、路由、自动加油）
**交付物：** token 精确计量、主备自动切换、自动充值兜底
**时间预估：** 3-4 周

### M3: Open Source Launch (Phase 7)
**目标：** 项目达到开源社区发布标准
**交付物：** 完整文档、CI/CD、Docker 镜像、版本管理
**时间预估：** 1-2 周

---

*Roadmap created: 2026-05-04*
*Last updated: 2026-05-11 — Phase 7 PLAN-01 complete (D-14 shipped); PLAN-02~04 revised per checker feedback*
