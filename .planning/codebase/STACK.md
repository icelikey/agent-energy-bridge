---
last_mapped_commit: a9a9af59670e6f7c7e4810af6fadde8b4e3d1635
---

# Technology Stack — Agent Energy Bridge

> Mapped: 2026-05-05

## Overview

Agent Energy Bridge (`agent-energy-bridge` v0.1.0) is a Node.js sidecar service that sits next to an LLM gateway (e.g. new-api, one-api, sub2api) and provides budget guard, model recommendation, auto-refuel, and session scoring for AI agent workflows.

---

## Languages & Runtime

| Item | Version / Details |
|------|-------------------|
| Language | JavaScript (ES2022, CommonJS) |
| Runtime | Node.js 22 (Alpine in Docker) |
| Type definitions | `src/index.d.ts` — hand-written TypeScript declarations for all public APIs |
| Module system | `commonjs` (no ESM for core library) |

---

## Package.json Analysis

`package.json` (`H:\projects\smart-relay-station\package.json`):

```json
{
  "name": "agent-energy-bridge",
  "version": "0.1.0",
  "type": "commonjs",
  "main": "src/index.js",
  "types": "src/index.d.ts",
  "bin": { "aeb": "bin/aeb.js" }
}
```

### Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `start` | `node scripts/start-server.js` | Start HTTP server |
| `test` | `node --test` | Run Node.js built-in test runner |
| `smoke` | `node tests/openclaw-agent-relay-smoke.mjs` | End-to-end smoke test against running server |
| `smoke:local` | start server in background, run smoke, kill server | Full local smoke validation |
| `check` | `node -e "const bridge=require('./src'); console.log(Object.keys(bridge).join(', '));"` | Verify module exports |

### Dependencies

**Zero external runtime dependencies.** The project relies entirely on Node.js built-in modules:

- `http` — HTTP server
- `fs` / `path` — file system operations
- `child_process` — CLI test execution
- `url` / `URLSearchParams` — URL parsing
- `fetch` (Node.js 18+) — HTTP client for gateway adapters

---

## Source Architecture

35 source files under `src/`:

```
src/
├── index.js                    # Public API barrel export
├── index.d.ts                  # TypeScript type declarations
├── core/
│   ├── budget-guard.js         # Budget policy evaluation
│   ├── compatibility-guard.js  # Route/key protection (advisory vs active)
│   ├── energy-engine.js        # Session scoring & energy efficiency
│   ├── model-capability-benchmark.js  # Model capability matrix (12 dims)
│   ├── model-selector.js       # Model recommendation engine
│   ├── ops-engine.js           # Operational monitoring & snapshots
│   ├── referral-engine.js      # Reseller/affiliate offer generation
│   ├── route-health-checker.js # External route health polling
│   └── session-store.js        # In-memory session storage (capped)
├── adapters/
│   ├── gateway-adapter.js      # Abstract base adapter
│   ├── generic-openai-adapter.js  # OpenAI-compatible generic adapter
│   ├── new-api-adapter.js      # QuantumNous/Calcium-Ion new-api adapter
│   ├── memory-adapter.js       # In-memory demo adapter
│   └── auto-refuel-decorator.js   # Decorator: auto-recharge on low balance
├── service/
│   └── refuel-orchestrator.js  # Orchestrates refuel, key issue, docs
├── server/
│   ├── index.js                # Server factory & starter
│   ├── router.js               # Route table & request dispatch
│   ├── middleware/
│   │   ├── error-handler.js    # JSON error response middleware
│   │   └── json-body.js        # JSON body parser
│   └── handlers/
│       ├── health.js           # GET /agent/v1/health
│       ├── balance.js          # GET /agent/v1/balance
│       ├── usage.js            # GET /agent/v1/usage/summary
│       ├── capabilities.js     # GET /agent/v1/models/capabilities
│       ├── recommend.js        # POST /agent/v1/recommend
│       ├── optimize.js         # POST /agent/v1/optimize
│       ├── refuel.js           # POST /agent/v1/refuel/redeem
│       ├── keys.js             # POST /agent/v1/keys/issue
│       ├── docs.js             # POST /agent/v1/docs/render
│       ├── session-report.js   # POST /agent/v1/session/report
│       ├── session-summary.js  # GET /agent/v1/session/summary
│       └── ops.js              # GET/POST /agent/v1/ops/*
└── utils/
    ├── config-loader.js        # JSON/JS config file loader
    └── logger.js               # Structured stderr logger with levels
```

