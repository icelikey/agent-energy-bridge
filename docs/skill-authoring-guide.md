# Skill 编写指南

## 目标

这个项目里的 skill 主要服务于 Agent-first API 中转站场景。一个合格的 skill，至少要让智能体在下面几件事上少走弯路：

- 任务开始前先看预算
- 根据任务类型选择模型和路由
- 余额不足时优先补给
- 高成本调用前先压缩上下文
- 不覆盖现有生产 key 和既有路由

## 推荐结构

```text
your-skill/
├─ SKILL.md
├─ references/
│  └─ api.md
└─ scripts/
   └─ smoke.mjs
```

## `SKILL.md` 最小模板

```md
---
name: your-skill-name
description: Use when an AI agent needs to check balance, choose routes, control budget, redeem activation codes, or fetch access docs from an agent-first API relay.
---

# Your Skill Name

## 何时使用

- 当智能体需要查询余额和用量
- 当智能体需要做模型推荐或预算判断
- 当智能体需要激活码充值或获取接入文档

## 工作流程

1. 读取 `AGENT_RELAY_URL`。
2. 读取 `AGENT_ID`。
3. 请求 `/agent/v1/health`。
4. 请求 `/agent/v1/balance` 与 `/agent/v1/usage/summary`。
5. 在正式调用模型前，先请求 `/agent/v1/recommend` 与 `/agent/v1/optimize`。
6. 如果返回 `downgrade_or_refuel`，先压缩上下文，再提示充值或切换低成本路由。

## 快速测试

```powershell
$env:AGENT_RELAY_URL='https://agent.example.com'
$env:AGENT_ID='demo-agent'
node scripts/smoke.mjs
```

## 输出要求

- 不暴露源站 IP
- 不覆盖已有生产 key
- 优先做节流，再做高成本调用

## 参考文件

- API 说明见 `references/api.md`
```

## `references/api.md` 建议写法

只写 Agent 真正会用到的接口，不写大而全废话。建议保留：

- Base URL
- 必需 headers
- 核心 endpoints
- `action=proceed` / `action=downgrade_or_refuel` 这类关键决策含义

## `scripts/smoke.mjs` 建议职责

只做三件事：

- 验证服务可达
- 验证 headers 和 body 格式
- 打印最小闭环结果

不要把私钥、真实域名、真实账号写死在脚本里。

## 让 skill 更容易被触发

`description` 里尽量覆盖这些关键词：

- balance
- usage
- budget
- route
- recommend
- redeem
- refuel
- activation code
- access docs

## 给 OpenClaw / Claude Code 的建议

如果你想让智能体更稳定地使用 skill，可以在系统提示里加入这一类约束：

```text
当任务涉及 token 消耗、额度不足、模型选择、激活码充值、预算控制、API key、接入文档时，优先使用 agent-energy-station skill，先查余额和用量，再决定是否调用高成本模型。
```

## 发布到 GitHub 前的检查

- 把真实域名改为占位域名
- 删除账号、密码、激活码库存
- 删除生产环境 IP
- 保留 mock 数据和 smoke 示例
- 跑一次 `node --test`
