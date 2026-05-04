# Agent Energy Bridge — 智能路由产品文档

## 一、产品定位

Agent Energy Bridge 的智能路由不是简单的"请求转发"，而是**面向 AI Agent 的模型决策中枢**。

核心问题："这个任务该用哪个模型？花多少钱？值不值得？"

一句话定义：

> **让 Agent 在正确的时间，用正确的模型，花正确的钱。**

---

## 二、能实现的 8 大效果

### 效果 1：任务-模型智能匹配（不是人挑，是系统荐）

**问题**：Agent 不知道 coding 该用 Claude 还是 GPT，也不知道 vision 任务该选 Gemini。

**解决**：输入任务类型，系统自动从 12 个模型中选出最匹配的一个。

支持的任务类型：

| 任务类型 | 优先能力维度 | 典型推荐 |
|---------|------------|---------|
| coding | coding > toolUse > reasoning > stability | Claude 4.7 / GPT-5 Codex |
| reasoning | reasoning > analysis > longContext > stability | O3 Premium / Claude 4.7 |
| chat | chat > speed > costEfficiency > stability | Kimi K2 / MiniMax M1 |
| multimodal | multimodal > reasoning > speed > stability | Gemini 2.5 Pro |
| research | search > reasoning > longContext > costEfficiency | Kimi K2 / Gemini 2.5 Pro |
| automation | toolUse > stability > coding > speed | Claude 4.6 / all-protocol-router |
| routing | routing > stability > speed > costEfficiency | all-protocol-router |

**调用方式**：

```bash
curl -X POST http://127.0.0.1:3100/agent/v1/recommend \
  -H "Content-Type: application/json" \
  -d '{
    "taskType": "coding",
    "budgetTier": "balanced",
    "protocol": "anthropic"
  }'
```

**返回示例**：

```json
{
  "success": true,
  "recommendation": {
    "primary": {
      "id": "claude-4.6-mixed",
      "pricePer1kUsd": 0.022,
      "capabilities": ["coding", "chat", "reasoning"]
    },
    "fallback": {
      "id": "kimi-k2",
      "pricePer1kUsd": 0.008
    },
    "candidates": [...]
  }
}
```

---

### 效果 2：三层降级兜底（主选 → 降级 → 免费）

**问题**：余额不足时直接报错，Agent 中断工作。

**解决**：系统始终返回三层推荐，Agent 可以自动降级。

| 层级 | 触发条件 | 成本 |
|-----|---------|------|
| **主选** | 预算充足 | 正常价格 |
| **降级** | 余额紧张 / 主选失败 | 更便宜 |
| **免费兜底** | 余额为 0 | $0 |

**免费模型库**（已内置）：

| 模型 | 能力 | 限制 |
|------|------|------|
| gemini-2.5-flash-free | chat, reasoning, coding, vision | 1,500 RPM |
| openrouter-free | chat, reasoning | 20 RPM |
| groq-llama-free | chat, coding, reasoning | 20 RPM |
| local-ollama | chat, coding | 无限制（本地） |

**代码实现**：

```js
// ModelSelector.js 第 230-245 行
if (preferFree || budgetTier === 'free') {
  fallback = ranked.find(model => model.id !== primary.id && model.isFree);
} else {
  fallback = ranked.find(model => 
    model.id !== primary.id && 
    (model.budgetTier === 'economy' || model.pricePer1kUsd < primary.pricePer1kUsd)
  );
}
```

---

### 效果 3：12 维能力雷达图评分（不是拍脑袋，是量化比）

每个模型在 12 个维度上有基准分数（0-100），系统自动加权计算：

| 维度 | 说明 | 最高分模型 |
|------|------|-----------|
| coding | 代码生成质量 | GPT-5 Codex (98) |
| reasoning | 推理深度 | O3 Premium (97) |
| chat | 对话自然度 | Claude 4.7 (90) |
| analysis | 分析能力 | O3 Premium (96) |
| multimodal | 多模态处理 | Gemini 2.5 Pro (96) |
| search | 搜索/检索 | Kimi K2 (90) |
| toolUse | 工具调用 | GPT-5 Codex (96) |
| agentic | Agent 自主性 | GPT-5 Codex (95) |
| speed | 响应速度 | Kimi K2 / MiniMax (90+) |
| stability | 稳定性 | all-protocol-router (90) |
| costEfficiency | 性价比 | Kimi K2 (94) |
| longContext | 长上下文 | Claude 4.7 (94) |

**评分算法**：

```
综合得分 = 
  任务匹配度 × 36% +
  能力覆盖度 × 18% +
  稳定性 × 12% +
  预算匹配度 × 10% +
  协议适配度 × 8% +
  成本效率 × 8% +
  速度 × 8%
```

（当 qualityPriority=high 时，质量维度额外 +12%；当 latencySensitive=true 时，速度额外 +6%）

---

### 效果 4：预算感知路由（贵模型只在值得时推荐）

**问题**：Agent 不管任务难易都用最贵模型，成本失控。

**解决**：系统根据预算等级自动过滤和排序。

