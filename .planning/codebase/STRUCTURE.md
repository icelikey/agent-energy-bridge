---
last_mapped_commit: a9a9af59670e6f7c7e4810af6fadde8b4e3d1635
---

# Structure — Agent Energy Bridge

> Mapped: 2026-05-05

## Directory Layout

```
/h/projects/smart-relay-station/
├── bin/                          # CLI entry points
│   └── aeb.js                    # Main CLI: start, recommend, optimize, test, check
├── scripts/                      # Bootstrapping scripts
│   └── start-server.js           # Production server bootstrap with env wiring
├── src/                          # Source code
│   ├── index.js                  # Public API exports
│   ├── index.d.ts                # TypeScript declarations
│   ├── adapters/                 # Gateway abstraction layer
│   │   ├── gateway-adapter.js            # Abstract base class
│   │   ├── generic-openai-adapter.js     # OpenAI-compatible gateway adapter
│   │   ├── new-api-adapter.js            # new-api (QuantumNous/Calcium-Ion) adapter
│   │   ├── memory-adapter.js             # In-memory demo adapter
│   │   └── auto-refuel-decorator.js      # Decorator: auto-refuel on low balance
│   ├── core/                     # Business rule engines
│   │   ├── budget-guard.js               # Budget policy evaluation
│   │   ├── compatibility-guard.js        # Route/key compatibility protection
│   │   ├── energy-engine.js              # Token efficiency scoring
│   │   ├── model-capability-benchmark.js # Model benchmark profiles & task weights
│   │   ├── model-selector.js             # Model recommendation engine
│   │   ├── ops-engine.js                 # Monitoring & trend reporting
│   │   ├── referral-engine.js            # Referral/offer card generation
│   │   ├── route-health-checker.js       # External route health polling
│   │   └── session-store.js              # In-memory session storage
│   ├── server/                   # HTTP server layer
│   │   ├── index.js                      # createServer, startServer, buildContext
│   │   ├── router.js                     # Route table & request dispatch
│   │   ├── handlers/                     # Per-endpoint handlers
│   │   │   ├── balance.js
│   │   │   ├── capabilities.js
│   │   │   ├── docs.js
│   │   │   ├── health.js
│   │   │   ├── keys.js
│   │   │   ├── ops.js
│   │   │   ├── optimize.js
│   │   │   ├── recommend.js
│   │   │   ├── refuel.js
│   │   │   ├── session-report.js
│   │   │   ├── session-summary.js
│   │   │   └── usage.js
│   │   └── middleware/
│   │       ├── error-handler.js          # Global error response formatter
│   │       └── json-body.js              # JSON body parser
│   ├── service/                  # High-level orchestration
│   │   └── refuel-orchestrator.js        # prepareSession, provisionAccess, reportSession
│   └── utils/                    # Cross-cutting utilities
│       ├── config-loader.js              # JSON/JS config file loader
│       └── logger.js                     # Structured logger with levels
├── test/                         # Unit tests (node --test)
│   ├── budget-guard.test.js
│   ├── compatibility-guard.test.js
│   ├── energy-engine.test.js
│   ├── energy-loop.test.js
│   ├── engineering.test.js
│   ├── generic-openai-adapter.test.js
│   ├── model-capability-benchmark.test.js
│   ├── model-selector.test.js
│   ├── newapi-integration.test.js
│   ├── referral-engine.test.js
│   ├── refuel-orchestrator.test.js
│   ├── route-health-checker.test.js
│   └── server.test.js
├── tests/                        # Smoke / integration tests
│   ├── free-fallback-demo.mjs
│   ├── openclaw-agent-relay-smoke.mjs
│   └── sub-agent-demo.mjs
├── skills/                       # Agent skill packs
│   ├── agent-energy-station/     # Main skill for Claude Code / OpenClaw
│   ├── relay-growth-playbook/    # Growth & reseller skill
│   ├── relay-ops-copilot/        # Operations monitoring skill
│   └── token-energy-station/     # Token management skill
├── docs/                         # Documentation
│   ├── deployments/              # Deployment guides
│   ├── reseller-pack/            # Reseller assets & pricing
│   └── *.md                      # Various design docs & guides
├── package.json                  # CommonJS package, main: src/index.js
├── docker-compose.yml            # Docker orchestration
├── Dockerfile                    # Container image
├── .env.example                  # Environment variable template
├── README.md                     # Project readme (Chinese)
└── .planning/codebase/           # Codebase mapping outputs
    ├── ARCHITECTURE.md
    └── STRUCTURE.md
```

## Key Files and Their Roles

