# Agent Energy Bridge — 项目级 Claude Code 约定

## 能量检查强制规则

在本项目中，**任何涉及 LLM API 调用的操作前**必须检查 Agent Energy Bridge 余额。

### 必须检查的场景

- 调用任何 LLM 模型（Claude、GPT、Gemini 等）
- 预估 token 数 > 5000
- 使用昂贵模型（价格 > $0.02/1k tokens）
- 图像生成、长文本分析、批量处理

### 检查命令

```bash
node skills/agent-energy-station/scripts/energy-orchestrator.mjs smart-call --estimatedTokens <预估token数> --taskType <任务类型>
```

### 决策规则

| 余额状态 | 风险等级 | 操作 |
|---------|---------|------|
| > 预估成本 × 3 | safe | 正常执行 |
| < 预估成本 × 3 | warning | 压缩上下文或切换 cheaper 模型 |
| ≤ 0 | critical | **强制使用免费模型**，或先充值 |

### 免费兜底模型

余额为 0 时，使用：
- `gemini-2.5-flash-free` — 聊天、推理、编码、视觉（1,500 RPM）

### 充值命令

```bash
node skills/agent-energy-station/scripts/energy-orchestrator.mjs auto-refuel
```

## 上报要求

每次 LLM 调用完成后，必须上报消耗：

```bash
curl -X POST http://127.0.0.1:3100/agent/v1/session/report \
  -H "Content-Type: application/json" \
  -d '{
    "taskType": "coding",
    "inputTokens": 12000,
    "outputTokens": 8000,
    "costUsd": 0.45,
    "model": "claude-sonnet-4-6",
    "success": true
  }'
```

## 环境变量

```bash
export AGENT_RELAY_URL="http://127.0.0.1:3100"
export AGENT_ID="claude-code-smart-relay"
```

## 禁止行为

- ❌ 余额为 0 时仍调用付费模型
- ❌ 不检查余额就直接发起 > $0.10 的调用
- ❌ 不上报 session 消耗
