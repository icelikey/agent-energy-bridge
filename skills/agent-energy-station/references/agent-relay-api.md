# Agent Relay API

## Base URL

- 本地默认：`http://127.0.0.1:3100`
- 生产建议：`https://agent.example.com`

## Headers

- `x-agent-id`: 当前 Agent 的稳定标识
- `content-type`: `application/json`

## Endpoints

### `GET /agent/v1/health`

检查 Agent sidecar 是否可用。

### `GET /agent/v1/models/capabilities`

获取 economy、balanced、premium 三类路由能力。

### `GET /agent/v1/balance`

查询当前 Agent 的余额。

### `GET /agent/v1/usage/summary`

查询当前 Agent 的用量摘要。

### `POST /agent/v1/recommend`

请求体示例：

```json
{
  "taskType": "coding",
  "budgetTier": "balanced",
  "client": "openclaw"
}
```

### `POST /agent/v1/optimize`

请求体示例：

```json
{
  "estimatedCostUsd": 2.8,
  "requestedTokens": 90000,
  "client": "openclaw"
}
```

### `POST /agent/v1/refuel/redeem`

请求体示例：

```json
{
  "code": "OPENCLAW-TEST-10",
  "client": "openclaw"
}
```

## Agent 行为建议

- `action=proceed`：继续执行任务。
- `action=downgrade_or_refuel`：先压缩上下文、切换 economy 路由，或请求兑换码。
- `savingActions` 包含 `compress_context` 时，必须优先摘要上下文再继续。
- 如果对外分发给终端用户，文档里不要出现源站 IP。
