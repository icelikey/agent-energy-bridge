# Agent Energy Bridge — 完整项目开发文档

> 版本: 0.1.0 | 更新日期: 2026-05-02
> 项目代号: smart-relay-station / agent-energy-bridge

---

## 1. 项目概述

### 1.1 定位

Agent Energy Bridge（智能中继站）是一套**面向 AI Agent 的中转增强层**，不替代现有 API 网关（new-api / sub2api / one-api），而是作为 Sidecar 部署在网关旁边，专门解决 Agent 场景下的成本透明、自动补给、智能选型和路由兜底问题。

### 1.2 核心目标

- **成本透明**: Agent 每次调用前知道余额、预计成本和剩余可调用次数
- **自动补给**: 余额低于阈值时自动触发兑换码充值
- **智能选型**: 根据任务类型、预算、协议自动推荐最优模型
- **免费兜底**: 余额耗尽时自动降级到免费模型（Gemini Flash、OpenRouter Free、Groq、Ollama）
- **路由健康**: 监控上游线路可用性，自动切换备用路由

### 1.3 一句话定义

`Agent Runtime Infrastructure as a Service` — 面向智能体的运行时基础设施服务。

---

## 2. 架构设计

### 2.1 系统位置

```
┌─────────────────────────────────────────────────────────────┐
│                        Agent 层                              │
│  Claude Code / Codex / OpenClaw / Harness / 自定义 Agent    │
│                     ↓ (HTTP / Skill)                        │
├─────────────────────────────────────────────────────────────┤
│              Agent Energy Bridge (Sidecar)                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │
│  │ BudgetGuard │ │ModelSelector│ │  AutoRefuelDecorator│   │
│  │  预算护栏    │ │  模型推荐    │ │    自动充值装饰器    │   │
│  └─────────────┘ └─────────────┘ └─────────────────────┘   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │
│  │ EnergyEngine│ │RouteHealth  │ │     OpsEngine       │   │
│  │  能量评分    │ │  路由健康    │ │    运营监控引擎      │   │
│  └─────────────┘ └─────────────┘ └─────────────────────┘   │
│                     ↓ (Adapter 层)                          │
├─────────────────────────────────────────────────────────────┤
│              API Gateway (现有中转站)                         │
│         new-api / sub2api / one-api / OpenAI                │
│                     ↓                                        │
│              上游模型供应商                                   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 技术栈

- **运行时**: Node.js 22+ (LTS)
- **协议**: HTTP/1.1 (原生 `http` 模块)
- **依赖**: 零外部运行时依赖（纯 Node.js 标准库）
- **部署**: Docker / Docker Compose / 裸机 Node.js
- **测试**: Node.js 原生 Test Runner (`node --test`)

### 2.3 目录结构

```
smart-relay-station/
├── src/
│   ├── core/                    # 业务核心规则
│   │   ├── budget-guard.js      # 预算护栏
│   │   ├── model-selector.js    # 模型选型与能力评估
│   │   ├── energy-engine.js     # Token 效率评分
│   │   ├── compatibility-guard.js # 兼容性保护（影子路由）
│   │   ├── referral-engine.js   # 代理商推荐卡片
│   │   ├── route-health-checker.js # 路由健康监控
│   │   └── model-capability-benchmark.js # 模型能力基准
│   ├── adapters/                # 网关适配器
│   │   ├── generic-openai-adapter.js   # 通用 OpenAI 风格适配
│   │   ├── new-api-adapter.js          # NewAPI v1.0.0+ 专用适配
│   │   └── auto-refuel-decorator.js    # 自动充值装饰器
│   ├── service/                 # 业务编排层
│   │   ├── refuel-orchestrator.js      # 补给编排
│   │   └── ops-engine.js               # 运营监控
│   ├── server/                  # HTTP 服务层
│   │   ├── index.js             # 服务器创建与启动
│   │   ├── router.js            # 路由分发
│   │   ├── handlers/            # 端点处理器
│   │   │   ├── health.js
│   │   │   ├── balance.js
│   │   │   ├── usage.js
│   │   │   ├── recommend.js
│   │   │   ├── optimize.js
│   │   │   ├── refuel.js
│   │   │   ├── keys.js
│   │   │   ├── docs.js
│   │   │   ├── session.js
│   │   │   ├── models.js
│   │   │   └── ops.js
│   │   └── middleware/          # 中间件
│   │       └── error-handler.js
│   └── utils/                   # 工具类
│       ├── logger.js
│       └── config-loader.js
├── skills/
│   └── agent-energy-station/
│       ├── skill.yaml           # Skill 元数据
│       └── scripts/
│           └── energy-orchestrator.mjs  # Agent 调用脚本
├── scripts/
│   ├── start-server.js          # 生产启动入口
│   └── verify-admin.js          # 管理员账号验证
├── test/                        # 单元测试
├── tests/                       # 联调 Smoke 测试
├── docs/                        # 设计文档
├── bin/                         # CLI 入口
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## 3. 核心模块详解

