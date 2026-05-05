---
last_mapped_commit: a9a9af59670e6f7c7e4810af6fadde8b4e3d1635
---

# Coding Conventions

> Mapped: 2026-05-05 | Project: agent-energy-bridge (smart-relay-station)

## Code Style (Formatting, Linting)

- **No formatter or linter is configured.** The project relies on manual consistency.
- **Indentation:** 2 spaces, no tabs.
- **Line length:** Soft limit around 120 characters; long ternaries and object spreads are kept inline when readable.
- **Quotes:** Single quotes for strings (`'use strict'` is implicit via CommonJS).
- **Semicolons:** Required and consistently used.
- **Trailing commas:** Not used in the codebase (e.g., `src/core/budget-guard.js:151`).
- **Bracket style:** Same-line opening braces for classes, functions, and blocks.

## Naming Conventions

### Files
- **Kebab-case** for all filenames: `budget-guard.js`, `generic-openai-adapter.js`, `session-report.js`.
- Test files mirror the source file name with `.test.js` suffix: `src/core/budget-guard.js` -> `test/budget-guard.test.js`.
- Entry points use `index.js` (e.g., `src/index.js`, `src/server/index.js`).

### Functions
- **camelCase** for all functions, including module-level helpers: `round()`, `clamp()`, `normalizePath()`, `appendQuery()`.
- Async functions are prefixed with `async` but not with naming: `async request()`, `async getBalance()`.
- Factory/builder functions use verb-noun pattern: `buildContext()`, `createServer()`, `createRequestObject()`.

### Variables / Constants
- **UPPER_SNAKE_CASE** for module-level frozen constants: `DEFAULT_POLICY`, `TASK_MULTIPLIERS`, `MODEL_CATALOG`, `LEVELS`, `ROUTES`.
- **camelCase** for local variables and instance properties.
- Private/internal instance properties use leading underscore: `_statusMap`, `_intervalId`, `_history`, `_refuelCount`, `_log()`.
- Boolean options favor positive naming with `!== false` defaults: `protectExistingRoutes: options.protectExistingRoutes !== false`.

### Classes
- **PascalCase** for all class names: `BudgetGuard`, `EnergyEngine`, `GenericOpenAIGatewayAdapter`, `AutoRefuelDecorator`.
- Abstract base classes end in `Adapter`: `GatewayAdapter`.
- Decorator classes include `Decorator` suffix: `AutoRefuelDecorator`.

## Error Handling Patterns

### Error Objects with Metadata
Errors are enriched with machine-readable codes and HTTP status codes before being thrown or passed to the error handler:

```js
const error = new Error('Invalid or expired activation code');
error.status = 400;
throw error;
```

```js
const error = new Error('Model selector not available');
error.statusCode = 503;
error.code = 'SERVICE_NOT_CONFIGURED';
throw error;
```

### Centralized Error Response
`src/server/middleware/error-handler.js:1` provides a single `sendError(response, error)` function that:
- Extracts `statusCode` from `error.statusCode || error.status || 500`.
- Returns a JSON body with `{ success: false, error, message }`.
- Includes stack traces only in `development` mode.
- Guards against double-sending with `!response.headersSent`.

### Graceful Degradation in Async Flows
The `OpsEngine` (`src/core/ops-engine.js:16`) wraps optional adapter calls in try/catch and logs warnings instead of crashing:

```js
try {
  balance = await this.adapter.getBalance();
} catch (error) {
  this._log('warn', 'ops.balance_fetch_failed', { error: error.message });
}
```

### Constructor Validation
Classes validate required dependencies at construction time and throw immediately:

```js
if (!this.adapter || !this.budgetGuard || !this.modelSelector) {
  throw new Error('adapter, budgetGuard and modelSelector are required');
}
```

## Common Code Patterns and Idioms

### Default Options Merge
Nearly every constructor and function uses the `options = {}` default and spreads:

```js
constructor(options = {}) {
  this.policy = { ...DEFAULT_POLICY, ...policy };
}
```

### Object.freeze for Constants
Module-level lookup tables and catalogs are frozen to prevent accidental mutation:

```js
const LEVELS = Object.freeze({ debug: 0, info: 1, warn: 2, error: 3 });
const MODEL_CATALOG = Object.freeze([...]);
```

### Number Coercion with Fallbacks
Input sanitization follows a consistent pattern across the codebase:

```js
const value = Number(input.someValue ?? 0);
const fallback = input.fallbackModel ?? this.policy.fallbackModel ?? null;
```

### Optional Dependency Pattern
Optional collaborators are accepted via `options` and checked before use:

```js
this.energyEngine = options.energyEngine ?? null;
this.sessionStore = options.sessionStore ?? null;

if (!this.energyEngine || !this.sessionStore) {
  return null;
}
```

### Decorator Pattern
`AutoRefuelDecorator` (`src/adapters/auto-refuel-decorator.js:3`) wraps a `GatewayAdapter` and delegates unmodified methods while intercepting `getBalance()`:

```js
async listModels(...args) { return this.wrappedAdapter.listModels(...args); }
```

### Slugify / Normalization Helpers
Small pure utility functions are defined at module top and reused:

```js
function slugify(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
}

function normalizePath(path) {
  return path.startsWith('/') ? path : `/${path}`;
}
```

### Route Table Declaration
HTTP routes are declared as a flat array of objects in `src/server/router.js:15`:

```js
const ROUTES = [
  { method: 'GET',  path: '/agent/v1/health', handler: getHealth },
  { method: 'POST', path: '/agent/v1/recommend', handler: postRecommend },
];
```

## Async/Await vs Callback Usage

- **Async/await is used exclusively.** No callback-style APIs exist in `src/`.
- `node:http` server handler is wrapped in an async IIFE so `await` can be used:

```js
const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res, context);
  } catch (error) {
    sendError(res, error);
  }
});
```

- Stream-based body parsing (`src/server/middleware/json-body.js:1`) returns a Promise so it integrates with `await`:

```js
function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => { ... resolve(parsed) });
    request.on('error', reject);
  });
}
```

- `fetch()` (global) is used for all outbound HTTP calls; no `axios` or `node-fetch` dependency.
- Server startup uses a Promise wrapper around `server.listen()` (`src/server/index.js:40`).

## TypeScript Declarations

- The project is pure JavaScript (CommonJS) but ships hand-written type definitions in `src/index.d.ts`.
- All public classes, interfaces, and constants are typed for consumers.
- No `tsconfig.json` or build step exists.