| File | Role |
|------|------|
| `src/index.js` | Public API barrel export. All consumers `require('./src')` or `require('agent-energy-bridge')` through this. |
| `src/index.d.ts` | Complete TypeScript declarations for all public classes and interfaces. |
| `bin/aeb.js` | CLI entry. Parses commands, builds components from config, invokes server or runs standalone commands. |
| `scripts/start-server.js` | Production bootstrap. Reads env vars, creates adapter (Memory or NewAPI), wraps with AutoRefuelDecorator, wires all engines, starts server. |
| `src/server/router.js` | Central route table (`ROUTES` array). Matches `(method, path)` to handler. Parses query strings and JSON bodies. |
| `src/service/refuel-orchestrator.js` | Primary high-level API. `prepareSession()` is the main integration point for callers. |
| `src/core/budget-guard.js` | Stateless policy engine. No I/O. Pure function from inputs to decision. |
| `src/core/model-selector.js` | Stateless recommendation engine. Scores catalog against requirements. |
| `src/core/energy-engine.js` | Stateless scoring engine. Computes energyScore from session telemetry. |
| `src/adapters/new-api-adapter.js` | Production adapter for QuantumNous/Calcium-Ion new-api. Handles session auth, quota conversion, multi-field balance extraction. |
| `src/adapters/auto-refuel-decorator.js` | Transparent decorator. Wraps any adapter to add automatic low-balance refuel behavior. |

## Naming Conventions

### Files
- All lowercase with hyphens: `budget-guard.js`, `refuel-orchestrator.js`
- Test files suffix: `.test.js`
- Smoke/demo scripts suffix: `.mjs` (ES modules for demos)

### Classes
- PascalCase, descriptive: `BudgetGuard`, `ModelSelector`, `AutoRefuelDecorator`
- Abstract base classes end in `Adapter`: `GatewayAdapter`
- Concrete implementations prefix with domain: `NewAPIGatewayAdapter`, `MemoryAdapter`

### Functions / Methods
- camelCase: `evaluateUsage()`, `prepareSession()`, `scoreCandidate()`
- Private methods prefix with underscore: `_ensureSession()`, `_extractBalance()`
- Handler exports use HTTP verb prefix: `getHealth`, `postOptimize`, `postRefuelRedeem`

### Constants
- UPPER_SNAKE_CASE for module-level constants: `DEFAULT_POLICY`, `MODEL_CATALOG`, `TASK_MULTIPLIERS`, `NEWAPI_DEFAULT_PATHS`
- Often wrapped with `Object.freeze()`

### Environment Variables
- Prefixed with `AEB_` for core: `AEB_PORT`, `AEB_HOST`, `AEB_LOG_LEVEL`, `AEB_CONFIG_PATH`
- Prefixed with `NEWAPI_` for new-api adapter: `NEWAPI_BASE_URL`, `NEWAPI_API_KEY`, `NEWAPI_USER_ID`
- Prefixed with `AUTO_REFUEL_` for refuel config: `AUTO_REFUEL_ENABLED`, `AUTO_REFUEL_THRESHOLD_USD`
- Prefixed with `OPS_` / `HEALTH_CHECK_` for ops/health: `OPS_MONITOR_INTERVAL_MS`, `HEALTH_CHECK_ROUTES`

## Module Organization

### Adapter Chain (Composition)
```
AutoRefuelDecorator
  └── NewAPIGatewayAdapter | GenericOpenAIGatewayAdapter | MemoryAdapter
        └── GatewayAdapter (abstract)
```

### Server Handler Dependency Map
Each handler receives `(request, response, context)` where `context` is the DI container:

| Handler | Required Context Fields |
|---------|------------------------|
| `health` | `adapter`, `routeHealthChecker` |
| `balance` | `adapter` |
| `usage` | `adapter` |
| `capabilities` | `modelSelector` |
| `recommend` | `modelSelector` |
| `optimize` | `modelSelector`, `budgetGuard`, `adapter` (optional) |
| `refuel` | `adapter` |
| `keys` | `adapter` |
| `docs` | `adapter` |
| `session-report` | `energyEngine`, `sessionStore` (optional) |
| `session-summary` | `energyEngine`, `sessionStore` (optional) |
| `ops/*` | `opsEngine` |

### Test Organization
- `test/*.test.js` — Unit tests using Node.js built-in test runner (`node --test`)
- `tests/*.mjs` — Integration / smoke tests that call a running server instance
- Each core module has a corresponding `.test.js` file

### Skill Organization
Each skill under `skills/` follows a consistent structure:
```
skills/<skill-name>/
  ├── SKILL.md              # Skill manifest & instructions
  ├── agents/
  │   └── openai.yaml       # Agent configuration
  ├── references/           # Reference docs for the skill
  └── scripts/              # Executable skill scripts (optional)
```