### 3.1 BudgetGuard — 预算护栏

**文件**: `src/core/budget-guard.js`

**职责**: 在 Agent 调用前进行预算风险评估，防止超支。

**核心策略**:

| 检查项 | 说明 |
|--------|------|
| `dailyBudgetUsd` | 每日 USD 预算上限 |
| `hourlyTokenLimit` | 每小时 Token 上限 |
| `maxAutoRefuelsPerDay` | 每日自动补给次数上限 |
| `maxRefuelAmountUsd` | 单次补给金额上限 |
| `maxAutoPurchasedUsdPerDay` | 每日自动购买 USD 上限 |
| `fallbackModel` | 预算不足时的降级模型 |
| `enableFreeFallback` | 是否启用免费模型兜底 |
| `freeFallbackModel` | 免费兜底模型 ID |

**决策输出**:

```js
{
  action: 'proceed' | 'downgrade' | 'free_fallback' | 'deny',
  reason: string,
  recommendedModel: string | null,
  estimatedCostUsd: number,
  estimatedCallsRemaining: number,
}
```

### 3.2 ModelSelector — 模型选型器

**文件**: `src/core/model-selector.js`

**职责**: 根据任务类型、预算等级、协议要求推荐最优模型。

**预算等级** (`budgetTier`):

| 等级 | 分值 | 说明 |
|------|------|------|
| `free` | 0 | 免费模型（Gemini Flash、OpenRouter Free、Groq、Ollama） |
| `economy` | 1 | 经济型（MiniMax、Kimi） |
| `balanced` | 2 | 均衡型（全能路由、Gemini Pro） |
| `premium` | 3 |  premium（Claude 4.7、O3、GPT-5 Codex） |

**三-tier 推荐**:

每次推荐返回 `primary`（主选）、`fallback`（降级）、`candidates`（候选列表），支持 `preferFree` 参数强制推荐免费模型。

### 3.3 AutoRefuelDecorator — 自动充值装饰器

**文件**: `src/adapters/auto-refuel-decorator.js`

**职责**: 以装饰器模式包装任意 GatewayAdapter，在查询余额时自动检测并触发充值。

**触发条件**:
- 余额 `< lowBalanceThresholdUsd`（默认 $3）
- 距离上次充值超过 `cooldownMs`（默认 60 秒）
- 本小时内充值次数 `< maxRefuelsPerHour`（默认 3）

**充值策略** (`refuelStrategy`):

| 策略 | 说明 |
|------|------|
| `fixed` | 固定金额充值 |
| `proportional` | 按比例充值（余额越低充越多） |
| `dynamic` | 动态计算（预留） |

**回调**:
- `onRefuel(event)` — 充值成功时触发
- `onAlert(alert)` — 告警时触发（余额低、充值失败、冷却中等）

### 3.4 NewAPIGatewayAdapter — NewAPI 适配器

**文件**: `src/adapters/new-api-adapter.js`

**职责**: 对接 QuantumNous/new-api v1.0.0-rc.2（Calcium-Ion/new-api 分支）。

**认证方式**（二选一）:

| 方式 | 配置项 | 说明 |
|------|--------|------|
| A | `username` + `password` | 自动调用 `/api/user/login` 获取 Session Cookie |
| B | `apiKey` + `userId` | 使用 Bearer Token + `New-Api-User` 头部 |

**核心方法**:

