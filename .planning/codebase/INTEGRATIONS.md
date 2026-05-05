---
last_mapped_commit: a9a9af59670e6f7c7e4810af6fadde8b4e3d1635
---

# External Integrations — Agent Energy Bridge

> Mapped: 2026-05-05

## APIs Consumed (Upstream)

### 1. NewAPI (QuantumNous/Calcium-Ion new-api)

**Primary upstream gateway.** Configured via environment variables.

| Env Var | Purpose | Default |
|---------|---------|---------|
| `NEWAPI_BASE_URL` | Base URL of new-api instance | — (demo mode if unset) |
| `NEWAPI_API_KEY` | API key for Bearer auth | — |
| `NEWAPI_USER_ID` | User ID for management API headers | `null` |
| `NEWAPI_USERNAME` | Username for session login (v1.0.0+) | `null` |
| `NEWAPI_PASSWORD` | Password for session login (v1.0.0+) | `null` |
| `NEWAPI_QUOTA_PER_UNIT` | Quota-to-USD conversion rate | auto-detected from `/api/status` |

**Endpoints called** (defined in `src/adapters/new-api-adapter.js`):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/v1/models` | List available models |
| `GET` | `/api/usage/token/` | Token usage summary |
| `GET` | `/api/user/self` | User balance/info |
| `POST` | `/api/user/login` | Session authentication (v1.0.0+) |
| `POST` | `/api/user/topup` | Redeem activation code |
| `GET` | `/api/status` | Server status (quota_per_unit) |

**Authentication modes:**
- Bearer token (`apiKey`) + optional `new-api-user` header
- Username/password session cookie (auto-login on first management API call)

### 2. Generic OpenAI-Compatible Gateways

**Secondary upstream.** Any OpenAI-style API via `GenericOpenAIGatewayAdapter`.

| Env Var | Purpose |
|---------|---------|
| `OPENAI_BASE_URL` | Base URL (e.g. `http://gateway:3000/v1`) |
| `OPENAI_API_KEY` | API key |

Default paths (`src/adapters/generic-openai-adapter.js`):
- `/v1/models`, `/v1/usage`, `/v1/balance`, `/v1/refuel/redeem`, `/v1/keys/issue`, `/v1/keys/rotate`, `/v1/docs/render`

### 3. Health-Check Routes (External)

Optional external route monitoring configured via:

| Env Var | Purpose | Default |
|---------|---------|---------|
| `HEALTH_CHECK_ROUTES` | Comma-separated URLs to poll | — |
| `HEALTH_CHECK_INTERVAL_MS` | Poll interval | `60000` |
| `HEALTH_CHECK_TIMEOUT_MS` | Request timeout | `10000` |

Uses native `fetch` with `AbortController` timeout.

---

## APIs Provided (Downstream)

### HTTP REST API

Base path: `/agent/v1/`
Server port: `3100` (default)

| Method | Endpoint | Handler File | Description |
|--------|----------|--------------|-------------|
| `GET` | `/agent/v1/health` | `src/server/handlers/health.js` | Service health + adapter status + route health report |
| `GET` | `/agent/v1/balance` | `src/server/handlers/balance.js` | Current balance from adapter |
| `GET` | `/agent/v1/usage/summary` | `src/server/handlers/usage.js` | Usage summary from adapter |
| `GET` | `/agent/v1/models/capabilities` | `src/server/handlers/capabilities.js` | Full model catalog with capability scores |
| `POST` | `/agent/v1/recommend` | `src/server/handlers/recommend.js` | Model recommendation for task + budget |
| `POST` | `/agent/v1/optimize` | `src/server/handlers/optimize.js` | Budget guard evaluation + saving actions |
| `POST` | `/agent/v1/refuel/redeem` | `src/server/handlers/refuel.js` | Redeem activation code |
| `POST` | `/agent/v1/keys/issue` | `src/server/handlers/keys.js` | Issue new API key |
| `POST` | `/agent/v1/docs/render` | `src/server/handlers/docs.js` | Render access documentation |
| `POST` | `/agent/v1/session/report` | `src/server/handlers/session-report.js` | Report session consumption for scoring |
| `GET` | `/agent/v1/session/summary` | `src/server/handlers/session-summary.js` | Summarize recent scored sessions |
| `GET` | `/agent/v1/ops/snapshot` | `src/server/handlers/ops.js` | Manual ops snapshot |
| `GET` | `/agent/v1/ops/report` | `src/server/handlers/ops.js` | Trend report (balance, spend, alerts) |
| `GET` | `/agent/v1/ops/energy` | `src/server/handlers/ops.js` | Energy efficiency report |
| `POST` | `/agent/v1/ops/start` | `src/server/handlers/ops.js` | Start auto-monitoring |
| `POST` | `/agent/v1/ops/stop` | `src/server/handlers/ops.js` | Stop auto-monitoring |

All endpoints return JSON. Errors use structured format with `code` and `statusCode`.

---

## Databases

**None.** The project uses in-memory storage only:

| Component | Storage | Capacity |
|-----------|---------|----------|
| `SessionStore` | In-memory array | Configurable `maxSize` (default 1000) |
| `OpsEngine.metrics` | In-memory array | Configurable `maxMetrics` (default 10000) |
| `RouteHealthChecker._history` | In-memory array | Hard cap 1000 entries |
| `AutoRefuelDecorator._alertLog` | In-memory array | No explicit cap |

