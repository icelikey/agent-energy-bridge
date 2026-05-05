---
last_mapped_commit: a9a9af59670e6f7c7e4810af6fadde8b4e3d1635
---

# Architecture — Agent Energy Bridge

> Mapped: 2026-05-05

## Overview

Agent Energy Bridge (AEB) is a sidecar intelligence layer that sits next to an AI gateway (e.g. new-api, one-api, sub2api). It does not proxy traffic; instead it provides **pre-flight budget guard, model recommendation, auto-refuel orchestration, and ops monitoring** for agent-first workflows.

## Architectural Patterns

### 1. Sidecar / Companion Pattern
AEB runs as an independent HTTP service (default port 3100). Clients (Claude Code, Codex, OpenClaw, custom agents) call AEB endpoints *before* making expensive LLM calls to decide whether to proceed, downgrade, or refuel.

### 2. Strategy + Decorator (Adapter Layer)
- `GatewayAdapter` defines the abstract interface for any upstream gateway.
- Concrete adapters (`GenericOpenAIGatewayAdapter`, `NewAPIGatewayAdapter`, `MemoryAdapter`) implement the protocol.
- `AutoRefuelDecorator` wraps any adapter transparently to add low-balance auto-refuel behavior without modifying the underlying adapter.

### 3. Policy Engine Pattern (Core Layer)
Core modules are pure stateless policy engines that accept inputs and return decisions:
- `BudgetGuard` — evaluates usage against policy and returns `allow | downgrade | free_fallback | block`
- `ModelSelector` — scores catalog models against task requirements and returns ranked candidates
- `CompatibilityGuard` — decides whether to preserve existing routes/keys or provision new ones
- `EnergyEngine` — computes efficiency scores from session telemetry

### 4. Orchestrator Pattern (Service Layer)
`RefuelOrchestrator` coordinates multiple core engines and the adapter into a single `prepareSession()` workflow. It is the primary high-level API for consumers.

### 5. Observer / Monitoring Pattern (Ops Layer)
- `OpsEngine` captures periodic snapshots of balance and usage, stores metrics, and generates trend reports.
- `RouteHealthChecker` polls external route URLs and maintains health status with EWMA latency tracking.

## Layer Boundaries and Responsibilities

```
┌─────────────────────────────────────────────────────────────┐
│  Entry Points                                               │
│  CLI (bin/aeb.js)  |  HTTP Server (src/server/)             │
├─────────────────────────────────────────────────────────────┤
│  Presentation / Transport                                   │
│  Router, Handlers, Middleware (src/server/)                 │
├─────────────────────────────────────────────────────────────┤
│  Service / Orchestration                                    │
│  RefuelOrchestrator (src/service/)                          │
├─────────────────────────────────────────────────────────────┤
│  Core Policy Engines                                        │
│  BudgetGuard, ModelSelector, EnergyEngine,                  │
│  CompatibilityGuard, ReferralEngine, OpsEngine,             │
│  RouteHealthChecker, SessionStore (src/core/)               │
├─────────────────────────────────────────────────────────────┤
│  Adapter / Gateway Integration                              │
│  GatewayAdapter, GenericOpenAIGatewayAdapter,               │
│  NewAPIGatewayAdapter, MemoryAdapter,                       │
│  AutoRefuelDecorator (src/adapters/)                        │
├─────────────────────────────────────────────────────────────┤
│  Infrastructure / Utilities                                 │
│  Logger, ConfigLoader (src/utils/)                          │
└─────────────────────────────────────────────────────────────┘
```

### Layer Details

| Layer | Path | Responsibility |
|-------|------|----------------|
| Entry | `bin/aeb.js`, `scripts/start-server.js` | CLI commands, server bootstrap, env-based wiring |
| Server | `src/server/` | HTTP transport, routing, request parsing, error handling |
| Service | `src/service/` | High-level workflow orchestration (`prepareSession`, `provisionAccess`) |
| Core | `src/core/` | Business rules, scoring, policy evaluation, state management |
| Adapters | `src/adapters/` | Gateway abstraction, protocol implementation, transparent decoration |
| Utils | `src/utils/` | Cross-cutting concerns (logging, config loading) |

## Data Flow

### Typical Request Flow: `/agent/v1/optimize`

```
Client POST /agent/v1/optimize
  │
  ▼
Router (src/server/router.js) — matches route, parses JSON body
  │
  ▼
Handler: postOptimize (src/server/handlers/optimize.js)
  │
  ├──► ModelSelector.recommend() ──► returns primary + fallback candidates
  │
  ├──► Adapter.getBalance() ──► fetches live balance from gateway
  │
  └──► BudgetGuard.evaluateUsage() ──► returns allow/downgrade/block decision
  │
  ▼
Handler assembles response: { action, guardDecision, recommendation, savingActions }
  │
  ▼
JSON response to client
```