| 方法 | 端点 | 说明 |
|------|------|------|
| `getBalance()` | `GET /api/user/self` | 提取余额（支持 `balance` / `quota` 字段） |
| `getUsage()` | `GET /api/usage/token/` | 提取日消耗和 Token 用量 |
| `redeemCode()` | `POST /api/user/topup` | 兑换码充值（body: `{ key: code }`） |
| `getUserInfo()` | `GET /api/user/self` | 用户信息 |

**配额转换**:

NewAPI 使用 `quota` 整数点数表示余额，`quotaPerUnit` 表示每 USD 对应的点数。适配器自动从 `/api/status` 获取 `quota_per_unit`（默认 100000）。

```
USD = quota / quota_per_unit
```

### 3.5 RouteHealthChecker — 路由健康检查

**文件**: `src/core/route-health-checker.js`

**职责**: 周期性检测上游路由可用性，维护健康状态。

**状态定义**:

| 状态 | 条件 |
|------|------|
| `healthy` | 连续成功，成功率 >= 80% |
| `degraded` | 偶发失败，成功率 50%~80% |
| `unhealthy` | 连续失败，成功率 < 50% |

**指标**:
- 成功率（success rate）
- 连续失败次数（consecutive failures）
- EWMA 延迟（指数加权移动平均）

### 3.6 OpsEngine — 运营监控引擎

**文件**: `src/service/ops-engine.js`

**职责**: 定时抓取余额、用量快照，生成趋势报告。

**报告内容**:
- 平均余额 / 最小余额
- 总消耗 / 趋势方向（上升/下降/持平）
- 告警列表
- 能量效率评分

---

## 4. HTTP API 文档

### 4.1 端点列表

| 端点 | 方法 | 说明 |
|------|------|------|
| `/agent/v1/health` | GET | 健康检查 |
| `/agent/v1/balance` | GET | 查询余额 |
| `/agent/v1/usage/summary` | GET | 用量摘要 |
| `/agent/v1/models/capabilities` | GET | 模型能力列表 |
| `/agent/v1/recommend` | POST | 模型推荐 |
| `/agent/v1/optimize` | POST | 预算优化判断 |
| `/agent/v1/refuel/redeem` | POST | 兑换码充值 |
| `/agent/v1/keys/issue` | POST | 签发新 Key |
| `/agent/v1/docs/render` | POST | 渲染接入文档 |
| `/agent/v1/session/report` | POST | 上报会话消耗 |
| `/agent/v1/ops/snapshot` | GET | 手动抓取运营快照 |
| `/agent/v1/ops/report` | GET | 运营趋势报告 |
| `/agent/v1/ops/energy` | GET | 能量效率报告 |

### 4.2 关键端点详情

#### GET /agent/v1/balance

**响应**:
```json
{
  "success": true,
  "balance": {
    "availableUsd": 200,
    "balanceUsd": 200,
    "raw": { /* 原始网关响应 */ }
  }
}
```

#### POST /agent/v1/recommend

**请求体**:
```json
{
  "taskType": "coding",
  "protocol": "openai",
  "budgetTier": "balanced",
  "client": "agent-id"
}
```

**响应**:
```json
{
  "success": true,
  "recommendation": {
    "primary": { /* 主选模型 */ },
    "fallback": { /* 降级模型 */ },
    "candidates": [ /* 候选列表 */ ],
    "explain": "推荐理由"
  }
}
```

#### POST /agent/v1/optimize

**请求体**:
```json
{
  "estimatedCostUsd": 1.2,
  "requestedTokens": 9000,
  "modelId": "claude-4.7-premium",
  "client": "agent-id"
}
```

**响应**:
```json
{
  "success": true,
  "decision": {
    "action": "proceed",
    "reason": "余额充足",
    "recommendedModel": "claude-4.7-premium",
    "estimatedCallsRemaining": 166
  }
}
```

#### POST /agent/v1/refuel/redeem

**请求体**:
```json
{
  "code": "RECHARGE-10",
  "client": "agent-id"
}
```

**响应**:
```json
{
  "success": true,
  "ok": true,
  "creditUsd": 10,
  "message": "充值成功"
}
```

---

## 5. 环境变量配置