| 预算等级 | 价格范围 ($/1k tokens) | 推荐策略 |
|---------|----------------------|---------|
| **free** | $0 | 只用免费模型 |
| **economy** | <$0.01 | 优先 Kimi、MiniMax |
| **balanced** | $0.01-$0.03 | 综合性价比，Claude 4.6 / Gemini |
| **premium** | >$0.04 | 优先 Claude 4.7 / O3 / GPT-5 |

**实际效果**：

- 日常聊天任务 → 推荐 $0.008 的 Kimi（而非 $0.06 的 Claude 4.7）
- 复杂编码任务 → 推荐 $0.045 的 GPT-5 Codex（值得）
- 余额 $0 → 自动推荐 gemini-2.5-flash-free

---

### 效果 5：多协议自适应（一个入口，多种风格）

**问题**：不同 Agent 用不同协议（OpenAI、Anthropic、Google），需要配多个地址。

**解决**：系统识别协议并推荐兼容模型，支持统一入口。

| 协议 | 兼容模型 |
|-----|---------|
| openai | 全部 12 个 |
| anthropic | Claude 系列 + all-protocol-router |
| google | Gemini 系列 + all-protocol-router |
| kimi | Kimi K2 + all-protocol-router |
| minimax | MiniMax M1 + all-protocol-router |

**特殊处理**：当需要多协议混合时，自动推荐 `all-protocol-router` 作为统一入口。

---

### 效果 6：工作流级路由（多步骤任务，每步不同模型）

**问题**：一个复杂任务包含多个子任务（如：分析 → 编码 → 测试），全用同一个模型不划算。

**解决**：对工作流中的每步任务分别推荐最优模型。

```bash
curl -X POST http://127.0.0.1:3100/agent/v1/recommend \
  -d '{
    "tasks": [
      {"taskType": "analysis", "weight": 1},
      {"taskType": "coding", "weight": 3},
      {"taskType": "automation", "weight": 1}
    ],
    "needsUniversalProtocol": true
  }'
```

**可能输出**：

| 步骤 | 任务 | 推荐模型 | 原因 |
|-----|------|---------|------|
| 1 | 需求分析 | Gemini 2.5 Pro | 多模态输入 + 长上下文 |
| 2 | 代码生成 | GPT-5 Codex | coding 维度 98 分 |
| 3 | 测试脚本 | Kimi K2 | 成本低，速度块 |
| 共享入口 | all-protocol-router | 统一协议适配 | — |

---

### 效果 7：调用前预算审批（花多少钱先知道）

**问题**：调用完了才发现花了 $2，预算超了。

**解决**：调用前先走 `/optimize` 接口，系统判断是否允许、是否降级。

```bash
curl -X POST http://127.0.0.1:3100/agent/v1/optimize \
  -d '{
    "estimatedCostUsd": 0.5,
    "requestedTokens": 10000,
    "modelId": "claude-4.7-premium"
  }'
```

**返回决策**：

| action | 含义 | 后续操作 |
|--------|------|---------|
| `proceed` | 允许执行 | 正常调用 |
| `free_fallback` | 余额耗尽 | 切换免费模型 |
| `downgrade` | 预算紧张 | 使用降级模型 |
| `block` | 超出限制 | 阻断调用 |

**BudgetGuard 检查项**：

- 余额是否 > 0
- 日预算是否超出
- 小时 token 是否超限
- 是否高价模型（>$0.02/1k）且不在白名单

---

### 效果 8：能效持续优化（越用越聪明）

**问题**：不知道哪个模型真的划算，凭感觉选。

**解决**：每次调用后上报 session，系统计算能效评分并给出趋势建议。

**能效评分公式**：

```
EnergyScore = (
  质量分 × 34% +
  成功率 × 24% +
  延迟分 × 12% +
  Token利用率 × 15% +
  成本利用率 × 15%
) × 任务系数 × 首轮成功加成
```

**上报方式**：

```bash
curl -X POST http://127.0.0.1:3100/agent/v1/session/report \
  -d '{
    "taskType": "coding",
    "inputTokens": 12000,
    "outputTokens": 8000,
    "costUsd": 0.45,
    "model": "claude-4.6-mixed",
    "success": true,
    "qualityScore": 0.85
  }'
```

**系统输出建议**：

- "能效趋势下降，建议收紧路由策略"
- "当前路由健康，继续监控"
- "失败率 > 15%，建议提升模型质量等级"

---

## 三、模型目录（已内置）

| 模型 | 价格/1k | 预算等级 | 质量等级 | 核心能力 |
|------|--------|---------|---------|---------|
| all-protocol-router | $0.015 | balanced | adaptive | 协议统一入口 |
| claude-4.7-premium | $0.060 | premium | premium | 编码、推理顶级 |
| claude-4.6-mixed | $0.022 | economy | mixed | 综合性价比 |
| o3-premium | $0.050 | premium | premium | 推理最强 |
| gpt-5-codex | $0.045 | premium | premium | 编码最强 |
| gemini-2.5-pro | $0.020 | balanced | balanced | 多模态 |
| kimi-k2 | $0.008 | economy | balanced | 速度、搜索、性价比 |
| minimax-m1 | $0.009 | economy | balanced | 速度、多模态 |
| gemini-2.5-flash-free | $0 | free | balanced | 免费兜底 |
| openrouter-free | $0 | free | economy | 免费聊天 |
| groq-llama-free | $0 | free | balanced | 免费编码 |
| local-ollama | $0 | free | economy | 本地无限 |