### Session Reporting Flow: `/agent/v1/session/report`

```
Client POST session telemetry
  │
  ▼
Handler: postSessionReport
  │
  ├──► EnergyEngine.scoreSession() ──► computes energyScore, latencyScore, etc.
  │
  └──► SessionStore.addSession() ──► stores scored session in memory
  │
  ▼
Response: { scored, stored }
```

### Auto-Refuel Flow (Decorator)

```
Any call to Adapter.getBalance()
  │
  ▼
AutoRefuelDecorator.getBalance()
  │
  ├──► wrappedAdapter.getBalance() ──► get current balance
  │
  ├──► if balance < threshold && cooldown OK && limit not reached
  │     ├──► try topUp() or redeemCode()
  │     └──► on success, re-query balance
  │
  ▼
Return (possibly updated) balance
```

### Ops Monitoring Flow

```
OpsEngine.startMonitoring()
  │
  ├──► setInterval ──► every 5 min (configurable)
  │     ├──► adapter.getBalance()
  │     ├──► adapter.getUsage()
  │     └──► push snapshot to metrics array
  │
  ▼
OpsEngine.generateReport() ──► computes trend, alerts, averages from recent snapshots
```

## Key Abstractions and Interfaces

### GatewayAdapter
Abstract base class defining the contract for all gateway integrations:
- `listModels()`, `getUsage(identity)`, `getBalance(identity)`
- `redeemCode(payload)`, `issueKey(payload)`, `rotateKey(payload)`
- `renderDocs(payload)`

### ServerContext
The dependency injection container passed to every handler:
```js
{
  adapter,           // GatewayAdapter instance
  budgetGuard,       // BudgetGuard instance
  modelSelector,     // ModelSelector instance
  energyEngine,      // EnergyEngine instance
  sessionStore,      // SessionStore instance
  compatibilityGuard,// CompatibilityGuard instance
  referralEngine,    // ReferralEngine instance
  opsEngine,         // OpsEngine instance
  routeHealthChecker // RouteHealthChecker instance
}
```

### GuardDecision
Output of `BudgetGuard.evaluateUsage()`:
```js
{
  allowed: boolean,
  action: 'allow' | 'downgrade' | 'free_fallback' | 'block',
  reasons: string[],
  fallbackModel: string | null,
  freeFallbackModel: string | null,
  projectedSpendUsd: number,
  projectedHourlyTokens: number
}
```

### Recommendation
Output of `ModelSelector.recommend()`:
```js
{
  primary: ModelCatalogEntry | null,
  fallback: ModelCatalogEntry | null,
  candidates: RankedCandidate[],
  explain: string
}
```

### SessionResult
Output of `RefuelOrchestrator.prepareSession()`:
```js
{
  status: 'ready' | 'blocked',
  selectedModel: string | null,
  recommendation: Recommendation,
  routingPlan: RoutePlan,
  guardDecision: GuardDecision,
  usage: any,
  balance: any,
  refuel: RefuelResult,
  energyInsights: EnergyInsights | null
}
```

## Entry Points

### CLI
- `bin/aeb.js` — main CLI entry
  - `aeb start` — bootstraps server from config (`aeb.config.json` or env)
  - `aeb recommend <taskType> <budgetTier> <protocol>` — quick model recommendation
  - `aeb optimize <cost> <tokens> <budgetTier>` — quick budget evaluation
  - `aeb test` — runs `node --test`
  - `aeb check` — verifies module exports

### HTTP Server
- `scripts/start-server.js` — production server bootstrap with full env-based wiring
- `src/server/index.js` — `createServer()`, `startServer()`, `buildContext()`
- Default listen: `127.0.0.1:3100` (overridable via `AEB_PORT`, `AEB_HOST`)

### Programmatic API
- `src/index.js` — exports all public classes and functions for `require('agent-energy-bridge')`
- TypeScript declarations in `src/index.d.ts`

## Design Decisions

1. **No Traffic Proxying** — AEB is purely advisory. It recommends and guards, but the caller still talks directly to the gateway.
2. **Compatibility-First** — `CompatibilityGuard` defaults to `protectExistingRoutes: true` and `protectExistingKeys: true`, ensuring AEB never disrupts production setups.
3. **Free Fallback Tier** — When balance is zero, `BudgetGuard` can switch to free-tier models (Gemini Flash, OpenRouter, Groq, local Ollama) instead of blocking.
4. **Memory-Only Session Store** — `SessionStore` is in-memory with a configurable max size. No external database dependency for the core runtime.
5. **Environment-Driven Wiring** — `scripts/start-server.js` uses environment variables to choose between `MemoryAdapter` (demo) and `NewAPIGatewayAdapter` (production) with `AutoRefuelDecorator`.