### 5.1 NewAPI 对接配置

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `NEWAPI_BASE_URL` | 是* | — | NewAPI 地址（如 `http://107.174.146.180`） |
| `NEWAPI_API_KEY` | 否 | — | API Key（Bearer 认证） |
| `NEWAPI_USER_ID` | 否 | — | 用户 ID（管理 API 需要 `New-Api-User` 头部） |
| `NEWAPI_USERNAME` | 否 | — | 登录用户名（自动获取 Session） |
| `NEWAPI_PASSWORD` | 否 | — | 登录密码 |
| `NEWAPI_QUOTA_PER_UNIT` | 否 | 自动获取 | 每 USD 配额点数 |

> `NEWAPI_BASE_URL` 设置后启用真实 NewAPI 模式，否则使用 MemoryAdapter 演示模式。

### 5.2 自动充值配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AUTO_REFUEL_ENABLED` | `true` | 是否启用自动充值 |
| `AUTO_REFUEL_THRESHOLD_USD` | `3` | 低余额阈值（USD） |
| `AUTO_REFUEL_AMOUNT_USD` | `10` | 充值金额（USD） |
| `AUTO_REFUEL_STRATEGY` | `fixed` | 策略：`fixed` / `proportional` / `dynamic` |
| `AUTO_REFUEL_CODES` | — | 兑换码列表，逗号分隔 |
| `AUTO_REFUEL_MAX_PER_HOUR` | `3` | 每小时最大充值次数 |
| `AUTO_REFUEL_COOLDOWN_MS` | `60000` | 充值冷却期（毫秒） |

### 5.3 运营监控配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `OPS_MONITOR_INTERVAL_MS` | `300000` | 监控间隔（5 分钟） |

### 5.4 路由健康检查配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `HEALTH_CHECK_ROUTES` | — | 路由列表，逗号分隔的 URL |
| `HEALTH_CHECK_INTERVAL_MS` | `60000` | 检查间隔（1 分钟） |
| `HEALTH_CHECK_TIMEOUT_MS` | `10000` | 单次超时（10 秒） |

### 5.5 服务配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AEB_PORT` | `3100` | 服务端口 |
| `AEB_HOST` | `127.0.0.1` | 绑定地址 |
| `AEB_LOG_LEVEL` | `info` | 日志级别：`debug` / `info` / `warn` / `error` |

---

## 6. 部署指南

### 6.1 本地开发

```bash
# 安装依赖（零外部依赖，仅需确认）
npm install

# 运行测试
node --test

# 启动服务（演示模式）
node scripts/start-server.js

# 启动服务（对接真实 NewAPI）
NEWAPI_BASE_URL=http://your-newapi.example.com \
NEWAPI_USERNAME=your-username \
NEWAPI_PASSWORD=your-password \
NEWAPI_USER_ID=1 \
node scripts/start-server.js
```

### 6.2 Docker 部署

```bash
# 构建镜像
docker build -t agent-energy-bridge .

# 运行容器
docker run -d \
  -p 3100:3100 \
  -e NEWAPI_BASE_URL=http://your-newapi.example.com \
  -e NEWAPI_USERNAME=your-username \
  -e NEWAPI_PASSWORD=your-password \
  -e NEWAPI_USER_ID=1 \
  -e AUTO_REFUEL_ENABLED=true \
  -e AUTO_REFUEL_CODES=CODE1,CODE2 \
  --name agent-energy-bridge \
  agent-energy-bridge
```

### 6.3 Docker Compose 部署

```bash
# 复制并编辑环境变量
cp .env.example .env
# 编辑 .env 填入你的配置

# 启动
docker-compose up -d
```

**docker-compose.yml 要点**:
- 端口映射: `3100:3100`
- 重启策略: `unless-stopped`
- 健康检查: 每 30 秒检查 `/agent/v1/health`
- 非 root 用户运行（UID 1001）

### 6.4 验证部署

```bash
# 健康检查
curl http://localhost:3100/agent/v1/health

# 余额查询
curl http://localhost:3100/agent/v1/balance

# 模型推荐
curl -X POST http://localhost:3100/agent/v1/recommend \
  -H "Content-Type: application/json" \
  -d '{"taskType":"coding","budgetTier":"balanced"}'
```

---

## 7. Skill 使用指南

### 7.1 Skill 安装

将 `skills/agent-energy-station/` 复制到对应目录：

