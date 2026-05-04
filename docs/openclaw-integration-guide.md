# OpenClaw 成本守卫集成指南

## 架构概述

```
Agent Energy Bridge ←→ OpenClaw Cost Guard ←→ OpenClaw 运行时
       ↑                    ↑                      ↑
   余额/预算         energy-state.json         model-routing.yaml
```

## 组件说明

### 1. OpenClaw Cost Guard 守护进程

`scripts/openclaw-cost-guard.mjs`

- 每 30 秒查询 Bridge 余额
- 将状态写入 `~/.openclaw/energy-state.json`
- 余额耗尽时自动修改 `~/.openclaw/model-routing.yaml`，将所有 Agent 路由到免费模型
- 余额恢复时自动恢复原始路由

### 2. 状态文件

`~/.openclaw/energy-state.json`

```json
{
  "healthy": true,
  "availableUsd": 0.00,
  "dailySpentUsd": 12.50,
  "hourlyTokensUsed": 45000,
  "riskLevel": "critical",
  "timestamp": "2026-05-04T10:00:00.000Z"
}
```

### 3. OpenClaw Skill

`~/.openclaw/skills/agent-energy-station/`

增强后的 skill 支持：
- 查询 Bridge 余额
- 读取 energy-state.json 本地状态
- 根据风险等级给出模型选择建议
- 免费模型兜底

## 快速启动

### 步骤 1: 启动 Bridge

```bash
cd /path/to/smart-relay-station
node scripts/start-server.js
```

### 步骤 2: 启动 Cost Guard 守护进程

```bash
# 守护模式（推荐）
node scripts/openclaw-cost-guard.mjs watch

# 或作为 OpenClaw Cron Job 运行（每1分钟）
node scripts/openclaw-cost-guard.mjs sync
```

### 步骤 3: 配置免费模型 Provider

在 `~/.openclaw/openclaw.json` 的 `models.providers` 中添加免费 provider：

```json
{
  "models": {
    "providers": {
      "gemini-free": {
        "baseUrl": "https://your-free-relay.com/v1",
        "apiKey": "your-free-api-key",
        "api": "openai-completions",
        "models": [
          {
            "id": "gemini-2.5-flash",
            "name": "Gemini 2.5 Flash Free",
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          }
        ]
      }
    }
  }
}
```

### 步骤 4: 配置 OpenClaw Cron Job（可选）

在 `~/.openclaw/cron/jobs.json` 中添加：

```json
{
  "id": "energy-guard-sync",
  "agentId": "main",
  "name": "energy-guard-sync",
  "enabled": true,
  "schedule": {
    "kind": "cron",
    "expr": "*/1 * * * *"
  },
  "sessionTarget": "isolated",
  "wakeMode": "now",
  "payload": {
    "kind": "agentTurn",
    "message": "运行能量守卫同步: node /path/to/smart-relay-station/scripts/openclaw-cost-guard.mjs sync"
  }
}
```

## 手动控制

```bash
# 查看当前状态
node scripts/openclaw-cost-guard.mjs status

# 强制切换到免费模式
node scripts/openclaw-cost-guard.mjs switch-free

# 恢复普通模式
node scripts/openclaw-cost-guard.mjs switch-normal

# 单次同步
node scripts/openclaw-cost-guard.mjs sync
```

## 与 OpenClaw Agent 集成

OpenClaw Agent 可以在系统提示词中读取 `energy-state.json`：

```yaml
# 在 agent 配置中
system_prompt: |
  当前能量状态: {{read_file("~/.openclaw/energy-state.json")}}
  如果 riskLevel 为 critical，优先使用免费模型。
```

## 注意事项

1. **备份**: Cost Guard 会自动备份 `openclaw.json` 为 `.aeb-backup`
2. **恢复**: 如果配置出错，运行 `switch-normal` 恢复
3. **免费 API Key**: 需要自行申请 Google AI Studio 或 OpenRouter 免费 API Key
4. **频率**: 守护模式每 30 秒检查一次，Cron 模式每 1 分钟检查一次
