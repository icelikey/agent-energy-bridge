---
last_mapped_commit: a9a9af59670e6f7c7e4810af6fadde8b4e3d1635
---

# Testing Patterns

> Mapped: 2026-05-05 | Project: agent-energy-bridge (smart-relay-station)

## Test Framework and Structure

- **Framework:** Node.js built-in test runner (`node:test`) + `node:assert/strict`.
- **No external test framework** (no Jest, Mocha, Vitest, or Tap).
- **Command:** `npm test` runs `node --test`, which auto-discovers files matching `test/**/*.test.js`.

### Test File Header Pattern
Every test file follows the same import pattern:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { SomeClass } = require('../src');
```

## Test File Organization

```
test/
  budget-guard.test.js          -> src/core/budget-guard.js
  compatibility-guard.test.js   -> src/core/compatibility-guard.js
  energy-engine.test.js         -> src/core/energy-engine.js
  energy-loop.test.js           -> src/service/refuel-orchestrator.js (session/energy loop)
  engineering.test.js           -> src/utils/logger.js + src/utils/config-loader.js
  generic-openai-adapter.test.js -> src/adapters/generic-openai-adapter.js
  model-capability-benchmark.test.js -> src/core/model-capability-benchmark.js
  model-selector.test.js        -> src/core/model-selector.js
  newapi-integration.test.js    -> src/adapters/new-api-adapter.js + auto-refuel-decorator + ops-engine
  referral-engine.test.js       -> src/core/referral-engine.js
  refuel-orchestrator.test.js   -> src/service/refuel-orchestrator.js
  route-health-checker.test.js  -> src/core/route-health-checker.js
  server.test.js                -> src/server/* (HTTP integration tests)
```

- **1:1 mapping** between source module and test file, with the exception of `newapi-integration.test.js` and `engineering.test.js` which cover multiple related modules.
- `tests/` (plural) contains **smoke / demo scripts** (`.mjs`), not unit tests.

## Mocking Patterns

### Inline Mock Objects (Preferred)
The dominant mocking style is plain JavaScript objects implementing the adapter interface:

```js
const adapter = {
  async getUsage() { return { dailySpentUsd: 3.5, ... }; },
  async getBalance() { return { availableUsd: 1.2 }; },
  async redeemCode({ code }) { calls.push(['redeem', code]); return { ok: true }; },
  async issueKey() { calls.push('issue'); return { apiKey: 'ak-generated' }; },
};
```

This pattern appears in:
- `test/refuel-orchestrator.test.js:5`
- `test/generic-openai-adapter.test.js:5`
- `test/newapi-integration.test.js:81`

### Transport Injection for HTTP Adapters
`GenericOpenAIGatewayAdapter` and `NewAPIGatewayAdapter` accept a `transport` option to intercept HTTP calls:

```js
const adapter = new GenericOpenAIGatewayAdapter({
  baseUrl: 'https://gateway.example.com/',
  apiKey: 'sk-demo',
  transport: async (request) => {
    calls.push(request);
    return { ok: true };
  },
});
```

### Mock Transport with Path Routing
`test/newapi-integration.test.js:15` defines a reusable `createMockTransport` helper:

```js
function createMockTransport(responseMap) {
  return async ({ method, url, headers, body }) => {
    const path = new URL(url).pathname;
    const handler = responseMap[path];
    if (!handler) {
      const error = new Error(`Mock transport: no handler for ${path}`);
      error.status = 404;
      throw error;
    }
    return handler({ method, path, headers, body, url });
  };
}
```

### In-Memory Adapter for Integration Tests
`MemoryAdapter` (`src/adapters/memory-adapter.js:3`) serves as the default test double for server-level tests:

```js
const adapter = new MemoryAdapter({ balanceUsd: 5, codes: { 'TEST-10': 10 } });
```

It is used in:
- `test/server.test.js:30`
- `test/energy-loop.test.js:14`
- `test/newapi-integration.test.js:83`

### Logger Sink Injection
`Logger` accepts a `sink` option to capture output without writing to stderr:

```js
const lines = [];
const logger = new Logger({ namespace: 'test', level: 'warn', sink: { write: (line) => lines.push(line) } });
```

### File System Mocking via Temp Files
`test/engineering.test.js:50` uses `os.tmpdir()` and real file I/O for config loader tests, cleaning up with `fs.unlinkSync()`.

### Environment Variable Mutation
Tests mutate `process.env` directly and restore the original value afterward:

```js
const original = process.env.AEB_LOG_LEVEL;
process.env.AEB_LOG_LEVEL = 'error';
// ... test ...
process.env.AEB_LOG_LEVEL = original;
```

## Coverage Approach

- **No coverage tool is configured.** No `c8`, `nyc`, or built-in `--test-coverage` flags are used.
- Coverage is achieved through **behavioral test completeness** rather than line coverage metrics.

## Test Types

### Unit Tests (Majority)
Each core class has isolated unit tests verifying:
- **Business logic correctness:** `budget-guard.test.js` validates downgrade vs block decisions.
- **Scoring algorithms:** `energy-engine.test.js` asserts efficient sessions score higher than wasteful ones.
- **Ranking logic:** `model-selector.test.js` verifies multimodal workloads promote Gemini.
- **State transitions:** `compatibility-guard.test.js` checks preserve vs provision modes.

### Integration Tests
- `test/server.test.js` spins up a real `http.Server` on `127.0.0.1:0` (random port) and exercises the full HTTP stack:
  - Health endpoint (`GET /agent/v1/health`)
  - Balance, usage, capabilities endpoints
  - Recommendation and optimization POST handlers
  - Refuel redeem, key issuance, docs rendering
  - Session reporting
  - 404 and invalid JSON error handling

- `test/newapi-integration.test.js` tests adapter integration with mock transports, covering:
  - Balance extraction from `/api/user/self`
  - Usage extraction from `/api/usage/token`
  - Auto-refuel decorator behavior (fixed, proportional, dynamic strategies)
  - Cooldown and limit enforcement
  - Alert log capture
  - OpsEngine snapshot and report generation

### Smoke / Demo Scripts (`tests/`)
These are **not unit tests** but manual validation scripts:
- `tests/openclaw-agent-relay-smoke.mjs` — end-to-end smoke test against a running server.
- `tests/free-fallback-demo.mjs` — demonstrates free-tier fallback behavior.
- `tests/sub-agent-demo.mjs` — sub-agent orchestration demo.

## Test Utilities and Helpers

### `makeRequest` Helper (`test/server.test.js:5`)
A Promise-based wrapper to send HTTP requests to the test server:

```js
function makeRequest(server, method, path, body) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      // fetch(...)
    });
  });
}
```

### `createTestServer` Helper (`test/server.test.js:29`)
Builds a fully wired server with `MemoryAdapter` and default guards:

```js
function createTestServer(options = {}) {
  const adapter = options.adapter || new MemoryAdapter({ ... });
  const context = buildContext({ adapter, budgetGuard, modelSelector, ... });
  return createServer(context);
}
```

### `createTestOrchestrator` Helper (`test/energy-loop.test.js:13`)
Factory for `RefuelOrchestrator` with sensible test defaults:

```js
function createTestOrchestrator(options = {}) {
  const adapter = options.adapter || new MemoryAdapter({ balanceUsd: 5, codes: { 'TEST-10': 10 } });
  return new RefuelOrchestrator({ adapter, budgetGuard, modelSelector, ... });
}
```

## Assertion Patterns

- **Strict equality** for primitives: `assert.equal(result.allowed, true)`.
- **Type checks** for numeric outputs: `assert.ok(typeof data.scored.energyScore === 'number')`.
- **Array inclusion** for suggestions/reasons: `assert.ok(result.suggestions.length >= 1)`.
- **Regex matching** for string content: `assert.match(card.markdown, /树枝 API/)`.
- **Deep equality** for object comparison: `assert.deepEqual(calls, [['redeem', 'DEMO-2026']])`.
- **Throws validation:** `assert.throws(() => { ... }, /energyEngine is required/)`.
