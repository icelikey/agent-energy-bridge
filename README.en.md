> English | [中文](README.md)

# Agent Energy Bridge

A generic energy bridge for AI gateways with budget guard, refuel orchestration and model selection.

[![Node.js](https://img.shields.io/badge/node-20%2B-brightgreen.svg)](https://nodejs.org/) [![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Tests](https://img.shields.io/badge/tests-219%20passing-success.svg)](#testing)

## Overview

`agent-energy-bridge` is a sidecar service that sits next to your LLM gateway (e.g. `sub2api`, `new-api`, `one-api`, or any OpenAI-compatible gateway). Instead of replacing your gateway, it complements it with agent-first capabilities:

- Pre-call budget evaluation
- Model capability recommendation
- Low-balance refuel and activation-code redemption
- Onboarding doc generation
- Shadow routing suggestions
- Token-value scoring and throttling

## Use Cases

- You already operate `sub2api`, `new-api`, `one-api`, or an OpenAI-compatible gateway
- You want agents to evaluate budget and capability *before* making LLM calls
- You want activation-code based refuel, automated key issuance, or onboarding docs
- You must not disturb existing production keys or routes

## Core Modules

- `BudgetGuard`: Budget guardrail, per-call limit, auto-refuel ceiling
- `CompatibilityGuard`: Default shadow suggestions only, never override live keys or routes
- `EnergyEngine`: Compute token consumption efficiency and energy score
- `ModelCapabilityBenchmark`: Evaluate model performance across tasks
- `ModelSelector`: Recommend model and route based on task, budget, and protocol
- `GenericOpenAIGatewayAdapter`: Adapter for OpenAI-style gateways
- `NewAPIGatewayAdapter`: Adapter for the new-api open-source relay system
- `AutoRefuelDecorator`: Decorator pattern for automatic recharge when balance is low
- `RefuelOrchestrator`: Orchestrate refuel, key issuance, and onboarding docs
- `ReferralEngine`: Generate referral cards for resellers or downstream distribution
- `OpsEngine`: Operations monitoring engine, periodically scrape usage and balance, generate trend reports

## Directory Structure

- `src/core/`: Generic business rules
- `src/adapters/`: Gateway adapters (including new-api adapter and auto-refuel decorator)
- `src/service/`: Refuel and onboarding orchestration
- `src/server/`: HTTP Server layer
- `src/utils/`: Utilities (logging, config loading)
- `skills/`: Skill examples for agents
- `docs/`: Public design docs and guides
- `test/`: Unit tests
- `tests/`: Integration smoke scripts
- `bin/`: CLI entry points

## Installation & Verification

### Local Development

```bash
node --test
```

```bash
node tests/openclaw-agent-relay-smoke.mjs
```

The default smoke test address is `http://127.0.0.1:3100`. If you already have your own agent sidecar, override with environment variables:

```bash
export AGENT_RELAY_URL='https://agent.example.com'
export AGENT_ID='openclaw-demo'
node tests/openclaw-agent-relay-smoke.mjs
```

PowerShell users:
```powershell
$env:AGENT_RELAY_URL='https://agent.example.com'
$env:AGENT_ID='openclaw-demo'
node tests/openclaw-agent-relay-smoke.mjs
```

### Skill Installation Paths

- Claude Code: `~/.claude/skills/agent-energy-station`
- OpenClaw: `~/.openclaw/skills/agent-energy-station`
- Shared skills directory: `~/.agents/skills/agent-energy-station`
- Codex desktop: place in the platform-specific skills directory and restart

### Make Agents Discover the Skill

Add this line to your system prompt or workflow prompt:

```text
When the task involves token consumption, quota shortage, model selection, activation-code recharge, budget control, API key, or onboarding docs, prefer using the agent-energy-station skill. Check balance and usage first, then decide whether to call expensive models.
```

## Minimal Usage Example

```js
const {
  BudgetGuard,
  ModelSelector,
  RefuelOrchestrator,
} = require('agent-energy-bridge'); // local dev: require('./src')

const adapter = {
  async getUsage() {
    return {
      dailySpentUsd: 3.2,
      hourlyTokensUsed: 18000,
      autoRefuelsToday: 0,
      autoPurchasedUsdToday: 0,
    };
  },
  async getBalance() {
    return { availableUsd: 1.6 };
  },
  async redeemCode({ code }) {
    return { ok: true, code, creditUsd: 10 };
  },
  async issueKey() {
    return { apiKey: 'ak-demo', expiresAt: null };
  },
  async renderDocs({ data }) {
    return {
      markdown: `Base URL: ${data.baseUrl}\nAPI Key: ${data.apiKey}`,
    };
  },
};

const budgetGuard = new BudgetGuard({
  dailyBudgetUsd: 12,
  hourlyTokenLimit: 120000,
  autoPurchaseEnabled: true,
  maxAutoRefuelsPerDay: 2,
  maxRefuelAmountUsd: 8,
  maxAutoPurchasedUsdPerDay: 16,
  fallbackModel: 'all-protocol-router',
});

const orchestrator = new RefuelOrchestrator({
  adapter,
  budgetGuard,
  modelSelector: new ModelSelector(),
});

(async () => {
  const result = await orchestrator.prepareSession({
    activationCode: 'DEMO-2026',
    taskType: 'coding',
    protocol: 'openai',
    budgetTier: 'balanced',
    estimatedCostUsd: 1.2,
    requestedTokens: 9000,
    routeName: 'all-protocol-router',
    currentRoute: 'legacy-premium-route',
  });

  console.log(result.routingPlan);
  console.log(result.refuel.action);
})();
```

## Skill Example

This repo includes a reusable skill:

- `skills/agent-energy-station`

This skill is designed for OpenClaw, Claude Code, Codex, and similar agents. It handles:

- Query balance and usage
- Request recommendation and budget check before calling
- Prompt activation-code refuel when balance is low
- Suggest compressing context before switching to a cheaper route

Skill authoring guides:

- `docs/skill-authoring-guide.md`
- `docs/agent-skill-install-playbook.md`

## Integrating with new-api

If you use [Calcium-Ion/new-api](https://github.com/Calcium-Ion/new-api) as your gateway, integrate as follows:

### Environment Variables

```bash
# Switch to new-api mode (after setting this, MemoryAdapter demo is no longer used)
# Note: QuantumNous/new-api v1.0.0+ defaults to port 80, not 3000
export NEWAPI_BASE_URL="http://your-newapi.example.com"
export NEWAPI_API_KEY="your-api-key"

# QuantumNous/new-api v1.0.0+ requires the following extra config
# Admin API needs userId + session (choose one):
# Option A: provide username/password for auto-login
export NEWAPI_USERNAME="your-username"
export NEWAPI_PASSWORD="your-password"
# Option B: provide userId (if apiKey can directly access admin API)
export NEWAPI_USER_ID="1"
# Optional: custom quota conversion ratio (default auto-fetched from /api/status)
export NEWAPI_QUOTA_PER_UNIT="500000"

# Auto-refuel config
export AUTO_REFUEL_ENABLED="true"
export AUTO_REFUEL_THRESHOLD_USD="3"
export AUTO_REFUEL_AMOUNT_USD="10"
export AUTO_REFUEL_CODES="CODE1,CODE2,CODE3"

# Ops monitoring interval (default 5 minutes)
export OPS_MONITOR_INTERVAL_MS="300000"
```

### Start the Server

```bash
npm start
# or
node scripts/start-server.js
```

### new-api Adapter Features

- `getBalance()` -> automatically calls `/api/user/self`, supports multiple balance field extraction:
  - `data.balance` (direct USD value)
  - `data.quota` (quota points, auto-divided by `quota_per_unit`)
  - auto-fetches `quota_per_unit` from `/api/status` (default 100000)
- `getUsage()` -> calls `/api/usage/token/`, extracts `daily_cost` / `hourly_tokens` / `used_quota`
- `redeemCode()` / `topUp()` -> calls configured top-up endpoint (default `/api/topup`)
- **QuantumNous/new-api v1.0.0+ auth**: supports `apiKey + userId` or `username + password` auto-login to get session

### Auto-Refuel (AutoRefuelDecorator)

`AutoRefuelDecorator` wraps any `GatewayAdapter` in decorator pattern:

- Automatically detects low balance on every balance query
- Triggers refuel (activation code or topUp) when below threshold
- Supports cooldown period to prevent frequent refuel
- Supports max refuel count per hour
- Auto-refreshes balance after successful refuel
- Built-in alert logging with configurable `onRefuel` / `onAlert` callbacks

```js
const { NewAPIGatewayAdapter, AutoRefuelDecorator } = require('agent-energy-bridge');

const newApi = new NewAPIGatewayAdapter({ baseUrl: 'https://gateway.example.com', apiKey: 'ak-xxx' });

const adapter = new AutoRefuelDecorator(newApi, {
  lowBalanceThresholdUsd: 5,
  refuelAmountUsd: 10,
  refuelStrategy: 'fixed',     // fixed | proportional | dynamic
  autoRefuelEnabled: true,
  refuelCodes: ['RECHARGE-10', 'RECHARGE-20'],
  onRefuel: (event) => console.log('Refueled:', event),
  onAlert: (alert) => console.log('Alert:', alert),
});
```

### Operations Monitoring (OpsEngine)

```js
const { OpsEngine, Logger } = require('agent-energy-bridge');

const ops = new OpsEngine({
  adapter,
  energyEngine,
  sessionStore,
  logger: new Logger({ namespace: 'ops' }),
  monitoringIntervalMs: 300000, // 5 minutes
});

ops.startMonitoring();
// Periodically auto-capture balance/usage snapshots

// Generate operations report
const report = ops.generateReport({ limit: 168 }); // last 168 snapshots
console.log(report.trend, report.avgBalanceUsd, report.alerts);

// Get energy efficiency report
const energy = ops.getEnergyReport();
```

### HTTP Operations Endpoints

After the server starts, access operations data via these endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/agent/v1/ops/snapshot` | GET | Manually capture current snapshot |
| `/agent/v1/ops/report` | GET | Generate operations trend report |
| `/agent/v1/ops/energy` | GET | Get energy efficiency report |
| `/agent/v1/ops/start` | POST | Start periodic monitoring |
| `/agent/v1/ops/stop` | POST | Stop periodic monitoring |

## Production Integration Order

1. First connect `/health`, `/balance`, `/usage/summary` at the sidecar layer
2. Then connect `/recommend` and `/optimize`
3. Finally connect `/refuel/redeem`, `issueKey()`, `renderDocs()`
4. Keep compatibility protection for production gateways, default to shadow suggestions only
5. Use domain names only for external distribution, never expose origin IP

## Open Source Boundary

This repository keeps only generic capabilities. It does NOT contain:

- Real upstream addresses
- Production domain names
- Account credentials
- Activation code inventory
- Reseller settlement data
- Customer profiles and billing

If you are deploying for your own site, inject via environment variables, private config, or private adapters.

## Documentation

- **API Reference:** [docs/API.md](docs/API.md) -- Full HTTP API documentation (26 endpoints, bilingual)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md) -- How to contribute, code style, PR flow
- **Security:** [SECURITY.md](SECURITY.md) -- Vulnerability reporting and disclosure policy
- **Roadmap:** [.planning/ROADMAP.md](.planning/ROADMAP.md) -- Project milestones

## License

MIT -- See [LICENSE](LICENSE) for details.
