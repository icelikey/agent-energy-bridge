---
name: agent-energy-station
description: Use when OpenClaw, Harness, Claude Code, Codex, or any AI agent needs to test or use the Agent Energy Bridge: query balance, inspect usage, request model recommendations, optimize token spend, redeem refuel codes, report session results, or decide whether to compress context before calling a model. Includes automatic free-tier fallback when balance is depleted.
---

# Agent Energy Station

## 何时使用

当智能体需要连接 Agent Energy Bridge 或进行成本管理时使用：

- 查询自己的余额和用量
- 获取当前可用模型/路由能力
- 在调用模型前做预算判断
- 根据任务类型获取模型推荐
- 额度不足时使用兑换码加油
- 根据返回建议压缩上下文或切换低成本路由
- 任务结束后准备上报 token、成本和成功状态
- **余额耗尽时自动降级到免费模型**

## 工作流程

### 1. 快速状态检查（推荐每次调用前）

```powershell
node scripts/openclaw-energy-sync.mjs status
```

或直接读取本地缓存状态：
```powershell
Get-Content ~/.openclaw/energy-state.json | ConvertFrom-Json
```

### 2. 调用前成本判断

```powershell
# 检查特定任务的成本
$estimatedTokens = 50000
node skills/agent-energy-station/scripts/energy-orchestrator.mjs check-cost --estimatedTokens $estimatedTokens
```

### 3. 智能模型推荐（含免费兜底）

```powershell
node skills/agent-energy-station/scripts/energy-orchestrator.mjs recommend --taskType coding
```

返回三层推荐：
- **主选**：当前预算下最优模型
- **降级**：余额紧张时的 cheaper 替代
- **免费兜底**：余额为 0 时的免费模型

### 4. 自动充值

```powershell
node skills/agent-energy-station/scripts/energy-orchestrator.mjs auto-refuel
```

### 5. 余额耗尽时的免费兜底

当 `energy-state.json` 中 `riskLevel` 为 `critical` 时：

1. **立即停止**高成本调用
2. 尝试自动充值（如果配置了兑换码）
3. 如果充值失败 → **强制使用免费模型**
4. 告知用户当前处于免费模式

免费模型选项：
| 模型 | 提供商 | 免费额度 | 能力 |
|------|--------|---------|------|
| Gemini 2.5 Flash | Google AI Studio | 1,500 RPM | 聊天、推理、编码、视觉 |
| OpenRouter Free | OpenRouter | 20 RPM | 聊天、推理 |
| Groq Llama 3 | Groq | 20 RPM | 聊天、编码、推理 |

### 6. 任务完成后上报

```powershell
# 使用 curl 上报
$body = @{
  taskType = "coding"
  inputTokens = 12000
  outputTokens = 8000
  costUsd = 0.45
  model = "claude-sonnet-4-6"
  success = $true
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:3100/agent/v1/session/report" -Method Post -Body $body -ContentType "application/json"
```

## 环境变量

```powershell
$env:AGENT_RELAY_URL="http://127.0.0.1:3100"
$env:AGENT_ID="openclaw-lobster-local-test"
$env:OPENCLAW_DIR="$env:USERPROFILE\.openclaw"
```

## 自动同步（守护进程）

启动 Cost Guard 守护进程，自动同步 Bridge 状态到 OpenClaw：

```powershell
# 守护模式
node /path/to/smart-relay-station/scripts/openclaw-cost-guard.mjs watch

# 或作为后台任务
Start-Process node -ArgumentList "/path/to/smart-relay-station/scripts/openclaw-cost-guard.mjs","watch" -WindowStyle Hidden
```

## 快速测试

运行 bundled smoke 脚本：

```powershell
node scripts/agent_relay_smoke.mjs
```

可通过环境变量覆盖：

```powershell
$env:AGENT_RELAY_URL='http://127.0.0.1:3100'
$env:AGENT_ID='openclaw-lobster-test'
node scripts/agent_relay_smoke.mjs
```

## 输出要求

- 不暴露服务器源站 IP 给终端用户；对外正式文档优先使用域名。
- 当前实验节点允许使用 IP 做内部测试。
- 如果平台返回节流建议，先执行节流建议再继续高成本模型调用。
- 如果只是测试，不要修改 OpenClaw 主模型配置。
- **余额为 0 时，必须标注 `[FREE]` 并使用免费模型。**

## 参考文件

- API 约定见 `references/agent-relay-api.md`
- OpenClaw 集成指南见 `docs/openclaw-integration-guide.md`