No persistence layer (Redis, PostgreSQL, MongoDB, etc.) is integrated.

---

## Caches

| Component | Type | TTL | Notes |
|-----------|------|-----|-------|
| `NewAPIGatewayAdapter._statusCache` | In-memory object | Indefinite (until process restart) | Caches `/api/status` response for `quota_per_unit` |
| `NewAPIGatewayAdapter._sessionCookie` | In-memory string | Session lifetime | Cookie from username/password login |

---

## Message Queues

**None.** No Kafka, RabbitMQ, SQS, or other message broker integration.

---

## Auth Providers

**No external auth provider integration** (OAuth, OIDC, SAML, LDAP).

Authentication is handled locally:
- **API Key**: Bearer token passed to upstream gateway
- **Session Cookie**: Username/password login to new-api management API
- **Agent Identity**: `x-agent-id` header (informational, not authenticated)

---

## Webhooks

**No inbound webhook handlers.** The service does not expose webhook endpoints for external systems.

Outbound callbacks (internal):
- `AutoRefuelDecorator.onRefuel` — called on successful auto-recharge
- `AutoRefuelDecorator.onAlert` — called on alert conditions
- `RouteHealthChecker.onStatusChange` — called when route health transitions

---

## Third-Party Services

### Model Providers (Catalog Only)

The `MODEL_CATALOG` in `src/core/model-selector.js` references these providers for recommendation purposes. No direct API calls are made to them — routing goes through the configured gateway.

| Provider | Models in Catalog |
|----------|-------------------|
| Anthropic | `claude-4.7-premium`, `claude-4.6-mixed` |
| OpenAI | `o3-premium`, `gpt-5-codex` |
| Google | `gemini-2.5-pro`, `gemini-2.5-flash-free` |
| Moonshot | `kimi-k2` |
| MiniMax | `minimax-m1` |
| OpenRouter | `openrouter-free` |
| Groq | `groq-llama-free` |
| Local | `local-ollama` |

### GitHub (Skill Installer)

`skills/agent-energy-station/install.mjs` references:
- `https://github.com/icelikey/agent-energy-bridge.git` — auto-clone source for bridge setup

---

## Environment Variable Reference

All integrations are configured exclusively through environment variables:

### NewAPI Connection
- `NEWAPI_BASE_URL`, `NEWAPI_API_KEY`, `NEWAPI_USER_ID`, `NEWAPI_USERNAME`, `NEWAPI_PASSWORD`, `NEWAPI_QUOTA_PER_UNIT`

### Auto-Refuel
- `AUTO_REFUEL_ENABLED`, `AUTO_REFUEL_THRESHOLD_USD`, `AUTO_REFUEL_AMOUNT_USD`, `AUTO_REFUEL_STRATEGY`, `AUTO_REFUEL_MAX_PER_HOUR`, `AUTO_REFUEL_COOLDOWN_MS`, `AUTO_REFUEL_CODES`

### Server
- `AEB_PORT` (default: 3100), `AEB_HOST` (default: 127.0.0.1), `AEB_LOG_LEVEL` (default: info)

### Demo Mode (when NEWAPI_BASE_URL is unset)
- `DEMO_BALANCE_USD`, `DEMO_DAILY_SPENT_USD`, `DEMO_HOURLY_TOKENS`

### Health Checks
- `HEALTH_CHECK_ROUTES`, `HEALTH_CHECK_INTERVAL_MS`, `HEALTH_CHECK_TIMEOUT_MS`

### Operations
- `OPS_MONITOR_INTERVAL_MS` (default: 300000 = 5 min)

### Codex / OpenAI Compatible
- `OPENAI_BASE_URL`, `OPENAI_API_KEY`

### Config File
- `AEB_CONFIG_PATH` — explicit path to `aeb.config.json` or `aeb.config.js`

---

## Network Diagram

```
┌─────────────────┐     HTTP      ┌─────────────────────────────┐
│  Claude Code    │◄─────────────►│  Agent Energy Bridge        │
│  / OpenClaw     │  /agent/v1/*  │  (Node.js, port 3100)       │
│  / Codex        │               │                             │
└─────────────────┘               │  ┌─────────────────────┐    │
                                  │  │ BudgetGuard         │    │
┌─────────────────┐               │  │ ModelSelector       │    │
│  Skill scripts  │◄─────────────►│  │ EnergyEngine        │    │
│  (energy-       │  /agent/v1/*  │  │ RefuelOrchestrator  │    │
│   orchestrator) │               │  │ OpsEngine           │    │
└─────────────────┘               │  │ RouteHealthChecker  │    │
                                  │  └─────────────────────┘    │
                                  │            │                │
                                  │            ▼                │
                                  │  ┌─────────────────────┐    │
                                  │  │ NewAPIGatewayAdapter│    │
                                  │  │  or                 │    │
                                  │  │ GenericOpenAIAdapter│    │
                                  │  │  or                 │    │
                                  │  │ MemoryAdapter (demo)│    │
                                  │  └─────────────────────┘    │
                                  │            │                │
                                  └────────────┼────────────────┘
                                               ▼
                                  ┌─────────────────────────────┐
                                  │  NewAPI / one-api / sub2api │
                                  │  (upstream LLM gateway)     │
                                  └─────────────────────────────┘
                                               │
                                               ▼
                                  ┌─────────────────────────────┐
                                  │  Anthropic / OpenAI /       │
                                  │  Google / Moonshot / etc.   │
                                  └─────────────────────────────┘
```