---

## 四、典型使用场景

### 场景 A：Claude Code 编码助手

```
用户：帮我重构这个函数

系统判断：
- taskType = coding
- budgetTier = balanced
- 推荐：claude-4.6-mixed ($0.022/1k)
- 降级：kimi-k2 ($0.008/1k)
- 免费：gemini-2.5-flash-free ($0)

如果余额 $5：正常用 claude-4.6
如果余额 $0.5：建议降级到 kimi-k2
如果余额 $0：自动切到 gemini-free
```

### 场景 B：OpenClaw 小说创作 Agent

```
任务：写一章节科幻小说（约 8000 tokens）

系统判断：
- taskType = chat / reasoning
- 长上下文需求高
- 推荐：gemini-2.5-pro ($0.020/1k, longContext 90)
- 原因：多模态支持插图描述，长上下文保持连贯

预估成本：8k tokens × $0.02 = $0.16
```

### 场景 C：余额耗尽自动兜底

```
余额：$0
自动充值：失败（无兑换码）

BudgetGuard 决策：
- action: free_fallback
- freeFallbackModel: gemini-2.5-flash-free
- 原因：balance depleted: $0 available

Agent 自动切换：
- 模型：gemini-2.5-flash-free
- 成本：$0
- 能力：chat, reasoning, coding, vision
- 限制：1,500 RPM
```

---

## 五、接入方式

### 方式 1：HTTP API（推荐）

```bash
# 1. 健康检查
curl http://127.0.0.1:3100/agent/v1/health

# 2. 模型推荐
curl -X POST http://127.0.0.1:3100/agent/v1/recommend \
  -H "x-agent-id: my-agent" \
  -d '{"taskType": "coding", "budgetTier": "balanced"}'

# 3. 预算审批
curl -X POST http://127.0.0.1:3100/agent/v1/optimize \
  -H "x-agent-id: my-agent" \
  -d '{"estimatedCostUsd": 0.5, "requestedTokens": 10000}'

# 4. 上报消耗
curl -X POST http://127.0.0.1:3100/agent/v1/session/report \
  -H "x-agent-id: my-agent" \
  -d '{"taskType": "coding", "costUsd": 0.3, "model": "claude-4.6-mixed"}'
```

### 方式 2：Skill 脚本

```bash
# 一键智能调用
node skills/agent-energy-station/scripts/energy-orchestrator.mjs smart-call \
  --estimatedTokens 50000 \
  --taskType coding

# 输出：推荐模型 + 预估成本 + 是否允许执行
```

### 方式 3：Claude Code Hook（自动）

已配置 `UserPromptSubmit` 钩子，每次输入自动检查余额并给出警告。

### 方式 4：OpenClaw Cost Guard（自动）

守护进程每 30 秒同步余额，余额为 0 时自动改写 OpenClaw 路由配置到免费模型。

---

## 六、与普通中转站对比

| 能力 | 普通中转站 | Agent Energy Bridge |
|------|----------|-------------------|
| 模型选择 | 用户手动选 | **系统自动推荐** |
| 余额不足 | 直接报错 429 | **自动降级免费模型** |
| 预算控制 | 无 | **日预算 + 小时 token 限制** |
| 任务匹配 | 无 | **12 维能力雷达评分** |
| 协议适配 | 固定一种 | **多协议自适应** |
| 工作流 | 单一模型 | **每步不同模型** |
| 能效追踪 | 无 | **EnergyScore 持续优化** |
| 调用前审批 | 无 | **optimize 预检** |
| Agent 集成 | 无 | **Claude Code / OpenClaw 原生集成** |

---

## 七、系统架构图

```
Agent 请求
    |
    v
+-------------------+
|   BudgetGuard     | <-- 余额？预算？限制？
|   (预算护栏)       |
+-------------------+
    | allowed / free_fallback / downgrade / block
    v
+-------------------+
|   ModelSelector   | <-- 任务类型 + 协议 + 预算
|   (模型选择器)     |     + 能力评分 + 价格权重
+-------------------+
    |
    +---> primary (主选)
    +---> fallback (降级)
    +---> freeFallback (免费兜底)
    v
+-------------------+
|  ModelCapability  | <-- 12 维基准评分
|   Benchmark       |
+-------------------+
    |
    v
  调用 LLM API
    |
    v
+-------------------+
|   EnergyEngine    | <-- 质量/成功率/延迟/token/成本
|   (能效引擎)       |     = EnergyScore
+-------------------+
    |
    v
  历史数据 --> 下次推荐更优
```

---

*文档版本：v0.2.0 | 对应代码版本：8b9a46b*