---

## Build & Dev Tools

| Tool | Version | Usage |
|------|---------|-------|
| Node.js built-in test runner | Node 22 | `node --test` (13 test files in `test/`) |
| npm | bundled | package management (no lockfile committed beyond stub) |
| Docker | — | Production containerization |

---

## Docker Configuration

### `Dockerfile` (`H:\projects\smart-relay-station\Dockerfile`)

- Base image: `node:22-alpine`
- User: non-root `aeb` (UID 1001, GID 1001)
- Exposed port: `3100`
- Default env: `AEB_PORT=3100`, `AEB_HOST=0.0.0.0`, `NODE_ENV=production`
- Entry: `node scripts/start-server.js`

### `docker-compose.yml` (`H:\projects\smart-relay-station\docker-compose.yml`)

- Service name: `agent-energy-bridge`
- Port mapping: `3100:3100`
- Restart policy: `unless-stopped`
- Healthcheck: `fetch('http://localhost:3100/agent/v1/health')` every 30s
- All configuration injected via environment variables (see `.env.example`)

---

## CLI Entry Point

`bin/aeb.js` — standalone CLI with commands:

| Command | Action |
|---------|--------|
| `aeb start` | Start server (with config file support) |
| `aeb recommend <taskType> <budgetTier> <protocol>` | Get model recommendation |
| `aeb optimize <cost> <tokens> <budgetTier>` | Evaluate budget guard |
| `aeb test` | Run `node --test` |
| `aeb check` | List exported modules |
| `aeb version` | Show version |

---

## Configuration Files

| File | Format | Purpose |
|------|--------|---------|
| `.env.example` | Shell env | Template for all runtime environment variables |
| `aeb.config.json` / `aeb.config.js` | JSON / CommonJS | Optional config file (searched in CWD and `~/.aeb/`) |
| `CLAUDE.md` | Markdown | Project-level Claude Code conventions (energy check rules) |

---

## Skills / Agent Integrations

4 skill packages under `skills/` (installed into agent skill directories):

| Skill | Path | Runtime |
|-------|------|---------|
| `agent-energy-station` | `skills/agent-energy-station/` | Node.js ESM (`.mjs`) |
| `relay-growth-playbook` | `skills/relay-growth-playbook/` | YAML + Markdown references |
| `relay-ops-copilot` | `skills/relay-ops-copilot/` | YAML + Markdown references |
| `token-energy-station` | `skills/token-energy-station/` | Markdown references |

The `agent-energy-station` skill includes:
- `install.mjs` — zero-setup auto-installer for Claude Code / OpenClaw / Codex
- `scripts/energy-orchestrator.mjs` — CLI orchestrator (health, cost-check, recommend, auto-refuel, smart-call)
- `scripts/claude-energy-guard.mjs` — Claude Code hook script for balance pre-check
- `start-bridge.mjs` — Bridge launcher

---

## Test Suite

- **Unit tests**: 13 files in `test/` (Node.js built-in test runner)
- **Smoke tests**: `tests/openclaw-agent-relay-smoke.mjs` — end-to-end HTTP validation
- **Demo scripts**: `tests/free-fallback-demo.mjs`, `tests/sub-agent-demo.mjs`

---

## Key Design Decisions

1. **Zero external dependencies** — no `npm install` needed for core runtime; reduces supply-chain attack surface.
2. **Built-in `fetch`** — relies on Node.js 18+ native `fetch` for all HTTP calls.
3. **Adapter pattern** — `GatewayAdapter` base class with concrete implementations for new-api, generic OpenAI, and in-memory demo.
4. **Decorator pattern** — `AutoRefuelDecorator` wraps any adapter to add automatic low-balance recharge.
5. **In-memory only** — no database; `SessionStore` and `OpsEngine` metrics are held in memory with configurable caps.