| 平台 | 路径 |
|------|------|
| Claude Code | `~/.claude/skills/agent-energy-station` |
| OpenClaw | `~/.openclaw/skills/agent-energy-station` |
| 共享目录 | `~/.agents/skills/agent-energy-station` |

### 7.2 Skill CLI

```bash
cd skills/agent-energy-station/scripts

# 健康检查
node energy-orchestrator.mjs health

# 成本透明
node energy-orchestrator.mjs check-cost --estimatedTokens 10000 --modelPricePer1k 0.02

# 模型推荐
node energy-orchestrator.mjs recommend --taskType coding --budgetTier balanced

# 自动充值检查
node energy-orchestrator.mjs auto-refuel --thresholdUsd 3

# 智能调用（完整闭环）
node energy-orchestrator.mjs smart-call --taskType coding --estimatedTokens 5000
```

### 7.3 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AGENT_RELAY_URL` | `http://127.0.0.1:3100` | Bridge 地址 |
| `AGENT_ID` | `agent-energy-station` | Agent 标识 |

### 7.4 让 Agent 自动触发

在系统提示中加入：

```text
当任务涉及 token 消耗、额度不足、模型选择、激活码充值、预算控制、API key、接入文档时，
优先使用 agent-energy-station skill，先查余额和用量，再决定是否调用高成本模型。
```

---

## 8. 测试指南

### 8.1 单元测试

```bash
# 运行全部 61 个测试
node --test

# 测试覆盖模块
# - BudgetGuard (2)
# - CompatibilityGuard (3)
# - EnergyEngine (2)
# - RefuelOrchestrator (6)
# - Logger (3)
# - ConfigLoader (4)
# - ModuleExports (1)
# - GenericOpenAIGatewayAdapter (1)
# - ModelCapabilityBenchmark (2)
# - ModelSelector (2)
# - NewAPIGatewayAdapter (4)
# - AutoRefuelDecorator (4)
# - OpsEngine (4)
# - ReferralEngine (1)
# - RouteHealthChecker (4)
# - HTTP Server (12)
```

### 8.2 管理员账号验证

```bash
node scripts/verify-admin.js
```

验证内容：
- `getBalance()` — 余额提取
- `getUserInfo()` — 用户信息
- `getUsage()` — 用量查询
- `getStatus()` — 系统状态（quota_per_unit）
- 适配器内部状态（Session Cookie）

### 8.3 Skill 联调

```bash
# 确保 Bridge 已启动
node scripts/start-server.js &

# 运行 Skill 测试
node skills/agent-energy-station/scripts/energy-orchestrator.mjs smart-call
```

### 8.4 Smoke 测试

```bash
node tests/openclaw-agent-relay-smoke.mjs
```

---

## 9. 免费模型兜底机制

### 9.1 免费模型清单

| 模型 ID | 供应商 | 限制 |
|---------|--------|------|
| `gemini-2.5-flash-free` | Google | 1,500 RPM, 1M tokens/min |
| `openrouter-free` | OpenRouter | 20 RPM, 200 RPD |
| `groq-llama-free` | Groq | 20 RPM, 6M tokens/min |
| `local-ollama` | Local |  unlimited（本地算力） |

### 9.2 触发条件

1. `availableUsd <= 0` → BudgetGuard 返回 `action: 'free_fallback'`
2. ModelSelector 的 `recommend({ preferFree: true })` 提升免费模型评分
3. Skill 的 `smartCall()` 在 `critical` 风险时自动切换免费模型

### 9.3 启用方式

在 `start-server.js` 中已默认启用：

```js
const budgetGuard = new BudgetGuard({
  enableFreeFallback: true,
  freeFallbackModel: 'all-protocol-router',
  // ...
});
```

---

## 10. 充值功能说明

### 10.1 当前状态

**已修复并验证可用**（2026-05-02）。

NewAPI v1.0.0-rc.2 的兑换码充值端点为 `POST /api/user/topup`，请求体为 `{ key: "兑换码" }`。

### 10.2 使用方式

**方式一：Skill 自动充值**

```bash
node energy-orchestrator.mjs auto-refuel --thresholdUsd 3
```

**方式二：HTTP API 手动充值**

```bash
curl -X POST http://localhost:3100/agent/v1/refuel/redeem \
  -H "Content-Type: application/json" \
  -d '{"code":"YOUR-REDEEM-CODE"}'
```

