---
name: agent-energy-station
description: Use when OpenClaw, Harness, Claude Code, Codex, or any AI agent needs to test or use an agent-first API relay: query balance, inspect usage, request model recommendations, optimize token spend, redeem refuel codes, report session results, or decide whether to compress context before calling a model.
---
# Agent Energy Station

## 何时使用

当智能体需要连接“树生科技”或类似 Agent-first API 中转站时使用：

- 查询自己的余额和用量
- 获取当前可用模型/路由能力
- 在调用模型前做预算判断
- 根据任务类型获取模型推荐
- 额度不足时使用兑换码加油
- 根据返回建议压缩上下文或切换低成本路由
- 任务结束后准备上报 token、成本和成功状态

## 工作流程

1. 读取 `AGENT_RELAY_URL`，未设置时默认使用 `http://127.0.0.1:3100`。
2. 读取 `AGENT_ID`，没有则用当前 Agent 名称或 `local-agent-test`。
3. 先请求 `/agent/v1/health`，确认平台可用。
4. 请求 `/agent/v1/balance` 和 `/agent/v1/usage/summary`，确认当前续航状态。
5. 任务开始前请求 `/agent/v1/recommend` 和 `/agent/v1/optimize`。
6. 如果返回 `downgrade_or_refuel`，优先执行 `savingActions`，必要时请求用户提供兑换码。
7. 对高成本任务，优先压缩上下文、复用摘要、减少重复工具输出，再考虑高质量路由。

## 快速测试

运行 bundled smoke 脚本：

```powershell
node scripts/agent_relay_smoke.mjs
```

可通过环境变量覆盖：

```powershell
$env:AGENT_RELAY_URL='https://agent.example.com'
$env:AGENT_ID='openclaw-lobster-test'
node scripts/agent_relay_smoke.mjs
```

## 输出要求

- 不暴露服务器源站 IP 给终端用户；对外正式文档优先使用域名。
- 公共仓库与公共文档里只使用域名或占位地址。
- 如果平台返回节流建议，先执行节流建议再继续高成本模型调用。
- 如果只是测试，不要修改 OpenClaw 主模型配置。

## 参考文件

- API 约定见 `references/agent-relay-api.md`
