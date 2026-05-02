---
name: agent-energy-station
description: |
  Use when any AI agent needs to manage LLM costs, check token budget, auto-refuel,
  or fallback to free-tier models before making expensive API calls.
  Critical for: cost transparency, zero-balance fallback, route health monitoring.
---

# Agent Energy Station

## 核心使命

帮助用户**清楚知道每一次调用的实际成本**，在余额不足时**自动降级到免费模型**或触发充值，在路由不可用时**自动切换备用线路**。

## 何时触发

- 任何涉及 LLM API 调用前（Claude Code、Codex、OpenClaw、Harness 等）
- 余额可能不足时
- 需要知道"这次调用要花多少钱"
- 需要知道"余额还能支撑多少次调用"
- 线路异常、模型不可用时
- 任务完成后上报 token 消耗

## 工作流程

### 1. 调用前成本透明（必须）

每次调用 LLM 前，运行：

```bash
node skills/agent-energy-station/scripts/energy-orchestrator.mjs check-cost --estimatedTokens 50000 --modelPricePer1k 0.02
```

输出会告诉你：
- 当前余额
- 预计花费
- 剩余可调用次数
- 风险等级（safe / warning / critical）

### 2. 智能模型推荐（含免费兜底）

```bash
node skills/agent-energy-station/scripts/energy-orchestrator.mjs recommend --taskType coding --protocol openai
```

返回三层推荐：
- **主选**：当前预算下最优模型
- **降级**：余额紧张时的 cheaper 替代
- **免费兜底**：余额为 0 时的免费模型（Gemini Flash、OpenRouter Free、Groq Llama、Local Ollama）

### 3. 智能调用决策（一键判断）

```bash
node skills/agent-energy-station/scripts/energy-orchestrator.mjs smart-call --estimatedTokens 50000 --taskType coding
```

自动执行：
1. 查询余额
2. 评估成本
3. 如果余额充足 → 推荐主选模型
4. 如果余额不足 → 尝试自动充值
5. 如果充值失败 → **自动推荐免费模型**
6. 输出明确的执行建议

### 4. 自动充值

```bash
node skills/agent-energy-station/scripts/energy-orchestrator.mjs auto-refuel --thresholdUsd 2
```

当余额低于阈值时，自动尝试兑换码充值。

### 5. 路由健康检查

```bash
node skills/agent-energy-station/scripts/energy-orchestrator.mjs health
```

检查：
- Bridge sidecar 是否健康
- 模型路由是否可用
- 余额查询是否正常

如果检测到异常，建议切换到备用路由或免费模型。

### 6. 任务完成后上报

调用结束后，向 Bridge 上报实际消耗：

```bash
curl -X POST http://127.0.0.1:3100/agent/v1/session/report \
  -H "Content-Type: application/json" \
  -d '{
    "taskType": "coding",
    "inputTokens": 12000,
    "outputTokens": 8000,
    "costUsd": 0.45,
    "model": "claude-4.6-mixed",
    "success": true
  }'
```

用于优化后续推荐和能量评分。

## Agent 行为指令

### 余额充足时（safe）
- 正常执行，使用推荐的主选模型
- 记录预估成本

### 余额紧张时（warning）
- **优先压缩上下文**（减少 token 数）
- 如果压缩后仍紧张，切换到降级模型
- 记录节省的成本

### 余额耗尽时（critical）
1. **立即停止**高成本调用
2. 尝试自动充值（如果配置了兑换码）
3. 如果充值失败 → **强制使用免费模型**
4. 告知用户当前处于免费模式

### 线路异常时（degraded）
1. 检查路由健康状态
2. 如果主路由不可用 → 切换到 healthy 的 fallback 路由
3. 如果所有付费路由都不可用 → 切换到免费模型
4. 记录异常事件

## 环境变量

```bash
# Bridge sidecar 地址（必须）
export AGENT_RELAY_URL="http://127.0.0.1:3100"

# 当前 Agent 标识
export AGENT_ID="claude-code-main"
```

## 免费模型兜底机制

当余额为 0 时，系统会自动推荐以下免费模型之一：

| 模型 | 提供商 | 免费额度 | 能力 |
|------|--------|---------|------|
| Gemini 2.5 Flash | Google | 1,500 RPM | 聊天、推理、编码、视觉 |
| OpenRouter Free | OpenRouter | 20 RPM | 聊天、推理 |
| Groq Llama 3 | Groq | 20 RPM | 聊天、编码、推理 |
| Local Ollama | 本地 | 无限制 | 聊天、编码 |

Agent 应优先使用与原任务能力匹配的免费模型。

## 输出要求

- 不要在公共对话中暴露 API Key 或服务器 IP
- 成本显示保留 4 位小数（如 $0.0234）
- 免费模型调用标注 `[FREE]`
- 充值操作需要用户确认（除非配置了自动充值）

## 参考文件

- API 契约见 `references/agent-relay-api.md`
- 详细部署指南见 `docs/agent-skill-install-playbook.md`