**方式三：Adapter 直接调用**

```js
const result = await adapter.redeemCode({ code: 'YOUR-CODE' });
// result.ok: true/false
// result.message: 结果消息
```

### 10.3 兑换码来源

兑换码需要在 NewAPI 管理后台预先创建：

1. 登录 NewAPI 管理面板
2. 进入"兑换码"或"充值码"管理页面
3. 创建新的兑换码（设置金额/配额）
4. 将兑换码填入 `AUTO_REFUEL_CODES` 环境变量

### 10.4 自动充值流程

```
Agent 查询余额
    ↓
AutoRefuelDecorator 检测余额 < threshold
    ↓
遍历 AUTO_REFUEL_CODES
    ↓
POST /api/user/topup { key: code }
    ↓
成功 → 刷新余额 → 继续调用
失败 → 记录告警 → 尝试下一个兑换码
耗尽 → 返回免费兜底建议
```

---

## 11. 当前状态与已知问题

### 11.1 已完成

| 功能 | 状态 |
|------|------|
| NewAPI v1.0.0-rc.2 适配 | 完成，已联调验证 |
| 余额查询（quota / balance 双模式） | 完成 |
| 用量查询 | 完成（受限于 NewAPI 权限，部分字段可能为 0） |
| 自动充值装饰器 | 完成，端点已修正为 `/api/user/topup` |
| 免费模型兜底 | 完成，4 个免费模型已配置 |
| 路由健康检查 | 完成 |
| 运营监控引擎 | 完成 |
| Skill 脚本 | 完成，已修复响应解析 Bug |
| Docker 部署 | 完成 |
| 61 项单元测试 | 全部通过 |

### 11.2 已知限制

| 问题 | 说明 | 解决建议 |
|------|------|----------|
| SSH 部署受阻 | 无法访问服务器 root | 提供 root 密码或使用本地部署 |
| 用量统计精度 | `/api/usage/token/` 对 admin 返回有限 | 确认 NewAPI 权限配置 |
| 兑换码需预创建 | 自动充值需要后台预先创建兑换码 | 在 NewAPI 管理面板创建 |
| Ops 报告需积累 | 刚启动时报告显示 "no data" | 运行 5 分钟后自动生成快照 |

### 11.3 下一步建议

1. **服务器部署**: 获取 SSH root 密码后，使用 Docker Compose 部署到 107.174.146.180
2. **兑换码配置**: 在 NewAPI 后台创建兑换码，填入 `AUTO_REFUEL_CODES`
3. **路由监控**: 配置 `HEALTH_CHECK_ROUTES` 监控实际上游模型地址
4. **Skill 集成**: 在 Claude Code / Codex 中安装 skill，测试实际工作流

---

## 12. 附录

### 12.1 NewAPI 管理 API 认证说明

QuantumNous/new-api v1.0.0+ 的管理 API（`/api/*`）需要双重认证：

1. **`New-Api-User: <userId>`** 头部（必须）
2. **Session Cookie** 或 **Bearer Token**（二选一）

适配器自动处理：
- 提供 `username` + `password` → 自动登录获取 Cookie
- 提供 `apiKey` + `userId` → 使用 Bearer + New-Api-User 头部

### 12.2 余额字段优先级

适配器提取余额时按以下优先级：

1. `data.balance`（直接 USD 数值）
2. `data.data.balance`（嵌套结构）
3. `data.data.quota / quota_per_unit`（配额转换）
4. `data.quota / quota_per_unit`

### 12.3 相关文档索引

| 文档 | 说明 |
|------|------|
| `README.md` | 快速入门与最小示例 |
| `docs/agent-first-api-relay-prd.md` | 产品需求与设计哲学 |
| `docs/intelligent-relay-station-solution.md` | 解决方案说明 |
| `docs/skill-authoring-guide.md` | Skill 编写指南 |
| `docs/agent-skill-install-playbook.md` | Skill 安装手册 |
| `docs/private-sub2api-retrofit.md` | 私有网关改造指南 |
| `docs/open-source-release-plan.md` | 开源发布计划 |

---

*本文档由 Agent Energy Bridge 项目自动生成，最后更新于 2026-05-02。*
