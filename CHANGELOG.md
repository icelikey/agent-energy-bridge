# Changelog

All notable changes to Agent Energy Bridge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-11

### Added

- **Phase 1 — Security Hardening** (SECU-01..05)
  - Removed all hardcoded credentials from production source
  - Replaced `Math.random` API key generation with `crypto.randomBytes(32)`
  - All secrets sourced from environment variables (`AEB_`, `NEWAPI_`, `AUTO_REFUEL_` prefixes)
  - Input validation on all HTTP endpoints (`src/server/middleware/json-body.js`)
  - Token-bucket rate limiting (`src/server/middleware/rate-limiter.js`)
- **Phase 2 — Testing Foundation** (TEST-01..06)
  - 80%+ test coverage on `ops` / `session-summary` / `usage` modules
  - End-to-end integration tests via `tests/openclaw-agent-relay-smoke.mjs`
  - Node.js built-in `node --test` runner (zero external dependencies)
- **Phase 3 — Concurrency Safety** (CONC-01..04)
  - Promise lock for auto-refuel preventing race conditions
  - Graceful shutdown (`SIGINT` / `SIGTERM`) cleans all `setInterval` handles
  - Alert array size cap prevents memory unbounded growth
- **Phase 4 — Token Metering** (METR-01..05)
  - `TokenMeter` core with per-model / per-user / per-task-type statistics
  - 4 HTTP endpoints: `POST /meter/record`, `GET /meter/stats`, `GET /meter/report`, `GET /meter/breakdown`
  - 7/30/90 day historical query windows
- **Phase 5 — Multi-Provider Routing** (ROUT-01..05)
  - `MultiProviderRouter` with weighted load balancing
  - 5-second failure detection and auto-switch to backup provider
  - 3 HTTP endpoints: `GET /routing/status`, `GET /routing/log`, `POST /routing/force`
- **Phase 6 — Auto-Refuel & Notifications** (FUEL-01..05, NOTF-01..05)
  - `NotificationService` with 6 channels: webhook / feishu / dingtalk / slack / wecom / email
  - Quiet-hours support (`src/utils/quiet-hours.js`) — cross-midnight safe
  - Free model fallback when balance exhausts (`RefuelOrchestrator`)
  - 3 HTTP endpoints: `GET /notify/config`, `POST /notify/test`, `GET /refuel/status`
- **Phase 7 — Open Source Release** (OPEN-01..06, in progress)
  - `auth-middleware.js` — X-API-Key authentication for admin endpoints
  - `POST /agent/v1/notify/test` requires X-API-Key when `AEB_API_KEY` is set
  - GitHub Actions CI: matrix test (Node 20 + 22) + gitleaks scan
  - Conventional Commits + `git-cliff` for changelog automation
  - Bilingual README (`README.md` 中文 + `README.en.md` English)
  - Comprehensive API documentation in `docs/API.md` (26 endpoints)
  - `CONTRIBUTING.md` and `SECURITY.md`
  - Docker image published to `ghcr.io/OWNER/agent-energy-bridge` (Wave 4)

### Security

- All Phase 1 SECU-01..05 mitigations applied
- X-API-Key authentication added to `POST /agent/v1/notify/test` (Phase 7)
- gitleaks scan in CI on every PR
- Constant-time API key comparison via `crypto.timingSafeEqual`

### Notes

- **Zero external runtime dependencies** — pure Node.js built-ins (`http`, `crypto`, `fs`, `url`, global `fetch`)
- Minimum supported Node.js: 20 (CI matrix covers 20 and 22)
- Docker base image: `node:22-alpine` running as non-root user (UID 1001)
- License: MIT

[Unreleased]: https://github.com/OWNER/agent-energy-bridge/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/OWNER/agent-energy-bridge/releases/tag/v0.1.0
