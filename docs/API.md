# Agent Energy Bridge — HTTP API Reference

> [中文](#中文版) | [English](#english-version)

**Version:** v0.1.0
**Base URL:** `http://localhost:3100` (default; configurable via `AEB_PORT` and `AEB_HOST`)
**Total endpoints:** 26
**Content-Type:** `application/json` (all POST/PUT requests)
**Encoding:** UTF-8

---

## English Version

### Table of Contents

- [Authentication](#authentication)
- [Error Response Format](#error-response-format)
- [Endpoints](#endpoints)
  - [Health & Status](#health--status) — 1 endpoint
  - [Balance & Usage](#balance--usage) — 2 endpoints
  - [Models & Recommendations](#models--recommendations) — 3 endpoints
  - [Refuel & Keys](#refuel--keys) — 3 endpoints
  - [Sessions](#sessions) — 2 endpoints
  - [Ops Monitoring](#ops-monitoring) — 5 endpoints
  - [Token Metering](#token-metering) — 4 endpoints
  - [Multi-Provider Routing](#multi-provider-routing) — 3 endpoints
  - [Notifications](#notifications) — 2 endpoints
  - [Refuel Status](#refuel-status) — 1 endpoint

### Authentication

Most endpoints are **unauthenticated** by default. Admin endpoints that mutate state or trigger external side effects require an `X-API-Key` HTTP header:

| Endpoint | Auth Required |
|----------|---------------|
| `POST /agent/v1/notify/test` | **Yes** (`X-API-Key`) |

To enable auth, set the `AEB_API_KEY` environment variable. If `AEB_API_KEY` is **not set**, the auth middleware acts as a no-op (backward compatible for existing deployments).

```bash
export AEB_API_KEY=$(openssl rand -hex 32)
curl -H "X-API-Key: $AEB_API_KEY" http://localhost:3100/agent/v1/notify/test
```

### Error Response Format

All errors follow a uniform JSON structure (see `src/server/middleware/error-handler.js`):

```json
{
  "success": false,
  "error": "Error",
  "message": "Human-readable description",
  "code": "ERROR_CODE",
  "statusCode": 400
}
```

| HTTP Status | Common Codes |
|-------------|--------------|
| 400 | `VALIDATION_ERROR`, `INVALID_CODE_FORMAT`, `MISSING_URL`, `INVALID_DIMENSION`, `INVALID_SESSION` |
| 401 | `UNAUTHORIZED` (X-API-Key missing or wrong) |
| 404 | `NOT_FOUND` |
| 503 | `SERVICE_NOT_CONFIGURED`, `ADAPTER_NOT_SUPPORTED` |

### Endpoints

#### Health & Status

##### GET /agent/v1/health

Service health check / 服务健康检查

**Auth:** Not required
**Method:** `GET`

**Response (200):**

```json
{
  "success": true,
  "status": "ok",
  "service": "agent-energy-bridge",
  "version": "0.1.0",
  "adapter": {
    "connected": true,
    "adapter": "NewApiAdapter"
  },
  "routes": null
}
```

**Example:**

```bash
curl http://localhost:3100/agent/v1/health
```

---

#### Balance & Usage

##### GET /agent/v1/balance

Query current account balance / 查询账户余额

**Auth:** Not required
**Method:** `GET`

**Response (200):**

```json
{
  "success": true,
  "balance": {
    "availableUsd": 10.5,
    "balanceUsd": 10.5,
    "currency": "USD"
  }
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `ADAPTER_NOT_SUPPORTED` | 503 | Adapter does not support balance queries / 适配器不支持余额查询 |

**Example:**

```bash
curl http://localhost:3100/agent/v1/balance
```

---

##### GET /agent/v1/usage/summary

Query usage summary / 查询用量摘要

**Auth:** Not required
**Method:** `GET`

**Response (200):**

```json
{
  "success": true,
  "usage": {
    "totalTokens": 150000,
    "totalCostUsd": 1.25
  }
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `ADAPTER_NOT_SUPPORTED` | 503 | Adapter does not support usage queries / 适配器不支持用量查询 |

**Example:**

```bash
curl http://localhost:3100/agent/v1/usage/summary
```

---

#### Models & Recommendations

##### GET /agent/v1/models/capabilities

List available models with capability scores / 列出可用模型及其能力评分

**Auth:** Not required
**Method:** `GET`

**Query Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `budgetTier` | string | No | Filter by budget tier: `free`, `economy`, `balanced`, `premium` |
| `protocol` | string | No | Filter by protocol: `openai`, `anthropic`, `google`, `kimi`, `minimax` |

**Response (200):**

```json
{
  "success": true,
  "models": [
    {
      "id": "gpt-4o",
      "name": "GPT-4o",
      "protocol": "openai",
      "budgetTier": "premium",
      "pricePer1kUsd": 0.005,
      "capabilities": {
        "coding": 95,
        "reasoning": 92,
        "multimodal": 90,
        "speed": 85,
        "stability": 90,
        "costEfficiency": 70
      }
    }
  ],
  "count": 1
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `SERVICE_NOT_CONFIGURED` | 503 | Model selector not available / 模型选择器未初始化 |

**Example:**

```bash
curl "http://localhost:3100/agent/v1/models/capabilities?budgetTier=premium&protocol=openai"
```

---

##### POST /agent/v1/recommend

Recommend the best model for a given task / 为指定任务推荐最优模型

**Auth:** Not required
**Method:** `POST`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `taskType` | string | No | Task type, e.g. `coding`, `reasoning`, `chat` / 任务类型 |
| `budgetTier` | string | No | Budget tier: `free`, `economy`, `balanced`, `premium` |
| `protocol` | string | No | Preferred protocol / 首选协议 |
| `requiredCapabilities` | array | No | Required capability names / 必需能力列表 |
| `needsUniversalProtocol` | boolean | No | Whether universal protocol support is needed / 是否需要通用协议 |
| `qualityPriority` | string | No | Quality priority hint / 质量优先级 |
| `tasks` | array | No | Multiple tasks for batch recommendation / 批量任务 |
| `taskWeights` | object | No | Task weight mapping / 任务权重映射 |

**Response (200):**

```json
{
  "success": true,
  "recommendation": {
    "primary": {
      "id": "gpt-4o",
      "name": "GPT-4o",
      "protocol": "openai",
      "budgetTier": "premium"
    },
    "fallback": {
      "id": "gemini-2.5-flash",
      "name": "Gemini 2.5 Flash",
      "protocol": "google",
      "budgetTier": "free"
    },
    "scores": {
      "overall": 92,
      "costEfficiency": 85
    }
  }
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `SERVICE_NOT_CONFIGURED` | 503 | Model selector not available / 模型选择器未初始化 |
| `VALIDATION_ERROR` | 400 | Request body validation failed / 请求参数校验失败 |

**Example:**

```bash
curl -X POST http://localhost:3100/agent/v1/recommend \
  -H "Content-Type: application/json" \
  -d '{"taskType":"coding","budgetTier":"premium","requiredCapabilities":["coding","reasoning"]}'
```

---

##### POST /agent/v1/optimize

Pre-call budget approval and model optimization / 调用前预算审批与模型优化

**Auth:** Not required
**Method:** `POST`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `taskType` | string | No | Task type / 任务类型 |
| `budgetTier` | string | No | Budget tier: `free`, `economy`, `balanced`, `premium` |
| `estimatedCostUsd` | number | No | Estimated cost in USD / 预估成本 |
| `requestedTokens` | number | No | Estimated token count / 预估 token 数 |
| `dailySpentUsd` | number | No | Daily spending so far / 当日已花费 |
| `hourlyTokensUsed` | number | No | Hourly token usage / 每小时 token 用量 |
| `availableUsd` | number | No | Available balance override / 可用余额覆盖值 |
| `protocol` | string | No | Preferred protocol / 首选协议 |
| `requiredCapabilities` | array | No | Required capabilities / 必需能力 |
| `needsUniversalProtocol` | boolean | No | Universal protocol needed / 需通用协议 |
| `qualityPriority` | string | No | Quality priority / 质量优先级 |
| `tasks` | array | No | Batch tasks / 批量任务 |
| `taskWeights` | object | No | Task weights / 任务权重 |
| `client` | string | No | Client identifier / 客户端标识 |

**Response (200):**

```json
{
  "success": true,
  "action": "proceed",
  "guardDecision": {
    "allowed": true,
    "reasons": ["Sufficient balance"],
    "action": "allow"
  },
  "recommendation": {
    "primary": {
      "id": "gpt-4o",
      "name": "GPT-4o"
    },
    "fallback": {
      "id": "gemini-2.5-flash",
      "name": "Gemini 2.5 Flash"
    }
  },
  "savingActions": [],
  "estimatedCostUsd": 0.5,
  "requestedTokens": 10000
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `VALIDATION_ERROR` | 400 | Request body validation failed / 请求参数校验失败 |
| `SERVICE_NOT_CONFIGURED` | 503 | Model selector or budget guard not available / 模型选择器或预算守卫未初始化 |

**Example:**

```bash
curl -X POST http://localhost:3100/agent/v1/optimize \
  -H "Content-Type: application/json" \
  -d '{"taskType":"coding","estimatedCostUsd":0.5,"requestedTokens":10000,"budgetTier":"balanced"}'
```

---

#### Refuel & Keys

##### POST /agent/v1/refuel/redeem

Redeem an activation code for quota / 兑换激活码获取额度

**Auth:** Not required
**Method:** `POST`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | **Yes** | Activation code (alphanumeric, dash, underscore) / 激活码 |
| `identity` | object | No | User identity object / 用户身份信息 |

**Response (200):**

```json
{
  "success": true,
  "redeemed": true,
  "result": {
    "ok": true,
    "quotaAdded": 1000000,
    "message": "Redemption successful"
  }
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `VALIDATION_ERROR` | 400 | Missing or invalid fields / 字段缺失或无效 |
| `INVALID_CODE_FORMAT` | 400 | Code contains invalid characters / 激活码包含非法字符 |
| `ADAPTER_NOT_SUPPORTED` | 503 | Adapter does not support code redemption / 适配器不支持兑换 |

**Example:**

```bash
curl -X POST http://localhost:3100/agent/v1/refuel/redeem \
  -H "Content-Type: application/json" \
  -d '{"code":"AEB-2026-DEMO-001","identity":{"userId":"user-123"}}'
```

---

##### POST /agent/v1/keys/issue

Issue a new API key / 发放新的 API Key

**Auth:** Not required
**Method:** `POST`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `owner` | string | No | Key owner identifier / 密钥所有者 |
| `group` | string | No | Group or team name / 所属组或团队 |
| `plan` | string | No | Subscription plan / 订阅计划 |
| `metadata` | object | No | Additional metadata / 附加元数据 |

**Response (200):**

```json
{
  "success": true,
  "key": {
    "id": "key-abc123",
    "token": "aeb-sk-xxxxxxxxxxxxxxxx",
    "createdAt": "2026-05-11T04:30:00.000Z"
  }
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `VALIDATION_ERROR` | 400 | Request body validation failed / 请求参数校验失败 |
| `ADAPTER_NOT_SUPPORTED` | 503 | Adapter does not support key issuance / 适配器不支持发放密钥 |

**Example:**

```bash
curl -X POST http://localhost:3100/agent/v1/keys/issue \
  -H "Content-Type: application/json" \
  -d '{"owner":"team-alpha","plan":"premium"}'
```

---

##### POST /agent/v1/docs/render

Render integration documentation / 生成接入文档

**Auth:** Not required
**Method:** `POST`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `template` | string | No | Template name / 模板名称 |
| `data` | object | No | Template data / 模板数据 |

**Response (200):**

```json
{
  "success": true,
  "docs": {
    "title": "Integration Guide",
    "content": "..."
  }
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `VALIDATION_ERROR` | 400 | Request body validation failed / 请求参数校验失败 |
| `ADAPTER_NOT_SUPPORTED` | 503 | Adapter does not support docs rendering / 适配器不支持文档渲染 |

**Example:**

```bash
curl -X POST http://localhost:3100/agent/v1/docs/render \
  -H "Content-Type: application/json" \
  -d '{"template":"quickstart","data":{"client":"claude-code"}}'
```

---

#### Sessions

##### POST /agent/v1/session/report

Report a completed session for scoring and storage / 上报会话结果进行评分和存储

**Auth:** Not required
**Method:** `POST`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session` | object | No | Nested session object / 嵌套会话对象 |
| `taskType` | string | No | Task type / 任务类型 |
| `inputTokens` | number | No | Input token count / 输入 token 数 |
| `outputTokens` | number | No | Output token count / 输出 token 数 |
| `costUsd` | number | No | Cost in USD / 成本（美元）|
| `model` | string | No | Model identifier / 模型标识 |
| `success` | boolean | No | Whether the session succeeded / 会话是否成功 |
| `latencyMs` | number | No | Latency in milliseconds / 延迟（毫秒）|

**Response (200):**

```json
{
  "success": true,
  "scored": {
    "taskType": "coding",
    "inputTokens": 12000,
    "outputTokens": 8000,
    "costUsd": 0.45,
    "model": "claude-sonnet-4",
    "success": true,
    "energyScore": 85,
    "efficiencyRating": "A"
  },
  "stored": true
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `VALIDATION_ERROR` | 400 | Request body validation failed / 请求参数校验失败 |
| `INVALID_SESSION` | 400 | Session must be a valid object / 会话必须是有效对象 |
| `SERVICE_NOT_CONFIGURED` | 503 | Energy engine not available / 能量引擎未初始化 |

**Example:**

```bash
curl -X POST http://localhost:3100/agent/v1/session/report \
  -H "Content-Type: application/json" \
  -d '{"taskType":"coding","inputTokens":12000,"outputTokens":8000,"costUsd":0.45,"model":"claude-sonnet-4","success":true}'
```

---

##### GET /agent/v1/session/summary

Get session summary with optional filters / 获取会话摘要（支持过滤）

**Auth:** Not required
**Method:** `GET`

**Query Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `limit` | number | No | Max sessions to include (1-1000, default 100) / 最大会话数 |
| `taskType` | string | No | Filter by task type / 按任务类型过滤 |
| `model` | string | No | Filter by model / 按模型过滤 |

**Response (200):**

```json
{
  "success": true,
  "summary": {
    "totalSessions": 42,
    "totalTokens": 500000,
    "totalCostUsd": 3.5,
    "averageEnergyScore": 82,
    "topModels": ["gpt-4o", "claude-sonnet-4"]
  },
  "filters": {
    "taskType": null,
    "model": null,
    "limit": 100
  }
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `SERVICE_NOT_CONFIGURED` | 503 | Energy engine not available / 能量引擎未初始化 |

**Example:**

```bash
curl "http://localhost:3100/agent/v1/session/summary?limit=50&taskType=coding"
```

---

#### Ops Monitoring

##### GET /agent/v1/ops/snapshot

Capture current operational snapshot / 捕获当前运营快照

**Auth:** Not required
**Method:** `GET`

**Response (200):**

```json
{
  "success": true,
  "snapshot": {
    "timestamp": "2026-05-11T04:30:00.000Z",
    "balance": { "availableUsd": 10.5 },
    "sessionCount": 42,
    "energyScore": 82,
    "alerts": []
  }
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `SERVICE_NOT_CONFIGURED` | 503 | Ops engine not available / 运营引擎未初始化 |

**Example:**

```bash
curl http://localhost:3100/agent/v1/ops/snapshot
```

---

##### GET /agent/v1/ops/report

Generate operational trend report / 生成运营趋势报告

**Auth:** Not required
**Method:** `GET`

**Query Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `limit` | number | No | Data points (1-10000, default 168) / 数据点数 |

**Response (200):**

```json
{
  "success": true,
  "report": {
    "points": [
      {
        "timestamp": "2026-05-11T04:00:00.000Z",
        "balanceUsd": 10.5,
        "sessionCount": 5,
        "costUsd": 0.25
      }
    ],
    "summary": {
      "totalCost": 3.5,
      "totalSessions": 42
    }
  }
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `SERVICE_NOT_CONFIGURED` | 503 | Ops engine not available / 运营引擎未初始化 |

**Example:**

```bash
curl "http://localhost:3100/agent/v1/ops/report?limit=24"
```

---

##### GET /agent/v1/ops/energy

Get energy efficiency report / 获取能量效率报告

**Auth:** Not required
**Method:** `GET`

**Response (200):**

```json
{
  "success": true,
  "energyReport": {
    "overallScore": 82,
    "efficiencyTrend": "improving",
    "recommendations": [
      "Consider switching to gemini-2.5-flash for coding tasks"
    ],
    "breakdownByModel": {
      "gpt-4o": { "score": 85, "costPerSession": 0.45 },
      "claude-sonnet-4": { "score": 80, "costPerSession": 0.38 }
    }
  }
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `SERVICE_NOT_CONFIGURED` | 503 | Ops engine not available / 运营引擎未初始化 |

**Example:**

```bash
curl http://localhost:3100/agent/v1/ops/energy
```

---

##### POST /agent/v1/ops/start

Start periodic monitoring / 启动定时监控

**Auth:** Not required
**Method:** `POST`

**Response (200):**

```json
{
  "success": true,
  "status": "monitoring_started",
  "intervalMs": 60000
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `SERVICE_NOT_CONFIGURED` | 503 | Ops engine not available / 运营引擎未初始化 |

**Example:**

```bash
curl -X POST http://localhost:3100/agent/v1/ops/start
```

---

##### POST /agent/v1/ops/stop

Stop periodic monitoring / 停止定时监控

**Auth:** Not required
**Method:** `POST`

**Response (200):**

```json
{
  "success": true,
  "status": "monitoring_stopped"
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `SERVICE_NOT_CONFIGURED` | 503 | Ops engine not available / 运营引擎未初始化 |

**Example:**

```bash
curl -X POST http://localhost:3100/agent/v1/ops/stop
```

---

#### Token Metering

##### POST /agent/v1/meter/record

Record token consumption for metering / 记录 token 消耗用于计量

**Auth:** Not required
**Method:** `POST`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | **Yes** | Model identifier / 模型标识 |
| `agentId` | string | No | Agent identifier / Agent 标识 |
| `taskType` | string | No | Task type / 任务类型 |
| `inputTokens` | number | **Yes** | Input token count / 输入 token 数 |
| `outputTokens` | number | **Yes** | Output token count / 输出 token 数 |
| `costUsd` | number | No | Cost in USD / 成本（美元）|
| `latencyMs` | number | No | Latency in milliseconds / 延迟（毫秒）|

**Response (200):**

```json
{
  "success": true,
  "entry": {
    "id": "meter-abc123",
    "model": "gpt-4o",
    "inputTokens": 12000,
    "outputTokens": 8000,
    "costUsd": 0.45,
    "recordedAt": "2026-05-11T04:30:00.000Z"
  }
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `VALIDATION_ERROR` | 400 | Request body validation failed / 请求参数校验失败 |
| `SERVICE_NOT_CONFIGURED` | 503 | Token meter not available / Token 计量器未初始化 |

**Example:**

```bash
curl -X POST http://localhost:3100/agent/v1/meter/record \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","inputTokens":12000,"outputTokens":8000,"costUsd":0.45,"taskType":"coding"}'
```

---

##### GET /agent/v1/meter/stats

Query token consumption statistics / 查询 token 消费统计

**Auth:** Not required
**Method:** `GET`

**Query Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `windowDays` | number | No | Time window in days (1-90, default 30) / 时间窗口（天）|
| `model` | string | No | Filter by model / 按模型过滤 |
| `agentId` | string | No | Filter by agent ID / 按 Agent 过滤 |
| `taskType` | string | No | Filter by task type / 按任务类型过滤 |

**Response (200):**

```json
{
  "success": true,
  "stats": {
    "totalInputTokens": 500000,
    "totalOutputTokens": 300000,
    "totalCostUsd": 3.5,
    "sessionCount": 42,
    "averageLatencyMs": 1200
  },
  "filters": {
    "windowDays": 30,
    "model": null,
    "agentId": null,
    "taskType": null
  }
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `SERVICE_NOT_CONFIGURED` | 503 | Token meter not available / Token 计量器未初始化 |

**Example:**

```bash
curl "http://localhost:3100/agent/v1/meter/stats?windowDays=7&model=gpt-4o"
```

---

##### GET /agent/v1/meter/report

Generate token usage report / 生成 token 使用报告

**Auth:** Not required
**Method:** `GET`

**Query Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `windowDays` | number | No | Time window in days (1-90, default 30) / 时间窗口（天）|

**Response (200):**

```json
{
  "success": true,
  "report": {
    "period": "2026-04-11 to 2026-05-11",
    "totalInputTokens": 500000,
    "totalOutputTokens": 300000,
    "totalCostUsd": 3.5,
    "dailyBreakdown": [
      { "date": "2026-05-10", "tokens": 15000, "costUsd": 0.12 }
    ]
  }
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `SERVICE_NOT_CONFIGURED` | 503 | Token meter not available / Token 计量器未初始化 |

**Example:**

```bash
curl "http://localhost:3100/agent/v1/meter/report?windowDays=7"
```

---

##### GET /agent/v1/meter/breakdown

Get token usage breakdown by dimension / 按维度获取 token 使用分解

**Auth:** Not required
**Method:** `GET`

**Query Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `windowDays` | number | No | Time window in days (1-90, default 30) / 时间窗口（天）|
| `dimension` | string | No | Breakdown dimension: `model`, `agent`, `taskType` (default `model`) / 分解维度 |

**Response (200):**

```json
{
  "success": true,
  "dimension": "model",
  "windowDays": 30,
  "breakdown": {
    "gpt-4o": { "inputTokens": 200000, "outputTokens": 150000, "costUsd": 2.0 },
    "claude-sonnet-4": { "inputTokens": 150000, "outputTokens": 100000, "costUsd": 1.5 }
  }
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `INVALID_DIMENSION` | 400 | Invalid dimension value / 无效的维度值 |
| `SERVICE_NOT_CONFIGURED` | 503 | Token meter not available / Token 计量器未初始化 |

**Example:**

```bash
curl "http://localhost:3100/agent/v1/meter/breakdown?dimension=agent&windowDays=7"
```

---

#### Multi-Provider Routing

##### GET /agent/v1/routing/status

Get multi-provider routing status / 获取多 Provider 路由状态

**Auth:** Not required
**Method:** `GET`

**Response (200):**

```json
{
  "success": true,
  "report": {
    "activeProvider": "openai",
    "providers": [
      { "name": "openai", "healthy": true, "weight": 50 },
      { "name": "anthropic", "healthy": true, "weight": 30 },
      { "name": "google", "healthy": false, "weight": 20 }
    ],
    "lastCheck": "2026-05-11T04:29:55.000Z"
  }
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `SERVICE_NOT_CONFIGURED` | 503 | Multi-provider router not available / 多 Provider 路由器未初始化 |

**Example:**

```bash
curl http://localhost:3100/agent/v1/routing/status
```

---

##### GET /agent/v1/routing/log

Get provider switch log / 获取 Provider 切换日志

**Auth:** Not required
**Method:** `GET`

**Query Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `limit` | number | No | Max log entries (1-1000, default 100) / 最大日志条数 |

**Response (200):**

```json
{
  "success": true,
  "limit": 100,
  "log": [
    {
      "timestamp": "2026-05-11T04:25:00.000Z",
      "from": "openai",
      "to": "anthropic",
      "reason": "health_check_failed"
    }
  ]
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `SERVICE_NOT_CONFIGURED` | 503 | Multi-provider router not available / 多 Provider 路由器未初始化 |

**Example:**

```bash
curl "http://localhost:3100/agent/v1/routing/log?limit=50"
```

---

##### POST /agent/v1/routing/force

Force switch to a specific provider / 强制切换到指定 Provider

**Auth:** Not required
**Method:** `POST`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | **Yes** | Provider name to force / 要强制切换到的 Provider 名称 |

**Response (200):**

```json
{
  "success": true,
  "active": "anthropic"
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `VALIDATION_ERROR` | 400 | Request body validation failed / 请求参数校验失败 |
| `SERVICE_NOT_CONFIGURED` | 503 | Multi-provider router not available / 多 Provider 路由器未初始化 |

**Example:**

```bash
curl -X POST http://localhost:3100/agent/v1/routing/force \
  -H "Content-Type: application/json" \
  -d '{"name":"anthropic"}'
```

---

#### Notifications

##### GET /agent/v1/notify/config

Get notification configuration (read-only) / 获取通知配置（只读）

**Auth:** Not required
**Method:** `GET`

**Response (200):**

```json
{
  "availableChannels": ["webhook", "feishu", "dingtalk", "slack", "wecom", "email"],
  "configuredChannels": ["webhook", "feishu"],
  "dedupWindowMs": 300000
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `SERVICE_NOT_CONFIGURED` | 503 | Notification service not available / 通知服务未初始化 |

**Example:**

```bash
curl http://localhost:3100/agent/v1/notify/config
```

---

##### POST /agent/v1/notify/test

Send a test notification through configured channels / 通过已配置渠道发送测试通知

**Auth:** **Required** (`X-API-Key` header)
**Method:** `POST`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channel` | string | No | Specific channel: `webhook` / `feishu` / `dingtalk` / `slack` / `wecom` / `email` |
| `url` | string | Conditional | Required when `channel` is specified / 指定 channel 时必填 |
| `level` | string | No | Severity: `info` / `warn` / `critical` (default `info`) |
| `title` | string | No | Notification title / 通知标题 |
| `message` | string | No | Notification body / 通知正文 |

**Response (200):**

```json
{
  "sent": ["webhook", "feishu"],
  "failed": [],
  "skipped": ["dingtalk"]
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid `X-API-Key` header / 缺失或错误的 API Key |
| `MISSING_URL` | 400 | `channel` specified but no `url` provided / 指定了 channel 但未提供 url |
| `SERVICE_NOT_CONFIGURED` | 503 | Notification service not available / 通知服务未初始化 |

**Example:**

```bash
curl -X POST http://localhost:3100/agent/v1/notify/test \
  -H "X-API-Key: $AEB_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"channel":"webhook","url":"https://example.com/hook","level":"info","title":"Test","message":"Hello from AEB"}'
```

---

#### Refuel Status

##### GET /agent/v1/refuel/status

Get auto-refuel status and alert log / 获取自动充值状态和告警日志

**Auth:** Not required
**Method:** `GET`

**Query Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `limit` | number | No | Max alert log entries (1-500, default 50) / 最大告警日志条数 |

**Response (200):**

```json
{
  "stats": {
    "totalRefuels": 5,
    "totalQuotaAdded": 5000000,
    "lastRefuelAt": "2026-05-10T12:00:00.000Z"
  },
  "alertLog": [
    {
      "timestamp": "2026-05-11T04:20:00.000Z",
      "level": "warn",
      "message": "Balance below threshold: $2.50"
    }
  ],
  "degraded": false
}
```

**Errors:**

| Code | Status | Meaning |
|------|--------|---------|
| `SERVICE_NOT_CONFIGURED` | 503 | Auto-refuel decorator not available / 自动充值装饰器未初始化 |

**Example:**

```bash
curl "http://localhost:3100/agent/v1/refuel/status?limit=20"
```

---

## 中文版

### 目录

- [认证](#认证)
- [错误响应格式](#错误响应格式)
- [端点列表](#端点列表)

### 认证

大多数端点**不需要认证**。下列管理类端点（涉及状态变更或外部副作用）要求 `X-API-Key` HTTP 头：

| 端点 | 需要认证 |
|------|---------|
| `POST /agent/v1/notify/test` | **是** (`X-API-Key`) |

设置环境变量 `AEB_API_KEY` 启用认证。若 `AEB_API_KEY` 未设置，认证中间件等同 no-op（向后兼容现有部署）。

```bash
export AEB_API_KEY=$(openssl rand -hex 32)
curl -H "X-API-Key: $AEB_API_KEY" http://localhost:3100/agent/v1/notify/test
```

### 错误响应格式

所有错误返回统一 JSON 结构：

```json
{
  "success": false,
  "error": "Error",
  "message": "可读错误描述",
  "code": "ERROR_CODE",
  "statusCode": 400
}
```

| HTTP 状态 | 常见 Code |
|-----------|----------|
| 400 | `VALIDATION_ERROR`、`INVALID_CODE_FORMAT`、`MISSING_URL`、`INVALID_DIMENSION`、`INVALID_SESSION` |
| 401 | `UNAUTHORIZED`（X-API-Key 缺失或错误） |
| 404 | `NOT_FOUND` |
| 503 | `SERVICE_NOT_CONFIGURED`、`ADAPTER_NOT_SUPPORTED` |

### 端点列表（中文摘要）

| # | 方法 | 路径 | 描述 | 认证 |
|---|------|------|------|------|
| 1 | GET | `/agent/v1/health` | 服务健康检查 | 否 |
| 2 | GET | `/agent/v1/balance` | 查询账户余额 | 否 |
| 3 | GET | `/agent/v1/usage/summary` | 用量摘要 | 否 |
| 4 | GET | `/agent/v1/models/capabilities` | 模型能力列表 | 否 |
| 5 | POST | `/agent/v1/recommend` | 模型推荐 | 否 |
| 6 | POST | `/agent/v1/optimize` | 调用前预算审批 | 否 |
| 7 | POST | `/agent/v1/refuel/redeem` | 激活码兑换 | 否 |
| 8 | POST | `/agent/v1/keys/issue` | 发放 API Key | 否 |
| 9 | POST | `/agent/v1/docs/render` | 生成接入文档 | 否 |
| 10 | POST | `/agent/v1/session/report` | 上报会话结果 | 否 |
| 11 | GET | `/agent/v1/session/summary` | 会话摘要 | 否 |
| 12 | GET | `/agent/v1/ops/snapshot` | 运营快照 | 否 |
| 13 | GET | `/agent/v1/ops/report` | 运营趋势报告 | 否 |
| 14 | GET | `/agent/v1/ops/energy` | 能量效率报告 | 否 |
| 15 | POST | `/agent/v1/ops/start` | 启动定时监控 | 否 |
| 16 | POST | `/agent/v1/ops/stop` | 停止定时监控 | 否 |
| 17 | POST | `/agent/v1/meter/record` | 记录 token 消耗 | 否 |
| 18 | GET | `/agent/v1/meter/stats` | 查询 token 统计 | 否 |
| 19 | GET | `/agent/v1/meter/report` | 生成 token 报告 | 否 |
| 20 | GET | `/agent/v1/meter/breakdown` | token 详细分解 | 否 |
| 21 | GET | `/agent/v1/routing/status` | 路由状态 | 否 |
| 22 | GET | `/agent/v1/routing/log` | 路由切换日志 | 否 |
| 23 | POST | `/agent/v1/routing/force` | 强制切换路由 | 否 |
| 24 | GET | `/agent/v1/notify/config` | 通知配置只读 | 否 |
| 25 | POST | `/agent/v1/notify/test` | 发送测试通知 | **是** (`X-API-Key`) |
| 26 | GET | `/agent/v1/refuel/status` | 充值/降级状态 | 否 |

> 详细字段说明见上方 English Version 各端点章节（中英对照）。

---

## License

MIT — See [LICENSE](../LICENSE) for details.
