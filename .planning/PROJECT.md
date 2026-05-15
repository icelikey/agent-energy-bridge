---
last_updated: 2026-05-05
---

# Agent Energy Bridge

## What This Is

面向 AI Agent 生态的智能路由与成本管理中间件。解决核心问题："这个任务该用哪个模型？花多少钱？值不值得？"

一句话：**让 Agent 在正确的时间，用正确的模型，花正确的钱。**

## Core Value

自动的 token 加油（auto-refuel）是最核心的业务——余额耗尽时自动充值、自动切换免费模型、自动对接中转站额度，让 Agent 永不中断。

## Users & Scenarios

- **个人开发者**：用 Claude Code / Codex 编码，控制 API 成本
- **小团队**：多人共享 NewAPI 中转站额度，自动分配和监控
- **Agent 平台运营者**：为下游用户提供额度管理、激活码充值、自动兜底

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 零外部运行时依赖 | 降低部署复杂度，Docker 镜像最小化 | Node.js 内置模块 + 空 dependencies |
| 纯内存存储（v1） | 快速迭代，避免数据库运维 | 进程重启数据丢失，v2 考虑持久化 |
| CommonJS 模块 | 兼容 Node.js 22 内置测试框架 | 无构建步骤，即写即跑 |
| 装饰器模式封装 Adapter | AutoRefuel 可以透明包裹任何 GatewayAdapter | 可插拔的自动充值逻辑 |
| Skill 自包含 Hook | install.mjs 自动配置 Claude Code settings.json | 朋友开箱即用 |

## Requirements

### Validated (Existing)

- ✅ 12 维能力雷达图模型评分（coding/reasoning/multimodal/speed/stability/costEfficiency 等）
- ✅ 三层降级兜底（主选 → 降级 → 免费模型）
- ✅ 预算感知路由（free/economy/balanced/premium 四档）
- ✅ 多协议自适应（OpenAI/Anthropic/Google/Kimi/MiniMax）
- ✅ 调用前预算审批（/optimize 接口）
- ✅ 能效持续优化（EnergyScore 公式）
- ✅ Claude Code UserPromptSubmit Hook（余额自动检查）
- ✅ OpenClaw Cost Guard 守护进程（自动同步 + 免费模式切换）
- ✅ Skill 一键安装器（install.mjs 自动配置一切）
- ✅ NewAPI 适配器（QuantumNous/new-api 对接）
- ✅ Docker 部署支持

### Active (Next)

- [ ] **Token 计量精确化** — 按模型/按用户/按任务的精细化 token 统计与计费
- [ ] **API 自动切换** — 主中转站故障时自动切换到备用中转站（多 provider 路由）
- [ ] **激活码对接中转站 Token** — 兑换码充值直接对接 NewAPI 的额度系统（quota 兑换）
- [ ] **自动 Token 加油（增强）** — 余额低于阈值时自动调用 NewAPI 充值接口（非兑换码方式）
- [ ] **安全加固** — 移除硬编码密码、替换 Math.random 为 crypto.randomBytes、敏感信息环境变量化
- [ ] **测试覆盖率** — 核心模块（ops handlers、session-summary、usage）补齐测试
- [ ] **并发安全** — AutoRefuel 加锁、setInterval 清理、alert 数组上限
- [ ] **开源社区准备** — CONTRIBUTING.md、完整 API 文档、CI/CD、版本发布流程

### Out of Scope

- 多租户隔离（v2 考虑）— 当前为单用户/单中转站设计
- Web UI 管理后台 — 专注 API + CLI + Skill 集成
- 数据持久化数据库 — v1 保持内存存储，简化运维
- 支持非 NewAPI 中转系统 — v1 专注 QuantumNous/new-api 生态

## Context

- **技术栈：** Node.js 22, CommonJS, 零外部依赖
- **部署：** Docker (node:22-alpine), 本地 Node.js
- **上游：** NewAPI (QuantumNous/new-api v1.0.0+)
- **下游：** Claude Code, OpenClaw, Codex, 任意 HTTP 客户端
- **状态：** Brownfield — 核心功能已实现，需打磨到生产可用

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — auto-refuel still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state
